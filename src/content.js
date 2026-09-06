// Sky for Google Calendar — content script.
//
// Everything about where this attaches was determined by inspecting the live DOM,
// not assumed. The findings that shape this file:
//
//   role="grid"          is painted opaque #FFFFFF, so we must inject INSIDE it
//     └ scroll viewport
//         └ role="row"
//             └ role="gridcell"   one per day column, full 24h height, scrolls with the grid
//                 └ event         position:absolute, z-index:5
//
// So: one layer per gridcell at z-index 0. Events stay above without being touched,
// and the layer scrolls with the grid for free because the gridcell IS the scrolled
// content. Class names (RnuVVe, hEtGGf, sBn5T) are hashed and churn; only role and
// data-* attributes are stable, because screen readers depend on them.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const TAG = 'skycal';
  const log = (...a) => console.log('%c[sky]', 'color:#2680D0;font-weight:600', ...a);

  // ---------------------------------------------------------------- location
  const ZONES = {
    'America/Detroit': [42.28, -83.74], 'America/New_York': [40.71, -74.01],
    'America/Chicago': [41.88, -87.63], 'America/Phoenix': [33.45, -112.07],
    'America/Anchorage': [61.22, -149.90], 'America/Halifax': [44.65, -63.58],
    'America/Winnipeg': [49.90, -97.14], 'America/Edmonton': [53.55, -113.49],
    'America/Denver': [39.74, -104.99], 'America/Los_Angeles': [34.05, -118.24],
    'America/Toronto': [43.65, -79.38], 'America/Vancouver': [49.28, -123.12],
    'America/Sao_Paulo': [-23.55, -46.63], 'America/Mexico_City': [19.43, -99.13],
    'Europe/London': [51.51, -0.13], 'Europe/Paris': [48.86, 2.35],
    'Europe/Berlin': [52.52, 13.40], 'Europe/Madrid': [40.42, -3.70],
    'Europe/Amsterdam': [52.37, 4.90], 'Europe/Stockholm': [59.33, 18.07],
    'Europe/Dublin': [53.35, -6.26], 'Europe/Lisbon': [38.72, -9.14],
    'Asia/Tokyo': [35.68, 139.69], 'Asia/Singapore': [1.35, 103.82],
    'Asia/Hong_Kong': [22.32, 114.17], 'Asia/Kolkata': [19.08, 72.88],
    'Asia/Dubai': [25.20, 55.27], 'Australia/Sydney': [-33.87, 151.21],
    'Australia/Melbourne': [-37.81, 144.96], 'Pacific/Auckland': [-36.85, 174.76]
  };
  async function resolveLocation() {
    const cfg = await S.settings();
    if (cfg.lat != null) return { lat: cfg.lat, lon: cfg.lon, label: cfg.label || 'set' };
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = ZONES[tz];
    // Never IP geolocation. The browser's own timezone, or nothing.
    // A timezone is not a location. America/New_York spans Maine to Michigan, which is
    // 40 minutes of sunrise error end to end. This is a placeholder until the location
    // picker exists; it announces itself so nobody trusts it by accident.
    const loc = hit ? { lat: hit[0], lon: hit[1], label: tz, inferred: true }
                    : { lat: 40.71, lon: -74.01, label: `${tz} -> New York (no match)`, inferred: true, weak: true };
    console.warn(`%c[sky] location was GUESSED from your timezone: ${loc.label} `
      + `(${loc.lat}, ${loc.lon}). If that is not where you are, run:\n`
      + `  __SkyCal.setLocation(42.28, -83.74, 'Ann Arbor')`,
      'color:#C5622D;font-weight:600');
    return loc;
  }

  // ---------------------------------------------------------------- the grid
  function findGrid() {
    const main = document.querySelector('[role="main"]');
    if (!main) return null;
    const grids = [...main.querySelectorAll('[role="grid"]')];
    // The timed grid is the one containing tall gridcells. The all-day grid is short.
    for (const g of grids) {
      const cells = [...g.querySelectorAll('[role="gridcell"]')];
      if (cells.some(c => c.getBoundingClientRect().height > 500)) return g;
    }
    return null;
  }
  function findColumns(grid) {
    return [...grid.querySelectorAll('[role="gridcell"]')]
      .filter(c => c.getBoundingClientRect().height > 500);
  }

  // ---------------------------------------------------------------- dates
  // Google packs dates as datekey = ((y-1970) << 9) | (m << 5) | d, month 1-indexed.
  function decodeDatekey(k) {
    const n = parseInt(k, 10);
    if (!Number.isFinite(n)) return null;
    const y = (n >> 9) + 1970, m = (n >> 5) & 0x0f, d = n & 0x1f;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function anchorDate() {
    const m = location.pathname.match(/\/r\/(?:day|week|month|customday|custom)\/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return new Date();
  }
  function columnDates(cols) {
    // Prefer Google's own datekey wherever it is present on the cell or an ancestor.
    const viaKey = cols.map(c => {
      let n = c;
      for (let i = 0; i < 12 && n; i++, n = n.parentElement) {          // was 5, too shallow
        const k = n.getAttribute && n.getAttribute('data-datekey');
        if (k) { const d = decodeDatekey(k); if (d) return d; }
      }
      const inner = c.querySelector('[data-datekey]');                   // or on a descendant
      if (inner) { const d = decodeDatekey(inner.getAttribute('data-datekey')); if (d) return d; }
      return null;
    });
    if (viaKey.every(Boolean)) return { dates: viaKey, method: 'data-datekey' };
    // Otherwise: the view's anchor date, one day per column, left to right.
    const start = anchorDate();
    if (/\/r\/week/.test(location.pathname)) start.setDate(start.getDate() - start.getDay());
    const dates = cols.map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return iso(d); });
    return { dates, method: 'url+index', datekeySample: viaKey[0] };
  }

  // ---------------------------------------------------------------- painting
  const P = () => S.RAMP, pct = h => (h / 24) * 100;

  function stopColour(i, hourData) {
    const clear = P().clear[i], over = P().overcast[i], rain = P().rain[i];
    if (!hourData) return clear;
    const cloud = Math.max(0, Math.min(1, hourData.cloud ?? 0));
    // Cover no longer drains the sky. It buys clouds instead, and the grey of an overcast
    // day emerges from a full deck of them rather than from a desaturated gradient.
    // Only a small residual dimming survives here, so heavy cover still reads as heavy.
    const dim = cloud * 0.12;   // the clouds do the work now, not the gradient
    // Oklab, explicitly not oklch: oklch takes the short hue path and turns a
    // blue-to-orange sky transition magenta. Verified in the browser.
    let c = `color-mix(in oklab, ${clear} ${Math.round((1 - dim) * 100)}%, ${over})`;
    const wet = Math.max(0, Math.min(1, (hourData.precip ?? 0) / 1.5));
    if (wet > 0.02) c = `color-mix(in oklab, ${c} ${Math.round((1 - wet) * 100)}%, ${rain})`;
    return c;
  }

  function buildSky(sun, hoursFor) {
    const anchors = [0, 3, sun.civilDawn, sun.sunrise, sun.sunrise + 0.55, 9, 12, 15, 17.5,
                     sun.golden, sun.sunset, sun.civilDusk, sun.civilDusk + 0.8, 24]
                    .map(h => Math.max(0, Math.min(24, h)));
    const stops = anchors.map((h, i) => `${stopColour(i, hoursFor(h))} ${pct(h).toFixed(2)}%`);
    return `linear-gradient(to bottom in oklab, ${stops.join(', ')})`;
  }

  function buildPlate(sun) {
    const pts = [[0, .34], [sun.civilDawn, .36], [sun.sunrise + 1, .48], [9, .51], [12, .52],
                 [16, .51], [sun.golden, .42], [sun.sunset, .32], [sun.civilDusk, .30], [24, .34]];
    return `linear-gradient(to bottom, ${pts.map(([h, a]) =>
      `rgba(255,255,255,${a}) ${pct(Math.max(0, Math.min(24, h))).toFixed(2)}%`).join(', ')})`;
  }

  // The entire day is visible at once, so the hours you are nowhere near should not
  // shout. This lifts distant hours toward the surface colour and leaves the current
  // hour untouched. It is also the only thing on screen that moves on its own: the
  // band travels down the grid as the day passes.
  function buildFocus(date) {
    const now = new Date();
    const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // On another day there is no "now", so anchor on the middle of the working day.
    const h0 = isToday ? now.getHours() + now.getMinutes() / 60 : 13;
    const a = d => Math.min(0.30, Math.max(0, (Math.abs(d - h0) - 2.5) * 0.045)).toFixed(3);
    const stops = [];
    for (let h = 0; h <= 24; h += 1.5) stops.push(`rgba(255,255,255,${a(h)}) ${pct(h).toFixed(2)}%`);
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  function buildWash(sun) {
    const W = S.WASH, t = (h, c, a) => `rgba(${c} / ${a}) ${pct(Math.max(0, Math.min(24, h))).toFixed(2)}%`;
    const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };
    return `linear-gradient(to bottom, ` + [
      t(0, hexToRgb(W.night[0]), W.night[1]),
      t(sun.civilDawn, hexToRgb(W.sunrise[0]), 0),
      t(sun.sunrise, hexToRgb(W.sunrise[0]), W.sunrise[1]),
      t(sun.sunrise + 1.8, hexToRgb(W.sunrise[0]), 0),
      t(sun.golden - 1.5, hexToRgb(W.golden[0]), 0),
      t(sun.golden, hexToRgb(W.golden[0]), W.golden[1]),
      t(sun.sunset, hexToRgb(W.sunset[0]), W.sunset[1]),
      t(sun.civilDusk, hexToRgb(W.night[0]), W.night[1]),
      t(24, hexToRgb(W.night[0]), W.night[1])
    ].join(', ') + ')';
  }

  // Cloud with a silhouette. A cumulus is a lumpy mass with a flat base, so each one is
  // built from three to six overlapping lobes whose bottoms align, biggest in the middle.
  // Blur stays low enough that the shape survives: at 46px they were fog, which is a 0
  // on the scale. This is aiming at a 4 -- readable as cloud, never as an icon.
  // Stars. Only between civil dusk and civil dawn, and only as many as the sky is clear
  // enough to show: cloud cover takes them away hour by hour. Sizes and brightnesses vary,
  // a minority twinkle, and none of them are four-pointed.
  function starField(sun, hoursFor, colW) {
    const wrap = document.createElement('div');
    wrap.className = `${TAG}-stars`;
    const bands = [[0, sun.civilDawn - 0.25], [sun.civilDusk + 0.25, 24]];
    let n = 0;
    for (const [from, to] of bands) {
      if (to - from < 0.4) continue;
      for (let h = from; h < to; h += 0.5) {
        const d = hoursFor(h);
        const clarity = 1 - Math.min(1, Math.max(0, d ? d.cloud : 0.3));
        if (clarity < 0.12) continue;                        // overcast: no stars
        const count = Math.round(clarity * 5);
        for (let i = 0; i < count; i++) {
          const rnd = k => { const x = Math.sin((h * 7.3 + 1) * 91.7 + (i * 4 + k) * 271.3) * 43758.5453; return x - Math.floor(x); };
          const mag = rnd(0);                                 // apparent magnitude
          const size = mag > 0.86 ? 2.1 : mag > 0.6 ? 1.5 : 1.05;
          const st = document.createElement('i');
          st.style.cssText = `left:${(rnd(1) * (colW - 8) + 3).toFixed(1)}px;`
            + `top:calc(${(((h + rnd(2) * 0.5) / 24) * 100).toFixed(3)}% );`
            + `width:${size}px;height:${size}px;`
            + `opacity:${(0.22 + mag * 0.62 * clarity).toFixed(3)}`;
          if (mag > 0.78) {                                   // only the brightest twinkle
            st.style.animationDuration = `${(5 + rnd(3) * 7).toFixed(1)}s`;
            st.style.animationDelay = `-${(rnd(4) * 9).toFixed(1)}s`;
            st.className = `${TAG}-twinkle`;
          }
          wrap.appendChild(st); n++;
        }
      }
    }
    return n ? wrap : null;
  }

  function cloudField(hoursFor, colW, sun) {
    const wrap = document.createElement('div');
    wrap.className = `${TAG}-clouds`;
    let any = false;
    for (let h = 0; h < 24; h += 2) {
      const d = hoursFor(h);
      if (!d) continue;
      const cover = Math.min(1, Math.max(0, d.cloud));
      // Discrete cumulus only exist in a partly-cloudy sky. Below 0.18 there is nothing
      // to draw; above 0.85 the deck is featureless and the flat ramp already says so.
      // Drawing puffy clouds at 100% cover was the error: it made a solid overcast look
      // like a cartoon sky.
      if (cover < 0.10) continue;                       // a genuinely clear sky has none
      const form = cover;                               // monotonic: more cover, more cloud
      const rnd = (k) => { const x = Math.sin((h + 1) * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
      // Cloud takes its colour from the light falling on it. At night that light is city
      // glow from below, so cloud reads LIGHTER than the sky, not darker -- the previous
      // slate at half strength was the same value as the sky and simply vanished.
      const lit = (() => {
        if (h < sun.civilDawn - 0.9 || h > sun.civilDusk + 0.9) return ['#8E97B8', 0.72];
        if (h < sun.sunrise + 0.8 || h > sun.golden - 0.2)      return ['#F7C79C', 0.92];
        return ['#FBFDFF', 1];
      })();
      const count = 1 + Math.round(form * 3.4);        // up to 4 per band at full cover
      for (let c = 0; c < count; c++) {
        any = true;
        const scale = 0.62 + rnd(c * 9) * 1.25;                 // wide size spread
        const ch = (20 + form * 26) * scale;
        // clouds widen as cover rises, so at full cover they merge into a deck
        const cw = Math.min(colW * 1.35, ch * (2.1 + rnd(c * 9 + 1) * 1.9) * (1 + form * 1.5));
        const drop = (rnd(c * 9 + 5) - 0.5) * 2.4;              // +/-1.2h, so no rows form
        const cloud = document.createElement('div');
        cloud.className = `${TAG}-cloud`;
        cloud.style.cssText = `left:${(rnd(c * 9 + 2) * (colW - cw * 0.6) - cw * 0.2).toFixed(1)}px;`
          + `width:${cw.toFixed(0)}px;height:${ch.toFixed(0)}px;`
          + `top:calc(${(((h + drop) / 24) * 100).toFixed(2)}% - ${(ch * 0.6).toFixed(0)}px);`
          + `opacity:${Math.min(0.70, (0.10 + form * 0.58) * lit[1]).toFixed(3)};`
          + `filter:blur(${(9 + rnd(c * 9 + 6) * 9).toFixed(0)}px);`
          + `animation-duration:${(13 + rnd(c * 9 + 3) * 15).toFixed(0)}s;`
          + `animation-direction:${rnd(c * 9 + 4) > 0.5 ? 'alternate' : 'alternate-reverse'}`;
        const n = 3 + Math.round(form * 2);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const dia = ch * (0.70 + 0.52 * Math.sin(Math.PI * t)) * (0.84 + rnd(c * 9 + 10 + i) * 0.38);
          const lobe = document.createElement('i');
          lobe.style.cssText = `position:absolute;bottom:${(rnd(c * 9 + 20 + i) * ch * 0.14).toFixed(1)}px;`
            + `left:${(t * cw - dia / 2).toFixed(1)}px;width:${dia.toFixed(1)}px;height:${dia.toFixed(1)}px;`
            + `border-radius:50%;background:${lit[0]}`;
          cloud.appendChild(lobe);
        }
        wrap.appendChild(cloud);
      }
    }
    return any ? wrap : null;
  }

  // Precipitation covers only the hours it actually falls in, held at 10% opacity,
  // and falls at 1/8 the cloud drift rate.
  function precipBand(hoursFor) {
    let first = null, last = null, solid = false, peak = 0;
    for (let h = 0; h < 24; h++) {
      const d = hoursFor(h);
      if (!d || (d.precip ?? 0) < 0.1) continue;
      if (first === null) first = h;
      last = h + 1;
      peak = Math.max(peak, d.precip);
      if (d.temp != null && d.temp <= 1) solid = true;
    }
    if (first === null) return null;
    const el = document.createElement('div');
    el.className = `${TAG}-precip ${solid ? TAG + '-snow' : TAG + '-rain'}`;
    el.style.top = `${((first / 24) * 100).toFixed(2)}%`;
    el.style.height = `${(((last - first) / 24) * 100).toFixed(2)}%`;
    el.style.opacity = Math.min(0.26, 0.10 + peak * 0.10).toFixed(3);
    return el;
  }

  // Open-Meteo codes 95, 96 and 99 are thunderstorm. Flashes are rare, irregular and
  // brief -- two overlapping cycles at coprime durations so they never land together.
  function stormBand(hoursFor) {
    let first = null, last = null;
    for (let h = 0; h < 24; h++) {
      const d = hoursFor(h);
      if (!d || !(d.code >= 95)) continue;
      if (first === null) first = h;
      last = h + 1;
    }
    if (first === null) return null;
    const el = document.createElement('div');
    el.className = `${TAG}-storm`;
    el.style.top = `${((first / 24) * 100).toFixed(2)}%`;
    el.style.height = `${(((last - first) / 24) * 100).toFixed(2)}%`;
    el.innerHTML = `<i class="${TAG}-flash-a"></i><i class="${TAG}-flash-b"></i>`;
    return el;
  }

  // The sun as an object rather than only as a bloom, on days clear enough to see one.
  //
  // It used to read as something behind the sky rather than in it, for three reasons and
  // all three are fixed here. It composited as an ordinary translucent overlay sitting on
  // a white plate that had already washed the sky out, so it had nothing to be brighter
  // *than*; it now screens onto the sky, which is what light does. Its opacity was
  // 0.9 - mean*1.1, which is 0.29 at half cover -- a smudge, not a star. And it was a
  // 58px disc whose gradient had faded out by 72%, so there was no core and no corona.
  function sunDisc(sun, hoursFor, m, intensity) {
    let cover = 0, n = 0;
    for (let h = Math.ceil(sun.sunrise); h < sun.sunset; h++) {
      const d = hoursFor(h); if (!d) continue;
      cover += d.cloud; n++;
    }
    if (!n) return null;
    const mean = cover / n;
    if (mean > 0.55) return null;                       // overcast: no disc
    const colW = m.colW;
    const size = Math.max(44, Math.min(78, colW * 0.30));
    const needH = (size + 14) / m.H * 24;                     // hours the disc occupies
    const lo = sun.sunrise + 0.6, hi = sun.sunset - 0.6;
    const busy = m.events.filter(e => e.bottom > lo && e.top < hi)
                         .map(e => [e.top, e.bottom])
                         .sort((a, b) => a[0] - b[0]);
    const gaps = [];
    let cursor = lo;
    for (const [a, b] of busy) { if (a - cursor >= needH) gaps.push([cursor, a]); cursor = Math.max(cursor, b); }
    if (hi - cursor >= needH) gaps.push([cursor, hi]);
    if (!gaps.length) return null;                            // nowhere to put it: skip
    // Of the gaps big enough, take the one nearest solar noon. Biggest-gap alone put the
    // sun at half four just because the afternoon was free, which is not where it lives.
    const solarNoon = (sun.sunrise + sun.sunset) / 2;
    const clamp = ([a, b]) => Math.max(a + needH / 2, Math.min(b - needH / 2, solarNoon));
    gaps.sort((g1, g2) => Math.abs(clamp(g1) - solarNoon) - Math.abs(clamp(g2) - solarNoon));
    const noon = clamp(gaps[0]);
    // Haze dims the sun; it does not put it out. The floor is the point of the change.
    const glare = Math.max(0.68, Math.min(1, 1.04 - mean * 0.64));
    // Two elements, not one, and they are siblings rather than nested. Warmth cannot
    // survive a screen blend -- a midday sky is already at 0.94 blue, and screening
    // anything onto that returns white -- so the halo paints normally and tints, and the
    // core screens on top of it and is unconditionally the brightest thing in the column.
    // Nesting them would put the core inside the halo's opacity group, where its backdrop
    // is transparent and the blend has nothing to work against.
    const box = `width:${size}px;height:${size}px;`
      + `left:${(colW * 0.5 - size / 2).toFixed(0)}px;`
      + `top:calc(${((noon / 24) * 100).toFixed(2)}% - ${(size / 2).toFixed(0)}px);`
      + `opacity:${(glare * Math.min(1, intensity)).toFixed(3)}`;
    const halo = document.createElement('div');
    halo.className = `${TAG}-sun-halo`;
    halo.style.cssText = box;
    const disc = document.createElement('div');
    disc.className = `${TAG}-sun`;
    disc.style.cssText = box;
    disc.innerHTML = `<i class="${TAG}-sun-core"></i>`;
    return [halo, disc];
  }

  function bloom(hour, hex, alpha, kind) {
    const d = document.createElement('div');
    d.className = `${TAG}-bloom ${TAG}-bloom-${kind || 'x'}`;
    d.style.top = `calc(${pct(hour).toFixed(2)}% - 90px)`;
    const n = parseInt(hex.slice(1), 16);
    d.style.background = `radial-gradient(closest-side, rgba(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${alpha}), transparent)`;
    return d;
  }

  // ---------------------------------------------------------------- measuring
  // One read pass per column, taken before anything at all is written. The old code read
  // an event's rect, wrote a box-shadow, read the next event's rect, and so on: every
  // write invalidated layout and every following read forced it again. The cost of that
  // does not land in our frame, it lands in Google's next one, which is what "the
  // calendar feels slower" actually was.
  function measureColumn(cell) {
    const box = cell.getBoundingClientRect();
    const H = box.height || 1;
    const events = [];
    for (const el of cell.querySelectorAll('[data-eventid]')) {
      const r = el.getBoundingClientRect();
      if (r.height < 1) continue;
      events.push({
        el,
        id:     el.getAttribute('data-eventid'),
        top:    (r.top - box.top) / H * 24,
        bottom: (r.bottom - box.top) / H * 24,
        right:  r.right - box.left,
        height: r.height,
        fill:   getComputedStyle(el).backgroundColor
      });
    }
    return { box, H, colW: box.width || 160, events };
  }

  // What the drawn sky is a function of. If none of this moved then the sky did not move
  // either, and tearing it down would only restart several hundred animations from zero.
  // That restart is the flash.
  // Every setting the painter reads belongs in here, including the ones that only affect
  // the event-dependent half: a setting missing from the signature is a setting that
  // silently does nothing until something else happens to force a repaint.
  const skySignature = (date, fc, m, loc, cfg) =>
    [date, fc.fetchedAt, Math.round(m.colW), Math.round(m.H), loc.lat, loc.lon,
     cfg.intensity, cfg.weather, cfg.stars, cfg.motion, cfg.hourlyTemps].join('|');

  // The sun's placement, the hourly temperatures and the separation guard are the only
  // things that depend on where the events are, so they get their own signature.
  function eventSignature(m) {
    let out = '';
    for (const e of m.events)
      out += `${e.id}:${e.top.toFixed(2)},${e.bottom.toFixed(2)},${Math.round(e.right)},${e.fill};`;
    return out;
  }

  const painted = new WeakMap();      // field element -> what is currently drawn on it

  function paintColumn(cell, date, fc, loc, m) {
    const day = fc.daily?.[date];
    // Sky first, weather second. Solar geometry is computable for any date, so a column
    // outside the forecast window still gets its day drawn -- it just has no weather.
    const sun = day ? S.solarDay(date, day.sunrise, day.sunset, loc.lat, loc.lon)
                    : S.solarDayComputed(date, loc.lat, loc.lon);
    if (!sun) return false;
    const hoursFor = h => {
      const hh = String(Math.max(0, Math.min(23, Math.round(h)))).padStart(2, '0');
      return fc.hourly?.[`${date}T${hh}:00`] || null;
    };

    const cfg = state.cfg || S.DEFAULTS;
    let field = cell.querySelector(`:scope > .${TAG}-field`);
    if (!field) {
      field = document.createElement('div');
      field.className = `${TAG}-field`;
      field.innerHTML = `<div class="${TAG}-sky"></div>`;
      field.appendChild(bloom(sun.sunrise, S.BLOOM.sunrise[0], S.BLOOM.sunrise[1], 'sunrise'));
      field.appendChild(bloom(sun.golden + 0.35, S.BLOOM.golden[0], S.BLOOM.golden[1], 'sunset'));
      field.insertAdjacentHTML('beforeend', `<div class="${TAG}-plate"></div><div class="${TAG}-wash"></div>`);
      // Four standing slots inside the weather layer, in painting order, so that a change
      // to one of them does not take the other three down with it. The sun keeps its own
      // slot because it screens onto the sky and must not sit inside a group opacity:
      // an isolated group has nothing to screen against.
      field.insertAdjacentHTML('beforeend',
        `<div class="${TAG}-weather">`
        + `<div class="${TAG}-slot ${TAG}-slot-stars"></div>`
        + `<div class="${TAG}-slot ${TAG}-slot-sun"></div>`
        + `<div class="${TAG}-slot ${TAG}-slot-clouds"></div>`
        + `<div class="${TAG}-slot ${TAG}-slot-fall"></div>`
        + `</div>`);
      field.insertAdjacentHTML('beforeend', `<div class="${TAG}-focus"></div>`);
      if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
      cell.insertBefore(field, cell.firstChild);
    }
    field.dataset.date = date;
    field.classList.toggle(`${TAG}-still`, cfg.motion === 'reduce');

    const was = painted.get(field) || {};
    const skySig = skySignature(date, fc, m, loc, cfg);
    const evSig = eventSignature(m);
    const now = { skySig, evSig, focus: was.focus };
    const dim = String(Math.min(1, cfg.intensity));

    // ---- the sky itself: only when something it depends on actually changed ----------
    if (was.skySig !== skySig) {
      field.querySelector(`.${TAG}-sky`).style.background = buildSky(sun, hoursFor);
      field.querySelector(`.${TAG}-plate`).style.background = buildPlate(sun);
      field.querySelector(`.${TAG}-wash`).style.background = buildWash(sun);
      const blooms = field.querySelectorAll(`.${TAG}-bloom`);
      blooms[0].style.top = `calc(${pct(sun.sunrise).toFixed(2)}% - 90px)`;
      blooms[1].style.top = `calc(${pct(sun.golden + 0.35).toFixed(2)}% - 90px)`;

      const slot = n => field.querySelector(`.${TAG}-slot-${n}`);
      const stars = slot('stars'), clouds = slot('clouds'), fall = slot('fall');
      stars.style.opacity = clouds.style.opacity = fall.style.opacity = dim;
      const s0 = cfg.stars ? starField(sun, hoursFor, m.colW) : null;
      stars.replaceChildren(...(s0 ? [s0] : []));
      const c0 = cfg.weather ? cloudField(hoursFor, m.colW, sun) : null;
      clouds.replaceChildren(...(c0 ? [c0] : []));
      const kids = [];
      if (cfg.weather) {
        const precip = precipBand(hoursFor); if (precip) kids.push(precip);
        const storm  = stormBand(hoursFor);  if (storm)  kids.push(storm);
      }
      fall.replaceChildren(...kids);
    }

    // ---- everything that depends on where the events are -----------------------------
    if (was.skySig !== skySig || was.evSig !== evSig) {
      const sunSlot = field.querySelector(`.${TAG}-slot-sun`);
      const disc = cfg.weather ? sunDisc(sun, hoursFor, m, cfg.intensity) : null;
      sunSlot.replaceChildren(...(disc || []));

      let temps = field.querySelector(`:scope > .${TAG}-temps`);
      if (temps) temps.remove();
      if (cfg.hourlyTemps) {
        temps = hourTemps(sun, hoursFor, m);
        if (temps) field.appendChild(temps);
      }
      applyGuard(sun, hoursFor, m);
    }

    // ---- the focus band, which moves on its own and is one gradient string ------------
    const focus = buildFocus(date);
    if (was.focus !== focus) {
      field.querySelector(`.${TAG}-focus`).style.background = focus;
      now.focus = focus;
    }

    painted.set(field, now);
    return true;
  }

  // Every event that our own sky pushed below the separation floor gets a 1px inset
  // ring in its own colour. Nothing else about the block is touched, and the ring is
  // removed the moment the layer is.
  let guardStats = { checked: 0, ringed: 0, worst: 99 };
  const step = hex => ({ hex, rgb: S.colour.hexToRgb(hex) });
  const STEPS_DARK  = ['#5F6368', '#3C4043', '#202124'].map(step);
  const STEPS_LIGHT = ['#C7D2E4', '#E2E9F5', '#FFFFFF'].map(step);
  const anchorsFor = sun => [0, 3, sun.civilDawn, sun.sunrise, sun.sunrise + 0.55, 9, 12, 15, 17.5,
                            sun.golden, sun.sunset, sun.civilDusk, sun.civilDusk + 0.8, 24]
                           .map(h => Math.max(0, Math.min(24, h)));
  const plateAtFor = sun => {
    const pp = [[0, .24], [sun.civilDawn, .28], [sun.sunrise + 1, .40], [9, .44], [12, .45],
                [16, .44], [sun.golden, .34], [sun.sunset, .24], [sun.civilDusk, .22], [24, .24]];
    return h => {
      let i = 0; while (i < pp.length - 2 && pp[i + 1][0] < h) i++;
      const span = Math.max(1e-6, pp[i + 1][0] - pp[i][0]);
      const t = Math.max(0, Math.min(1, (h - pp[i][0]) / span));
      return pp[i][1] + (pp[i + 1][1] - pp[i][1]) * t;
    };
  };

  // surfaceAt composites the whole ramp in linear light for one instant, and between them
  // the guard and the hourly temperatures ask for it a couple of hundred times per column.
  // A quarter of an hour is far finer than a contrast check can tell apart, and the two
  // consumers share the table.
  function surfaceCache(hoursFor, anchors, plateAt) {
    const seen = new Map();
    return h => {
      const k = Math.round(h * 4);
      let v = seen.get(k);
      if (v === undefined) seen.set(k, v = S.surfaceAt(k / 4, hoursFor, anchors, plateAt));
      return v;
    };
  }

  // Hourly temperature. The contextual layer from the design: present, quiet, and never
  // in the way. It sits at the right edge of the column, below every event, and is
  // suppressed outright wherever an event occupies that hour -- the same placement rule
  // the sun and the moment labels use.
  function hourTemps(sun, hoursFor, m) {
    const anchors = anchorsFor(sun), plateAt = plateAtFor(sun);
    const H = m.H, colW = m.colW;
    const busy = m.events.map(e => [e.top, e.bottom, e.right]);
    const wrap = document.createElement('div');
    wrap.className = `${TAG}-temps`;
    const labelH = 13 / H * 24;                       // how many hours a 13px label spans
    const surfaceAt = m.surfaceAt || (m.surfaceAt = surfaceCache(hoursFor, anchors, plateAt));
    let n = 0;
    for (let h = 0; h < 24; h++) {
      const d = hoursFor(h);
      if (!d || d.temp == null) continue;
      // covered by an event that reaches into the right margin? then do not draw it
      const covered = busy.some(([a, b, right]) =>
        b > h + 0.05 && a < h + labelH + 0.05 && right > colW - 34);
      if (covered) continue;
      const surf = surfaceAt(h + 0.5);
      // the contrast guard, applied to the smallest text in the system
      const dark = S.colour.lum(surf) > 0.40;
      const steps = dark ? STEPS_DARK : STEPS_LIGHT;
      const fill = steps.find(c => S.colour.contrast(c.rgb, surf) >= 3) || steps[steps.length - 1];
      const t = document.createElement('span');
      t.className = `${TAG}-hourtemp`;
      t.style.top = `${((h / 24) * 100).toFixed(3)}%`;
      t.style.color = fill.hex;
      t.textContent = `${Math.round(d.temp)}\u00B0`;
      wrap.appendChild(t);
      n++;
    }
    return n ? wrap : null;
  }

  // Writes only. Every rect and every computed fill this needs was already taken in
  // measureColumn, so nothing in here can force a layout.
  function applyGuard(sun, hoursFor, m) {
    const anchors = anchorsFor(sun);
    const plateAt = plateAtFor(sun);
    const surfaceAt = m.surfaceAt || (m.surfaceAt = surfaceCache(hoursFor, anchors, plateAt));
    for (const e of m.events) {
      if (e.height < 6) continue;
      const hour = Math.max(0, Math.min(24, (e.top + e.bottom) / 2));
      const surface = surfaceAt(hour);
      const out = S.ringFor(e.fill, surface);
      guardStats.checked++;
      if (out) {
        e.el.style.boxShadow = `inset 0 0 0 1px ${out.ring}`;
        e.el.dataset.skyRing = '1';
        guardStats.ringed++;
        guardStats.worst = Math.min(guardStats.worst, out.before);
      } else if (e.el.dataset.skyRing) {
        e.el.style.boxShadow = ''; delete e.el.dataset.skyRing;
      }
    }
  }

  // The contextual layer. Google's own column header is the only place with room for a
  // number, and it uses a size already on the page. Nothing else the extension draws
  // contains a digit.
  function paintHeaders(dates, fc) {
    const heads = [...document.querySelectorAll('[role="columnheader"]')];
    if (heads.length !== dates.length) return 0;
    let n = 0;
    heads.forEach((h, i) => {
      const day = fc.daily?.[dates[i]];
      if (!day) return;
      let el = h.querySelector(`:scope .${TAG}-temp`);
      if (!el) {
        el = document.createElement('div');
        el.className = `${TAG}-temp`;
        if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
        h.appendChild(el);
      }
      const hi = Math.round(day.hi), lo = Math.round(day.lo);
      const next = `${hi}/${lo}`;
      if (el.dataset.v !== next) {                    // rewriting this every repaint is churn
        el.innerHTML = `<span class="${TAG}-hi">${hi}\u00B0</span>`
                     + `<span class="${TAG}-lo">${lo}\u00B0</span>`;
        el.dataset.v = next;
      }
      n++;
    });
    return n;
  }

  // ---------------------------------------------------------------- lifecycle
  let state = { forecast: null, location: null, painting: false, cfg: null, cols: [], colMeta: [],
                pending: null, rectsDirty: true, watchedGrid: null };

  // The window is not the only thing that resizes. Collapsing Google's sidebar, or
  // changing its display density, moves the columns without touching the window and
  // without producing a mutation. Attached in render, which has just found the grid
  // anyway, rather than polled for it.
  const gridResize = window.ResizeObserver
    ? new ResizeObserver(() => { state.rectsDirty = true; schedule('grid resize'); })
    : null;
  function watchGrid(grid) {
    if (!gridResize || state.watchedGrid === grid) return;
    gridResize.disconnect();
    gridResize.observe(grid);
    state.watchedGrid = grid;
  }

  async function render(reason) {
    // Dropping a request while a paint is in flight loses it. Remember it instead and
    // run exactly once more afterwards, which coalesces a burst into a single repaint.
    if (state.painting) { state.pending = reason; return; }
    state.painting = true;
    try {
      const grid = findGrid();
      if (!grid) { log('no timed grid in this view, standing down'); unmount(); return; }
      watchGrid(grid);
      const cols = findColumns(grid);
      if (!cols.length) { unmount(); return; }

      state.cfg = await S.settings();
      if (!state.cfg.enabled) { log('weather layer is off'); unmount(); return; }
      if (state.cfg.lat != null) {
        state.location = { lat: state.cfg.lat, lon: state.cfg.lon, label: state.cfg.label || 'set' };
      }
      state.location ||= await resolveLocation();
      state.forecast ||= await S.getForecast(state.location.lat, state.location.lon);
      if (state.forecast.fetchedAt)
        S.fetchedLabel = 'updated ' + new Date(state.forecast.fetchedAt)
          .toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      if (state.forecast.error && state.forecast.source === 'unavailable') {
        log('no forecast, leaving the calendar alone:', state.forecast.error); unmount(); return;
      }

      const { dates, method, datekeySample } = columnDates(cols);
      // Read everything first, write everything second. Splitting the passes is the whole
      // point: no write in the second pass can be forced back through layout by a read.
      const measured = cols.map(measureColumn);
      const hourPx = measured[0].H / 24;
      let painted = 0;
      guardStats = { checked: 0, ringed: 0, worst: 99 };
      state.colMeta = [];
      cols.forEach((c, i) => {
        if (paintColumn(c, dates[i], state.forecast, state.location, measured[i])) painted++;
        state.colMeta.push({ cell: c, date: dates[i], rect: measured[i].box });
      });
      state.rectsDirty = false;
      const heads = paintHeaders(dates, state.forecast);
      mountFlyers(cols, dates);

      log(`${reason} · ${painted}/${cols.length} columns · ${heads} headers · ${dates[0]}…${dates[dates.length - 1]}`,
          `· ${hourPx.toFixed(1)}px/hour · dates via ${method}`,
          datekeySample !== undefined ? `· datekey sample ${datekeySample}` : '',
          `· forecast ${state.forecast.source} · ${state.location.label} · ${S.units()}`,
          `· guard ${guardStats.ringed}/${guardStats.checked} ringed`
            + (guardStats.checked === 0 ? ' (no events in DOM yet)' : '')
            + (guardStats.worst < 99 ? ` (worst was ${guardStats.worst}:1)` : ''));
    } catch (err) {
      console.warn('[sky] render failed, removing layer', err);
      unmount();
    } finally {
      state.painting = false;
      if (state.pending) { const r = state.pending; state.pending = null; schedule(r); }
    }
  }

  // The focus band is the only thing that moves without anything else changing, and it is
  // one gradient string per column. A minute tick used to run the whole painter for it.
  function updateFocus() {
    for (const { cell, date } of state.colMeta) {
      const field = cell.querySelector(`:scope > .${TAG}-field`);
      if (!field) return schedule('tick, layer gone');
      const rec = painted.get(field);
      const next = buildFocus(date);
      if (rec && rec.focus === next) continue;
      field.querySelector(`.${TAG}-focus`).style.background = next;
      if (rec) rec.focus = next;
    }
  }

  function unmount() {
    document.querySelectorAll(`.${TAG}-field, .${TAG}-temp, .${TAG}-flyers`).forEach(n => n.remove());
    document.querySelectorAll('[data-sky-ring]').forEach(n => { n.style.boxShadow = ''; delete n.dataset.skyRing; });
    if (S.stopFlyers) S.stopFlyers();
    if (S.hidePopover) S.hidePopover();
    if (gridResize) { gridResize.disconnect(); state.watchedGrid = null; }
    state.colMeta = [];
  }

  function mountFlyers(cols, dates) {
    if (!S.startFlyers) return;
    const cfg = state.cfg || S.DEFAULTS;
    const row = cols[0].parentElement;
    if (!row || !cols.every(c => c.parentElement === row)) return S.stopFlyers();
    S.startFlyers(row, {
      cfg, dates,
      hourlyAt: (date, h) => state.forecast?.hourly?.[`${date}T${String(Math.max(0, Math.min(23, Math.round(h)))).padStart(2, '0')}:00`] || null,
      sunFor: date => {
        const day = state.forecast?.daily?.[date];
        return day ? S.solarDay(date, day.sunrise, day.sunset, state.location.lat, state.location.lon)
                   : S.solarDayComputed(date, state.location.lat, state.location.lon);
      }
    });
  }

  let timer = null;
  const schedule = (reason) => { clearTimeout(timer); timer = setTimeout(() => render(reason), 180); };
  // Google paints the grid before it paints the events, so the first pass measures an
  // empty column and the guard has nothing to check. Come back once things have settled.
  const settle = () => { setTimeout(() => render('settle'), 700); setTimeout(() => render('settle'), 2200); };

  // Cheap enough to run inside a MutationObserver callback that fires hundreds of times a
  // minute: no allocation, no spread, no closure per record.
  function ours(n) {
    if (!n || n.nodeType !== 1) return true;              // text nodes are not interesting
    const c = n.className;
    return typeof c === 'string' && c.startsWith(TAG);
  }
  function ourMutation(m) {
    if (!ours(m.target)) {
      for (let i = 0; i < m.addedNodes.length; i++)   if (!ours(m.addedNodes[i]))   return false;
      for (let i = 0; i < m.removedNodes.length; i++) if (!ours(m.removedNodes[i])) return false;
      return m.addedNodes.length + m.removedNodes.length > 0;
    }
    return true;
  }

  function observe() {
    const root = document.querySelector('[role="main"]') || document.body;
    new MutationObserver(muts => {
      for (let i = 0; i < muts.length; i++) {
        if (ourMutation(muts[i])) continue;
        schedule('dom change');
        return;
      }
    }).observe(root, { childList: true, subtree: true });

    // The grid scrolls under the cursor, so cached column rectangles go stale without any
    // mutation at all. Mark them rather than re-reading: the next hover pays for it.
    const stale = () => { state.rectsDirty = true; };
    addEventListener('scroll', stale, { passive: true, capture: true });

    // A resize changes the column width and height, which the sky is a function of, and
    // it produces no mutation at all -- so watching the DOM was never going to catch it.
    // Cloud widths, star positions and the size of the sun all come from those numbers.
    addEventListener('resize', () => { stale(); schedule('resize'); }, { passive: true });

    let last = location.pathname;
    setInterval(() => { if (location.pathname !== last) { last = location.pathname; unmount(); schedule('view change'); } }, 400);
    setInterval(() => { state.forecast = null; schedule('forecast refresh'); }, 15 * 60 * 1000);
    setInterval(updateFocus, 60 * 1000);   // the focus band moves, and nothing else does
  }

  // Geometry only. No hit testing, no pointer capture, nothing that could interfere with
  // Google's drag-to-create on the grid.
  //
  // Split in two, because the whole of it used to run on every mousemove: which column,
  // which hour, then the full solar day (three forty-step binary searches) and the
  // composited surface colour, several dozen times a second, to answer a question whose
  // answer only changes when the cursor crosses an hour line. Now the move path is four
  // comparisons against cached rectangles, and the expensive half runs once, when the
  // popover is actually about to be drawn.
  function hitPoint(x, y) {
    const cfg = state.cfg || S.DEFAULTS;
    if (!cfg.enabled || cfg.detail !== 'hover' || !state.forecast) return null;
    if (state.rectsDirty) {
      for (const c of state.colMeta) c.rect = c.cell.getBoundingClientRect();
      state.rectsDirty = false;
    }
    for (const { date, rect: r } of state.colMeta) {
      if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const hour = Math.max(0, Math.min(23.999, ((y - r.top) / r.height) * 24));
      return { date, hour };
    }
    return null;
  }

  function describePoint(hit) {
    if (!hit || !state.forecast) return null;
    const { date, hour } = hit;
    const hh = String(Math.floor(hour)).padStart(2, '0');
    const d = state.forecast.hourly?.[`${date}T${hh}:00`];
    if (!d) return null;
    const day = state.forecast.daily?.[date];
    const sun = day ? S.solarDay(date, day.sunrise, day.sunset, state.location.lat, state.location.lon)
                    : S.solarDayComputed(date, state.location.lat, state.location.lon);
    const anchors = anchorsFor(sun), plateAt = plateAtFor(sun);
    const hoursFor = h => state.forecast.hourly?.[`${date}T${String(Math.max(0, Math.min(23, Math.round(h)))).padStart(2, '0')}:00`] || null;
    const surf = S.surfaceAt(hour, hoursFor, anchors, plateAt);
    const dt = new Date(date + 'T12:00:00');
    return {
      date, hour: Math.floor(hour), d, sun,
      unit: S.units(),
      skyColour: S.colour.toHex(surf),
      dayLabel: dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    };
  }

  const resolvePoint = (x, y) => describePoint(hitPoint(x, y));

  S.render = render; S.unmount = unmount;
  // Throw the cached forecast away and redraw from a fresh one. The fifteen-minute timer
  // does this on its own; this is for when you want it now.
  S.refresh = async () => { state.forecast = null; await render('manual refresh'); };
  S.setUnits    = async u => { await S.saveSettings({ units: u === 'f' ? 'f' : u === 'c' ? 'c' : 'auto' }); };
  S.setLocation = async (lat, lon, label) => {
    await S.saveSettings({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100,
                           label: label || `${lat}, ${lon}` });
  };
  S.settingsNow = () => state.cfg;

  (async () => {
    const cfg = await S.settings();
    S.popoverEnabled = cfg.enabled && cfg.detail === 'hover';
    S.enablePopover(hitPoint, describePoint);
  })();

  S.onSettingsChanged(cfg => {
    state.cfg = cfg;
    state.location = null;
    state.forecast = null;
    S.popoverEnabled = cfg.enabled && cfg.detail === 'hover';
    S.hidePopover();
    unmount();
    if (cfg.enabled) render('settings changed');
  });

  log('mounting');
  render('initial');
  settle();
  observe();
})();
