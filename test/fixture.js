// A deterministic forecast, shaped exactly like what weather.js returns from Open-Meteo.
// Seeded off the date string, so a given day always gets the same weather and a test run
// is reproducible. No network, no key, no clock dependency beyond "which days are shown".
window.__skyFixture = (function () {
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rnd = (s, k) => { const x = Math.sin(hash(s) * 0.0001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return function fixture(dates, { cloudy = false, wet = false, storm = false } = {}) {
    const hourly = {}, daily = {};
    for (const date of dates) {
      // A plausible day: cloud drifts, rain lands in an afternoon window, temp follows a arc.
      const base = cloudy ? 0.72 : 0.24;
      for (let h = 0; h < 24; h++) {
        const drift = (rnd(date, h * 0.7) - 0.5) * 0.34;
        const cloud = Math.max(0, Math.min(1, base + drift));
        const raining = wet && h >= 13 && h <= 17;
        hourly[`${date}T${pad(h)}:00`] = {
          cloud,
          cloudRaw: cloud,
          precip: raining ? 0.6 + rnd(date, h) * 0.9 : 0,
          precipProb: raining ? 80 : Math.round(cloud * 30),
          visibility: 20000,
          temp: 9 + Math.sin(((h - 4) / 24) * Math.PI * 2) * 7 + rnd(date, h + 3) * 2,
          feels: 8 + Math.sin(((h - 4) / 24) * Math.PI * 2) * 7,
          code: storm && raining ? 95 : raining ? 63 : cloud > 0.7 ? 3 : cloud > 0.35 ? 2 : 0,
          wind: 6 + rnd(date, h + 7) * 14,
          humidity: 55 + Math.round(cloud * 35),
          uv: Math.max(0, Math.sin(((h - 6) / 12) * Math.PI) * 6)
        };
      }
      const d = new Date(date + 'T00:00:00');
      const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
      // A real-enough sunrise/sunset swing for a mid-latitude site.
      const half = 6.1 + 2.5 * Math.sin(((doy - 80) / 365) * Math.PI * 2);
      const noon = 12.9;
      const at = h => `${date}T${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;
      daily[date] = {
        date,
        sunrise: at(noon - half),
        sunset: at(noon + half),
        daylight: half * 2 * 3600,
        hi: 17 + rnd(date, 1) * 6,
        lo: 4 + rnd(date, 2) * 5
      };
    }
    return { fetchedAt: Date.now(), lat: 42.28, lon: -83.74, tz: 'America/Detroit', hourly, daily, source: 'fixture' };
  };
})();
