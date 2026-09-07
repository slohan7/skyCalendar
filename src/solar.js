// Solar position. Open-Meteo gives authoritative sunrise and sunset; this supplies the
// two moments it does not: golden hour (sun at +6 degrees, descending) and civil
// twilight (sun at -6 degrees). NOAA approximation, accurate to well under a minute
// at the latitudes a calendar is read at.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const rad = Math.PI / 180, deg = 180 / Math.PI;

  function julian(date) { return date.valueOf() / 86400000 - 0.5 + 2440588; }

  // Solar altitude in degrees for a given instant and location.
  function altitude(date, lat, lon) {
    const d = julian(date) - 2451545;
    const g = (357.529 + 0.98560028 * d) * rad;                 // mean anomaly
    const q = 280.459 + 0.98564736 * d;                          // mean longitude
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad; // ecliptic longitude
    const e = (23.439 - 0.00000036 * d) * rad;                   // obliquity
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * deg;
    const decl = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const lst = (gmst * 15 + lon + 360) % 360;
    const H = ((lst - ra + 540) % 360 - 180) * rad;              // hour angle
    const phi = lat * rad;
    return Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)) * deg;
  }

  // Binary search for the instant the sun crosses `target` degrees, between two hours
  // of the same local day. Returns hours-since-local-midnight, or null if no crossing.
  function crossing(dayStart, lat, lon, target, fromH, toH, descending) {
    const at = h => altitude(new Date(dayStart.getTime() + h * 3600000), lat, lon);
    let lo = fromH, hi = toH;
    const f = h => at(h) - target;
    if (Math.sign(f(lo)) === Math.sign(f(hi))) return null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Every solar moment costs a forty-step binary search over altitude(), and a day's
  // answer never changes. The hover popover asked for it on every mousemove, which is
  // roughly a hundred and twenty altitude solves per pointer event. Memoise on the only
  // things the answer depends on.
  const cache = new Map();
  function memo(key, compute) {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const val = compute();
    if (cache.size > 400) cache.clear();          // a fortnight of columns, then start over
    cache.set(key, val);
    return val;
  }
  S.clearSolarCache = () => cache.clear();

  // All solar moments for one local day, as hours since local midnight.
  // sunriseISO / sunsetISO come from the forecast and are treated as authoritative.
  S.solarDay = function (dateISO, sunriseISO, sunsetISO, lat, lon) {
    return memo(`d|${dateISO}|${sunriseISO}|${sunsetISO}|${lat}|${lon}`,
                () => solarDayUncached(dateISO, sunriseISO, sunsetISO, lat, lon));
  };
  function solarDayUncached(dateISO, sunriseISO, sunsetISO, lat, lon) {
    const dayStart = new Date(dateISO + 'T00:00:00');
    const hoursOf = iso => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
    const sunrise = hoursOf(sunriseISO);
    const sunset  = hoursOf(sunsetISO);
    return {
      civilDawn: crossing(dayStart, lat, lon, -6, Math.max(0, sunrise - 2), sunrise) ?? sunrise - 0.55,
      sunrise,
      golden:    crossing(dayStart, lat, lon, 6, sunset - 3, sunset) ?? sunset - 0.78,
      sunset,
      civilDusk: crossing(dayStart, lat, lon, -6, sunset, Math.min(24, sunset + 2)) ?? sunset + 0.57,
      daylight:  sunset - sunrise
    };
  }

  // Sunrise and sunset solved directly from altitude, for dates outside the forecast
  // window. Sun disc centre at -0.833 degrees, which is the standard refraction allowance.
  S.solarDayComputed = function (dateISO, lat, lon) {
    return memo(`c|${dateISO}|${lat}|${lon}`, () => solarDayComputedUncached(dateISO, lat, lon));
  };
  function solarDayComputedUncached(dateISO, lat, lon) {
    const dayStart = new Date(dateISO + 'T00:00:00');
    const sunrise = crossing(dayStart, lat, lon, -0.833, 1, 12);
    const sunset  = crossing(dayStart, lat, lon, -0.833, 12, 23.5);
    if (sunrise == null || sunset == null) return null;          // polar day or night
    return {
      civilDawn: crossing(dayStart, lat, lon, -6, Math.max(0, sunrise - 2), sunrise) ?? sunrise - 0.55,
      sunrise,
      golden:    crossing(dayStart, lat, lon, 6, sunset - 3, sunset) ?? sunset - 0.78,
      sunset,
      civilDusk: crossing(dayStart, lat, lon, -6, sunset, Math.min(24, sunset + 2)) ?? sunset + 0.57,
      daylight:  sunset - sunrise,
      computed:  true
    };
  }

  S.altitude = altitude;
})();
