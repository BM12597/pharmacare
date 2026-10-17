/* PharmaCare+ — management portal.
   Session and identity come from Django. The dashboard figures below are
   still placeholder data and get replaced once the role pages are built. */

const API = {
  me: '/api/auth/me/',
  logout: '/api/auth/logout/',
  overview: '/api/management/overview/',
  accounts: '/api/management/accounts/',
  createAccount: '/api/management/accounts/new/',
  suggestId: '/api/management/accounts/suggest-id/',
  tickets: '/api/management/tickets/',
  activity: '/api/management/activity/'
};

/* Every call carries the session cookie and the CSRF token, and every failure
   says what went wrong rather than leaving a panel silently empty. */
async function callApi(url, { method = 'GET', body = null } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { 'X-CSRFToken': getCookie('csrftoken') || '' }
  };

  if (body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    window.location.href = LOGIN_URL;
    throw new Error('not allowed');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'That did not work. Try again.');
  return data;
}

const LOGIN_URL = '/management/login/';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/* Nobody sees this page without a valid session for an account that is
   allowed to manage the system. Django enforces this too; this is only so
   the browser does not sit on a dead page. */
async function requireSession() {
  try {
    const response = await fetch(API.me, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('no session');

    const me = await response.json();
    if (!me.can_manage) throw new Error('not allowed');

    document.querySelector('.side-user').textContent = me.full_name || me.user_id;
    document.querySelector('.side-role').textContent = `${me.role_label} \u00b7 ${me.user_id}`;
    return true;
  } catch (error) {
    window.location.href = LOGIN_URL;
    return false;
  }
}

/* ==================================================================
   State

   Everything below is filled from the API. Nothing here is invented: a figure
   that belongs to a part of the system that is not built yet arrives as
   unavailable and the panel shows an empty state instead of a number.
   ================================================================== */

const ROLE_LABEL = { admin: 'Admin', doctor: 'Doctor', pharmacist: 'Pharmacist', researcher: 'Researcher', it: 'IT support' };
const ROLE_COLOR = { doctor: '#153f32', pharmacist: '#4a7c64', researcher: '#9dbfa8', admin: '#d7e58f', it: '#c2b8a0' };

let accounts = [];
let overview = null;
let tickets = [];
let activityEntries = [];
let loadError = null;

/* ---------- dates, shown the way a person reads them ---------- */

function whenText(iso) {
  if (!iso) return t('never', 'Never');

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';

  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const clock = then.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  if (sameDay) {
    const minutes = Math.round((now - then) / 60000);
    if (minutes < 1) return t('justNow', 'Just now');
    if (minutes < 60) return `${minutes} ${t('minutesAgo', 'min ago')}`;
    return `${t('today', 'Today')}, ${clock}`;
  }

  if (then.toDateString() === yesterday.toDateString()) {
    return `${t('yesterday', 'Yesterday')}, ${clock}`;
  }

  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function bytesText(value) {
  if (value === null || value === undefined) return '—';
  let size = Number(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

/* ==================================================================
   Translations
   ================================================================== */

const STRINGS = {
  en: {},
  af: {
    'nav.home': 'Tuis', 'nav.accounts': 'Rekeninge', 'nav.support': 'Ondersteuning', 'nav.settings': 'Instellings',
    'action.signout': 'Teken uit', 'action.edit': 'Wysig', 'action.remove': 'Verwyder',
    'home.title': 'Stelseloorsig', 'home.sub': 'Rekeninge, daaglikse aktiwiteit en berging.',
    'stat.accounts': 'Personeelrekeninge', 'stat.today': 'Vandag aangeteken', 'stat.files': 'Pasiëntlêers', 'stat.screens': 'Voorskrifte vandag nagegaan',
    'chart.usage': 'Daaglikse aktiwiteit', 'chart.usageSub': 'Voorskrifte oor die laaste 14 dae',
    'chart.storage': 'Berging', 'chart.storageSub': 'Pasiëntlêers, oplaaie en modeldata',
    'chart.roles': 'Rekeninge per rol', 'chart.rolesSub': 'Slegs aktiewe rekeninge',
    'chart.load': 'Werkruimtegebruik', 'chart.loadSub': 'Aandeel aanmeldings per werkruimte',
    'chart.health': 'Stelselgesondheid', 'chart.healthSub': 'Nou net nagegaan',
    'accounts.title': 'Rekeninge', 'accounts.sub': 'Voeg by, werk by en verwyder personeelrekeninge.',
    'accounts.add': 'Voeg rekening by', 'accounts.search': 'Soek op ID of naam', 'role.all': 'Alle rolle',
    'table.id': 'Personeel-ID', 'table.name': 'Naam', 'table.role': 'Rol', 'table.status': 'Status', 'table.last': 'Laaste aanmelding',
    'status.active': 'Aktief', 'status.pending': 'Nog nie aangeteken', 'status.revoked': 'Herroep',
    'support.title': 'Ondersteuning', 'support.sub': 'Boodskappe vanaf elke werkruimte.',
    'settings.title': 'Instellings', 'settings.sub': 'Geld vir hierdie portaal en hoe syfers gewys word.',
    'settings.appearance': 'Voorkoms', 'settings.theme': 'Tema', 'settings.light': 'Lig', 'settings.dark': 'Donker',
    'settings.language': 'Taal', 'settings.save': 'Stoor instellings',
    'form.name': 'Volle naam', 'form.role': 'Rol', 'form.facility': 'Fasiliteit', 'form.id': 'Personeel-ID',
    'form.password': 'Beginwagwoord', 'form.create': 'Skep rekening', 'form.cancel': 'Kanselleer', 'form.save': 'Stoor veranderinge',
    'free': 'beskikbaar', 'of': 'van'
  },
  zu: {
    'nav.home': 'Ikhaya', 'nav.accounts': 'Ama-akhawunti', 'nav.support': 'Usizo', 'nav.settings': 'Izilungiselelo',
    'action.signout': 'Phuma', 'action.edit': 'Hlela', 'action.remove': 'Susa',
    'home.title': 'Ukubuka konke', 'home.sub': 'Ama-akhawunti, umsebenzi wansuku zonke nesitoreji.',
    'stat.accounts': 'Ama-akhawunti abasebenzi', 'stat.today': 'Bangene namuhla', 'stat.files': 'Amafayela eziguli', 'stat.screens': 'Amaphrisikhripshini ahloliwe namuhla',
    'chart.usage': 'Umsebenzi wansuku zonke', 'chart.usageSub': 'Amaphrisikhripshini ezinsukwini ezingu-14',
    'chart.storage': 'Isitoreji', 'chart.storageSub': 'Amafayela eziguli nedatha yemodeli',
    'chart.roles': 'Ama-akhawunti ngendima', 'chart.rolesSub': 'Asebenzayo kuphela',
    'chart.load': 'Ukusetshenziswa kwendawo yomsebenzi', 'chart.loadSub': 'Ingxenye yokungena ngendawo',
    'chart.health': 'Impilo yesistimu', 'chart.healthSub': 'Kuhloliwe manje',
    'accounts.title': 'Ama-akhawunti', 'accounts.sub': 'Engeza, buyekeza ususe ama-akhawunti abasebenzi.',
    'accounts.add': 'Engeza i-akhawunti', 'accounts.search': 'Sesha nge-ID noma igama', 'role.all': 'Zonke izindima',
    'table.id': 'I-ID yomsebenzi', 'table.name': 'Igama', 'table.role': 'Indima', 'table.status': 'Isimo', 'table.last': 'Ukungena kokugcina',
    'status.active': 'Iyasebenza', 'status.pending': 'Akakangeni', 'status.revoked': 'Ihoxisiwe',
    'support.title': 'Usizo', 'support.sub': 'Imilayezo evela kuzo zonke izindawo zomsebenzi.',
    'settings.title': 'Izilungiselelo', 'settings.sub': 'Kusebenza kule portal nokuthi izibalo zikhonjiswa kanjani.',
    'settings.appearance': 'Ukubukeka', 'settings.theme': 'Itimu', 'settings.light': 'Okukhanyayo', 'settings.dark': 'Okumnyama',
    'settings.language': 'Ulimi', 'settings.save': 'Londoloza',
    'form.name': 'Igama eligcwele', 'form.role': 'Indima', 'form.facility': 'Isikhungo', 'form.id': 'I-ID yomsebenzi',
    'form.password': 'Iphasiwedi yokuqala', 'form.create': 'Dala i-akhawunti', 'form.cancel': 'Khansela', 'form.save': 'Londoloza izinguquko',
    'free': 'okusele', 'of': 'kwa-'
  },
  nso: {
    'nav.home': 'Gae', 'nav.accounts': 'Diakhaonto', 'nav.support': 'Thekgo', 'nav.settings': 'Dipeakanyo',
    'action.signout': 'Tšwa', 'action.edit': 'Fetoša', 'action.remove': 'Tloša',
    'home.title': 'Kakaretšo ya tshepedišo', 'home.sub': 'Diakhaonto, mešomo ya letšatši le polokelo.',
    'stat.accounts': 'Diakhaonto tša bašomi', 'stat.today': 'Ba tsenego lehono', 'stat.files': 'Difaele tša balwetši', 'stat.screens': 'Dingwalwa tše hlahlobilwego lehono',
    'chart.usage': 'Mešomo ya letšatši', 'chart.usageSub': 'Dingwalwa matšatšing a 14 a fetilego',
    'chart.storage': 'Polokelo', 'chart.storageSub': 'Difaele tša balwetši le datha ya mmotlolo',
    'chart.roles': 'Diakhaonto ka karolo', 'chart.rolesSub': 'Tše šomago fela',
    'chart.load': 'Tšhomišo ya lefelo la mošomo', 'chart.loadSub': 'Karolo ya go tsena ka lefelo',
    'chart.health': 'Maphelo a tshepedišo', 'chart.healthSub': 'Go hlahlobilwe gona bjale',
    'accounts.title': 'Diakhaonto', 'accounts.sub': 'Oketša, mpshafatša gomme o tloše diakhaonto.',
    'accounts.add': 'Oketša akhaonto', 'accounts.search': 'Nyaka ka ID goba leina', 'role.all': 'Dikarolo ka moka',
    'table.id': 'ID ya mošomi', 'table.name': 'Leina', 'table.role': 'Karolo', 'table.status': 'Boemo', 'table.last': 'Go tsena mafelelo',
    'status.active': 'E a šoma', 'status.pending': 'Ga se a tsena', 'status.revoked': 'E phumotšwe',
    'support.title': 'Thekgo', 'support.sub': 'Melaetša go tšwa mafelong ka moka a mošomo.',
    'settings.title': 'Dipeakanyo', 'settings.sub': 'Di šoma go portal ye le ka moo dipalo di bontšhwago.',
    'settings.appearance': 'Ponagalo', 'settings.theme': 'Sebopego', 'settings.light': 'Seedi', 'settings.dark': 'Leswiswi',
    'settings.language': 'Leleme', 'settings.save': 'Boloka dipeakanyo',
    'form.name': 'Leina ka botlalo', 'form.role': 'Karolo', 'form.facility': 'Setheo', 'form.id': 'ID ya mošomi',
    'form.password': 'Phasewete ya mathomo', 'form.create': 'Hlama akhaonto', 'form.cancel': 'Khansela', 'form.save': 'Boloka diphetogo',
    'free': 'tše šetšego', 'of': 'go tšwa go'
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

/* ==================================================================
   Slide-in menu on small screens
   ================================================================== */

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

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeDrawer();
});

/* ==================================================================
   Charts — hand-drawn SVG so they follow the theme tokens
   ================================================================== */

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

/* Charts animate once when the dashboard first appears: the gauge sweeps to
   full and settles on the real reading, the line draws itself, the donut
   fills round and the bars grow from empty. Redraws after that (theme or
   language changes) are instant. */

let chartsAnimated = false;

function shouldAnimate() { return !chartsAnimated && !REDUCED_MOTION; }

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* ---------- a panel with nothing to draw yet ---------- */

function emptyState(reason) {
  return `<div class="empty" style="padding:26px 10px;line-height:1.6">${reason}</div>`;
}

/* ---------- storage gauge ---------- */

const GAUGE = { start: 135, sweep: 270, cx: 125, cy: 120, r: 86 };

function drawGauge() {
  const space = overview && overview.storage;
  const caption = document.getElementById('gaugeCaption');
  const readout = document.getElementById('gaugeValue');
  const holder = document.getElementById('gauge');

  // No credentials, no connection, or a plan with no stated limit: say so
  // rather than drawing a needle pointing at nothing.
  if (!space || !space.available || space.used_percent === null || space.used_percent === undefined) {
    holder.innerHTML = emptyState(
      (space && space.detail) || t('storage.none', 'Storage figures are not available.')
    );
    readout.textContent = '—';
    caption.textContent = '';
    return;
  }

  const target = Math.min(space.used_percent / 100, 1);
  const { start, sweep, cx, cy, r } = GAUGE;

  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = start + (sweep * i) / 10;
    const [x1, y1] = polar(cx, cy, r - 16, a);
    const [x2, y2] = polar(cx, cy, r - (i % 5 === 0 ? 27 : 22), a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="${i % 5 === 0 ? 2 : 1}" opacity="${i % 5 === 0 ? .38 : .2}" stroke-linecap="round"/>`;
  }

  holder.innerHTML = `
    <svg viewBox="0 0 250 178" style="width:100%;max-width:250px;color:var(--ink)" role="img" aria-label="Storage used">
      <path d="${arcPath(cx, cy, r, start, start + sweep)}" fill="none" stroke="var(--track)" stroke-width="14" stroke-linecap="round"/>
      <path id="gaugeArc" d="${arcPath(cx, cy, r, start, start + sweep)}" pathLength="1"
            fill="none" stroke="var(--green)" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="0 1"/>
      ${ticks}
      <g id="gaugeNeedle" transform="rotate(${start} ${cx} ${cy})">
        <line x1="${cx - 14}" y1="${cy}" x2="${cx + r - 36}" y2="${cy}" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>
      </g>
      <circle cx="${cx}" cy="${cy}" r="7.5" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"/>
      <text x="${cx - r + 2}" y="${cy + 36}" font-size="11" fill="var(--muted)" text-anchor="middle">0</text>
      <text x="${cx + r - 2}" y="${cy + 36}" font-size="11" fill="var(--muted)" text-anchor="middle">${bytesText(space.limit_bytes)}</text>
    </svg>`;

  const arc = document.getElementById('gaugeArc');
  const needle = document.getElementById('gaugeNeedle');

  function paint(fraction) {
    arc.setAttribute('stroke-dasharray', `${fraction.toFixed(4)} 1`);
    needle.setAttribute('transform', `rotate(${(start + sweep * fraction).toFixed(2)} ${cx} ${cy})`);
    readout.textContent = Math.round(fraction * 100) + '%';
  }

  const free = (space.limit_bytes !== null && space.used_bytes !== null)
    ? ` · ${bytesText(space.limit_bytes - space.used_bytes)} ${t('free', 'free')}`
    : '';

  caption.innerHTML =
    `${bytesText(space.used_bytes)} ${t('of', 'of')} ${bytesText(space.limit_bytes)}${free}`
    + (space.limit_is_credits
        ? `<br><span style="opacity:.75">${t('storage.credits', 'The limit is a credit allowance covering storage, bandwidth and transformations together.')}</span>`
        : '');

  if (!shouldAnimate()) { paint(target); return; }

  animate({
    duration: 850,
    ease: easeInOutCubic,
    onFrame: paint,
    onDone: () => animate({ duration: 700, onFrame: p => paint(1 - (1 - target) * p) })
  });
}

/* ---------- daily activity line ---------- */

function drawLine() {
  const holder = document.getElementById('lineChart');
  const series = overview && overview.daily_activity;

  if (!series || !series.available) {
    holder.innerHTML = emptyState(
      (series && series.detail) || t('activity.none', 'No activity recorded yet.')
    );
    return;
  }

  const values = series.values || [];
  const labelsIn = series.labels || [];

  if (values.length < 2) {
    holder.innerHTML = emptyState(t('activity.thin', 'Not enough days recorded to draw a trend yet.'));
    return;
  }

  const w = 640, h = 220, padX = 30, padY = 24;
  const max = Math.max(...values, 1) * 1.14;
  const stepX = (w - padX * 2) / (values.length - 1);
  const y = v => h - padY - (v / max) * (h - padY * 2);

  const points = values.map((v, i) => [padX + i * stepX, y(v)]);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${h - padY} L ${padX} ${h - padY} Z`;

  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const gy = padY + ((h - padY * 2) / 3) * i;
    grid += `<line x1="${padX}" y1="${gy}" x2="${w - padX}" y2="${gy}" stroke="var(--line)" stroke-width="1"/>`;
  }

  const labels = labelsIn.map((d, i) =>
    i % 2 === 0 ? `<text x="${(padX + i * stepX).toFixed(1)}" y="${h - 4}" font-size="10" fill="var(--muted)" text-anchor="middle">${d}</text>` : '').join('');

  const last = points[points.length - 1];

  holder.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%" role="img" aria-label="Activity per day">
      ${grid}
      <path id="lineArea" d="${area}" fill="var(--green)" opacity="0"/>
      <path id="lineStroke" d="${line}" pathLength="1" fill="none" stroke="var(--green)" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>
      <g id="lineTip" opacity="0">
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.5" fill="var(--green)"/>
        <text x="${(last[0] - 8).toFixed(1)}" y="${(last[1] - 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="end">${values[values.length - 1]}</text>
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

/* ---------- accounts by role ---------- */

function drawDonut() {
  const holder = document.getElementById('donut');
  const legendHolder = document.getElementById('donutLegend');
  const byRole = (overview && overview.accounts && overview.accounts.by_role) || [];

  if (!byRole.length) {
    holder.innerHTML = emptyState(t('roles.none', 'No active accounts yet.'));
    legendHolder.innerHTML = '';
    return;
  }

  const total = byRole.reduce((sum, row) => sum + row.count, 0) || 1;
  const r = 60, c = 2 * Math.PI * r;

  let segments = '', legend = '';
  byRole.forEach((row, index) => {
    segments += `<circle class="donut-seg" data-index="${index}" cx="80" cy="80" r="${r}" fill="none"
      stroke="${ROLE_COLOR[row.role] || 'var(--muted)'}" stroke-width="19" stroke-dasharray="0 ${c.toFixed(2)}"
      stroke-dashoffset="0" transform="rotate(-90 80 80)"/>`;
    legend += `<div class="legend-row">
        <span class="legend-dot" style="background:${ROLE_COLOR[row.role] || 'var(--muted)'}"></span>
        <span>${row.label}</span>
        <span>${row.count}</span>
      </div>`;
  });

  holder.innerHTML = `
    <svg viewBox="0 0 160 160" style="width:100%;max-width:168px" role="img" aria-label="Accounts by role">
      <circle cx="80" cy="80" r="${r}" fill="none" stroke="var(--track)" stroke-width="19"/>
      ${segments}
      <text id="donutTotal" x="80" y="86" font-size="28" font-weight="800" fill="var(--ink)" text-anchor="middle">0</text>
    </svg>`;

  legendHolder.innerHTML = legend;

  const nodes = [...document.querySelectorAll('.donut-seg')];
  const totalLabel = document.getElementById('donutTotal');

  function paint(p) {
    let offset = 0;
    byRole.forEach((row, index) => {
      const len = (row.count / total) * c * p;
      nodes[index].setAttribute('stroke-dasharray', `${len.toFixed(2)} ${(c - len).toFixed(2)}`);
      nodes[index].setAttribute('stroke-dashoffset', (-offset).toFixed(2));
      offset += len;
    });
    totalLabel.textContent = Math.round(total * p);
  }

  if (!shouldAnimate()) { paint(1); return; }
  animate({ duration: 1000, onFrame: paint });
}

/* ---------- workspace use ---------- */

function drawBars() {
  const holder = document.getElementById('barList');
  const use = overview && overview.workspace_use;

  if (!use || !use.available) {
    holder.innerHTML = emptyState(
      (use && use.detail) || t('workspace.none', 'No workspace activity recorded yet.')
    );
    return;
  }

  const rowsOut = use.rows || [];
  holder.innerHTML = rowsOut.map(row => `
    <div class="bar-row">
      <div class="bar-top"><span>${row.label}</span><span>${row.value}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${shouldAnimate() ? 0 : row.value}%"></div></div>
    </div>`).join('');

  if (!shouldAnimate()) return;

  const fills = [...document.querySelectorAll('#barList .bar-fill')];
  requestAnimationFrame(() => {
    fills.forEach((fill, index) => {
      fill.style.transitionDelay = `${index * 90}ms`;
      fill.style.width = rowsOut[index].value + '%';
    });
  });
}

/* ---------- system health ---------- */

function drawHealth() {
  const checks = (overview && overview.health) || [];
  document.getElementById('healthList').innerHTML = checks.length
    ? checks.map(item => `
        <div class="setting">
          <div class="setting-copy"><strong>${item.label}</strong></div>
          <span class="tag ${item.ok ? 'green' : 'warn'}">${item.value}</span>
        </div>`).join('')
    : emptyState(t('health.none', 'No checks reported.'));
}

/* ---------- recent activity ---------- */

function drawActivity() {
  const holder = document.getElementById('activityList');
  if (!holder) return;

  if (!activityEntries.length) {
    holder.innerHTML = emptyState(t('log.none', 'Nothing has been changed yet.'));
    return;
  }

  holder.innerHTML = activityEntries.slice(0, 12).map(entry => `
    <div class="log-row">
      <time>${whenText(entry.at)}</time>
      <span>${entry.detail || entry.label}</span>
      <span class="log-actor">${entry.actor || t('log.system', 'system')}</span>
    </div>`).join('');
}

/* ==================================================================
   Accounts table
   ================================================================== */

const rows = document.getElementById('accountRows');
const searchInput = document.getElementById('searchInput');
const roleFilter = document.getElementById('roleFilter');

function statusTag(status) {
  if (status === 'active') return `<span class="tag green">${t('status.active', 'Active')}</span>`;
  if (status === 'pending') return `<span class="tag warn">${t('status.pending', 'Not signed in')}</span>`;
  return `<span class="tag grey">${t('status.revoked', 'Revoked')}</span>`;
}

function renderTable() {
  const term = searchInput.value.trim().toLowerCase();
  const role = roleFilter.value;

  const shown = accounts.filter(a =>
    (!role || a.role === role) &&
    (!term || a.id.toLowerCase().includes(term) || a.name.toLowerCase().includes(term)));

  if (loadError) {
    rows.innerHTML = `<tr><td colspan="6" class="empty">${loadError}</td></tr>`;
    return;
  }

  rows.innerHTML = shown.length ? shown.map(a => {
    const revoked = a.status === 'revoked';

    // You cannot revoke or delete the account you are signed in with, so the
    // buttons that would fail are simply not offered.
    const actions = [
      `<button class="link-btn" data-act="edit" data-id="${a.id}">${t('action.edit', 'Edit')}</button>`,
      `<button class="link-btn" data-act="password" data-id="${a.id}">${t('action.reset', 'Reset password')}</button>`,
    ];

    if (!a.is_self) {
      actions.push(`<button class="link-btn ${revoked ? '' : 'danger'}" data-act="access" data-id="${a.id}" data-active="${revoked}">
          ${revoked ? t('action.restore', 'Restore') : t('action.revoke', 'Revoke')}</button>`);
      actions.push(`<button class="link-btn danger" data-act="remove" data-id="${a.id}">${t('action.remove', 'Remove')}</button>`);
    }

    return `
      <tr>
        <td class="id">${a.id}${a.is_self ? ` <span class="tag" style="margin-left:6px">${t('label.you', 'you')}</span>` : ''}</td>
        <td>${a.name}</td>
        <td><span class="tag">${a.role_label || ROLE_LABEL[a.role] || a.role}</span></td>
        <td>${statusTag(a.status)}</td>
        <td class="sub">${whenText(a.last_login)}</td>
        <td><div class="row-actions">${actions.join('')}</div></td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="6" class="empty">${t('empty.accounts', 'No accounts match that search. Clear the filter to see everyone.')}</td></tr>`;
}

searchInput.addEventListener('input', renderTable);
roleFilter.addEventListener('change', renderTable);

/* ==================================================================
   Loading
   ================================================================== */

function paintStat(id, value, delta) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
  const deltaNode = document.getElementById(id + 'Delta');
  if (deltaNode) deltaNode.textContent = delta || '';
}

function render() {
  renderTable();

  const counts = (overview && overview.accounts) || null;

  if (counts) {
    paintStat('statAccounts', nf().format(counts.total),
      `${counts.active} ${t('active.lower', 'active')}${counts.revoked ? ` · ${counts.revoked} ${t('revoked.lower', 'revoked')}` : ''}`);
    paintStat('statToday', nf().format(counts.signed_in_today), t('delta.today', 'across all workspaces'));
  } else {
    paintStat('statAccounts', '—', '');
    paintStat('statToday', '—', '');
  }

  // Patient files and screening belong to workspaces that are not wired up
  // yet. A dash is honest; a zero would not be.
  const files = overview && overview.patient_files;
  paintStat('statFiles',
    files && files.available ? nf().format(files.total) : '—',
    files && files.available ? `+${files.added_this_week || 0} ${t('delta.week', 'this week')}`
                             : t('delta.pending', 'not connected yet'));

  const screening = overview && overview.screening;
  paintStat('statScreens',
    screening && screening.available ? nf().format(screening.today) : '—',
    screening && screening.available ? (screening.change || '')
                                     : t('delta.pending', 'not connected yet'));

  drawGauge();
  drawLine();
  drawDonut();
  drawBars();
  drawHealth();
  drawActivity();

  chartsAnimated = true;

  renderTickets();
}

function renderTickets() {
  const holder = document.getElementById('ticketList');

  if (!tickets.length) {
    holder.innerHTML = `<div class="card">${emptyState(t('tickets.none', 'No support requests. Messages sent from the other workspaces appear here.'))}</div>`;
    return;
  }

  holder.innerHTML = tickets.map(item => `
    <div class="card" style="margin-bottom:10px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start">
      <div>
        <h3 style="margin-bottom:4px">${item.subject}</h3>
        <p class="card-sub" style="margin:0 0 8px;white-space:pre-wrap">${item.body}</p>
        <div style="color:var(--muted);font-size:12px">
          ${item.raised_by_name || t('log.system', 'system')}${item.raised_by ? ` · ${item.raised_by}` : ''}
          ${item.workspace_label ? ` · ${item.workspace_label}` : ''} · ${whenText(item.created_at)}
        </div>
        ${item.resolution ? `<div style="margin-top:8px;color:var(--muted);font-size:12px"><strong>${t('tickets.resolution', 'Resolution')}:</strong> ${item.resolution}</div>` : ''}
      </div>
      <div style="display:grid;gap:8px;justify-items:end">
        <span class="tag ${item.status === 'open' ? 'warn' : 'grey'}">${item.status === 'open' ? t('status.open', 'Open') : t('status.closed', 'Closed')}</span>
        <button class="link-btn" data-ticket="${item.id}" data-status="${item.status}">
          ${item.status === 'open' ? t('action.close', 'Close') : t('action.reopen', 'Reopen')}
        </button>
      </div>
    </div>`).join('');
}

document.getElementById('ticketList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-ticket]');
  if (!button) return;

  const closing = button.dataset.status === 'open';
  let resolution = '';

  if (closing) {
    resolution = window.prompt(t('tickets.ask', 'What was done about it? (optional)')) || '';
  }

  try {
    await callApi(`${API.tickets}${button.dataset.ticket}/status/`, {
      method: 'POST',
      body: { status: closing ? 'closed' : 'open', resolution }
    });
    // Reload everything, not just the list: closing a request changes the
    // open count on Home and adds a line to the activity log.
    await loadAll();
    toast(closing ? t('toast.closed', 'Support request closed') : t('toast.reopened', 'Support request reopened'));
  } catch (error) {
    toast(error.message);
  }
});

async function loadAccounts() {
  const data = await callApi(API.accounts);
  accounts = data.results;
}

async function loadOverview() {
  overview = await callApi(API.overview);
}

async function loadTickets() {
  const data = await callApi(API.tickets);
  tickets = data.results;
}

async function loadActivity() {
  try {
    const data = await callApi(API.activity + '?limit=20');
    activityEntries = data.results;
  } catch (error) {
    activityEntries = [];
  }
}

async function loadAll() {
  loadError = null;
  try {
    await Promise.all([loadAccounts(), loadOverview(), loadTickets(), loadActivity()]);
  } catch (error) {
    loadError = error.message || t('error.load', 'Could not load the portal data.');
    toast(loadError);
  }
  render();
}

/* ==================================================================
   Add / edit account
   ================================================================== */

const backdrop = document.getElementById('modalBackdrop');
const fRole = document.getElementById('fRole');
const fId = document.getElementById('fId');
const fPassword = document.getElementById('fPassword');
let editingId = null;

/* The server owns ID generation, so the browser asks for one rather than
   inventing a number that might already be taken. */
async function fillSuggestion() {
  if (editingId) return;

  fId.value = t('form.generating', 'Generating…');
  try {
    const data = await callApi(`${API.suggestId}?role=${encodeURIComponent(fRole.value)}`);
    fId.value = data.user_id;
    fPassword.value = data.password;
  } catch (error) {
    fId.value = '';
    toast(error.message);
  }
}

function openModal(account) {
  editingId = account ? account.id : null;

  document.getElementById('modalTitle').textContent = account ? t('form.editTitle', 'Update account') : t('form.addTitle', 'Add account');
  document.getElementById('modalSub').textContent = account
    ? t('form.editSub', 'Change the details. The ID and password are not changed here.')
    : t('form.addSub', 'The ID is generated from the role. Hand the details over in person.');
  document.getElementById('saveAccount').textContent = account ? t('form.save', 'Save changes') : t('form.create', 'Create account');

  document.getElementById('fName').value = account ? account.name : '';
  fRole.value = account ? account.role : 'doctor';
  document.getElementById('fFacility').value = account ? account.facility : 'Dr George Mukhari Academic Hospital';
  document.getElementById('fEmail').value = account ? account.email : '';
  document.getElementById('fReg').value = account ? account.reg : '';

  document.getElementById('idHint').textContent = account
    ? t('form.idHintEdit', 'The ID stays the same once the account exists.')
    : t('form.idHint', 'Generated automatically from the role.');

  document.getElementById('passwordField').style.display = account ? 'none' : 'grid';
  document.getElementById('regenId').style.display = account ? 'none' : 'block';

  if (account) {
    fId.value = account.id;
    fPassword.value = '';
  } else {
    fillSuggestion();
  }

  document.getElementById('issuedCard').style.display = 'none';
  document.querySelector('.modal-actions').style.display = 'flex';
  backdrop.classList.add('open');
  document.getElementById('fName').focus();
}

function closeModal() {
  backdrop.classList.remove('open');
  editingId = null;
}

document.getElementById('addAccount').addEventListener('click', () => openModal(null));
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('regenId').addEventListener('click', fillSuggestion);
document.getElementById('regenPassword').addEventListener('click', fillSuggestion);
fRole.addEventListener('change', fillSuggestion);

backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && backdrop.classList.contains('open')) closeModal(); });

function showIssued(credentials) {
  document.getElementById('issuedId').textContent = credentials.user_id;
  document.getElementById('issuedPassword').textContent = credentials.password;
  document.getElementById('issuedCard').style.display = 'block';
  document.querySelector('.modal-actions').style.display = 'none';
}

document.getElementById('saveAccount').addEventListener('click', async () => {
  const button = document.getElementById('saveAccount');
  const name = document.getElementById('fName').value.trim();
  if (!name) { toast(t('error.name', 'Enter the full name to continue.')); return; }

  const details = {
    name,
    role: fRole.value,
    facility: document.getElementById('fFacility').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    reg: document.getElementById('fReg').value.trim()
  };

  button.disabled = true;

  try {
    if (editingId) {
      await callApi(`${API.accounts}${encodeURIComponent(editingId)}/`, { method: 'POST', body: details });
      toast(`${editingId} ${t('toast.updated', 'updated')}`);
      closeModal();
    } else {
      const data = await callApi(API.createAccount, {
        method: 'POST',
        body: { ...details, user_id: fId.value.trim(), password: fPassword.value.trim() }
      });
      showIssued(data.credentials);
    }
    await loadAll();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('doneIssuing').addEventListener('click', () => { closeModal(); showPanel('accounts'); });

rows.addEventListener('click', async event => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;

  const id = button.dataset.id;
  const account = accounts.find(a => a.id === id);
  if (!account) return;

  if (button.dataset.act === 'edit') { openModal(account); return; }

  try {
    if (button.dataset.act === 'password') {
      if (!window.confirm(`${t('confirm.reset', 'Issue a new password for')} ${id}?`)) return;
      const data = await callApi(`${API.accounts}${encodeURIComponent(id)}/password/`, { method: 'POST', body: {} });
      openModal(account);
      showIssued(data.credentials);
      await loadAll();
      return;
    }

    if (button.dataset.act === 'access') {
      const activating = button.dataset.active === 'true';
      if (!activating && !window.confirm(`${t('confirm.revoke', 'Revoke access for')} ${id}?`)) return;
      await callApi(`${API.accounts}${encodeURIComponent(id)}/access/`, {
        method: 'POST', body: { is_active: activating }
      });
      toast(`${id} ${activating ? t('toast.restored', 'restored') : t('toast.revoked', 'revoked')}`);
      await loadAll();
      return;
    }

    if (button.dataset.act === 'remove') {
      // Deleting loses the history attached to the account, so the wording
      // points at revoking instead and asks twice.
      if (!window.confirm(
        `${t('confirm.removeOne', 'Delete')} ${id} ${t('confirm.removeTwo', 'permanently? Revoking keeps the record and can be undone. This cannot.')}`
      )) return;
      if (!window.confirm(t('confirm.removeAgain', 'Last check — delete this account for good?'))) return;

      await callApi(`${API.accounts}${encodeURIComponent(id)}/delete/`, { method: 'POST' });
      toast(`${id} ${t('toast.removed', 'deleted')}`);
      await loadAll();
    }
  } catch (error) {
    toast(error.message);
  }
});

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

/* Changing the theme or language redraws from what is already loaded; the
   charts do not replay their entry animation each time. */

document.getElementById('saveSettings').addEventListener('click', () => toast(t('toast.saved', 'Settings saved')));

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
   Start up

   The session is checked first; everything else only runs if it passed.
   The dashboard refreshes while the tab is open, but pauses when it is
   hidden so a portal left open overnight is not polling all night.
   ================================================================== */

const REFRESH_MS = 60000;
let refreshTimer = null;

function startRefreshing() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadAll();
  }, REFRESH_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadAll();
});

(async function start() {
  render();                       // draw the empty shell straight away
  if (await requireSession()) {
    await loadAll();
    startRefreshing();
  }
})();

/* ==================================================================
   Sign out
   ================================================================== */

document.getElementById('signOut').addEventListener('click', async () => {
  try {
    await fetch(API.logout, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' }
    });
  } finally {
    window.location.href = LOGIN_URL;
  }
});