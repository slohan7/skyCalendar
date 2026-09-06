// The detailed layer. Reached by hovering an hour in the grid, and shown no other way.
//
// It never takes a pointer event. Google Calendar uses mousedown-drag on the grid to
// create events, so intercepting anything there would break the calendar. Instead this
// listens passively on the document, works out which column and hour the cursor is over
// from geometry alone, and draws a fixed-position panel that is itself pointer-transparent.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const TAG = 'skycal';
  const DWELL = 380;             // ms of stillness before it appears
  let el = null, timer = null, current = null, armed = false;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = `${TAG}-popover`;
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
    return el;
  }

  const f1 = n => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  const hm = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

  function render(ctx) {
    const { date, hour, d, sun, unit, skyColour, dayLabel } = ctx;
    const p = build();
    const deg = unit === 'fahrenheit' ? '°F' : '°C';
    const rows = [
      ['Precipitation', d.precip > 0 ? `${f1(d.precip)} ${unit === 'fahrenheit' ? 'in' : 'mm'}` : `${Math.round(d.precipProb || 0)}% chance`],
      ['Wind', `${Math.round(d.wind)} ${unit === 'fahrenheit' ? 'mph' : 'km/h'}`],
      ['Humidity', `${Math.round(d.humidity)}%`],
      ['Cloud cover', `${Math.round(d.cloud * 100)}%`],
      ['UV index', d.uv == null ? '—' : f1(d.uv)]
    ];
    p.innerHTML =
      `<div class="${TAG}-pop-head" style="background:linear-gradient(180deg, ${skyColour} 0%, transparent 100%)">
         <div class="${TAG}-pop-date">${dayLabel}</div>
         <div class="${TAG}-pop-time">${hm(hour)} – ${hm(hour + 1)}</div>
         <div class="${TAG}-pop-temp">${Math.round(d.temp)}<span>${deg}</span></div>
       </div>
       <div class="${TAG}-pop-cond">
         <span>${S.conditionText(d.code)}</span>
         <em>feels ${Math.round(d.feels)}°</em>
       </div>
       <dl class="${TAG}-pop-rows">
         ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
       </dl>
       <div class="${TAG}-pop-foot">
         <span>Open-Meteo · ${S.fetchedLabel || 'cached'}</span>
         <span>${sun ? `sunset ${hm(sun.sunset)}` : ''}</span>
       </div>`;
    return p;
  }

  function place(p, x, y) {
    const w = 268, gap = 16;
    const vw = innerWidth, vh = innerHeight;
    const r = p.getBoundingClientRect();
    const h = r.height || 250;
    let left = x + gap;
    if (left + w > vw - 8) left = x - gap - w;
    let top = y - h / 2;
    top = Math.max(8, Math.min(vh - h - 8, top));
    p.style.left = `${Math.round(left)}px`;
    p.style.top = `${Math.round(top)}px`;
  }

  function hide() {
    clearTimeout(timer);
    current = null;
    if (el) el.classList.remove(`${TAG}-pop-on`);
  }
  S.hidePopover = hide;

  // Both resolvers are supplied by content.js. `hit` is cheap: which column, which hour,
  // from cached rectangles. `describe` is not: it solves the day's solar geometry and
  // composites the surface colour. The listener does no work of its own beyond recording
  // where the cursor is; one frame later it runs `hit`, and `describe` runs once, inside
  // the dwell, when the panel is actually about to be drawn.
  //
  // Before this split, a mousemove ran the whole chain. At sixty to a hundred and twenty
  // events a second that is the extension quietly taxing every drag on the calendar.
  S.enablePopover = function (hit, describe) {
    S.hitPoint = hit;
    S.describePoint = describe;
    S.resolvePoint = (x, y) => describe(hit(x, y));
    if (armed) return;
    armed = true;

    let mx = 0, my = 0, queued = false;

    function frame() {
      queued = false;
      if (!S.popoverEnabled) return hide();
      const h = S.hitPoint(mx, my);
      if (!h) return hide();
      const key = `${h.date}@${Math.floor(h.hour)}`;
      if (key === current) { if (el) place(el, mx, my); return; }
      clearTimeout(timer);
      const x = mx, y = my;
      timer = setTimeout(() => {
        const ctx = S.describePoint(h);
        if (!ctx) return hide();
        current = key;
        const p = render(ctx);
        p.classList.add(`${TAG}-pop-on`);
        place(p, x, y);
      }, DWELL);
    }

    addEventListener('mousemove', ev => {
      mx = ev.clientX; my = ev.clientY;
      if (queued) return;                 // at most one hit test per frame, never per event
      queued = true;
      requestAnimationFrame(frame);
    }, { passive: true });

    addEventListener('mousedown', hide, { passive: true, capture: true });
    addEventListener('wheel', hide, { passive: true, capture: true });
    addEventListener('keydown', hide, { passive: true });
    document.addEventListener('mouseleave', hide, { passive: true });
  };

  S.removePopover = () => { hide(); if (el) { el.remove(); el = null; } };
})();
