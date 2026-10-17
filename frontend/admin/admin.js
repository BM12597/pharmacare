/* PharmaCare+ — admin workspace.

   Every figure on this page is counted in the database. Where something
   cannot be counted yet, the card says so and why, rather than showing a
   number nobody could justify.

   What this workspace may do: read every patient file, download the original
   document, and upload new ones. It may not change a record — only a doctor
   can do that. The buttons reflect that, and so does the server, which checks
   again on every request. */

const API = {
  me: '/api/auth/me/',
  logout: '/api/auth/logout/',
  overview: '/api/admin/overview/',
  patients: '/api/patients/',
  files: '/api/patients/files/',
  upload: '/api/patients/upload/'
};

const LOGIN_URL = '/login/';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/* One place for every call, so a dead server or an expired session is handled
   the same way everywhere. */
async function callApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      'X-CSRFToken': getCookie('csrftoken') || '',
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 401) {
    window.location.href = LOGIN_URL;
    throw new Error('signed out');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The body is carried on the error, because a refusal often has more to
    // say than a sentence — a clashing upload names the record it clashes with.
    const error = new Error(data.detail || 'That did not work.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function requireSession() {
  try {
    const me = await callApi(API.me);
    if (me.role !== 'admin' && !me.is_superuser && !me.can_manage) throw new Error('wrong workspace');

    document.querySelector('.side-user').textContent = me.full_name || me.user_id;
    document.querySelector('.side-role').textContent = `${me.role_label} · ${me.user_id}`;
    return me;
  } catch (error) {
    window.location.href = LOGIN_URL;
    return null;
  }
}

/* ==================================================================
   State — filled from the server, never seeded with examples
   ================================================================== */

const state = {
  overview: null,
  patients: [],
  conditions: [],
  wards: [],
  files: [],
  total: 0,
  shown: 0,
  can: { view: false, edit: false, upload: false, download: false },
  loading: true,
  error: ''
};

/* ==================================================================
   Translations
   ================================================================== */

const STRINGS = {
  en: {},
  af: {
    'nav.overview': 'Oorsig', 'nav.patients': 'Pasiënte', 'nav.files': 'Lêers', 'nav.settings': 'Instellings',
    'action.signout': 'Teken uit', 'action.search': 'Soek', 'action.clear': 'Maak skoon',
    'action.view': 'Bekyk', 'action.retrieve': 'Laai af',
    'overview.title': 'Oorsig', 'overview.sub': 'Uit die pasiëntlêers op die stelsel.',
    'stat.files': 'Pasiëntlêers', 'stat.uploads': 'Hierdie week opgelaai',
    'stat.awaiting': 'Wag op bevestiging', 'stat.docs': 'Dokumente gestoor',
    'chart.added': 'Lêers bygevoeg', 'chart.addedSub': 'Laaste 14 dae',
    'chart.review': 'Wag op bevestiging', 'chart.reviewSub': 'Rekords wat ’n dokter nog nie nagegaan het nie',
    'hot.disease': 'Toestand-brandpunte', 'hot.diseaseSub': 'Mees aangetekende toestande',
    'hot.interaction': 'Interaksie-brandpunte', 'hot.interactionSub': 'Middelpare met die meeste waarskuwings',
    'hot.ward': 'Per saal', 'hot.wardSub': 'Waar die pasiënte is',
    'patients.title': 'Pasiënte', 'patients.sub': 'Elke pasiënt met ’n lêer op die stelsel.',
    'patients.search': 'Soek op naam, lêernommer of ID', 'patients.allConditions': 'Alle toestande',
    'table.patient': 'Pasiënt', 'table.file': 'Lêernommer', 'table.conditions': 'Toestande',
    'table.risk': 'Status', 'table.updated': 'Laas bygewerk',
    'files.title': 'Lêers', 'files.sub': 'Laai ’n pasiëntlêer op, of haal een af.',
    'files.upload': 'Laai ’n pasiëntlêer op', 'files.drop': 'Sleep lêers hier, of klik om te kies',
    'files.recent': 'Op die stelsel',
    'settings.title': 'Instellings', 'settings.appearance': 'Voorkoms', 'settings.theme': 'Tema',
    'settings.light': 'Lig', 'settings.dark': 'Donker', 'settings.language': 'Taal', 'settings.save': 'Stoor instellings',
    'form.cancel': 'Maak toe',
    'status.review': 'Nie bevestig nie', 'status.confirmed': 'Bevestig',
    'stage.store': 'Stoor die lêer', 'stage.read': 'Lees die bladsye',
    'stage.extract': 'Haal die besonderhede uit', 'stage.record': 'Rekord gereed'
  },
  zu: {
    'nav.overview': 'Ukubuka konke', 'nav.patients': 'Iziguli', 'nav.files': 'Amafayela', 'nav.settings': 'Izilungiselelo',
    'action.signout': 'Phuma', 'action.search': 'Sesha', 'action.clear': 'Sula',
    'action.view': 'Buka', 'action.retrieve': 'Landa',
    'overview.title': 'Ukubuka konke', 'overview.sub': 'Kusuka kumafayela eziguli akhona.',
    'stat.files': 'Amafayela eziguli', 'stat.uploads': 'Alayishwe kuleli sonto',
    'stat.awaiting': 'Kulindele ukuqinisekiswa', 'stat.docs': 'Amadokhumenti agciniwe',
    'chart.added': 'Amafayela engeziwe', 'chart.addedSub': 'Izinsuku ezingu-14',
    'chart.review': 'Kulindele ukuqinisekiswa', 'chart.reviewSub': 'Amarekhodi udokotela angakawahloli',
    'hot.disease': 'Izifo ezivamile', 'hot.diseaseSub': 'Izifo ezibhalwe kakhulu',
    'hot.interaction': 'Ukuxhumana kwemithi', 'hot.interactionSub': 'Imithi edala izexwayiso eziningi',
    'hot.ward': 'Ngewadi', 'hot.wardSub': 'Lapho iziguli zikhona',
    'patients.title': 'Iziguli', 'patients.sub': 'Zonke iziguli ezinamafayela.',
    'patients.search': 'Sesha ngegama noma inombolo yefayela', 'patients.allConditions': 'Zonke izifo',
    'table.patient': 'Isiguli', 'table.file': 'Inombolo yefayela', 'table.conditions': 'Izifo',
    'table.risk': 'Isimo', 'table.updated': 'Kugcine kubuyekezwa',
    'files.title': 'Amafayela', 'files.sub': 'Layisha ifayela lesiguli, noma ulande elikhona.',
    'files.upload': 'Layisha ifayela lesiguli', 'files.drop': 'Yehlisa amafayela lapha, noma uchofoze',
    'files.recent': 'Akhona ohlelweni',
    'settings.title': 'Izilungiselelo', 'settings.appearance': 'Ukubukeka', 'settings.theme': 'Itimu',
    'settings.light': 'Okukhanyayo', 'settings.dark': 'Okumnyama', 'settings.language': 'Ulimi', 'settings.save': 'Londoloza',
    'form.cancel': 'Vala',
    'status.review': 'Akuqinisekisiwe', 'status.confirmed': 'Kuqinisekisiwe',
    'stage.store': 'Kugcinwa ifayela', 'stage.read': 'Kufundwa amakhasi',
    'stage.extract': 'Kukhishwa imininingwane', 'stage.record': 'Irekhodi lilungile'
  },
  nso: {
    'nav.overview': 'Kakaretšo', 'nav.patients': 'Balwetši', 'nav.files': 'Difaele', 'nav.settings': 'Dipeakanyo',
    'action.signout': 'Tšwa', 'action.search': 'Nyaka', 'action.clear': 'Hlwekiša',
    'action.view': 'Lebelela', 'action.retrieve': 'Laola',
    'overview.title': 'Kakaretšo', 'overview.sub': 'Go tšwa difaeleng tša balwetši.',
    'stat.files': 'Difaele tša balwetši', 'stat.uploads': 'Tše rometšwego bekeng ye',
    'stat.awaiting': 'Tše emetšego netefatšo', 'stat.docs': 'Ditokumente tše bolokilwego',
    'chart.added': 'Difaele tše oketšegilego', 'chart.addedSub': 'Matšatši a 14 a fetilego',
    'chart.review': 'Tše emetšego netefatšo', 'chart.reviewSub': 'Direkoto tše ngaka e sa di hlahlobile',
    'hot.disease': 'Malwetši a atilego', 'hot.diseaseSub': 'Malwetši a ngwadilwego kudu',
    'hot.interaction': 'Dikgokagano tša dihlare', 'hot.interactionSub': 'Dihlare tše di tsošago ditemošo',
    'hot.ward': 'Ka wate', 'hot.wardSub': 'Moo balwetši ba lego',
    'patients.title': 'Balwetši', 'patients.sub': 'Molwetši yo mongwe le yo mongwe yo a nago le faele.',
    'patients.search': 'Nyaka ka leina goba nomoro ya faele', 'patients.allConditions': 'Malwetši ka moka',
    'table.patient': 'Molwetši', 'table.file': 'Nomoro ya faele', 'table.conditions': 'Malwetši',
    'table.risk': 'Boemo', 'table.updated': 'Mpshafatšo ya mafelelo',
    'files.title': 'Difaele', 'files.sub': 'Romela faele ya molwetši, goba o laole ye e lego gona.',
    'files.upload': 'Romela faele ya molwetši', 'files.drop': 'Lahlela difaele mo, goba o kgotle',
    'files.recent': 'Tše di lego gona',
    'settings.title': 'Dipeakanyo', 'settings.appearance': 'Ponagalo', 'settings.theme': 'Sebopego',
    'settings.light': 'Seedi', 'settings.dark': 'Leswiswi', 'settings.language': 'Leleme', 'settings.save': 'Boloka',
    'form.cancel': 'Tswalela',
    'status.review': 'Ga se netefatšwe', 'status.confirmed': 'Netefaditšwe',
    'stage.store': 'Go boloka faele', 'stage.read': 'Go bala matlakala',
    'stage.extract': 'Go ntšha dintlha', 'stage.record': 'Rekoto e lokile'
  }
};

let lang = 'en';
let locale = 'en-ZA';

function t(key, fallback) {
  return (STRINGS[lang] && STRINGS[lang][key]) || fallback;
}

function applyLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(node => {
    if (!node.dataset.original) node.dataset.original = node.textContent;
    node.textContent = t(node.dataset.i18n, node.dataset.original);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(node => {
    if (!node.dataset.originalPh) node.dataset.originalPh = node.placeholder;
    node.placeholder = t(node.getAttribute('data-i18n-ph'), node.dataset.originalPh);
  });
  document.documentElement.lang = lang;
  render();
}

const nf = () => new Intl.NumberFormat(locale);

/* ==================================================================
   Small helpers
   ================================================================== */

/* Escaped, because a patient's own file is user-entered text and it ends up
   inside innerHTML. A surname with an apostrophe should not break the page,
   and nothing typed into a record should ever run as markup. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function bytesText(value) {
  if (value === null || value === undefined) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Number(value);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

/* "Today, 08:20" reads better than a timestamp when most of the list is
   recent, and a date once it is not. */
function whenText(iso) {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';

  const now = new Date();
  const time = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const sameDay = when.toDateString() === now.toDateString();
  if (sameDay) return `${t('when.today', 'Today')}, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (when.toDateString() === yesterday.toDateString()) return `${t('when.yesterday', 'Yesterday')}, ${time}`;

  return when.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase();
}

const INFO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.8h.01"/></svg>';
const WARN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.4v4.2M12 17.2h.01"/></svg>';
const TICK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const CROSS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* Why a figure is missing, said in the card where the figure would be. */
function gapState(detail) {
  return `<div class="gap">${INFO_ICON}<div>${esc(detail)}</div></div>`;
}

/* ==================================================================
   Navigation
   ================================================================== */

function showPanel(name) {
  document.querySelectorAll('.side-nav button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
}

document.getElementById('sideNav').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  showPanel(button.dataset.panel);
  closeDrawer();
});

const sidebar = document.getElementById('sidebar');
const navBackdrop = document.getElementById('navBackdrop');
const burger = document.getElementById('burger');

function openDrawer() {
  sidebar.classList.add('open');
  navBackdrop.classList.add('open');
  burger.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  sidebar.classList.remove('open');
  navBackdrop.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
}

burger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeDrawer() : openDrawer();
});

navBackdrop.addEventListener('click', closeDrawer);

/* ==================================================================
   Charts
   ================================================================== */

let chartsAnimated = false;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function shouldAnimate() { return !chartsAnimated && !REDUCED_MOTION; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function animate({ duration, ease = easeOutCubic, onFrame, onDone }) {
  const started = performance.now();
  function step(now) {
    const progress = Math.min((now - started) / duration, 1);
    onFrame(ease(progress));
    if (progress < 1) requestAnimationFrame(step);
    else if (onDone) onDone();
  }
  requestAnimationFrame(step);
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const GAUGE = { start: 135, sweep: 270, cx: 125, cy: 120, r: 86 };

/* The needle sweeps to full and settles back on the reading, which is the
   one bit of theatre here — the number it lands on is counted. */
function drawGauge() {
  const patients = state.overview && state.overview.patients;
  const holder = document.getElementById('gauge');
  const readout = document.getElementById('gaugeValue');
  const caption = document.getElementById('gaugeCaption');

  if (!patients || !patients.total) {
    holder.innerHTML = gapState(t('gauge.none',
      'Nothing to show yet. Upload a patient file and this fills in.'));
    readout.textContent = '—';
    caption.textContent = '';
    return;
  }

  const target = Math.min(patients.awaiting_share / 100, 1);
  const { start, sweep, cx, cy, r } = GAUGE;

  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = start + (sweep * i) / 10;
    const [x1, y1] = polar(cx, cy, r - 16, a);
    const [x2, y2] = polar(cx, cy, r - (i % 5 === 0 ? 27 : 22), a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="${i % 5 === 0 ? 2 : 1}" opacity="${i % 5 === 0 ? .38 : .2}" stroke-linecap="round"/>`;
  }

  holder.innerHTML = `
    <svg viewBox="0 0 250 178" style="width:100%;max-width:250px;color:var(--ink)" role="img" aria-label="Share of records awaiting confirmation">
      <path d="${arcPath(cx, cy, r, start, start + sweep)}" fill="none" stroke="var(--track)" stroke-width="14" stroke-linecap="round"/>
      <path id="gaugeArc" d="${arcPath(cx, cy, r, start, start + sweep)}" pathLength="1"
            fill="none" stroke="var(--green)" stroke-width="14" stroke-linecap="round" stroke-dasharray="0 1"/>
      ${ticks}
      <g id="gaugeNeedle" transform="rotate(${start} ${cx} ${cy})">
        <line x1="${cx - 14}" y1="${cy}" x2="${cx + r - 36}" y2="${cy}" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>
      </g>
      <circle cx="${cx}" cy="${cy}" r="7.5" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"/>
      <text x="${cx - r + 2}" y="${cy + 36}" font-size="11" fill="var(--muted)" text-anchor="middle">0</text>
      <text x="${cx + r - 2}" y="${cy + 36}" font-size="11" fill="var(--muted)" text-anchor="middle">100</text>
    </svg>`;

  const arc = document.getElementById('gaugeArc');
  const needle = document.getElementById('gaugeNeedle');

  function paint(fraction) {
    arc.setAttribute('stroke-dasharray', `${fraction.toFixed(4)} 1`);
    needle.setAttribute('transform', `rotate(${(start + sweep * fraction).toFixed(2)} ${cx} ${cy})`);
    readout.textContent = Math.round(fraction * 100) + '%';
  }

  caption.textContent =
    `${nf().format(patients.awaiting_confirmation)} ${t('gauge.of', 'of')} ${nf().format(patients.total)} ${t('gauge.records', 'records')}`;

  if (!shouldAnimate()) { paint(target); return; }

  animate({
    duration: 850,
    ease: easeInOutCubic,
    onFrame: paint,
    onDone: () => animate({ duration: 700, onFrame: p => paint(1 - (1 - target) * p) })
  });
}

/* The line draws itself left to right as the page opens. */
function drawLine() {
  const daily = state.overview && state.overview.daily_files;
  const holder = document.getElementById('lineChart');

  if (!daily || !daily.available) {
    holder.innerHTML = gapState((daily && daily.detail) ||
      t('chart.noData', 'Nothing added yet. This fills in as files are read into the system.'));
    return;
  }

  const series = daily.values;
  const days = daily.days;

  if (!series.some(value => value > 0)) {
    holder.innerHTML = gapState(t('chart.quiet',
      'No files added in the last fortnight. The line appears once there are.'));
    return;
  }

  const w = 640, h = 220, padX = 30, padY = 24;
  const max = Math.max(...series) * 1.14 || 1;
  const stepX = (w - padX * 2) / (series.length - 1);
  const y = v => h - padY - (v / max) * (h - padY * 2);

  const points = series.map((v, i) => [padX + i * stepX, y(v)]);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${h - padY} L ${padX} ${h - padY} Z`;

  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const gy = padY + ((h - padY * 2) / 3) * i;
    grid += `<line x1="${padX}" y1="${gy}" x2="${w - padX}" y2="${gy}" stroke="var(--line)" stroke-width="1"/>`;
  }

  const labels = days.map((d, i) =>
    i % 2 === 0 ? `<text x="${(padX + i * stepX).toFixed(1)}" y="${h - 4}" font-size="10" fill="var(--muted)" text-anchor="middle">${esc(d)}</text>` : '').join('');

  const last = points[points.length - 1];

  holder.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%" role="img" aria-label="Files added per day">
      ${grid}
      <path id="lineArea" d="${area}" fill="var(--green)" opacity="0"/>
      <path id="lineStroke" d="${line}" pathLength="1" fill="none" stroke="var(--green)" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>
      <g id="lineTip" opacity="0">
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.5" fill="var(--green)"/>
        <text x="${(last[0] - 8).toFixed(1)}" y="${(last[1] - 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="end">${series[series.length - 1]}</text>
      </g>
      ${labels}
    </svg>`;

  const stroke = document.getElementById('lineStroke');
  const areaPath = document.getElementById('lineArea');
  const tip = document.getElementById('lineTip');

  if (!shouldAnimate()) {
    stroke.setAttribute('stroke-dashoffset', '0');
    areaPath.setAttribute('opacity', '.1');
    tip.setAttribute('opacity', '1');
    return;
  }

  animate({
    duration: 1100,
    onFrame: p => {
      stroke.setAttribute('stroke-dashoffset', (1 - p).toFixed(4));
      areaPath.setAttribute('opacity', (p * .1).toFixed(3));
      tip.setAttribute('opacity', p > .85 ? ((p - .85) / .15).toFixed(2) : '0');
    }
  });
}

/* Bars rather than trend lines: there is no history to draw a trend from
   yet, and a flat line pretending to be one would be worse than nothing. */
function drawBars(holder, rows, totalForShare) {
  const total = totalForShare || rows.reduce((sum, row) => sum + row.count, 0) || 1;

  holder.innerHTML = rows.map(row => {
    const share = Math.round((row.count / total) * 100);
    return `
      <div class="bar-row">
        <div class="bar-top"><span>${esc(row.label)}</span><span>${nf().format(row.count)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${shouldAnimate() ? 0 : share}%"></div></div>
      </div>`;
  }).join('');

  if (!shouldAnimate()) return;

  const fills = [...holder.querySelectorAll('.bar-fill')];
  requestAnimationFrame(() => {
    fills.forEach((fill, index) => {
      const share = Math.round((rows[index].count / total) * 100);
      fill.style.transitionDelay = `${index * 90}ms`;
      fill.style.width = share + '%';
    });
  });
}

function drawConditions() {
  const card = state.overview && state.overview.conditions;
  const holder = document.getElementById('diseaseList');

  if (!card || !card.available) {
    holder.innerHTML = gapState((card && card.detail) ||
      t('hot.noConditions', 'No conditions recorded yet.'));
    return;
  }

  drawBars(holder, card.results.map(row => ({ label: row.name, count: row.count })),
    state.overview.patients.total);
}

function drawInteractions() {
  const card = state.overview && state.overview.interactions;
  const holder = document.getElementById('interactionList');
  holder.innerHTML = gapState((card && card.detail) ||
    t('hot.noInteractions', 'Interaction counts arrive once prescriptions are recorded.'));
}

function drawWards() {
  const card = state.overview && state.overview.wards;
  const holder = document.getElementById('wardList');

  if (!card || !card.available) {
    holder.innerHTML = gapState((card && card.detail) || t('hot.noWards', 'No wards recorded yet.'));
    return;
  }

  drawBars(holder, card.results.map(row => ({ label: row.label, count: row.count })));
}

/* ==================================================================
   Patients
   ================================================================== */

const patientRows = document.getElementById('patientRows');
const patientSearch = document.getElementById('patientSearch');
const conditionFilter = document.getElementById('conditionFilter');
const resultCount = document.getElementById('resultCount');

function statusTag(patient) {
  return patient.needs_review
    ? `<span class="tag review">${t('status.review', 'Not confirmed')}</span>`
    : `<span class="tag green">${t('status.confirmed', 'Confirmed')}</span>`;
}

function renderPatients() {
  if (state.loading) {
    patientRows.innerHTML = `<tr><td colspan="6" class="empty">${t('loading', 'Loading…')}</td></tr>`;
    resultCount.textContent = '';
    return;
  }

  if (state.error) {
    patientRows.innerHTML = `<tr><td colspan="6" class="empty">${esc(state.error)}</td></tr>`;
    return;
  }

  patientRows.innerHTML = state.patients.length ? state.patients.map(p => `
    <tr>
      <td>
        <div class="who">
          <span class="initials">${esc(initials(p.full_name))}</span>
          <div>
            <strong>${esc(p.full_name)}</strong>
            <span>${p.age !== null && p.age !== undefined ? esc(p.age) : '—'}${p.sex ? ' · ' + esc(p.sex) : ''}${p.ward ? ' · ' + esc(p.ward) : ''}</span>
          </div>
        </div>
      </td>
      <td class="id">${esc(p.file_number)}</td>
      <td><div class="chip-list" style="justify-content:flex-start">${
        (p.conditions.length ? p.conditions : ['—']).slice(0, 4).map(c => `<span class="tag">${esc(c)}</span>`).join('')
      }</div></td>
      <td>${statusTag(p)}</td>
      <td class="sub">${esc(whenText(p.updated_at))}</td>
      <td>
        <div class="row-actions">
          <button class="link-btn" data-file="${esc(p.file_number)}">${t('action.view', 'View')}</button>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${
        state.total
          ? t('empty.search', 'No patient file matches that search. Check the spelling or clear the filter.')
          : t('empty.patients', 'No patient files yet. Upload one from the Files section and the details are read out of it.')
      }</td></tr>`;

  resultCount.textContent = state.total
    ? `${nf().format(state.shown)} ${t('result.of', 'of')} ${nf().format(state.total)} ${t('result.files', 'files')}`
    : '';
}

/* The search runs on the server, so a long patient list is not pulled into
   the browser to be filtered there. Typing is debounced to one request. */
let searchTimer;

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadPatients, 220);
}

document.getElementById('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  clearTimeout(searchTimer);
  loadPatients();
});

conditionFilter.addEventListener('change', loadPatients);
patientSearch.addEventListener('input', scheduleSearch);

document.getElementById('clearSearch').addEventListener('click', () => {
  patientSearch.value = '';
  conditionFilter.value = '';
  loadPatients();
  patientSearch.focus();
});

/* ==================================================================
   One patient file

   The record on the left, the document it was read from on the right. Admin
   reads and downloads. The Edit button is not here because this account
   cannot edit — and if the request were sent anyway, the server refuses it.
   ================================================================== */

const backdrop = document.getElementById('modalBackdrop');
let openPatientFile = null;

function fieldRow(label, value, options = {}) {
  const empty = value === null || value === undefined || value === '' ;
  const shown = empty ? t('field.blank', 'Not recorded') : value;
  const classes = ['field'];
  if (options.wide) classes.push('wide');
  if (options.stack) classes.push('stack');

  return `
    <div class="${classes.join(' ')}">
      <span class="label">${esc(label)}</span>
      <span class="value${empty ? ' empty' : ''}">${esc(shown)}</span>
    </div>`;
}

function chipRow(label, values, kind) {
  const list = (values || []).filter(Boolean);
  if (!list.length) return fieldRow(label, '');

  return `
    <div class="field">
      <span class="label">${esc(label)}</span>
      <div class="chip-list">${list.map(v =>
        `<span class="tag${kind === 'allergy' ? ' severe' : ''}">${esc(v)}</span>`).join('')}</div>
    </div>`;
}

const OBSERVATIONS = [
  ['bp', 'Blood pressure'], ['pulse', 'Pulse'], ['temperature', 'Temp °C'],
  ['respiratory_rate', 'Resp rate'], ['spo2', 'SpO₂ %'], ['weight_kg', 'Weight kg'],
  ['height_m', 'Height m'], ['pain_score', 'Pain']
];

function sectionBlock(number, title, inner) {
  return `
    <div class="section">
      <div class="section-head">
        <span class="section-no">${number}</span>
        <h4>${esc(title)}</h4>
      </div>
      ${inner}
    </div>`;
}

function recordHtml(patient) {
  const encounter = patient.encounter || {};
  const observations = patient.observations || {};

  const identification = sectionBlock('01', t('sec.id', 'Patient identification'), `
    <div class="field-grid">
      ${fieldRow(t('f.name', 'Full name'), patient.full_name)}
      ${fieldRow(t('f.fileNo', 'File number'), patient.file_number)}
      ${fieldRow(t('f.idNo', 'ID number'), patient.id_number)}
      ${fieldRow(t('f.dob', 'Date of birth'), patient.date_of_birth)}
      ${fieldRow(t('f.age', 'Age'), patient.age)}
      ${fieldRow(t('f.sex', 'Sex'), patient.sex_label || patient.sex)}
      ${fieldRow(t('f.ward', 'Ward'), patient.ward)}
      ${fieldRow(t('f.area', 'Home area'), patient.home_area)}
      ${fieldRow(t('f.language', 'Language'), patient.language)}
      ${fieldRow(t('f.phone', 'Phone'), patient.phone)}
      ${fieldRow(t('f.email', 'Email'), patient.email)}
      ${fieldRow(t('f.kin', 'Next of kin'), patient.next_of_kin)}
      ${fieldRow(t('f.kinPhone', 'Their number'), patient.next_of_kin_phone)}
      ${fieldRow(t('f.address', 'Address'), patient.address, { wide: true })}
    </div>`);

  const encounterBlock = sectionBlock('02', t('sec.encounter', 'Encounter and triage'), `
    <div class="field-grid">
      ${fieldRow(t('f.date', 'Date'), encounter.date)}
      ${fieldRow(t('f.time', 'Time'), encounter.time)}
      ${fieldRow(t('f.type', 'Type'), encounter.type)}
      ${fieldRow(t('f.triage', 'Triage'), encounter.triage)}
      ${fieldRow(t('f.referred', 'Referred by'), encounter.referred_by)}
      ${fieldRow(t('f.complaint', 'Presenting complaint'), encounter.presenting_complaint, { wide: true, stack: true })}
    </div>`);

  const medication = (patient.medication || []).length
    ? (patient.medication || []).map(item => `
        <div class="med">
          <strong>${esc(item.name)}</strong>
          <span class="how">${esc([item.dose, item.frequency].filter(Boolean).join(' · ')) || t('f.noDose', 'no dose recorded')}</span>
        </div>`).join('')
    : `<p class="hint">${t('f.noMeds', 'No current medication recorded.')}</p>`;

  const history = sectionBlock('03', t('sec.history', 'Medical history'), `
    ${chipRow(t('f.conditions', 'Conditions'), patient.conditions)}
    ${chipRow(t('f.allergies', 'Allergies'), patient.allergies, 'allergy')}
    <p class="section-label" style="margin-top:16px">${t('f.meds', 'Current medication')}</p>
    ${medication}
    ${patient.history_notes ? `<div class="field stack" style="border-bottom:0">
        <span class="label">${t('f.notes', 'Other history')}</span>
        <span class="value">${esc(patient.history_notes)}</span>
      </div>` : ''}`);

  const obsBlock = sectionBlock('04', t('sec.obs', 'Observations'), `
    <div class="obs-grid">
      ${OBSERVATIONS.map(([key, label]) => {
        const value = observations[key];
        return `<div class="obs${value ? '' : ' empty'}">
          <strong>${value ? esc(value) : '—'}</strong>
          <span>${esc(t('obs.' + key, label))}</span>
        </div>`;
      }).join('')}
    </div>`);

  const assessment = sectionBlock('05', t('sec.assessment', 'Clinical assessment'),
    `<div class="field stack" style="border-bottom:0">
      <span class="value${patient.assessment ? '' : ' empty'}">${esc(patient.assessment || t('field.blank', 'Not recorded'))}</span>
    </div>`);

  const plan = sectionBlock('06', t('sec.plan', 'Plan and follow-up'),
    `<div class="field stack" style="border-bottom:0">
      <span class="value${patient.plan ? '' : ' empty'}">${esc(patient.plan || t('field.blank', 'Not recorded'))}</span>
    </div>`);

  return identification + encounterBlock + history + obsBlock + assessment + plan;
}

function originalHtml(patient) {
  const documents = patient.documents || [];

  if (!documents.length) {
    return sectionBlock('—', t('sec.original', 'Original document'),
      gapState(t('f.noDoc', 'No document is attached to this record. It was entered by hand.')));
  }

  const first = documents.find(d => d.download_url) || documents[0];
  const viewable = first.download_url && first.name.toLowerCase().endsWith('.pdf');

  const list = documents.map(doc => `
    <div class="doc-row">
      <span class="file-icon">${esc(doc.kind)}</span>
      <div class="doc-name">
        <strong>${esc(doc.name)}</strong>
        <span>${esc(bytesText(doc.size_bytes))}${doc.pages ? ' · ' + doc.pages + ' ' + t('f.pages', 'pages') : ''} · ${esc(whenText(doc.uploaded_at))}</span>
      </div>
      ${doc.download_url
        ? `<button class="link-btn" data-download="${doc.id}">${t('action.retrieve', 'Download')}</button>`
        : `<span class="tag grey">${esc(doc.stage_label)}</span>`}
    </div>`).join('');

  const frame = viewable
    ? `<iframe class="pdf-frame" src="${esc(first.download_url)}?inline=1"
               title="${esc(first.name)}" loading="lazy"></iframe>
       <p class="pdf-note">${
         first.read_as_image
           ? t('f.wasImage', 'This page had no text layer, so it was read as a picture. Worth checking against the record.')
           : t('f.wasText', 'The record on the left was read from this document.')
       }</p>`
    : '';

  return sectionBlock('—', t('sec.original', 'Original document'), list + frame);
}

function historyHtml(patient) {
  const versions = patient.versions || [];

  if (!versions.length) {
    return sectionBlock('—', t('sec.history2', 'Edit history'),
      gapState(t('f.noEdits', 'Nothing has been changed since this record was created.')));
  }

  return sectionBlock('—', t('sec.history2', 'Edit history'), versions.map(version => `
    <div class="history-row">
      <span class="when">${esc(whenText(version.at))}</span>
      <span class="what">
        <strong>${esc(version.by)}</strong> ${t('f.changed', 'changed')} ${esc(version.fields.join(', ') || '—')}
        ${version.note ? `<span>${esc(version.note)}</span>` : ''}
      </span>
    </div>`).join(''));
}

async function openPatient(fileNumber) {
  document.getElementById('modalTitle').textContent = t('loading', 'Loading…');
  document.getElementById('modalSub').textContent = fileNumber;
  document.getElementById('modalBody').innerHTML = '';
  document.getElementById('sheetTools').innerHTML = '';
  document.getElementById('sheetFoot').textContent = '';
  backdrop.classList.add('open');

  let data;
  try {
    data = await callApi(API.patients + encodeURIComponent(fileNumber) + '/');
  } catch (error) {
    document.getElementById('modalTitle').textContent = t('f.notFound', 'File not found');
    document.getElementById('modalBody').innerHTML = gapState(error.message);
    return;
  }

  const patient = data.patient;
  openPatientFile = patient;
  state.can = data.can;

  document.getElementById('modalTitle').textContent = patient.full_name;
  document.getElementById('modalSub').textContent =
    [patient.file_number, patient.ward, patient.age !== null ? `${patient.age} ${t('f.years', 'years')}` : '']
      .filter(Boolean).join(' · ');

  const firstDoc = (patient.documents || []).find(d => d.download_url);

  document.getElementById('sheetTools').innerHTML = `
    ${patient.needs_review ? `<span class="tag review">${t('status.review', 'Not confirmed')}</span>` : ''}
    ${firstDoc ? `<button class="btn ghost" type="button" data-download="${firstDoc.id}">${t('action.retrieve', 'Download original')}</button>` : ''}`;

  document.getElementById('modalBody').innerHTML = `
    ${patient.needs_review ? `
      <div class="flagged">
        ${WARN_ICON}
        <div>
          <strong>${t('f.reviewTitle', 'Not yet confirmed by a doctor')}</strong>
          ${t('f.reviewBody', 'These details were read out of the uploaded document and have not been checked against it. A doctor confirms the record; this workspace cannot.')}
        </div>
      </div>` : ''}

    <div class="sheet-cols">
      <div>${recordHtml(patient)}</div>
      <div class="original">${originalHtml(patient)}${historyHtml(patient)}</div>
    </div>`;

  document.getElementById('sheetFoot').textContent = patient.confirmed_at
    ? `${t('f.confirmedBy', 'Confirmed by')} ${patient.confirmed_by || '—'} · ${whenText(patient.confirmed_at)}`
    : `${t('f.created', 'Created')} ${whenText(patient.created_at)}${patient.created_by ? ' · ' + patient.created_by : ''}`;
}

patientRows.addEventListener('click', event => {
  const button = event.target.closest('button[data-file]');
  if (button) openPatient(button.dataset.file);
});

/* Downloading goes through Django, which checks the session before handing
   over a single byte. The storage URL never reaches the browser. */
function downloadDocument(id) {
  window.open(`${API.files}${id}/download/`, '_blank', 'noopener');
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-download]');
  if (button) downloadDocument(button.dataset.download);
});

function closeModal() { backdrop.classList.remove('open'); openPatientFile = null; }

document.getElementById('closeModal').addEventListener('click', closeModal);
backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (backdrop.classList.contains('open')) closeModal();
  closeDrawer();
});

/* ==================================================================
   Files on the system
   ================================================================== */

function drawFiles() {
  const holder = document.getElementById('fileList');

  if (state.loading) {
    holder.innerHTML = `<p class="hint">${t('loading', 'Loading…')}</p>`;
    return;
  }

  if (!state.files.length) {
    holder.innerHTML = gapState(t('files.none',
      'Nothing uploaded yet. The files you add appear here with the record each one produced.'));
    return;
  }

  holder.innerHTML = state.files.map(file => `
    <div class="doc-row">
      <span class="file-icon">${esc(file.kind)}</span>
      <div class="doc-name">
        <strong>${esc(file.name)}</strong>
        <span>${esc(bytesText(file.size_bytes))} · ${esc(whenText(file.uploaded_at))}${
          file.patient_name ? ' · ' + esc(file.patient_name) : ''
        }</span>
      </div>
      ${file.stage === 'failed'
        ? `<span class="tag severe" title="${esc(file.detail)}">${t('stage.failed', 'Not read')}</span>`
        : ''}
      ${file.stage === 'held'
        ? `<span class="tag warn" title="${esc(file.detail)}">${t('stage.heldTag', 'Held')}</span>`
        : ''}
      ${file.file_number
        ? `<button class="link-btn" data-file="${esc(file.file_number)}">${t('action.view', 'View')}</button>`
        : ''}
      ${file.download_url
        ? `<button class="link-btn" data-download="${file.id}">${t('action.retrieve', 'Download')}</button>`
        : ''}
    </div>`).join('');
}

document.getElementById('fileList').addEventListener('click', event => {
  const view = event.target.closest('button[data-file]');
  if (view) openPatient(view.dataset.file);
});

/* ==================================================================
   Uploading, one real stage at a time

   Four steps, each marked done only when the server says that step finished.
   The first shows real byte progress; the others show what the server reported
   — how much text came off the page, what the record ended up being called.
   ================================================================== */

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadList = document.getElementById('uploadList');

const MAX_BYTES = 20 * 1024 * 1024;

const STAGES = [
  ['store', 'stage.store', 'Storing the file'],
  ['read', 'stage.read', 'Reading the pages'],
  ['extract', 'stage.extract', 'Pulling out the details'],
  ['record', 'stage.record', 'Record ready']
];

function uploadCard(file) {
  const card = document.createElement('div');
  card.className = 'upload-card';
  card.innerHTML = `
    <div class="upload-top">
      <span class="file-icon">${esc((file.name.split('.').pop() || '?').slice(0, 4).toUpperCase())}</span>
      <div class="upload-name">
        <strong>${esc(file.name)}</strong>
        <span>${esc(bytesText(file.size))}</span>
      </div>
    </div>
    <div class="stages">
      ${STAGES.map(([key, token, fallback]) => `
        <div class="stage" data-stage="${key}">
          <span class="stage-dot">${TICK_ICON}</span>
          <div class="stage-copy">
            <strong>${esc(t(token, fallback))}</strong>
            <span></span>
            ${key === 'store' ? '<div class="stage-bar" hidden><i></i></div>' : ''}
          </div>
        </div>`).join('')}
    </div>
    <div class="upload-done" hidden></div>`;

  uploadList.prepend(card);
  return card;
}

function setStage(card, key, status, detail) {
  const row = card.querySelector(`.stage[data-stage="${key}"]`);
  if (!row) return;

  row.classList.remove('waiting', 'working', 'done', 'failed');
  row.classList.add(status);

  if (status === 'failed') row.querySelector('.stage-dot').innerHTML = CROSS_ICON;
  if (detail !== undefined) row.querySelector('.stage-copy span').textContent = detail || '';
}

/* fetch() cannot report how much of a body has gone up, so the first step
   uses XMLHttpRequest and the bar follows the real byte count. */
function postFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', API.upload);
    request.setRequestHeader('X-CSRFToken', getCookie('csrftoken') || '');
    request.withCredentials = true;

    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      let data = {};
      try { data = JSON.parse(request.responseText); } catch (error) { /* handled below */ }

      if (request.status === 401) { window.location.href = LOGIN_URL; reject(new Error('signed out')); return; }
      if (request.status >= 200 && request.status < 300) resolve(data);
      else reject(new Error(data.detail || `The upload failed (${request.status}).`));
    });

    request.addEventListener('error', () => reject(new Error('The upload could not reach the server.')));
    request.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));

    request.send(form);
  });
}

async function uploadOne(file) {
  const card = uploadCard(file);
  STAGES.forEach(([key]) => setStage(card, key, 'waiting'));

  const bar = card.querySelector('.stage-bar');
  const barFill = card.querySelector('.stage-bar i');
  const finish = card.querySelector('.upload-done');

  function fail(key, message) {
    setStage(card, key, 'failed', message);
    finish.hidden = false;
    finish.innerHTML = `<span class="ready">${esc(message)}</span>`;
  }

  // ---- 1. store it
  setStage(card, 'store', 'working', t('stage.storing', 'Sending it to storage…'));
  bar.hidden = false;

  let stored;
  try {
    stored = await postFile(file, fraction => { barFill.style.width = (fraction * 100).toFixed(1) + '%'; });
  } catch (error) {
    bar.hidden = true;
    fail('store', error.message);
    return;
  }

  barFill.style.width = '100%';
  setStage(card, 'store', 'done', `${bytesText(stored.file.size_bytes)} ${t('stage.stored', 'stored')}`);

  const fileId = stored.file.id;
  loadFiles();

  // A CSV is kept but there is no patient record to make from it, so the
  // remaining steps are removed rather than shown as skipped.
  if (!stored.next) {
    ['read', 'extract', 'record'].forEach(key => {
      const row = card.querySelector(`.stage[data-stage="${key}"]`);
      if (row) row.remove();
    });
    finish.hidden = false;
    finish.innerHTML = `<span class="ready">${t('stage.notRead',
      'Stored. A spreadsheet is kept as a file but not read into a patient record.')}</span>`;
    return;
  }

  // ---- 2. read the pages
  setStage(card, 'read', 'working', t('stage.readingNow', 'Looking for the text on the page…'));

  let read;
  try {
    read = await callApi(`${API.files}${fileId}/read/`, { method: 'POST' });
  } catch (error) {
    fail('read', error.message);
    return;
  }

  setStage(card, 'read', 'done', read.detail);

  // ---- 3. pull out the details
  setStage(card, 'extract', 'working', read.file.read_as_image
    ? t('stage.extractingImage', 'Reading the page as a picture. This one takes longer…')
    : t('stage.extractingText', 'Finding the name, conditions, medication and allergies…'));

  let result;
  try {
    result = await callApi(`${API.files}${fileId}/extract/`, { method: 'POST' });
  } catch (error) {
    // A clash is not a failure to read — the page was read fine, it just
    // belongs to somebody already on the system. Say which record, and offer
    // to open it, rather than leaving the person to go looking.
    const clash = error.status === 409 && error.data && error.data.conflict;

    if (clash) {
      setStage(card, 'extract', 'done', t('stage.readOk', 'Read without trouble.'));
      setStage(card, 'record', 'failed', t('stage.held', 'Held — it clashes with a record already on the system'));

      finish.hidden = false;
      finish.innerHTML = `
        <span class="ready">
          <strong>${t('stage.heldTitle', 'Nothing was created or changed.')}</strong>
          <span style="display:block;margin-top:4px">${esc(error.message)}</span>
        </span>
        <button class="btn ghost" type="button" data-file="${esc(clash.file_number)}">${
          t('stage.openExisting', 'Open that record')}</button>`;
    } else {
      fail('extract', error.message);
    }

    loadFiles();
    return;
  }

  const gaps = result.gaps || [];
  setStage(card, 'extract', 'done', gaps.length
    ? `${t('stage.gaps', 'Read, but the page did not state:')} ${gaps.join(', ')}`
    : t('stage.gotAll', 'Every section found.'));

  // ---- 4. the record
  const patient = result.patient;
  setStage(card, 'record', 'done',
    `${patient.file_number} · ${patient.conditions.length} ${t('stage.conditions', 'conditions')}, ` +
    `${patient.medication.length} ${t('stage.medicines', 'medicines')}, ` +
    `${patient.allergies.length} ${t('stage.allergies', 'allergies')}`);

  finish.hidden = false;
  finish.innerHTML = `
    <span class="ready">
      <strong>${esc(patient.full_name)}</strong> —
      ${result.created
        ? t('stage.created', 'new record created')
        : result.matched_on === 'id_number'
          ? t('stage.mergedById', 'recognised by ID number and added to the record already on file')
          : t('stage.merged', 'added to the record already on file')}.
      ${patient.needs_review ? t('stage.needsDoctor', 'A doctor confirms it before it counts as checked.') : ''}
      ${result.note ? `<span style="display:block;margin-top:4px;color:var(--muted)">${esc(result.note)}</span>` : ''}
    </span>
    <button class="btn ghost" type="button" data-file="${esc(patient.file_number)}">${t('action.view', 'View')}</button>`;

  loadAll();
}

uploadList.addEventListener('click', event => {
  const button = event.target.closest('button[data-file]');
  if (button) openPatient(button.dataset.file);
});

function handleFiles(fileList) {
  if (!state.can.upload) {
    toast(t('error.noUpload', 'This account cannot upload patient files.'));
    return;
  }

  // One at a time, in order. Each file makes three requests, and firing a
  // dozen at once would only make them all slower.
  const queue = [...fileList].filter(file => {
    if (file.size > MAX_BYTES) {
      toast(`${file.name} ${t('error.tooBig', 'is over the 20 MB limit')}`);
      return false;
    }
    if (file.size === 0) {
      toast(`${file.name} ${t('error.empty', 'is empty')}`);
      return false;
    }
    return true;
  });

  queue.reduce(
    (chain, file) => chain.then(() => uploadOne(file).catch(() => {})),
    Promise.resolve()
  );
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});

['dragenter', 'dragover'].forEach(type =>
  dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('drag'); }));

['dragleave', 'drop'].forEach(type =>
  dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('drag'); }));

dropzone.addEventListener('drop', event => handleFiles(event.dataTransfer.files));
fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

/* ==================================================================
   Satellite map of where patients come from

   The circles are drawn from the home area on each record, which is a suburb
   and never a street. A suburb the backend has no coordinates for is listed
   under the map rather than guessed onto it.

   The key below is visible to anyone who opens this page — that is how the
   Maps JavaScript API works. Restrict it in the Google Cloud console to this
   site's referrers and to the Maps JavaScript API only.
   ================================================================== */

const MAPS_KEY = 'AIzaSyD6xtbTLrG1jKICo1tZhl10dL1S-rgEGH8';

const mapCondition = document.getElementById('mapCondition');
let map = null;
let circles = [];
let infoWindow = null;
let mapReady = false;

function loadMaps() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps && window.google.maps.Map) return resolve();

    // Google calls this once the library is genuinely ready. The script's own
    // load event fires earlier than that, while google.maps is still empty.
    window.pharmacareMapsReady = () => resolve();

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=pharmacareMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error('Maps failed to load'));
    document.head.appendChild(script);
  });
}

function drawCircles() {
  if (!mapReady) return;

  circles.forEach(circle => circle.setMap(null));
  circles = [];

  const card = state.overview && state.overview.map;
  if (!card) return;

  const condition = mapCondition.value;
  const shown = (card.areas || []).filter(area => !condition || area.condition === condition);
  const biggest = Math.max(...shown.map(area => area.cases), 1);

  shown.forEach(area => {
    // Radius grows with the square root of the count, so a hotspot four times
    // the size draws twice as wide rather than four times.
    const circle = new google.maps.Circle({
      map,
      center: { lat: area.lat, lng: area.lng },
      radius: Math.sqrt(area.cases) * 420,
      strokeColor: '#1d6b4f',
      strokeOpacity: .9,
      strokeWeight: 1.5,
      fillColor: '#1d6b4f',
      fillOpacity: Math.min(.18 + (area.cases / biggest) * .32, .5)
    });

    circle.addListener('click', () => {
      infoWindow.setContent(`
        <div class="map-info">
          <strong>${esc(area.area)}</strong>
          <span>${nf().format(area.cases)} ${area.cases === 1 ? t('map.patient', 'patient') : t('map.patients', 'patients')}</span>
          ${area.condition ? `<span>${t('map.mostly', 'Mostly')} ${esc(area.condition)}</span>` : ''}
        </div>`);
      infoWindow.setPosition({ lat: area.lat, lng: area.lng });
      infoWindow.open(map);
    });

    circles.push(circle);
  });
}

function fillMapFilter() {
  const card = state.overview && state.overview.map;
  if (!card) return;

  const conditions = [...new Set((card.areas || []).map(a => a.condition).filter(Boolean))].sort();
  const current = mapCondition.value;

  mapCondition.innerHTML = `<option value="">${t('map.all', 'All conditions')}</option>` +
    conditions.map(c => `<option value="${esc(c)}"${c === current ? ' selected' : ''}>${esc(c)}</option>`).join('');
}

function mapNote() {
  const card = state.overview && state.overview.map;
  const note = document.querySelector('.map-legend .map-note');
  if (!note || !card) return;

  const unplaced = card.unplaced || [];
  note.textContent = unplaced.length
    ? `${t('map.unplaced', 'Not on the map:')} ${unplaced.map(a => `${a.area} (${a.cases})`).join(', ')}`
    : t('map.note', 'Circle size shows how many patients');
}

async function initMap() {
  const target = document.getElementById('map');
  const card = state.overview && state.overview.map;

  if (!card || !card.available) {
    target.innerHTML = `<div class="map-fallback">${esc((card && card.detail) ||
      t('map.none', 'No home areas recorded yet. They appear here as patient files are read in.'))}</div>`;
    return;
  }

  if (!mapReady) {
    try {
      await loadMaps();
    } catch (error) {
      target.innerHTML = `<div class="map-fallback">${t('map.offline',
        'The map could not load. Check the connection and the API key.')}</div>`;
      return;
    }

    map = new google.maps.Map(target, {
      center: { lat: card.hospital.lat, lng: card.hospital.lng },
      zoom: 11,
      mapTypeId: 'satellite',
      tilt: 0,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: true,
      mapTypeControlOptions: { mapTypeIds: ['satellite', 'hybrid', 'roadmap'] }
    });

    infoWindow = new google.maps.InfoWindow();

    new google.maps.Marker({
      map,
      position: { lat: card.hospital.lat, lng: card.hospital.lng },
      title: card.hospital.name
    });

    mapReady = true;
  }

  drawCircles();
}

mapCondition.addEventListener('change', drawCircles);

/* ==================================================================
   Loading
   ================================================================== */

async function loadOverview() {
  try {
    state.overview = await callApi(API.overview);
  } catch (error) {
    state.overview = null;
    state.error = error.message;
  }
}

async function loadPatients() {
  const params = new URLSearchParams();
  if (patientSearch.value.trim()) params.set('q', patientSearch.value.trim());
  if (conditionFilter.value) params.set('condition', conditionFilter.value);

  try {
    const data = await callApi(`${API.patients}?${params}`);
    state.patients = data.results;
    state.total = data.total;
    state.shown = data.shown;
    state.can = data.can;
    state.error = '';

    // The filter is built from the conditions actually on file, so it never
    // offers something that would return nothing.
    const current = conditionFilter.value;
    conditionFilter.innerHTML =
      `<option value="">${t('patients.allConditions', 'All conditions')}</option>` +
      data.conditions.map(c => `<option value="${esc(c)}"${c === current ? ' selected' : ''}>${esc(c)}</option>`).join('');
  } catch (error) {
    state.patients = [];
    state.error = error.message;
  }

  state.loading = false;
  renderPatients();
}

async function loadFiles() {
  try {
    const data = await callApi(API.files);
    state.files = data.results;
    state.can = data.can;
  } catch (error) {
    state.files = [];
  }
  drawFiles();
}

async function loadAll() {
  await Promise.all([loadOverview(), loadPatients(), loadFiles()]);
  state.loading = false;
  render();
  initMap();
}

/* ==================================================================
   Settings
   ================================================================== */

document.getElementById('themeToggle').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  document.querySelectorAll('#themeToggle button').forEach(b => b.classList.toggle('active', b === button));
  document.body.classList.toggle('dark', button.dataset.theme === 'dark');
  document.querySelector('meta[name="theme-color"]').content = button.dataset.theme === 'dark' ? '#0e1210' : '#ffffff';
  render();
});

document.getElementById('langSelect').addEventListener('change', event => {
  lang = event.target.value;
  applyLanguage();
});

document.getElementById('localeSelect').addEventListener('change', event => {
  locale = event.target.value;
  render();
});

document.getElementById('saveSettings').addEventListener('click', () => toast(t('toast.saved', 'Settings saved')));

/* ==================================================================
   Sign out
   ================================================================== */

document.getElementById('signOut').addEventListener('click', async () => {
  try {
    await callApi(API.logout, { method: 'POST' });
  } catch (error) {
    /* signing out locally matters more than the server's answer */
  } finally {
    window.location.href = LOGIN_URL;
  }
});

/* ==================================================================
   Toast
   ================================================================== */

let toastTimer;
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

/* ==================================================================
   Render
   ================================================================== */

function statNumber(id, value, note) {
  document.getElementById(id).textContent = value === null || value === undefined ? '—' : nf().format(value);
  const delta = document.getElementById(id + 'Delta');
  if (delta) delta.textContent = note || '';
}

function render() {
  const overview = state.overview;
  const patients = overview && overview.patients;
  const files = overview && overview.files;

  statNumber('statFiles', patients ? patients.total : null, t('delta.total', 'on the system'));
  statNumber('statUploads', files ? files.this_week : null, t('delta.week', 'in the last 7 days'));
  statNumber('statAwaiting', patients ? patients.awaiting_confirmation : null,
    t('delta.doctor', 'waiting on a doctor'));
  statNumber('statDocs', files ? files.total : null,
    files && files.failed ? `${nf().format(files.failed)} ${t('delta.failed', 'could not be read')}` : t('delta.stored', 'kept as uploaded'));

  drawGauge();
  drawLine();
  drawConditions();
  drawInteractions();
  drawWards();
  drawFiles();
  renderPatients();
  fillMapFilter();
  mapNote();

  chartsAnimated = true;
}

/* ==================================================================
   Boot
   ================================================================== */

(async function start() {
  const me = await requireSession();
  if (!me) return;

  render();
  await loadAll();

  // The overview is a shared view of a system other people are using, so it
  // refreshes itself — but not while nobody is looking at the tab.
  setInterval(() => {
    if (document.hidden) return;
    loadOverview().then(render);
  }, 60000);
})();