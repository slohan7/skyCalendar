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

  S.colour = { hexToRgb, parseRgb, toHex, lum, contrast, mix, shade, tint };

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

  // Returns a CSS colour for a 1px inset ring, or null if the block is fine as it is.
  S.ringFor = function (fillCss, surface) {
    const fill = parseRgb(fillCss);
    if (!fill) return null;
    const sep = contrast(fill, surface);
    const stock = contrast(fill, [1, 1, 1]);
    if (sep >= Math.min(S.SEPARATION_FLOOR, stock)) return null;
    const lighter = lum(fill) > lum(surface);
    let edge = lighter ? tint(fill, 0.34) : shade(fill, 0.62);
    const alt = lighter ? shade(fill, 0.55) : tint(fill, 0.50);
    if (contrast(alt, surface) > contrast(edge, surface)) edge = alt;
    return { ring: toHex(edge), before: +sep.toFixed(2), after: +contrast(edge, surface).toFixed(2) };
  };
})();
