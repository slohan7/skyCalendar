// The assertions. `window.__h.run()` returns every check with the number behind it, and
// a count of what failed. Budgets are set just above what the code currently does, so a
// regression trips them rather than being absorbed.
//
// The numbers these replaced, measured on this same harness before any of it was fixed:
//
//   one Google DOM mutation   1279 of 1303 layer nodes replaced, 163ms of long task
//   repaint, nothing changed  47.9ms, same full rebuild
//   200 mousemoves            59.6ms, 763 forced layout reads
//
// The first of those is the flash. Replacing the nodes restarts every cloud drift, every
// twinkle and every raindrop from zero, several times a minute, because Google touched
// its own DOM.
(() => {
  const h = window.__h;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  // ---- what the sky must not spend ---------------------------------------------------
  // Counts, not milliseconds. Wall-clock in a browser swings by a factor of three between
  // consecutive identical runs -- a no-op repaint measured 4.3, 6.5, 6.0 and 16.8ms in
  // four passes -- so a millisecond budget is a coin toss dressed up as an assertion. The
  // work that drives the time is exact and deterministic: how many nodes were replaced,
  // and how many times layout was forced. Timings are reported, and asserted on never.
  const BUDGET = [
    ['a repaint with nothing changed replaces no nodes',   p => p.noop.nodesRebuilt === 0,        p => p.noop.nodesRebuilt],
    ['Google churning its own DOM replaces no nodes',      p => p.churn.nodesRebuilt === 0,       p => p.churn.nodesRebuilt],
    ['Google churning its own DOM causes no long task',    p => p.churn.longtaskMs === 0,         p => p.churn.longtaskMs + 'ms'],
    ['one read pass per column, not three',                p => p.noop.rectReads < 90,            p => p.noop.rectReads],
    ['one style read per event, and only in that pass',    p => p.noop.styleReads <= 56,          p => p.noop.styleReads],
    ['200 mousemoves force at most 8 layout reads',        p => p.mousemove.rectReads <= 8,       p => p.mousemove.rectReads],
    ['200 mousemoves read no computed styles',             p => p.mousemove.styleReads === 0,     p => p.mousemove.styleReads],
    ['moving events repaints only what depends on them',   p => p.eventsMoved.nodesRebuilt < 400, p => p.eventsMoved.nodesRebuilt]
  ];

  // ---- and what it must actually do --------------------------------------------------
  async function legibilityAt(level) {
      const S = window.__SkyCal, C = S.colour;
      await h.setConfig({ glass: level });
      const cells = $$('[role="gridcell"]').filter(c => c.getBoundingClientRect().height > 500);
      const worst = { ratio: 99, id: null };
      let checked = 0, seeThrough = 0, flipped = 0;
      for (const cell of cells) {
        const date = cell.querySelector('.skycal-field').dataset.date;
        const box = cell.getBoundingClientRect(), H = box.height;
        // The same solar day the painter used. Solving it the other way (from geometry
        // rather than from the forecast's own sunrise) shifts every anchor and quietly
        // models a different sky than the one the decisions were made against.
        const day = window.__fc.daily[date];
        const sun = day ? S.solarDay(date, day.sunrise, day.sunset, 42.28, -83.74)
                        : S.solarDayComputed(date, 42.28, -83.74);
        const anchors = [0, 3, sun.civilDawn, sun.sunrise, sun.sunrise + 0.55, 9, 12, 15, 17.5,
                         sun.golden, sun.sunset, sun.civilDusk, sun.civilDusk + 0.8, 24]
                        .map(x => Math.max(0, Math.min(24, x)));
        const plateAt = S.plateAt(sun);
        const hoursFor = x => window.__fc.hourly[`${date}T${String(Math.max(0, Math.min(23, Math.round(x)))).padStart(2, '0')}:00`] || null;
        for (const el of cell.querySelectorAll('[data-eventid]')) {
          const r = el.getBoundingClientRect();
          if (r.height < 6) continue;
          const drew = window.__stockFill.get(el.getAttribute('data-eventid'));
          const stockFill = C.hexToRgb(drew.fill), stockInk = C.hexToRgb(drew.ink);
          const target = Math.min(S.GLASS_TARGET, C.contrast(stockInk, stockFill));

          const cs = getComputedStyle(el);
          const m = cs.backgroundColor.match(/[\d.]+/g).map(Number);
          const alpha = m.length > 3 ? m[3] : 1;
          const ink = C.parseRgb(cs.color);
          const hour = Math.max(0, Math.min(24, ((r.top + r.bottom) / 2 - box.top) / H * 24));
          const surface = S.surfaceAt(hour, hoursFor, anchors, plateAt);
          const back = C.over(stockFill, surface, alpha);
          const got = C.contrast(ink, back);

          checked++;
          if (alpha < 0.999) seeThrough++;
          if (C.contrast(ink, stockInk) > 1.05) flipped++;
          if (got + 0.02 < target && got < worst.ratio)
            worst.ratio = +got.toFixed(2), worst.id = `${el.getAttribute('data-eventid')} @${hour.toFixed(1)}h wanted ${target.toFixed(2)}`;
        }
      }
      return { ok: worst.id === null && checked > 0 && seeThrough > 0,
               checked, seeThrough, labelsFlipped: flipped, worstFailure: worst.id };
    }

  const BEHAVIOUR = {
    // The flash, stated directly: a cloud must be the same element afterwards, with its
    // animation further along than it was. A rebuilt cloud starts again at zero.
    async 'cloud animations survive a Google mutation'() {
      const cloud = $('.skycal-cloud');
      if (!cloud) return { skip: 'no clouds in this fixture' };
      const t0 = cloud.getAnimations()[0]?.currentTime ?? 0;
      h.churn(40);
      await h.settle(650);
      const t1 = cloud.getAnimations()[0]?.currentTime ?? 0;
      return { ok: cloud.isConnected && t1 > t0, was: Math.round(t0), now: Math.round(t1) };
    },

    async 'the sun is a light source, not an overlay'() {
      const halo = $('.skycal-sun-halo'), disc = $('.skycal-sun');
      if (!halo || !disc) return { ok: false, why: 'no sun drawn' };
      const blend = getComputedStyle(disc).mixBlendMode;
      const alpha = Math.min(...$$('.skycal-sun').map(e => parseFloat(e.style.opacity)));
      return { ok: blend === 'screen' && alpha >= 0.6 && !!$('.skycal-sun-core'),
               blend, dimmestSun: alpha };
    },

    // A blend mode that reached Google's own pixels would be a bug, not an effect.
    async 'the blend cannot escape our own field'() {
      const f = $('.skycal-field');
      return { ok: getComputedStyle(f).isolation === 'isolate' };
    },

    async 'flyers cross the whole week, above the sky and below events'() {
      const layer = $('.skycal-flyers');
      if (!layer) return { ok: false, why: 'no flyer layer' };
      const cols = $$('[role="gridcell"]').filter(c => c.getBoundingClientRect().height > 500);
      const onRow = cols.every(c => c.parentElement === layer.parentElement);
      const z = +getComputedStyle(layer).zIndex;
      const skyZ = +getComputedStyle($('.skycal-field')).zIndex;
      return { ok: onRow && z > skyZ && z < 5, spansAllColumns: onRow, z, skyZ };
    },

    async 'a flyer is one element that removes itself'() {
      $$('.skycal-flyers > *').forEach(n => n.remove());
      const got = window.__SkyCal.flyNow();
      const el = $('.skycal-flyers > .skycal-flyer:last-child');
      const ok = got && $('.skycal-flyers').childElementCount === 1 && !!el
              && el.getAnimations().length > 0
              && parseFloat(el.style.animationDuration) > 15;
      if (el) el.remove();
      return { ok, seconds: el ? parseFloat(el.style.animationDuration) : null };
    },

    // The counter this replaced leaked a slot whenever a flyer left any way other than by
    // finishing -- and two leaks stopped the traffic for the rest of the session. Removing
    // eight in a row without ever letting animationend fire is exactly that failure.
    async 'flyers keep spawning after one is removed abruptly'() {
      const S = window.__SkyCal;
      $$('.skycal-flyers > *').forEach(n => n.remove());
      let spawned = 0;
      for (let i = 0; i < 8; i++) {
        if (!S.flyNow()) continue;
        const el = $('.skycal-flyers > .skycal-flyer:last-child');
        if (el) { spawned++; el.remove(); }          // removed WITHOUT animationend firing
      }
      return { ok: spawned === 8, spawned };
    },

    // The whole feature rests on one promise, so it is measured rather than asserted by
    // construction: every block is re-derived from what the harness drew, composited over
    // the surface the extension itself models, and compared against what stock Google
    // gives that block. Nothing here asks the extension what it thinks it did.
    async 'no see-through event is harder to read than stock Google'() {
      return legibilityAt('clear');
    },

    async 'and nor is an outlined one, where there is almost no fill left'() {
      return legibilityAt('outline');
    },

    // The point of the feature. If nothing ended up see-through it passed the check above
    // by doing nothing at all.
    async 'the sky is actually visible through the blocks'() {
      await h.setConfig({ glass: 'clear' });
      const a = $$('[data-eventid]').map(e => {
        const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number);
        return m.length > 3 ? m[3] : 1;
      });
      const through = a.filter(x => x < 0.999);
      return { ok: through.length > a.length * 0.7, blocks: a.length, seeThrough: through.length,
               clearest: Math.min(...a) };
    },

    // Each level has to be its own level, in order.
    async 'the four levels are actually four levels'() {
      const mean = () => { const a = $$('[data-eventid]').map(e => {
          const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number);
          return m.length > 3 ? m[3] : 1; });
        return a.reduce((x, y) => x + y, 0) / a.length; };
      await h.setConfig({ glass: 'outline' }); const outline = mean();
      await h.setConfig({ glass: 'clear' });   const clear = mean();
      await h.setConfig({ glass: 'tinted' });  const tinted = mean();
      await h.setConfig({ glass: 'off' });     const off = mean();
      await h.setConfig({ glass: 'outline' });
      return { ok: outline < clear && clear < tinted && tinted < off && off === 1,
               outline: +outline.toFixed(3), clear: +clear.toFixed(3),
               tinted: +tinted.toFixed(3), off };
    },

    // The "weird black line": Google's border stayed opaque while the fill went
    // see-through, and the separation guard -- built to fire rarely, on an emergency --
    // was firing on every block and painting a darkened neutral round it. Every edge on a
    // see-through block should now be the event's own colour, not a dark neutral.
    async 'no block is outlined in a colour that is not its own'() {
      const C = window.__SkyCal.colour;
      await h.setConfig({ glass: 'outline' });
      const off = [];
      for (const el of $$('[data-eventid]')) {
        const cs = getComputedStyle(el);
        const m = cs.boxShadow.match(/rgba?\([^)]*\)/);
        if (!m) { off.push('no edge'); continue; }
        const edge = C.parseRgb(m[0]);
        const own = C.parseRgb(window.__SkyCal.stockOf(el).fill);
        // same hue family: the edge is that colour walked lighter or darker, never a grey
        const chroma = c => Math.max(...c) - Math.min(...c);
        const greyish = chroma(edge) < 0.06 && chroma(own) > 0.12;
        // and Google's own border must not still be sitting there at full strength
        const borderOpaque = C.parseRgb(cs.borderTopColor) &&
                             !/transparent|, ?0\)/.test(cs.borderTopColor);
        if (greyish || borderOpaque) off.push(el.getAttribute('data-eventid'));
      }
      return { ok: off.length === 0, wrong: off.slice(0, 4), n: off.length };
    },

    // Outlined has to actually be outlined: a real edge, and a label that still reads.
    async 'outlined blocks keep an edge and a readable label'() {
      await h.setConfig({ glass: 'outline' });
      const els = $$('[data-eventid]');
      const withEdge = els.filter(e => /inset/.test(getComputedStyle(e).boxShadow));
      const alphas = els.map(e => {
        const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number);
        return m.length > 3 ? m[3] : 1; });
      return { ok: withEdge.length === els.length && Math.min(...alphas) <= 0.14,
               blocks: els.length, edged: withEdge.length, clearest: Math.min(...alphas) };
    },

    // Off means Google's own blocks back, byte for byte, not "something close".
    async 'off restores exactly what Google drew'() {
      await h.setConfig({ glass: 'off' });
      const C = window.__SkyCal.colour;
      const bad = $$('[data-eventid]').filter(e => {
        const want = window.__stockFill.get(e.getAttribute('data-eventid'));
        const cs = getComputedStyle(e);
        return C.toHex(C.parseRgb(cs.backgroundColor)) !== want.fill.toLowerCase()
            || C.toHex(C.parseRgb(cs.color)) !== want.ink.toLowerCase()
            || cs.backgroundColor.startsWith('rgba');
      });
      const marks = $$('[data-sky-glass], [data-sky-ink]').length;
      await h.setConfig({ glass: 'clear' });
      return { ok: bad.length === 0 && marks === 0, wrong: bad.length, marksLeft: marks };
    },

    // Recolouring an event is the case where caching "what Google drew" turns into
    // painting a dead colour back over a live one.
    async 'an event recoloured in place is not repainted with its old colour'() {
      await h.setConfig({ glass: 'clear' });
      const el = $('[data-eventid]');
      const id = el.getAttribute('data-eventid');
      const before = getComputedStyle(el).backgroundColor;
      // Google's move: write the new fill straight onto the same element.
      el.style.backgroundColor = '#0B8043';
      el.style.color = '#ffffff';
      window.__stockFill.set(id, { fill: '#0B8043', ink: '#ffffff' });
      h.moveEvents();                                   // force the event half to repaint
      await h.render('recoloured');
      await h.settle(250);
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
      const now = { r: m[0], g: m[1], b: m[2] };
      const ok = now.r === 11 && now.g === 128 && now.b === 67;    // #0B8043, still see-through
      h.seedEvents();
      await h.render('reseed');
      await h.settle(250);
      return { ok, before, became: `rgb(${now.r}, ${now.g}, ${now.b})`, alpha: m[3] ?? 1 };
    },

    // Google throws chips away and rebuilds them constantly. A rebuilt chip at the same
    // hour in the same colour signs identically by value while being a different element
    // carrying none of our treatment, and skipping that repaint is what makes events snap
    // back to opaque on a real calendar.
    async 'a chip rebuilt with identical geometry is dressed again'() {
      await h.setConfig({ glass: 'outline' });
      const dressedBefore = $$('[data-sky-glass]').length;
      h.seedEvents();                        // same ids, same hours, same colours, new nodes
      await h.render('rebuilt');
      await h.settle(300);
      const after = $$('[data-sky-glass]').length;
      const opaque = $$('[data-eventid]').filter(e =>
        !/rgba/.test(getComputedStyle(e).backgroundColor)).length;
      return { ok: after === dressedBefore && after > 0 && opaque === 0,
               dressedBefore, after, leftOpaque: opaque };
    },

    async 'turning the layer off leaves nothing behind'() {
      window.__SkyCal.unmount();
      const left = $$('.skycal-field, .skycal-flyers, .skycal-temp').length;
      const rings = $$('[data-sky-ring]').length + $$('[data-sky-glass], [data-sky-ink]').length;
      await h.render('remount');
      await h.settle(400);
      return { ok: left === 0 && rings === 0 && $$('.skycal-field').length > 0, left, rings };
    }
  };

  // ---- and that every setting still means something ----------------------------------
  // Nine controls, and the claim in settings.js is that every one of them does something.
  // This is that claim, checked. It also covers the reason the sun was given its own slot
  // rather than left inside the weather layer's group opacity: at any intensity below 1
  // the group would isolate it, and a screen blend against a transparent backdrop is a
  // no-op. If `subtle.sunBlend` ever comes back as anything but `screen`, that is why.
  const snap = () => ({
    fields: $$('.skycal-field').length,
    flyerLayer: $$('.skycal-flyers').length,
    suns: $$('.skycal-sun').length,
    sunOpacity: $('.skycal-sun') ? +$('.skycal-sun').style.opacity : null,
    sunBlend: $('.skycal-sun') ? getComputedStyle($('.skycal-sun')).mixBlendMode : null,
    clouds: $$('.skycal-cloud').length,
    stars: $$('.skycal-stars > i').length,
    rain: $$('.skycal-rain').length,
    storm: $$('.skycal-storm').length,
    temps: $$('.skycal-hourtemp').length
  });

  h.matrix = async function () {
    const before = snap();
    const seen = {};
    const step = async (name, fn) => { await fn(); seen[name] = snap(); };

    await step('stormy',        () => h.setWeather({ cloudy: true, wet: true, storm: true }));
    await step('clearAgain',    () => h.setWeather({}));
    await step('subtle',        () => h.setConfig({ intensity: 0.55 }));
    await step('noFlyers',      () => h.setConfig({ intensity: 1, flyers: false }));
    await step('reducedMotion', () => h.setConfig({ flyers: true, motion: 'reduce' }));
    await step('noWeather',     () => h.setConfig({ motion: 'system', weather: false }));
    await step('noStars',       () => h.setConfig({ weather: true, stars: false }));
    await step('noTemps',       () => h.setConfig({ stars: true, hourlyTemps: false }));
    // Without a teardown: this is what catches a setting left out of the signature.
    await step('noTempsLive',   () => h.setConfigLive({ hourlyTemps: false }));
    await step('tempsBackLive', () => h.setConfigLive({ hourlyTemps: true }));
    await step('subtleLive',    () => h.setConfigLive({ intensity: 0.55 }));
    await step('disabled',      () => h.setConfig({ intensity: 1, enabled: false }));
    await step('reenabled',     () => h.setConfig({ enabled: true }));

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
      seen,
      checks: [
        ['an overcast day draws no sun and thins the stars',
          seen.stormy.suns === 0 && seen.stormy.stars < before.stars && seen.stormy.clouds > before.clouds],
        ['rain and storm are drawn only when they are forecast',
          seen.stormy.rain > 0 && seen.stormy.storm > 0 && before.rain === 0 && before.storm === 0],
        ['a forecast change leaves nothing of the old one behind',
          same(seen.clearAgain, before)],
        ['the sun still blends at every intensity',
          seen.subtle.sunBlend === 'screen' && seen.subtle.sunOpacity < before.sunOpacity],
        ['the flyers switch removes the layer',           seen.noFlyers.flyerLayer === 0],
        ['motion off removes the layer, mid-flight or not', seen.reducedMotion.flyerLayer === 0],
        ['the weather switch takes clouds and sun, not stars',
          seen.noWeather.clouds === 0 && seen.noWeather.suns === 0 && seen.noWeather.stars > 0],
        ['the stars switch takes stars, not clouds',
          seen.noStars.stars === 0 && seen.noStars.clouds > 0],
        ['the hourly temperature switch takes only those', seen.noTemps.temps === 0 && seen.noTemps.clouds > 0],
        ['every setting is in the repaint signature, so it works without a teardown too',
          seen.noTempsLive.temps === 0 && seen.tempsBackLive.temps > 0
          && seen.subtleLive.sunOpacity < seen.tempsBackLive.sunOpacity],
        ['off returns the calendar to stock',
          seen.disabled.fields === 0 && seen.disabled.flyerLayer === 0 && seen.disabled.temps === 0],
        ['and back on restores exactly what was there',    same(seen.reenabled, before)]
      ]
    };
  };

  h.run = async function () {
    const perf = await h.perf();
    const results = [];
    for (const [name, pass, show] of BUDGET)
      results.push({ name, ok: pass(perf), measured: show(perf) });
    for (const [name, fn] of Object.entries(BEHAVIOUR)) {
      const out = await fn();
      results.push({ name, ok: out.skip ? null : !!out.ok, measured: out });
    }
    const mx = await h.matrix();
    for (const [name, ok] of mx.checks) results.push({ name, ok, measured: '' });
    const failed = results.filter(r => r.ok === false);
    return {
      passed: results.filter(r => r.ok === true).length,
      failed: failed.length,
      skipped: results.filter(r => r.ok === null).length,
      failures: failed,
      perf,
      matrix: mx.seen,
      results
    };
  };
})();
