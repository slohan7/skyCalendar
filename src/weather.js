// Forecast client. Open-Meteo, no key, no account, no identifier.
// Coordinates are rounded to two decimal places (about 1km) before leaving the browser.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const HOURLY = ['cloud_cover','precipitation','precipitation_probability','visibility',
                  'temperature_2m','apparent_temperature','weather_code','wind_speed_10m',
                  'relative_humidity_2m','uv_index'];
  const DAILY  = ['sunrise','sunset','daylight_duration','temperature_2m_max','temperature_2m_min'];
  // Fahrenheit in the three countries that use it, Celsius everywhere else, overridable.
  S.units = () => {
    const pref = S.cfgSync ? S.cfgSync().units : 'auto';
    if (pref === 'f') return 'fahrenheit';
    if (pref === 'c') return 'celsius';
    const loc = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';
    let region = '';
    try { region = new Intl.Locale(loc).region || ''; } catch { region = loc.split('-')[1] || ''; }
    return ['US', 'LR', 'MM'].includes(region.toUpperCase()) ? 'fahrenheit' : 'celsius';
  };

  const TTL_MS = 15 * 60 * 1000;
  const STALE_MS = 6 * 60 * 60 * 1000;

  // Raw hourly cloud cover is far too noisy to drive a gradient directly. Measured on a
  // real Paris forecast: 73, 81, 88, 78, 68, 58, 66, 69, 67, 73, 86, 100, 92, 85, 77, 82.
  // Mapped straight to opacity that produces exactly the per-hour banding the design
  // forbids. A gaussian over +/-2 hours removes it without flattening real fronts.
  function smooth(series, sigma = 1.2, radius = 3) {
    const w = [];
    for (let i = -radius; i <= radius; i++) w.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
    return series.map((_, i) => {
      let sum = 0, wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const v = series[i + k];
        if (v == null) continue;
        sum += v * w[k + radius]; wsum += w[k + radius];
      }
      return wsum ? sum / wsum : series[i];
    });
  }
  S.smooth = smooth;

  const SCHEMA = 'v2';   // bump whenever the request params change
  function cacheKey(lat, lon) { return `sky:fc:${SCHEMA}:${S.units()[0]}:${lat.toFixed(2)},${lon.toFixed(2)}`; }

  async function read(key) {
    try { const o = await chrome.storage.local.get(key); return o[key] || null; } catch { return null; }
  }
  async function write(key, value) {
    try { await chrome.storage.local.set({ [key]: value }); } catch { /* quota or no context */ }
  }

  S.getForecast = async function (lat, lon, { force = false } = {}) {
    const rlat = Math.round(lat * 100) / 100, rlon = Math.round(lon * 100) / 100;
    const key = cacheKey(rlat, rlon);
    const now = Date.now();
    const cached = await read(key);
    if (!force && cached && now - cached.fetchedAt < TTL_MS) return { ...cached, source: 'cache' };

    const url = `${ENDPOINT}?latitude=${rlat}&longitude=${rlon}`
      + `&hourly=${HOURLY.join(',')}&daily=${DAILY.join(',')}`
      + `&temperature_unit=${S.units()}&timezone=auto&past_days=8&forecast_days=14`;

    try {
      const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();

      const cloud = smooth(raw.hourly.cloud_cover);
      const byHour = new Map();
      raw.hourly.time.forEach((t, i) => {
        byHour.set(t, {
          cloud: cloud[i] / 100,
          cloudRaw: raw.hourly.cloud_cover[i] / 100,
          precip: raw.hourly.precipitation[i],
          precipProb: raw.hourly.precipitation_probability[i],
          visibility: raw.hourly.visibility[i],
          temp: raw.hourly.temperature_2m[i],
          feels: raw.hourly.apparent_temperature[i],
          code: raw.hourly.weather_code[i],
          wind: raw.hourly.wind_speed_10m[i],
          humidity: raw.hourly.relative_humidity_2m[i],
          uv: raw.hourly.uv_index[i]
        });
      });

      const days = new Map();
      raw.daily.time.forEach((d, i) => {
        days.set(d, {
          date: d,
          sunrise: raw.daily.sunrise[i],
          sunset: raw.daily.sunset[i],
          daylight: raw.daily.daylight_duration[i],
          hi: raw.daily.temperature_2m_max[i],
          lo: raw.daily.temperature_2m_min[i]
        });
      });

      const payload = { fetchedAt: now, lat: rlat, lon: rlon, tz: raw.timezone,
                        hourly: Object.fromEntries(byHour), daily: Object.fromEntries(days) };
      await write(key, payload);
      return { ...payload, source: 'network' };
    } catch (err) {
      if (cached && now - cached.fetchedAt < STALE_MS) return { ...cached, source: 'stale', error: String(err) };
      return { error: String(err), source: 'unavailable' };
    }
  };
})();
