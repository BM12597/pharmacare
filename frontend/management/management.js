/* PharmaCare+ — management portal.
   Session and identity come from Django. The dashboard figures below are
   still placeholder data and get replaced once the role pages are built. */

const API = {
  me: '/api/auth/me/',
  logout: '/api/auth/logout/'
};

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
  } catch (error) {
    window.location.href = LOGIN_URL;
  }
}

requireSession();

/* ==================================================================
   Demo data. Django replaces each of these with a real query.
   ================================================================== */

const ROLE_LABEL = { admin: 'Admin', doctor: 'Doctor', pharmacist: 'Pharmacist', researcher: 'Researcher', it: 'IT support' };
const ROLE_PREFIX = { admin: 'AD', doctor: 'DR', pharmacist: 'PH', researcher: 'RS', it: 'IT' };
const ROLE_COLOR = { doctor: '#153f32', pharmacist: '#4a7c64', researcher: '#9dbfa8', admin: '#d7e58f', it: '#c2b8a0' };

let accounts = [
  { id: 'DGMH-IT-0001', name: 'O. Hlalethwa', role: 'it', status: 'active', last: 'Today, 09:41', email: '', reg: '', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-DR-0101', name: 'Dr M. Sithole', role: 'doctor', status: 'active', last: 'Today, 08:14', email: '', reg: 'MP0453219', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-DR-0118', name: 'Dr N. Khumalo', role: 'doctor', status: 'pending', last: 'Never', email: '', reg: '', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-DR-0126', name: 'Dr A. Botha', role: 'doctor', status: 'active', last: 'Today, 07:48', email: '', reg: '', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-PH-0142', name: 'T. Mokoena', role: 'pharmacist', status: 'active', last: 'Yesterday, 16:40', email: '', reg: 'P0198334', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-PH-0155', name: 'L. van Wyk', role: 'pharmacist', status: 'revoked', last: '14 Aug 2026', email: '', reg: '', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-RS-0007', name: 'P. Naidoo', role: 'researcher', status: 'active', last: 'Today, 07:02', email: '', reg: '', facility: 'Dr George Mukhari Academic Hospital' },
  { id: 'DGMH-AD-0044', name: 'S. Dlamini', role: 'admin', status: 'active', last: 'Today, 06:55', email: '', reg: '', facility: 'Dr George Mukhari Academic Hospital' }
];

const usageSeries = [128, 141, 96, 152, 168, 174, 133, 118, 186, 192, 177, 205, 198, 221];
const usageDays = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '1', '2'];

const storage = { usedGb: 341, totalGb: 500 };
const patientFiles = 12480;
const screenedToday = 221;

const workspaceLoad = [
  { label: 'Doctor', value: 46 },
  { label: 'Pharmacy', value: 34 },
  { label: 'Research', value: 12 },
  { label: 'Admin', value: 8 }
];

const health = [
  { label: 'Interaction model', value: 'Loaded · v1.4', ok: true },
  { label: 'Database', value: 'Connected', ok: true },
  { label: 'Last backup', value: 'Today, 03:00', ok: true },
  { label: 'Failed sign-ins (24h)', value: '3', ok: true }
];

const tickets = [
  { who: 'Dr N. Khumalo · DGMH-DR-0118', subject: 'Cannot sign in after password reset', body: 'The new password from the reset is rejected on the doctor login page.', status: 'open', when: 'Today, 09:12' },
  { who: 'T. Mokoena · DGMH-PH-0142', subject: 'Interaction warning missing severity', body: 'A flagged prescription reached the pharmacy queue without a severity level.', status: 'open', when: 'Yesterday, 15:30' },
  { who: 'P. Naidoo · DGMH-RS-0007', subject: 'Bulk upload for validated pairs', body: 'Asking whether validated drug pairs can be pushed back in as a CSV.', status: 'closed', when: '28 Aug 2026' }
];

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

/* ---------- storage gauge ---------- */

const GAUGE = { start: 135, sweep: 270, cx: 125, cy: 120, r: 86 };

function drawGauge() {
  const target = storage.usedGb / storage.totalGb;
  const { start, sweep, cx, cy, r } = GAUGE;

  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = start + (sweep * i) / 10;
    const [x1, y1] = polar(cx, cy, r - 16, a);
    const [x2, y2] = polar(cx, cy, r - (i % 5 === 0 ? 27 : 22), a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="${i % 5 === 0 ? 2 : 1}" opacity="${i % 5 === 0 ? .38 : .2}" stroke-linecap="round"/>`;
  }

  // The needle is drawn pointing right, then rotated into place.
  document.getElementById('gauge').innerHTML = `
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
      <text x="${cx + r - 2}" y="${cy + 36}" font-size="11" fill="var(--muted)" text-anchor="middle">${storage.totalGb}</text>
    </svg>`;

  const arc = document.getElementById('gaugeArc');
  const needle = document.getElementById('gaugeNeedle');
  const readout = document.getElementById('gaugeValue');

  function paint(fraction) {
    arc.setAttribute('stroke-dasharray', `${fraction.toFixed(4)} 1`);
    needle.setAttribute('transform', `rotate(${(start + sweep * fraction).toFixed(2)} ${cx} ${cy})`);
    readout.textContent = Math.round(fraction * 100) + '%';
  }

  document.getElementById('gaugeCaption').textContent =
    `${nf().format(storage.usedGb)} GB ${t('of', 'of')} ${nf().format(storage.totalGb)} GB · ${nf().format(storage.totalGb - storage.usedGb)} GB ${t('free', 'free')}`;

  if (!shouldAnimate()) { paint(target); return; }

  // Sweep to full, then fall back to the real reading.
  animate({
    duration: 850,
    ease: easeInOutCubic,
    onFrame: paint,
    onDone: () => animate({ duration: 700, onFrame: p => paint(1 - (1 - target) * p) })
  });
}

/* ---------- daily activity line ---------- */

function drawLine() {
  const w = 640, h = 220, padX = 30, padY = 24;
  const max = Math.max(...usageSeries) * 1.14;
  const stepX = (w - padX * 2) / (usageSeries.length - 1);
  const y = v => h - padY - (v / max) * (h - padY * 2);

  const points = usageSeries.map((v, i) => [padX + i * stepX, y(v)]);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${h - padY} L ${padX} ${h - padY} Z`;

  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const gy = padY + ((h - padY * 2) / 3) * i;
    grid += `<line x1="${padX}" y1="${gy}" x2="${w - padX}" y2="${gy}" stroke="var(--line)" stroke-width="1"/>`;
  }

  const labels = usageDays.map((d, i) =>
    i % 2 === 0 ? `<text x="${(padX + i * stepX).toFixed(1)}" y="${h - 4}" font-size="10" fill="var(--muted)" text-anchor="middle">${d}</text>` : '').join('');

  const last = points[points.length - 1];

  document.getElementById('lineChart').innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%" role="img" aria-label="Prescriptions screened per day">
      ${grid}
      <path id="lineArea" d="${area}" fill="var(--green)" opacity="0"/>
      <path id="lineStroke" d="${line}" pathLength="1" fill="none" stroke="var(--green)" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>
      <g id="lineTip" opacity="0">
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.5" fill="var(--green)"/>
        <text x="${(last[0] - 8).toFixed(1)}" y="${(last[1] - 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="end">${usageSeries[usageSeries.length - 1]}</text>
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
  const active = accounts.filter(a => a.status !== 'revoked');
  const counts = {};
  active.forEach(a => { counts[a.role] = (counts[a.role] || 0) + 1; });

  const total = active.length || 1;
  const r = 60, c = 2 * Math.PI * r;
  const roles = Object.keys(counts);

  let segments = '', legend = '';
  roles.forEach((role, index) => {
    segments += `<circle class="donut-seg" data-index="${index}" cx="80" cy="80" r="${r}" fill="none"
      stroke="${ROLE_COLOR[role]}" stroke-width="19" stroke-dasharray="0 ${c.toFixed(2)}"
      stroke-dashoffset="0" transform="rotate(-90 80 80)"/>`;
    legend += `<div class="legend-row">
        <span class="legend-dot" style="background:${ROLE_COLOR[role]}"></span>
        <span>${ROLE_LABEL[role]}</span>
        <span>${counts[role]}</span>
      </div>`;
  });

  document.getElementById('donut').innerHTML = `
    <svg viewBox="0 0 160 160" style="width:100%;max-width:168px" role="img" aria-label="Accounts by role">
      <circle cx="80" cy="80" r="${r}" fill="none" stroke="var(--track)" stroke-width="19"/>
      ${segments}
      <text id="donutTotal" x="80" y="86" font-size="28" font-weight="800" fill="var(--ink)" text-anchor="middle">0</text>
    </svg>`;

  document.getElementById('donutLegend').innerHTML = legend;

  const nodes = [...document.querySelectorAll('.donut-seg')];
  const totalLabel = document.getElementById('donutTotal');

  function paint(p) {
    let offset = 0;
    roles.forEach((role, index) => {
      const len = (counts[role] / total) * c * p;
      nodes[index].setAttribute('stroke-dasharray', `${len.toFixed(2)} ${(c - len).toFixed(2)}`);
      nodes[index].setAttribute('stroke-dashoffset', (-offset).toFixed(2));
      offset += len;
    });
    totalLabel.textContent = Math.round(total * p);
  }

  if (!shouldAnimate()) { paint(1); return; }
  animate({ duration: 1000, onFrame: paint });
}

/* ---------- workspace bars ---------- */

function drawBars() {
  document.getElementById('barList').innerHTML = workspaceLoad.map(row => `
    <div class="bar-row">
      <div class="bar-top"><span>${row.label}</span><span>${row.value}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${shouldAnimate() ? 0 : row.value}%"></div></div>
    </div>`).join('');

  if (!shouldAnimate()) return;

  const fills = [...document.querySelectorAll('#barList .bar-fill')];
  requestAnimationFrame(() => {
    fills.forEach((fill, index) => {
      fill.style.transitionDelay = `${index * 90}ms`;
      fill.style.width = workspaceLoad[index].value + '%';
    });
  });
}

function drawHealth() {
  document.getElementById('healthList').innerHTML = health.map(item => `
    <div class="setting">
      <div class="setting-copy"><strong>${item.label}</strong></div>
      <span class="tag ${item.ok ? 'green' : 'warn'}">${item.value}</span>
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

  rows.innerHTML = shown.length ? shown.map(a => `
    <tr>
      <td class="id">${a.id}</td>
      <td>${a.name}</td>
      <td><span class="tag">${ROLE_LABEL[a.role]}</span></td>
      <td>${statusTag(a.status)}</td>
      <td class="sub">${a.last}</td>
      <td>
        <div class="row-actions">
          <button class="link-btn" data-act="edit" data-id="${a.id}">${t('action.edit', 'Edit')}</button>
          <button class="link-btn danger" data-act="remove" data-id="${a.id}">${t('action.remove', 'Remove')}</button>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${t('empty.accounts', 'No accounts match that search. Clear the filter to see everyone.')}</td></tr>`;
}

function render() {
  renderTable();

  const active = accounts.filter(a => a.status === 'active').length;
  document.getElementById('statAccounts').textContent = nf().format(accounts.length);
  document.getElementById('statAccountsDelta').textContent = `${active} ${t('active.lower', 'active')}`;
  document.getElementById('statToday').textContent = accounts.filter(a => a.last.startsWith('Today')).length;
  document.getElementById('statTodayDelta').textContent = t('delta.today', 'across all workspaces');
  document.getElementById('statFiles').textContent = nf().format(patientFiles);
  document.getElementById('statFilesDelta').textContent = `+38 ${t('delta.week', 'this week')}`;
  document.getElementById('statScreens').textContent = nf().format(screenedToday);
  document.getElementById('statScreensDelta').textContent = `+12% ${t('delta.vs', 'vs yesterday')}`;

  drawGauge();
  drawLine();
  drawDonut();
  drawBars();
  drawHealth();

  chartsAnimated = true;

  document.getElementById('ticketList').innerHTML = tickets.map(item => `
    <div class="card" style="margin-bottom:10px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start">
      <div>
        <h3 style="margin-bottom:4px">${item.subject}</h3>
        <p class="card-sub" style="margin:0 0 8px">${item.body}</p>
        <div style="color:var(--muted);font-size:12px">${item.who} · ${item.when}</div>
      </div>
      <span class="tag ${item.status === 'open' ? 'warn' : 'grey'}">${item.status === 'open' ? t('status.open', 'Open') : t('status.closed', 'Closed')}</span>
    </div>`).join('');
}

searchInput.addEventListener('input', renderTable);
roleFilter.addEventListener('change', renderTable);

/* ==================================================================
   Add / edit account
   ================================================================== */

const backdrop = document.getElementById('modalBackdrop');
const fRole = document.getElementById('fRole');
const fId = document.getElementById('fId');
const fPassword = document.getElementById('fPassword');
let editingId = null;

function makeId(role) {
  let candidate;
  do {
    candidate = `DGMH-${ROLE_PREFIX[role]}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  } while (accounts.some(a => a.id === candidate));
  return candidate;
}

function makePassword() {
  const words = ['Safe', 'Dose', 'Care', 'Script', 'Ward', 'Check'];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(Math.random() * 9000) + 1000}!`;
}

function openModal(account) {
  editingId = account ? account.id : null;

  document.getElementById('modalTitle').textContent = account ? t('form.editTitle', 'Update account') : t('form.addTitle', 'Add account');
  document.getElementById('modalSub').textContent = account
    ? t('form.editSub', 'Change the details or issue a new password.')
    : t('form.addSub', 'The ID is generated from the role. Hand the details over in person.');
  document.getElementById('saveAccount').textContent = account ? t('form.save', 'Save changes') : t('form.create', 'Create account');

  document.getElementById('fName').value = account ? account.name : '';
  fRole.value = account ? account.role : 'doctor';
  document.getElementById('fFacility').value = account ? account.facility : 'Dr George Mukhari Academic Hospital';
  document.getElementById('fEmail').value = account ? account.email : '';
  document.getElementById('fReg').value = account ? account.reg : '';

  fId.value = account ? account.id : makeId(fRole.value);
  document.getElementById('idHint').textContent = account
    ? t('form.idHintEdit', 'The ID stays the same once the account exists.')
    : t('form.idHint', 'Generated automatically from the role.');

  document.getElementById('passwordField').style.display = account ? 'none' : 'grid';
  document.getElementById('regenId').style.display = account ? 'none' : 'block';
  fPassword.value = makePassword();

  document.getElementById('issuedCard').style.display = 'none';
  backdrop.classList.add('open');
  document.getElementById('fName').focus();
}

function closeModal() {
  backdrop.classList.remove('open');
  editingId = null;
}

document.getElementById('addAccount').addEventListener('click', () => openModal(null));
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('regenId').addEventListener('click', () => { fId.value = makeId(fRole.value); });
document.getElementById('regenPassword').addEventListener('click', () => { fPassword.value = makePassword(); });
fRole.addEventListener('change', () => { if (!editingId) fId.value = makeId(fRole.value); });

backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && backdrop.classList.contains('open')) closeModal(); });

document.getElementById('saveAccount').addEventListener('click', () => {
  const name = document.getElementById('fName').value.trim();
  if (!name) { toast(t('error.name', 'Enter the full name to continue.')); return; }

  const details = {
    name,
    role: fRole.value,
    facility: document.getElementById('fFacility').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    reg: document.getElementById('fReg').value.trim()
  };

  if (editingId) {
    Object.assign(accounts.find(a => a.id === editingId), details);
    toast(`${editingId} ${t('toast.updated', 'updated')}`);
    closeModal();
    render();
    return;
  }

  accounts.unshift(Object.assign({ id: fId.value, status: 'pending', last: 'Never' }, details));
  document.getElementById('issuedId').textContent = fId.value;
  document.getElementById('issuedPassword').textContent = fPassword.value;
  document.getElementById('issuedCard').style.display = 'block';
  render();
});

document.getElementById('doneIssuing').addEventListener('click', () => { closeModal(); showPanel('accounts'); });

rows.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const account = accounts.find(a => a.id === button.dataset.id);
  if (!account) return;

  if (button.dataset.act === 'edit') { openModal(account); return; }

  if (window.confirm(`${t('confirm.remove', 'Remove')} ${account.id}?`)) {
    accounts = accounts.filter(a => a.id !== account.id);
    toast(`${account.id} ${t('toast.removed', 'removed')}`);
    render();
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

render();

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