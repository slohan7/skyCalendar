// Traffic. Aircraft and birds, crossing the grid now and then.
//
// This is the one part of the system that is not a function of the forecast, and it is
// deliberately rare: a flyer every half-minute to two minutes, never more than two at
// once, and never at all in weather that would keep them on the ground. If you sit and
// wait for one you have misunderstood it. You are supposed to catch one out of the
// corner of your eye and go back to reading your week.
//
// The layer is mounted on the row that holds the day columns rather than inside a
// column, because a plane that vanishes at a Tuesday/Wednesday boundary is a plane made
// of DOM. It sits at z-index 1: above the sky, which is 0, and below events, which
// Google puts at 5.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const TAG = 'skycal';

  let layer = null, host = null, timer = null, ctx = null;

  // Counted off the DOM rather than kept in a variable. A counter only stays correct if
  // every flyer ends by firing animationend, and one that is removed any other way --
  // the layer torn down, the animation cancelled by a reduced-motion media query, an
  // element display:none'd -- leaks a slot and eventually stops the traffic for good.
  const live = () => (layer ? layer.childElementCount : 0);

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // ---------------------------------------------------------------- the aircraft
  // A top view, because that is the side of an aeroplane you see from a calendar. Built
  // from a mirrored half so the thing is symmetrical by construction: nose at the right,
  // swept wings, tailplane, and no undercarriage, since it is at altitude.
  const HALF = [
    [63, 10], [49, 7.9], [43, 7.9], [34, 1.4], [29.5, 1.4], [36, 8.4],
    [17, 8.9], [11, 3.7], [8, 3.7], [10.6, 9.3], [3, 9.7], [3, 10]
  ];
  const PLANE_PATH = (() => {
    const down = HALF.map(([x, y]) => `${x},${y}`);
    const up = HALF.slice(0, -1).reverse().map(([x, y]) => `${x},${(20 - y).toFixed(1)}`);
    return `M${down.join(' L')} L${up.join(' L')} Z`;
  })();

  function plane(width, night) {
    const el = document.createElement('div');
    el.className = `${TAG}-flyer ${TAG}-plane`;
    const h = width * (20 / 66);
    // At night there is no contrail to see, only the beacon; by day the contrail is the
    // whole point, so it draws itself in behind the aircraft as it goes.
    el.innerHTML =
      `<i class="${TAG}-body" style="width:${width.toFixed(0)}px;height:${h.toFixed(1)}px">`
      + (night ? '' : `<i class="${TAG}-contrail"></i>`)
      + `<svg viewBox="0 0 66 20" width="${width.toFixed(0)}" height="${h.toFixed(1)}" aria-hidden="true">`
      + `<path d="${PLANE_PATH}"/></svg>`
      + (night ? `<i class="${TAG}-beacon"></i>` : '')
      + `</i>`;
    return el;
  }

  // ---------------------------------------------------------------- the birds
  // Not a V. A V is a goose thing and it reads as a logo at this size. This is a loose
  // skein: a rough diagonal with the spacing pulled about, which is what a flock of
  // anything smaller actually looks like from underneath.
  function birds(count, scale) {
    const el = document.createElement('div');
    el.className = `${TAG}-flyer ${TAG}-birds`;
    let html = '';
    for (let i = 0; i < count; i++) {
      const w = (9 + rnd(-1.4, 2.6)) * scale;
      const x = i * rnd(9, 15) * scale;
      const y = i * rnd(2.4, 6.5) * scale * (i % 3 === 1 ? -0.8 : 1);
      html += `<i class="${TAG}-bird" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;`
        + `width:${w.toFixed(1)}px;`
        // every bird flaps at its own rate, or the flock beats like a metronome
        + `animation-duration:${rnd(0.34, 0.62).toFixed(2)}s;`
        + `animation-delay:-${rnd(0, 0.6).toFixed(2)}s">`
        + `<svg viewBox="0 0 14 7" width="100%" aria-hidden="true">`
        + `<path d="M1 5.6 Q3.6 0.9 7 4.2 Q10.4 0.9 13 5.6" fill="none" stroke="currentColor"`
        + ` stroke-width="1.5" stroke-linecap="round"/></svg></i>`;
    }
    el.innerHTML = html;
    return el;
  }

  // ---------------------------------------------------------------- when, and whether
  const reduced = () => {
    if (ctx?.cfg?.motion === 'reduce') return true;
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };

  // Nothing flies in a downpour, and nothing is visible through a full deck. Birds also
  // go quiet in heavy rain long before a jet does, which is why the thresholds differ.
  function flyable(date, hour, kind) {
    const d = ctx.hourlyAt(date, hour);
    if (!d) return true;                                // no data is not a reason to stop
    if (kind === 'birds') return (d.precip ?? 0) < 0.25 && d.cloud < 0.88;
    return (d.precip ?? 0) < 0.9 && d.cloud < 0.95;     // an airliner is above the weather
  }

  // Returns whether anything actually took off. Most of the reasons it declines are the
  // point of the feature -- nothing flies through a squall, and there are no birds at
  // two in the morning -- so declining is a normal outcome, not a failure.
  function spawn() {
    timer = null;
    if (!layer || live() >= 2 || document.visibilityState !== 'visible' || reduced()) { rearm(); return false; }

    const date = pick(ctx.dates);
    const sun = ctx.sunFor(date);
    if (!sun) { rearm(6000); return false; }             // polar day or night: no window

    // Birds keep daylight hours and crowd the ends of the day. Aircraft fly at any hour,
    // and after dusk they are a beacon rather than a contrail.
    const kind = Math.random() < 0.62 ? 'birds' : 'plane';
    let hour;
    if (kind === 'birds') {
      hour = Math.random() < 0.55
        ? (Math.random() < 0.5 ? rnd(sun.sunrise - 0.2, sun.sunrise + 2.2)   // the dawn lift
                               : rnd(sun.sunset - 2.4, sun.sunset + 0.3))    // going to roost
        : rnd(sun.sunrise + 1, sun.sunset - 1);
    } else {
      hour = rnd(1, 23);
    }
    hour = Math.max(0.4, Math.min(23.6, hour));
    if (!flyable(date, hour, kind)) { rearm(9000); return false; }

    const night = hour < sun.civilDawn || hour > sun.civilDusk;
    if (kind === 'birds' && night) { rearm(9000); return false; }

    const W = layer.clientWidth, H = layer.clientHeight;
    if (!W || !H) { rearm(); return false; }

    const rightward = Math.random() < 0.5;
    const el = kind === 'plane'
      ? plane(rnd(26, 40), night)
      : birds(3 + Math.floor(Math.random() * 5), rnd(0.8, 1.3));

    // Slow. A plane crossing a week takes the better part of a minute, which is about
    // how long a real one takes to cross the part of the sky you can see out of a window.
    const secs = kind === 'plane' ? rnd(34, 52) : rnd(19, 30);
    const from = rightward ? -140 : W + 140;
    const to   = rightward ? W + 140 : -140;
    const drift = rnd(-26, 26);                         // a little height gained or lost

    el.classList.add(rightward ? `${TAG}-east` : `${TAG}-west`);
    if (night) el.classList.add(`${TAG}-night`);
    el.style.cssText += `;top:${((hour / 24) * H).toFixed(0)}px;`
      + `--sky-from:${from.toFixed(0)}px;--sky-to:${to.toFixed(0)}px;`
      + `--sky-drift:${drift.toFixed(0)}px;`
      + `animation-duration:${secs.toFixed(1)}s`;

    el.addEventListener('animationend', () => el.remove(), { once: true });
    // A backstop, because an animation that never gets to run -- a background tab, a
    // cancelled transition -- would otherwise leave the element parked on screen forever.
    setTimeout(() => el.remove(), secs * 1000 + 4000);
    layer.appendChild(el);
    rearm();
    return true;
  }

  const rearm = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(spawn, ms ?? rnd(26000, 96000));
  };

  // ---------------------------------------------------------------- mounting
  // Called on every repaint, so it has to be idempotent: refresh the context, and only
  // build the layer and start the clock if they are not already running.
  S.startFlyers = function (row, c) {
    ctx = c;
    // Motion off means no traffic at all, and that includes whatever is halfway across
    // right now: a frozen aeroplane is a sticker.
    if (!c.cfg.enabled || c.cfg.flyers === false || reduced()) return S.stopFlyers();
    if (layer && host === row && layer.isConnected) return;
    S.stopFlyers();
    host = row;
    if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
    layer = document.createElement('div');
    layer.className = `${TAG}-flyers`;
    row.appendChild(layer);
    rearm(rnd(4000, 14000));                            // one soon after the sky lands
  };

  S.stopFlyers = function () {
    clearTimeout(timer); timer = null;
    if (layer) layer.remove();
    layer = null; host = null;
  };

  // A hidden tab should not be spawning aircraft it will never show anyone.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (layer && !timer) rearm(rnd(3000, 12000)); }
    else { clearTimeout(timer); timer = null; }
  });

  // Console handle, in the same spirit as the others: see one now rather than wait. It
  // keeps trying, because a single spawn picks a random day and hour and may quite
  // legitimately land in the rain. Returns false only if nothing could fly at all.
  S.flyNow = () => {
    clearTimeout(timer); timer = null;
    for (let i = 0; i < 24; i++) if (spawn()) return true;
    return false;
  };
})();
