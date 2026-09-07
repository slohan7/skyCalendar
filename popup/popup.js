// Settings surface. Writes to chrome.storage.local; the content script watches that key
// and repaints, so nothing here needs to message a tab.
const KEY = 'sky:settings';
const DEFAULTS = {
  enabled: true, lat: null, lon: null, label: null, units: 'auto', intensity: 1,
  weather: true, stars: true, flyers: true, moon: true, glass: 'outline',
  hourlyTemps: true, detail: 'hover', motion: 'system'
};
const $ = s => document.querySelector(s);
let cfg = { ...DEFAULTS };

const load = async () => {
  const o = await chrome.storage.local.get(KEY);
  cfg = { ...DEFAULTS, ...(o[KEY] || {}) };
};
const save = async patch => {
  cfg = { ...cfg, ...patch };
  await chrome.storage.local.set({ [KEY]: cfg });
  paint();
};

// ---- controls -------------------------------------------------------------------
function toggle(id, key, transform) {
  const el = $('#' + id);
  el.addEventListener('click', () => {
    const on = el.getAttribute('aria-checked') !== 'true';
    save({ [key]: transform ? transform(on) : on });
  });
}
function group(id, key, cast) {
  $('#' + id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    save({ [key]: cast ? cast(b.dataset.v) : b.dataset.v });
  });
}
toggle('enabled', 'enabled');
toggle('weather', 'weather');
toggle('stars', 'stars');
toggle('flyers', 'flyers');
toggle('moon', 'moon');
toggle('hourlyTemps', 'hourlyTemps');
toggle('detail', 'detail', on => (on ? 'hover' : 'off'));
group('glass', 'glass');
group('units', 'units');
group('motion', 'motion');
group('intensity', 'intensity', Number);

const INT_LABEL = { '0': 'Off · stock Google Calendar', '0.55': 'Subtle', '1': 'Standard', '1.35': 'Full' };
// Each one says what it costs you, because the honest answer is that it costs legibility
// and the extension buys it back per event rather than pretending it is free.
const GLASS_LABEL = {
  off:     'Off · Google\u2019s own solid blocks',
  tinted:  'A hint of sky through each block',
  clear:   'As clear as the label can stand',
  outline: 'No fill · the colour moves to the edge'
};

function paint() {
  const set = (id, on) => $('#' + id).setAttribute('aria-checked', String(on));
  set('enabled', cfg.enabled);
  set('weather', cfg.weather);
  set('stars', cfg.stars);
  set('flyers', cfg.flyers);
  set('moon', cfg.moon);
  set('hourlyTemps', cfg.hourlyTemps);
  set('detail', cfg.detail === 'hover');
  for (const [id, val] of [['units', cfg.units], ['motion', cfg.motion], ['glass', cfg.glass],
                           ['intensity', String(cfg.intensity)]])
    $('#' + id).querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-checked', String(b.dataset.v === val)));
  $('#intlabel').textContent = INT_LABEL[String(cfg.intensity)] || 'Standard';
  $('#glasslabel').textContent = GLASS_LABEL[cfg.glass] || GLASS_LABEL.outline;
  $('#loclabel').textContent = cfg.label || 'inferred from your timezone';
  document.body.style.opacity = cfg.enabled ? '1' : '.62';
}

// ---- location search ------------------------------------------------------------
let searchTimer = null;
$('#q').addEventListener('input', e => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 2) { $('#results').hidden = true; return; }
  searchTimer = setTimeout(() => search(q), 260);
});

async function search(q) {
  const ul = $('#results');
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const j = await r.json();
    const hits = j.results || [];
    if (!hits.length) { ul.hidden = true; return; }
    ul.innerHTML = hits.map((h, i) =>
      `<li data-i="${i}">${h.name}<small>${[h.admin1, h.country_code].filter(Boolean).join(', ')}</small></li>`).join('');
    ul.hidden = false;
    ul.onclick = ev => {
      const li = ev.target.closest('li'); if (!li) return;
      const h = hits[+li.dataset.i];
      // two decimal places, about a kilometre, is all that ever leaves the browser
      save({ lat: Math.round(h.latitude * 100) / 100,
             lon: Math.round(h.longitude * 100) / 100,
             label: `${h.name}${h.admin1 ? ', ' + h.admin1 : ''}` });
      ul.hidden = true; $('#q').value = '';
      showConditions();
    };
  } catch { ul.hidden = true; }
}

// ---- current conditions, read from the content script's own cache ----------------
async function showConditions() {
  const all = await chrome.storage.local.get(null);
  const key = Object.keys(all).find(k => k.startsWith('sky:fc:'));
  const fc = key && all[key];
  const place = cfg.label || (fc ? fc.tz : null) || 'Location not set';
  $('#place').textContent = place;
  if (!fc || !fc.daily) { $('#cond').textContent = 'No forecast cached yet'; return; }
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const day = fc.daily[iso];
  const hr = fc.hourly[`${iso}T${String(today.getHours()).padStart(2, '0')}:00`];
  const unit = key.split(':')[2] === 'f' ? '°F' : '°C';
  if (hr) $('#cond').textContent = `${Math.round(hr.temp)}${unit} · ${Math.round(hr.cloud * 100)}% cloud`;
  if (day) {
    const hm = s => s.slice(11, 16);
    const hrs = Math.floor(day.daylight / 3600), mins = Math.round((day.daylight % 3600) / 60);
    $('#suntimes').textContent = `↑ ${hm(day.sunrise)}   ↓ ${hm(day.sunset)}   ${hrs}h ${mins}m of daylight`;
    // the header takes the colour of the sky it is describing
    $('#head').style.background = day && hr
      ? `linear-gradient(180deg,#4C86C8,#9CC6E6 55%,#F2D8BE)` : '';
  }
  $('#foot').textContent = fc.fetchedAt
    ? `Open-Meteo · ${new Date(fc.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : 'Open-Meteo';
}

(async () => { await load(); paint(); showConditions(); })();
