// Settings. Eleven controls, and every one of them does something. A control that maps to
// nothing is worse than a missing feature, so nothing here is aspirational.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const KEY = 'sky:settings';

  S.DEFAULTS = {
    enabled:     true,
    lat:         null,          // null means "infer, and say so"
    lon:         null,
    label:       null,
    units:       'auto',        // auto | c | f
    intensity:   1,             // 0 off · 0.55 subtle · 1 standard · 1.35 full
    weather:     true,          // clouds, precipitation, storms, sun disc
    stars:       true,
    flyers:      true,          // aircraft and birds, crossing every minute or two
    glass:       'outline',     // off | tinted | clear | outline -- how much sky shows through
    hourlyTemps: true,
    detail:      'hover',       // hover | off
    motion:      'system'       // system | reduce
  };

  let cache = null;
  S.cfgSync = () => cache || S.DEFAULTS;

  S.settings = async function () {
    if (cache) return cache;
    try {
      const o = await chrome.storage.local.get(KEY);
      cache = Object.assign({}, S.DEFAULTS, o[KEY] || {});
    } catch { cache = Object.assign({}, S.DEFAULTS); }   // extension context gone
    return cache;
  };

  S.saveSettings = async function (patch) {
    const next = Object.assign({}, await S.settings(), patch);
    cache = next;
    try { await chrome.storage.local.set({ [KEY]: next }); } catch {}
    return next;
  };

  S.onSettingsChanged = function (fn) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[KEY]) return;
        cache = Object.assign({}, S.DEFAULTS, changes[KEY].newValue || {});
        fn(cache);
      });
    } catch {}
  };

  // Intensity scales what the atmosphere is allowed to do. Below 1 it also thickens the
  // plate, because less atmosphere means more surface, not just fainter colour.
  S.intensityScale = (v, i) => v * i;
  S.plateFor = (p, i) => Math.max(0.12, Math.min(0.88, p + (1 - i) * 0.25));
})();
