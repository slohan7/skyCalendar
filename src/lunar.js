// The Moon. Position and phase, computed the same way the sun is: from the date and the
// place, not from an icon set. Open-Meteo does not carry lunar data, and a moon that is
// always full, or always in the same corner, is a sticker rather than a sky.
//
// Schlyter's low-precision formulae with the principal perturbations. Good to a couple of
// arcminutes, which is several orders of magnitude finer than a calendar column can draw.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const sin = a => Math.sin(a * rad), cos = a => Math.cos(a * rad);
  const rev = a => a - Math.floor(a / 360) * 360;

  // Days since 2000 Jan 0.0. solar.js counts from J2000 proper; this is the epoch
  // Schlyter's elements are stated against, so the two differ by 1.5 days on purpose.
  const days = date => date.valueOf() / 86400000 - 0.5 + 2440588 - 2451543.5;

  // Ecliptic longitude and latitude of the Moon, and of the Sun, for one instant.
  function place(date) {
    const d = days(date);

    // Sun
    const ws = 282.9404 + 4.70935e-5 * d;
    const Ms = rev(356.0470 + 0.9856002585 * d);
    const Ls = rev(ws + Ms);
    const sunLon = rev(Ls + 1.915 * sin(Ms) + 0.020 * sin(2 * Ms));

    // Moon, orbital elements
    const N = rev(125.1228 - 0.0529538083 * d);
    const inc = 5.1454;
    const w = rev(318.0634 + 0.1643573223 * d);
    const a = 60.2666;
    const e = 0.054900;
    const M = rev(115.3654 + 13.0649929509 * d);

    // Eccentric anomaly, iterated: the Moon's orbit is eccentric enough that one pass
    // of the usual first approximation is not sufficient.
    let E = M + (e * deg) * sin(M) * (1 + e * cos(M));
    for (let i = 0; i < 6; i++) {
      const dE = (E - (e * deg) * sin(E) - M) / (1 - e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }

    const x = a * (cos(E) - e);
    const y = a * Math.sqrt(1 - e * e) * sin(E);
    const r = Math.hypot(x, y);
    const v = rev(Math.atan2(y, x) * deg);

    const xe = r * (cos(N) * cos(v + w) - sin(N) * sin(v + w) * cos(inc));
    const ye = r * (sin(N) * cos(v + w) + cos(N) * sin(v + w) * cos(inc));
    const ze = r * sin(v + w) * sin(inc);

    let lon = rev(Math.atan2(ye, xe) * deg);
    let lat = Math.atan2(ze, Math.hypot(xe, ye)) * deg;

    // The perturbations that matter. Without the first two the phase can be a day out,
    // which is the difference between drawing a gibbous moon and drawing a half one.
    const Lm = rev(N + w + M);
    const D = rev(Lm - Ls);
    const F = rev(Lm - N);
    lon += -1.274 * sin(M - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms)
         - 0.059 * sin(2 * M - 2 * D) - 0.057 * sin(M - 2 * D + Ms)
         + 0.053 * sin(M + 2 * D) + 0.046 * sin(2 * D - Ms) + 0.041 * sin(M - Ms)
         - 0.035 * sin(D) - 0.031 * sin(M + Ms) - 0.015 * sin(2 * F - 2 * D)
         + 0.011 * sin(M - 4 * D);
    lat += -0.173 * sin(F - 2 * D) - 0.055 * sin(M - F - 2 * D)
         - 0.046 * sin(M + F - 2 * D) + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * M + F);

    return { d, lon: rev(lon), lat, sunLon, dist: r };
  }

  // Illuminated fraction, and which limb it is on.
  //
  // Elongation is the Sun-Earth-Moon angle; the phase angle is its supplement for a sun
  // this far away, and k falls straight out of that. Waxing means the Moon is running
  // ahead of the Sun in longitude, which is also the half of the cycle where the lit limb
  // is on the right -- from the northern hemisphere. Below the equator you are looking at
  // the same moon upside down, so the limb swaps.
  S.moonPhase = function (date, observerLat) {
    const p = place(date);
    const elong = Math.acos(cos(p.lon - p.sunLon) * cos(p.lat)) * deg;
    const k = (1 - Math.cos(elong * rad)) / 2;
    const ahead = rev(p.lon - p.sunLon);
    const waxing = ahead < 180;
    const litRight = (observerLat == null || observerLat >= 0) ? waxing : !waxing;
    return { k, waxing, litRight, elongation: elong, age: (ahead / 360) * 29.530588853,
             name: phaseName(k, waxing) };
  };

  function phaseName(k, waxing) {
    if (k < 0.02) return 'New moon';
    if (k > 0.98) return 'Full moon';
    if (Math.abs(k - 0.5) < 0.06) return waxing ? 'First quarter' : 'Last quarter';
    if (k < 0.5) return waxing ? 'Waxing crescent' : 'Waning crescent';
    return waxing ? 'Waxing gibbous' : 'Waning gibbous';
  }

  // Altitude above the horizon, degrees. Same shape as the solar one next door.
  S.moonAltitude = function (date, lat, lon) {
    const p = place(date);
    const ecl = 23.4393 - 3.563e-7 * p.d;
    const xh = cos(p.lon) * cos(p.lat);
    const yh = sin(p.lon) * cos(p.lat);
    const zh = sin(p.lat);
    const xq = xh;
    const yq = yh * cos(ecl) - zh * sin(ecl);
    const zq = yh * sin(ecl) + zh * cos(ecl);
    const ra = Math.atan2(yq, xq) * deg;
    const dec = Math.atan2(zq, Math.hypot(xq, yq)) * deg;
    // Same sidereal time expression solar.js uses, so the two agree with each other.
    const jd2000 = date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;
    const gmst = (18.697374558 + 24.06570982441908 * jd2000) % 24;
    const lst = (gmst * 15 + lon + 360) % 360;
    const H = ((lst - ra + 540) % 360 - 180);
    return Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * deg;
  };

  // Everything about the Moon for one local day, in hours since local midnight.
  //
  // Sampled rather than solved. The Moon's altitude is not the tidy single-humped curve
  // the Sun's is -- it rises about fifty minutes later each day, so a given date may hold
  // a rise, a set, both, or neither -- and hunting for a crossing between two assumed
  // bounds is exactly how you end up asserting the Moon is never up on a Tuesday.
  const cache = new Map();
  S.moonDay = function (dateISO, lat, lon) {
    const key = `${dateISO}|${lat}|${lon}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const start = new Date(dateISO + 'T00:00:00');
    const at = h => S.moonAltitude(new Date(start.getTime() + h * 3600000), lat, lon);
    const STEP = 0.25;
    const alt = [];
    for (let h = 0; h <= 24 + 1e-9; h += STEP) alt.push([h, at(h)]);

    // -0.83 degrees: the standard refraction allowance, near enough for the Moon too.
    const HORIZON = -0.83;
    const up = [];
    let from = alt[0][1] > HORIZON ? 0 : null;
    const refine = (h0, h1) => {                      // bisect the quarter hour it is in
      let lo = h0, hi = h1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if ((at(lo) - HORIZON) * (at(mid) - HORIZON) <= 0) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    };
    for (let i = 1; i < alt.length; i++) {
      const [h0, a0] = alt[i - 1], [h1, a1] = alt[i];
      if (a0 <= HORIZON && a1 > HORIZON) from = refine(h0, h1);
      else if (a0 > HORIZON && a1 <= HORIZON && from != null) { up.push([from, refine(h0, h1)]); from = null; }
    }
    if (from != null) up.push([from, 24]);

    let peak = alt[0];
    for (const s of alt) if (s[1] > peak[1]) peak = s;

    const phase = S.moonPhase(new Date(start.getTime() + 12 * 3600000), lat);
    const out = { up, transit: peak[0], peakAltitude: peak[1], ...phase };
    if (cache.size > 300) cache.clear();
    cache.set(key, out);
    return out;
  };
  S.clearLunarCache = () => cache.clear();

  // The lit part of the disc, as one SVG path in a unit box of the given radius.
  //
  // A semicircle for the bright limb, then the terminator, which is a half-ellipse whose
  // width is |2k-1| of the radius: wide and bulging outward for a gibbous moon, narrow and
  // bulging back across the disc for a crescent. Drawing the shadow as a circle offset
  // sideways is the usual shortcut and it is wrong -- it cannot make a crescent thinner
  // than a quarter without the horns going the wrong way.
  S.moonPath = function (cx, cy, r, k, litRight) {
    const p = 2 * Math.min(1, Math.max(0, k)) - 1;    // -1 new, 0 quarter, +1 full
    const rx = Math.abs(p) * r;
    const outer = litRight ? 1 : 0;                   // bright limb, top to bottom
    const inner = (p >= 0) ? outer : 1 - outer;       // terminator, bottom back to top
    return `M ${cx} ${cy - r}`
         + ` A ${r} ${r} 0 0 ${outer} ${cx} ${cy + r}`
         + ` A ${rx.toFixed(3)} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`;
  };
})();
