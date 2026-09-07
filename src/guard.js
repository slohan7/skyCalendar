// The event separation guard.
//
// A stronger sky costs event legibility. Measured across five atmospheric surfaces and
// every Google hue, nine of twenty-five combinations fall below 1.6:1 separation, and
// the worst reaches 1.09:1 -- a block with no visible edge. That is a regression the
// atmosphere caused, so the atmosphere pays for it.
//
// Where, and only where, the composited surface reduces a block's separation below both
// the floor and its own separation against stock Google white, the block gains a 1px
// inset ring in its own fill moved AWAY from the surface. Direction is not optional:
// darkening a light fill against a mid-dark surface makes it worse.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});

  const srgbToLin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const linToSrgb = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const parseRgb = str => { const m = str.match(/(\d+(?:\.\d+)?)/g); return m ? m.slice(0, 3).map(v => +v / 255) : null; };
  const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  const lum = c => 0.2126 * srgbToLin(c[0]) + 0.7152 * srgbToLin(c[1]) + 0.0722 * srgbToLin(c[2]);
  const contrast = (a, b) => { const l = [lum(a), lum(b)]; return (Math.max(...l) + 0.05) / (Math.min(...l) + 0.05); };
  // Mixing happens in linear light, which is where luminance actually lives.
  const mix = (a, b, t) => a.map((v, i) => linToSrgb(srgbToLin(v) * (1 - t) + srgbToLin(b[i]) * t));
  const shade = (c, k) => c.map(v => v * k);
  const tint  = (c, k) => c.map(v => v + (1 - v) * k);

  // CSS composites a translucent background over its backdrop in sRGB, gamma and all --
  // NOT in linear light like `mix` above. Predicting a see-through event in the wrong
  // space is out by enough to matter exactly where it matters, at the margins, so this
  // deliberately does the arithmetic the browser will actually do.
  const over = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));
  const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  S.colour = { hexToRgb, parseRgb, toHex, lum, contrast, mix, shade, tint, over, ratio };

  // What the surface actually is at a given hour, after cloud, rain and the plate.
  S.surfaceAt = function (hour, hoursFor, anchors, plateAt) {
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1] < hour) i++;
    const span = Math.max(1e-6, anchors[i + 1] - anchors[i]);
    const t = Math.max(0, Math.min(1, (hour - anchors[i]) / span));
    const R = S.RAMP;
    const blend = idx => mix(hexToRgb(R.clear[idx]), hexToRgb(R.clear[idx]), 0); // placeholder, replaced below
    const stopAt = idx => {
      const d = hoursFor(anchors[idx]);
      let c = hexToRgb(R.clear[idx]);
      if (d) {
        c = mix(c, hexToRgb(R.overcast[idx]), Math.max(0, Math.min(1, d.cloud || 0)));
        const wet = Math.max(0, Math.min(1, (d.precip || 0) / 1.5));
        if (wet > 0.02) c = mix(c, hexToRgb(R.rain[idx]), wet);
      }
      return c;
    };
    const sky = mix(stopAt(i), stopAt(i + 1), t);
    return mix(sky, [1, 1, 1], plateAt(hour));
  };

  // Events you can see the sky through.
  //
  // Transparency is spent, not given. A block starts at the alpha the setting asked for
  // and is pushed back toward opaque only as far as its own label needs, and the label is
  // moved before the alpha is, because moving a label costs nothing and opacity costs
  // sky. That is the order the plate and the separation guard already use.
  //
  // The invariant, and the only reason this is safe to turn on by default: no block ends
  // up harder to read than it is on stock Google. The target is capped at whatever
  // Google's own fill and label already achieve, so a chip sitting at 4.1:1 today is
  // asked for 4.1, not 4.5 -- we are not entitled to fail a bar Google never cleared, and
  // we are not allowed to drop below it either. If nothing clears the target even at full
  // opacity, this returns null and the block is left exactly as Google drew it.
  S.GLASS_TARGET = 4.5;                          // WCAG AA, and event labels are small text

  S.glassFor = function (fillCss, inkCss, surface, wanted, outlined) {
    const fill = parseRgb(fillCss), ink = parseRgb(inkCss);
    if (!fill || !ink) return null;
    const target = Math.min(S.GLASS_TARGET, contrast(ink, fill));
    // Filled: Google's own label first, then the smallest move that might work. Their own
    // text grey before pure white, and pure white before the near-black, so a label moves
    // as little as the job allows. Flipping a white label to grey over a bright noon sky
    // is not a liberty taken -- the thing behind it is no longer the colour white was
    // chosen against -- but it is a change, and changes are rationed.
    //
    // Outlined: the event's own colour first, darkened for a bright sky and lightened for
    // a dark one. With the fill gone the label is the only thing left carrying which
    // calendar this is, so it should be that colour if that colour can be read at all.
    //
    // Google's own label is last on the outlined ladder rather than absent from it. It is
    // the only rung guaranteed to clear at full opacity -- the target is defined as what
    // that label achieves on that fill -- so leaving it out let blocks fall off the end
    // and stay stock-opaque among their outlined neighbours. Last, because on an outlined
    // block it is the least appropriate answer, not because it is the wrong one.
    const inks = outlined
      ? [shade(fill, 0.52), tint(fill, 0.62), shade(fill, 0.34), hexToRgb('#3C4043'),
         [1, 1, 1], hexToRgb('#202124'), ink]
      : [ink, hexToRgb('#3C4043'), [1, 1, 1], hexToRgb('#202124')];
    const inkLum = inks.map(lum);
    for (let a = wanted; ; a = Math.min(1, a + 0.05)) {
      const back = over(fill, surface, a);
      const bl = lum(back);
      for (let i = 0; i < inks.length; i++) {
        if (ratio(inkLum[i], bl) >= target) {
          const [r, g, b] = fill.map(v => Math.round(v * 255));
          const isOwn = contrast(inks[i], ink) < 1.02;
          return { alpha: +a.toFixed(2), ink: toHex(inks[i]), back,
                   flipped: !isOwn,       // no need to touch a label we did not move
                   css: `rgba(${r}, ${g}, ${b}, ${+a.toFixed(2)})`,
                   ratio: +ratio(inkLum[i], bl).toFixed(2), target: +target.toFixed(2) };
        }
      }
      if (a >= 1) return null;                   // cannot be done: leave the block alone
    }
  };

  // The edge of a see-through block, in the event's own colour, walked away from the sky
  // only as far as it has to be. This is not the separation guard below: that one is an
  // emergency, fires rarely, and darkens a block that our own sky broke. This is
  // deliberate, fires on every block, and is the thing that says where the event is once
  // the fill has stopped saying it. A block outlined in a dark neutral is the "weird
  // black line"; a block outlined in its own colour is a calendar.
  S.edgeFor = function (fillCss, surface, floor) {
    const fill = parseRgb(fillCss);
    if (!fill) return null;
    if (contrast(fill, surface) >= floor) return toHex(fill);      // its own colour will do
    const away = lum(fill) > lum(surface);
    let best = fill, bestC = contrast(fill, surface);
    for (let k = 1; k <= 9; k++) {
      const c = away ? tint(fill, k * 0.085) : shade(fill, 1 - k * 0.085);
      const got = contrast(c, surface);
      if (got > bestC) { best = c; bestC = got; }
      if (got >= floor) return toHex(c);
    }
    return toHex(best);                        // as far as it goes, which is still better
  };

  // Returns a CSS colour for a 1px inset ring, or null if the block is fine as it is.
  // `shown` is what is actually on screen, which is not the fill once the block is
  // see-through: separation is measured on that, while the ring is still drawn from the
  // event's own colour, because that is the colour the ring is supposed to be.
  S.ringFor = function (fillCss, surface, shownRgb) {
    const fill = parseRgb(fillCss);
    if (!fill) return null;
    const shown = shownRgb || fill;
    const sep = contrast(shown, surface);
    // A see-through block is closer to the sky by construction and we did that on
    // purpose, so the "was it already this bad on white?" escape hatch does not apply:
    // it needs an edge, and it needs one for the reason we just created.
    if (sep >= (shownRgb ? S.SEPARATION_FLOOR : Math.min(S.SEPARATION_FLOOR, contrast(fill, [1, 1, 1]))))
      return null;
    const lighter = lum(fill) > lum(surface);
    let edge = lighter ? tint(fill, 0.34) : shade(fill, 0.62);
    const alt = lighter ? shade(fill, 0.55) : tint(fill, 0.50);
    if (contrast(alt, surface) > contrast(edge, surface)) edge = alt;
    return { ring: toHex(edge), before: +sep.toFixed(2), after: +contrast(edge, surface).toFixed(2) };
  };
})();
