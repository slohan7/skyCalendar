// The scenarios. Each one is a thing a person actually does to a calendar, and each one
// reports the cost the extension adds to it. Numbers, not adjectives.
//
//   window.__h.perf()            -> the full run
//   window.__h.perf('mousemove') -> one scenario
//
// Forced layout is counted rather than timed, because the damage it does lands in
// Google's next frame and not in ours. getBoundingClientRect and getComputedStyle are
// wrapped in harness.html before the extension loads.
(() => {
  const h = window.__h;
  const round = n => Math.round(n * 100) / 100;

  const SCENARIOS = {
    // Google churns its own DOM constantly: hover states, chips re-rendering, the mini
    // calendar ticking. None of it changes what the sky should look like.
    async churn() {
      await h.settle(300);
      h.reset();
      h.churn(40);
      await h.settle(600);
      const p = h.probe();
      return { rectReads: p.rect, styleReads: p.style, nodesRebuilt: p.added,
               longtaskMs: round(p.longtaskMs) };
    },

    // A repaint with nothing whatsoever changed. Should cost close to nothing and must
    // not replace a single node: replacing them is what restarts every animation, which
    // is what the flash is.
    async noop() {
      await h.settle(300);
      h.reset();
      const ms = await h.render('noop');
      const p = h.probe();
      return { ms: round(ms), rectReads: p.rect, styleReads: p.style, nodesRebuilt: p.added };
    },

    // A cursor crossing the grid. Two hundred moves is about three seconds of ordinary
    // pointing, and every one of them runs through the popover's hit test.
    async mousemove() {
      await h.settle(200);
      h.reset();
      const ms = h.mousemoves(200);
      await h.settle(120);
      const p = h.probe();
      return { ms: round(ms), msPerMove: round(ms / 200), rectReads: p.rect, styleReads: p.style };
    },

    // Events moving is a real change, so a repaint here is correct. What is measured is
    // whether it costs one pass over the events or three.
    async eventsMoved() {
      await h.settle(200);
      h.moveEvents();
      h.reset();
      const ms = await h.render('events moved');
      const p = h.probe();
      return { ms: round(ms), rectReads: p.rect, styleReads: p.style, nodesRebuilt: p.added };
    },

    // What the layer weighs once it is up.
    async footprint() {
      await h.settle(200);
      return { fields: h.fields(), nodes: h.nodes() };
    }
  };

  // The first pass after load pays for cold JIT and the page's first full layout, which
  // is not what any of this is trying to measure. Run it, throw it away, then measure.
  let warm = false;
  h.perf = async function (only) {
    if (!warm) { warm = true; await SCENARIOS.noop(); await SCENARIOS.eventsMoved(); h.seedEvents(); await h.render('warmup'); }
    const out = {};
    for (const [name, fn] of Object.entries(SCENARIOS)) {
      if (only && name !== only) continue;
      out[name] = await fn();
    }
    return out;
  };
})();
