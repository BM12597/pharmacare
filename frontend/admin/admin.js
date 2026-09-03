/* PharmaCare+ — admin workspace.
   The figures below are placeholder data. Each block is marked with the
   query that replaces it once the Django endpoints exist. */

const API = {
  me: '/api/auth/me/',
  logout: '/api/auth/logout/'
};

const LOGIN_URL = '/login/';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

async function requireSession() {
  try {
    const response = await fetch(API.me, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('no session');

    const me = await response.json();
    if (me.role !== 'admin' && !me.is_superuser) throw new Error('wrong workspace');

    document.querySelector('.side-user').textContent = me.full_name || me.user_id;
    document.querySelector('.side-role').textContent = `${me.role_label} \u00b7 ${me.user_id}`;
  } catch (error) {
    window.location.href = LOGIN_URL;
  }
}

requireSession();

/* ==================================================================
   Placeholder data
   ================================================================== */

// → GET /api/patients/
const patients = [
  { file: 'DGMH-2026-04812', name: 'Thandiwe Mabaso', age: 63, sex: 'F', ward: 'Internal medicine',
    conditions: ['Type 2 diabetes', 'Hypertension'], meds: ['Metformin', 'Enalapril', 'Simvastatin'],
    risk: 'severe', updated: 'Today, 08:20', allergies: 'Penicillin' },
  { file: 'DGMH-2026-04799', name: 'Sipho Ndlovu', age: 47, sex: 'M', ward: 'Casualty',
    conditions: ['Epilepsy'], meds: ['Carbamazepine', 'Warfarin'],
    risk: 'severe', updated: 'Today, 07:55', allergies: 'None recorded' },
  { file: 'DGMH-2026-04781', name: 'Lerato Molefe', age: 29, sex: 'F', ward: 'Maternity',
    conditions: ['Anaemia'], meds: ['Ferrous sulphate', 'Folic acid'],
    risk: 'none', updated: 'Yesterday, 16:10', allergies: 'None recorded' },
  { file: 'DGMH-2026-04770', name: 'Johannes Pretorius', age: 71, sex: 'M', ward: 'Internal medicine',
    conditions: ['Atrial fibrillation', 'Hypertension'], meds: ['Warfarin', 'Amiodarone', 'Furosemide'],
    risk: 'severe', updated: 'Yesterday, 14:32', allergies: 'Sulfa drugs' },
  { file: 'DGMH-2026-04766', name: 'Nomsa Dube', age: 38, sex: 'F', ward: 'Internal medicine',
    conditions: ['HIV', 'Tuberculosis'], meds: ['Dolutegravir', 'Rifampicin', 'Isoniazid'],
    risk: 'moderate', updated: 'Yesterday, 11:04', allergies: 'None recorded' },
  { file: 'DGMH-2026-04751', name: 'Kabelo Motaung', age: 8, sex: 'M', ward: 'Paediatrics',
    conditions: ['Asthma'], meds: ['Salbutamol', 'Beclomethasone'],
    risk: 'none', updated: '30 Aug 2026', allergies: 'Aspirin' },
  { file: 'DGMH-2026-04744', name: 'Fatima Patel', age: 55, sex: 'F', ward: 'Internal medicine',
    conditions: ['Type 2 diabetes', 'Chronic kidney disease'], meds: ['Insulin glargine', 'Metformin'],
    risk: 'moderate', updated: '30 Aug 2026', allergies: 'None recorded' },
  { file: 'DGMH-2026-04732', name: 'Peter Nkosi', age: 66, sex: 'M', ward: 'Casualty',
    conditions: ['Hypertension'], meds: ['Amlodipine', 'Hydrochlorothiazide'],
    risk: 'none', updated: '29 Aug 2026', allergies: 'None recorded' },
  { file: 'DGMH-2026-04718', name: 'Grace Sibanda', age: 42, sex: 'F', ward: 'Internal medicine',
    conditions: ['Depression', 'Migraine'], meds: ['Fluoxetine', 'Sumatriptan'],
    risk: 'moderate', updated: '28 Aug 2026', allergies: 'None recorded' },
  { file: 'DGMH-2026-04703', name: 'Andile Zwane', age: 34, sex: 'M', ward: 'Internal medicine',
    conditions: ['Tuberculosis'], meds: ['Rifampicin', 'Pyrazinamide'],
    risk: 'none', updated: '27 Aug 2026', allergies: 'None recorded' }
];

// → GET /api/stats/conditions/
const diseaseHotspots = [
  { name: 'Hypertension', ward: 'Internal medicine', count: 1842, change: 12, series: [58, 61, 64, 62, 70, 74, 81] },
  { name: 'Type 2 diabetes', ward: 'Internal medicine', count: 1361, change: 8, series: [44, 46, 49, 47, 52, 55, 58] },
  { name: 'Tuberculosis', ward: 'Isolation', count: 604, change: -6, series: [38, 36, 35, 33, 31, 30, 28] },
  { name: 'Asthma', ward: 'Paediatrics', count: 512, change: 21, series: [18, 20, 22, 26, 29, 33, 38] },
  { name: 'HIV', ward: 'Internal medicine', count: 488, change: -3, series: [30, 30, 29, 29, 28, 28, 27] }
];

// → GET /api/stats/interactions/
const interactionHotspots = [
  { pair: 'Warfarin + Amiodarone', severity: 'severe', count: 96, change: 18, series: [8, 9, 11, 12, 14, 16, 19] },
  { pair: 'Rifampicin + Dolutegravir', severity: 'severe', count: 74, change: 9, series: [7, 8, 8, 10, 11, 12, 13] },
  { pair: 'Carbamazepine + Warfarin', severity: 'severe', count: 58, change: -11, series: [12, 11, 10, 10, 9, 8, 7] },
  { pair: 'Fluoxetine + Sumatriptan', severity: 'moderate', count: 41, change: 4, series: [5, 5, 6, 6, 6, 7, 7] },
  { pair: 'Metformin + Contrast dye', severity: 'moderate', count: 33, change: -2, series: [6, 6, 5, 5, 5, 5, 4] }
];

// → GET /api/stats/geography/
// Home area of the patients on file. Coordinates are the suburb centre, never
// a patient address — nothing here identifies anybody.
const caseAreas = [
  { area: 'Ga-Rankuwa',   lat: -25.6222, lng: 27.9986, condition: 'Hypertension',    cases: 412, change: 14 },
  { area: 'Mabopane',     lat: -25.4936, lng: 28.0139, condition: 'Hypertension',    cases: 336, change: 9 },
  { area: 'Soshanguve',   lat: -25.5333, lng: 28.1000, condition: 'Type 2 diabetes', cases: 298, change: 11 },
  { area: 'Winterveld',   lat: -25.4500, lng: 27.9333, condition: 'Tuberculosis',    cases: 187, change: -8 },
  { area: 'Hebron',       lat: -25.5167, lng: 27.9167, condition: 'Tuberculosis',    cases: 121, change: -5 },
  { area: 'Klipgat',      lat: -25.4667, lng: 27.9667, condition: 'Asthma',          cases: 143, change: 23 },
  { area: 'Rosslyn',      lat: -25.6167, lng: 28.0833, condition: 'Asthma',          cases: 96,  change: 18 },
  { area: 'Akasia',       lat: -25.6667, lng: 28.1000, condition: 'Type 2 diabetes', cases: 174, change: 6 },
  { area: 'Pretoria West',lat: -25.7333, lng: 28.1500, condition: 'HIV',             cases: 128, change: -3 },
  { area: 'Atteridgeville',lat: -25.7667,lng: 28.0667, condition: 'HIV',             cases: 156, change: -6 }
];

// → GET /api/stats/wards/
const wardLoad = [
  { label: 'Internal medicine', value: 44 },
  { label: 'Casualty', value: 27 },
  { label: 'Paediatrics', value: 17 },
  { label: 'Maternity', value: 12 }
];

const screenedSeries = [46, 52, 39, 58, 61, 66, 51, 44, 68, 72, 65, 77, 74, 83];
const screenedDays = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '1', '2'];

const totals = { files: 12480, uploadsThisWeek: 38, flagged: 214, severe: 27, flagRate: 0.19 };

// → GET /api/files/
let systemFiles = [
  { name: 'DGMH-2026-04812_bloods.pdf', size: '1.2 MB', when: 'Today, 08:20', kind: 'PDF' },
  { name: 'DGMH-2026-04799_referral.pdf', size: '840 KB', when: 'Today, 07:58', kind: 'PDF' },
  { name: 'ward_admissions_august.csv', size: '312 KB', when: 'Yesterday, 17:02', kind: 'CSV' },
  { name: 'DGMH-2026-04770_ecg.png', size: '2.4 MB', when: 'Yesterday, 14:30', kind: 'PNG' },
  { name: 'DGMH-2026-04766_sputum.pdf', size: '1.1 MB', when: 'Yesterday, 11:00', kind: 'PDF' }
];

/* ==================================================================
   Translations
   ================================================================== */

const STRINGS = {
  en: {},
  af: {
    'nav.overview': 'Oorsig', 'nav.patients': 'Pasiënte', 'nav.files': 'Lêers', 'nav.settings': 'Instellings',
    'action.signout': 'Teken uit', 'action.search': 'Soek', 'action.clear': 'Maak skoon',
    'action.view': 'Bekyk', 'action.retrieve': 'Haal lêer',
    'overview.title': 'Oorsig', 'overview.sub': 'Uit die pasiëntlêers op die stelsel.',
    'stat.files': 'Pasiëntlêers', 'stat.uploads': 'Hierdie week opgelaai',
    'stat.flagged': 'Interaksies gemerk', 'stat.severe': 'Ernstig hierdie maand',
    'chart.screened': 'Voorskrifte nagegaan', 'chart.screenedSub': 'Laaste 14 dae',
    'chart.flagRate': 'Merkkoers', 'chart.flagRateSub': 'Aandeel wat ’n waarskuwing wek',
    'hot.disease': 'Toestand-brandpunte', 'hot.diseaseSub': 'Mees aangetekende toestande',
    'hot.interaction': 'Interaksie-brandpunte', 'hot.interactionSub': 'Middelpare met die meeste waarskuwings',
    'hot.ward': 'Per saal', 'hot.wardSub': 'Aandeel gemerkte voorskrifte',
    'patients.title': 'Pasiënte', 'patients.sub': 'Elke pasiënt met ’n lêer op die stelsel.',
    'patients.search': 'Soek op naam, lêernommer of ID', 'patients.allConditions': 'Alle toestande',
    'table.patient': 'Pasiënt', 'table.file': 'Lêernommer', 'table.conditions': 'Toestande',
    'table.risk': 'Interaksierisiko', 'table.updated': 'Laas bygewerk',
    'files.title': 'Lêers', 'files.sub': 'Laai ’n lêer op of haal een af.',
    'files.upload': 'Laai op', 'files.drop': 'Sleep lêers hier, of klik om te kies',
    'files.recent': 'Op die stelsel',
    'settings.title': 'Instellings', 'settings.appearance': 'Voorkoms', 'settings.theme': 'Tema',
    'settings.light': 'Lig', 'settings.dark': 'Donker', 'settings.language': 'Taal', 'settings.save': 'Stoor instellings',
    'form.cancel': 'Maak toe',
    'risk.severe': 'Ernstig', 'risk.moderate': 'Matig', 'risk.none': 'Geen'
  },
  zu: {
    'nav.overview': 'Ukubuka konke', 'nav.patients': 'Iziguli', 'nav.files': 'Amafayela', 'nav.settings': 'Izilungiselelo',
    'action.signout': 'Phuma', 'action.search': 'Sesha', 'action.clear': 'Sula',
    'action.view': 'Buka', 'action.retrieve': 'Thola ifayela',
    'overview.title': 'Ukubuka konke', 'overview.sub': 'Kusuka kumafayela eziguli akhona.',
    'stat.files': 'Amafayela eziguli', 'stat.uploads': 'Alayishwe kuleli sonto',
    'stat.flagged': 'Ukuxhumana okuphawuliwe', 'stat.severe': 'Okubucayi kule nyanga',
    'chart.screened': 'Amaphrisikhripshini ahloliwe', 'chart.screenedSub': 'Izinsuku ezingu-14',
    'chart.flagRate': 'Izinga lokuphawula', 'chart.flagRateSub': 'Ingxenye edala isexwayiso',
    'hot.disease': 'Izindawo ezishisayo zezifo', 'hot.diseaseSub': 'Izifo ezibhalwe kakhulu',
    'hot.interaction': 'Ukuxhumana kwemithi', 'hot.interactionSub': 'Imithi edala izexwayiso eziningi',
    'hot.ward': 'Ngewadi', 'hot.wardSub': 'Ingxenye ephawuliwe',
    'patients.title': 'Iziguli', 'patients.sub': 'Zonke iziguli ezinamafayela.',
    'patients.search': 'Sesha ngegama noma inombolo yefayela', 'patients.allConditions': 'Zonke izifo',
    'table.patient': 'Isiguli', 'table.file': 'Inombolo yefayela', 'table.conditions': 'Izifo',
    'table.risk': 'Ubungozi', 'table.updated': 'Kugcine kubuyekezwa',
    'files.title': 'Amafayela', 'files.sub': 'Layisha noma uthole ifayela.',
    'files.upload': 'Layisha', 'files.drop': 'Yehlisa amafayela lapha, noma uchofoze',
    'files.recent': 'Akhona ohlelweni',
    'settings.title': 'Izilungiselelo', 'settings.appearance': 'Ukubukeka', 'settings.theme': 'Itimu',
    'settings.light': 'Okukhanyayo', 'settings.dark': 'Okumnyama', 'settings.language': 'Ulimi', 'settings.save': 'Londoloza',
    'form.cancel': 'Vala',
    'risk.severe': 'Kubucayi', 'risk.moderate': 'Maphakathi', 'risk.none': 'Lutho'
  },
  nso: {
    'nav.overview': 'Kakaretšo', 'nav.patients': 'Balwetši', 'nav.files': 'Difaele', 'nav.settings': 'Dipeakanyo',
    'action.signout': 'Tšwa', 'action.search': 'Nyaka', 'action.clear': 'Hlwekiša',
    'action.view': 'Lebelela', 'action.retrieve': 'Tšea faele',
    'overview.title': 'Kakaretšo', 'overview.sub': 'Go tšwa difaeleng tša balwetši.',
    'stat.files': 'Difaele tša balwetši', 'stat.uploads': 'Tše rometšwego bekeng ye',
    'stat.flagged': 'Dikgokagano tše swailwego', 'stat.severe': 'Tše šoro kgweding ye',
    'chart.screened': 'Dingwalwa tše hlahlobilwego', 'chart.screenedSub': 'Matšatši a 14 a fetilego',
    'chart.flagRate': 'Elo ya maswao', 'chart.flagRateSub': 'Karolo yeo e tsošago temošo',
    'hot.disease': 'Mafelo a malwetši', 'hot.diseaseSub': 'Malwetši a ngwadilwego kudu',
    'hot.interaction': 'Dikgokagano tša dihlare', 'hot.interactionSub': 'Dihlare tše di tsošago ditemošo',
    'hot.ward': 'Ka wate', 'hot.wardSub': 'Karolo ye e swailwego',
    'patients.title': 'Balwetši', 'patients.sub': 'Molwetši yo mongwe le yo mongwe yo a nago le faele.',
    'patients.search': 'Nyaka ka leina goba nomoro ya faele', 'patients.allConditions': 'Malwetši ka moka',
    'table.patient': 'Molwetši', 'table.file': 'Nomoro ya faele', 'table.conditions': 'Malwetši',
    'table.risk': 'Kotsi', 'table.updated': 'Mpshafatšo ya mafelelo',
    'files.title': 'Difaele', 'files.sub': 'Romela goba o tšee faele.',
    'files.upload': 'Romela', 'files.drop': 'Lahlela difaele mo, goba o kgotle',
    'files.recent': 'Tše di lego gona',
    'settings.title': 'Dipeakanyo', 'settings.appearance': 'Ponagalo', 'settings.theme': 'Sebopego',
    'settings.light': 'Seedi', 'settings.dark': 'Leswiswi', 'settings.language': 'Leleme', 'settings.save': 'Boloka',
    'form.cancel': 'Tswalela',
    'risk.severe': 'Šoro', 'risk.moderate': 'Magareng', 'risk.none': 'Ga go gona'
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

function drawGauge() {
  const target = totals.flagRate;
  const { start, sweep, cx, cy, r } = GAUGE;

  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = start + (sweep * i) / 10;
    const [x1, y1] = polar(cx, cy, r - 16, a);
    const [x2, y2] = polar(cx, cy, r - (i % 5 === 0 ? 27 : 22), a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="${i % 5 === 0 ? 2 : 1}" opacity="${i % 5 === 0 ? .38 : .2}" stroke-linecap="round"/>`;
  }

  document.getElementById('gauge').innerHTML = `
    <svg viewBox="0 0 250 178" style="width:100%;max-width:250px;color:var(--ink)" role="img" aria-label="Flag rate">
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
  const readout = document.getElementById('gaugeValue');

  function paint(fraction) {
    arc.setAttribute('stroke-dasharray', `${fraction.toFixed(4)} 1`);
    needle.setAttribute('transform', `rotate(${(start + sweep * fraction).toFixed(2)} ${cx} ${cy})`);
    readout.textContent = Math.round(fraction * 100) + '%';
  }

  document.getElementById('gaugeCaption').textContent =
    `${nf().format(totals.flagged)} ${t('gauge.of', 'of')} ${nf().format(Math.round(totals.flagged / totals.flagRate))} ${t('gauge.screened', 'screened')}`;

  if (!shouldAnimate()) { paint(target); return; }

  animate({
    duration: 850,
    ease: easeInOutCubic,
    onFrame: paint,
    onDone: () => animate({ duration: 700, onFrame: p => paint(1 - (1 - target) * p) })
  });
}

function drawLine() {
  const w = 640, h = 220, padX = 30, padY = 24;
  const max = Math.max(...screenedSeries) * 1.14;
  const stepX = (w - padX * 2) / (screenedSeries.length - 1);
  const y = v => h - padY - (v / max) * (h - padY * 2);

  const points = screenedSeries.map((v, i) => [padX + i * stepX, y(v)]);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${h - padY} L ${padX} ${h - padY} Z`;

  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const gy = padY + ((h - padY * 2) / 3) * i;
    grid += `<line x1="${padX}" y1="${gy}" x2="${w - padX}" y2="${gy}" stroke="var(--line)" stroke-width="1"/>`;
  }

  const labels = screenedDays.map((d, i) =>
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
        <text x="${(last[0] - 8).toFixed(1)}" y="${(last[1] - 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="end">${screenedSeries[screenedSeries.length - 1]}</text>
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

/* A small line showing the direction of travel for one hotspot. */
function sparkline(series, rising) {
  const w = 74, h = 26, pad = 3;
  const max = Math.max(...series), min = Math.min(...series);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (series.length - 1);
  const path = series.map((v, i) =>
    `${i ? 'L' : 'M'} ${(pad + i * stepX).toFixed(1)} ${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`).join(' ');

  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${rising ? 'var(--danger)' : 'var(--green)'}" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function trendChip(change) {
  const rising = change > 0;
  const arrow = rising
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>';
  return `<span class="trend ${rising ? 'up' : 'down'}">${arrow}${Math.abs(change)}%</span>`;
}

function drawDiseases() {
  document.getElementById('diseaseList').innerHTML = diseaseHotspots.map(item => `
    <div class="hotspot">
      <div class="hotspot-name">
        <strong>${item.name}</strong>
        <span>${item.ward} · ${nf().format(item.count)} ${t('hot.cases', 'cases')}</span>
      </div>
      ${sparkline(item.series, item.change > 0)}
      ${trendChip(item.change)}
    </div>`).join('');
}

function drawInteractions() {
  document.getElementById('interactionList').innerHTML = interactionHotspots.map(item => `
    <div class="hotspot">
      <div class="hotspot-name">
        <strong>${item.pair}</strong>
        <span><span class="tag ${item.severity}">${t('risk.' + item.severity, item.severity)}</span> · ${item.count} ${t('hot.flags', 'flags')}</span>
      </div>
      ${sparkline(item.series, item.change > 0)}
      ${trendChip(item.change)}
    </div>`).join('');
}

function drawWards() {
  document.getElementById('wardList').innerHTML = wardLoad.map(row => `
    <div class="bar-row">
      <div class="bar-top"><span>${row.label}</span><span>${row.value}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${shouldAnimate() ? 0 : row.value}%"></div></div>
    </div>`).join('');

  if (!shouldAnimate()) return;

  const fills = [...document.querySelectorAll('#wardList .bar-fill')];
  requestAnimationFrame(() => {
    fills.forEach((fill, index) => {
      fill.style.transitionDelay = `${index * 90}ms`;
      fill.style.width = wardLoad[index].value + '%';
    });
  });
}

/* ==================================================================
   Patients
   ================================================================== */

const patientRows = document.getElementById('patientRows');
const patientSearch = document.getElementById('patientSearch');
const conditionFilter = document.getElementById('conditionFilter');
const resultCount = document.getElementById('resultCount');

// Build the condition filter from what is actually on file.
const allConditions = [...new Set(patients.flatMap(p => p.conditions))].sort();
conditionFilter.insertAdjacentHTML('beforeend',
  allConditions.map(c => `<option value="${c}">${c}</option>`).join(''));

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function riskTag(risk) {
  if (risk === 'severe') return `<span class="tag severe">${t('risk.severe', 'Severe')}</span>`;
  if (risk === 'moderate') return `<span class="tag moderate">${t('risk.moderate', 'Moderate')}</span>`;
  return `<span class="tag grey">${t('risk.none', 'None')}</span>`;
}

function renderPatients() {
  const term = patientSearch.value.trim().toLowerCase();
  const condition = conditionFilter.value;

  const shown = patients.filter(p =>
    (!condition || p.conditions.includes(condition)) &&
    (!term || p.name.toLowerCase().includes(term) || p.file.toLowerCase().includes(term)));

  patientRows.innerHTML = shown.length ? shown.map(p => `
    <tr>
      <td>
        <div class="who">
          <span class="initials">${initials(p.name)}</span>
          <div>
            <strong>${p.name}</strong>
            <span>${p.age} · ${p.sex} · ${p.ward}</span>
          </div>
        </div>
      </td>
      <td class="id">${p.file}</td>
      <td><div class="chip-list" style="justify-content:flex-start">${p.conditions.map(c => `<span class="tag">${c}</span>`).join('')}</div></td>
      <td>${riskTag(p.risk)}</td>
      <td class="sub">${p.updated}</td>
      <td>
        <div class="row-actions">
          <button class="link-btn" data-file="${p.file}">${t('action.view', 'View')}</button>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${t('empty.patients', 'No patient file matches that search. Check the spelling or clear the filter.')}</td></tr>`;

  resultCount.textContent = `${nf().format(shown.length)} ${t('result.of', 'of')} ${nf().format(patients.length)} ${t('result.files', 'files')}`;
}

document.getElementById('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  renderPatients();
});

conditionFilter.addEventListener('change', renderPatients);
patientSearch.addEventListener('input', renderPatients);

document.getElementById('clearSearch').addEventListener('click', () => {
  patientSearch.value = '';
  conditionFilter.value = '';
  renderPatients();
  patientSearch.focus();
});

/* ---------- patient file ---------- */

const backdrop = document.getElementById('modalBackdrop');
let openFile = null;

function openPatient(fileNumber) {
  const patient = patients.find(p => p.file === fileNumber);
  if (!patient) return;
  openFile = patient;

  document.getElementById('modalTitle').textContent = patient.name;
  document.getElementById('modalSub').textContent = `${patient.file} · ${patient.ward}`;

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><span>${t('detail.age', 'Age and sex')}</span><strong>${patient.age} · ${patient.sex}</strong></div>
    <div class="detail-row"><span>${t('detail.conditions', 'Conditions')}</span>
      <div class="chip-list">${patient.conditions.map(c => `<span class="tag">${c}</span>`).join('')}</div></div>
    <div class="detail-row"><span>${t('detail.meds', 'Current medication')}</span>
      <div class="chip-list">${patient.meds.map(m => `<span class="tag">${m}</span>`).join('')}</div></div>
    <div class="detail-row"><span>${t('detail.allergies', 'Allergies')}</span><strong>${patient.allergies}</strong></div>
    <div class="detail-row"><span>${t('table.risk', 'Interaction risk')}</span><strong>${riskTag(patient.risk)}</strong></div>
    <div class="detail-row"><span>${t('table.updated', 'Last updated')}</span><strong>${patient.updated}</strong></div>`;

  backdrop.classList.add('open');
}

patientRows.addEventListener('click', event => {
  const button = event.target.closest('button[data-file]');
  if (button) openPatient(button.dataset.file);
});

function closeModal() { backdrop.classList.remove('open'); openFile = null; }

document.getElementById('closeModal').addEventListener('click', closeModal);
backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (backdrop.classList.contains('open')) closeModal();
  closeDrawer();
});

document.getElementById('retrieveFile').addEventListener('click', () => {
  if (!openFile) return;
  // → GET /api/files/<file>/download/
  toast(`${t('toast.retrieving', 'Retrieving')} ${openFile.file}`);
  closeModal();
});

/* ==================================================================
   Files
   ================================================================== */

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadList = document.getElementById('uploadList');

function drawFiles() {
  document.getElementById('fileList').innerHTML = systemFiles.map(file => `
    <div class="file-row">
      <span class="file-icon">${file.kind}</span>
      <div class="file-name">
        <strong>${file.name}</strong>
        <span>${file.size} · ${file.when}</span>
      </div>
      <button class="link-btn" data-download="${file.name}">${t('action.retrieve', 'Retrieve')}</button>
    </div>`).join('');
}

document.getElementById('fileList').addEventListener('click', event => {
  const button = event.target.closest('button[data-download]');
  // → GET /api/files/<name>/download/
  if (button) toast(`${t('toast.retrieving', 'Retrieving')} ${button.dataset.download}`);
});

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

const MAX_BYTES = 20 * 1024 * 1024;

function readableSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function handleFiles(fileList) {
  [...fileList].forEach(file => {
    if (file.size > MAX_BYTES) {
      toast(`${file.name} ${t('error.tooBig', 'is over the 20 MB limit')}`);
      return;
    }

    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `
      <span class="file-icon">${(file.name.split('.').pop() || '?').slice(0, 4).toUpperCase()}</span>
      <div class="file-name">
        <strong>${file.name}</strong>
        <span>${readableSize(file.size)} · ${t('files.uploading', 'uploading…')}</span>
        <div class="progress"><i></i></div>
      </div>`;
    uploadList.prepend(row);

    // Stands in for the real upload. → POST /api/files/ with FormData.
    const bar = row.querySelector('.progress i');
    const status = row.querySelector('.file-name span');
    let percent = 0;

    const timer = setInterval(() => {
      percent = Math.min(percent + 8 + Math.random() * 14, 100);
      bar.style.width = percent + '%';

      if (percent === 100) {
        clearInterval(timer);
        status.textContent = `${readableSize(file.size)} · ${t('files.done', 'uploaded')}`;
        row.querySelector('.progress').remove();

        systemFiles.unshift({
          name: file.name,
          size: readableSize(file.size),
          when: t('when.now', 'Just now'),
          kind: (file.name.split('.').pop() || '?').slice(0, 4).toUpperCase()
        });
        drawFiles();
      }
    }, 180);
  });
}

/* ==================================================================
   Satellite map of case hotspots

   The key below is visible to anyone who opens this page — that is how the
   Maps JavaScript API works. Restrict it in the Google Cloud console to this
   site's referrers and to the Maps JavaScript API only.
   ================================================================== */

const MAPS_KEY = 'AIzaSyD6xtbTLrG1jKICo1tZhl10dL1S-rgEGH8';
const HOSPITAL = { lat: -25.6154, lng: 27.9930 };  // Dr George Mukhari, Ga-Rankuwa

const mapCondition = document.getElementById('mapCondition');
let map = null;
let circles = [];
let infoWindow = null;

// Fill the filter from the areas actually on file.
[...new Set(caseAreas.map(a => a.condition))].sort().forEach(condition => {
  mapCondition.insertAdjacentHTML('beforeend', `<option value="${condition}">${condition}</option>`);
});

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
  circles.forEach(circle => circle.setMap(null));
  circles = [];

  const condition = mapCondition.value;
  const shown = caseAreas.filter(a => !condition || a.condition === condition);

  shown.forEach(area => {
    const rising = area.change > 0;

    // Radius grows with the square root of the count, so a hotspot four times
    // the size draws twice as wide rather than four times.
    const circle = new google.maps.Circle({
      map,
      center: { lat: area.lat, lng: area.lng },
      radius: Math.sqrt(area.cases) * 190,
      strokeColor: rising ? '#d94436' : '#8fbf9f',
      strokeOpacity: .9,
      strokeWeight: 1.5,
      fillColor: rising ? '#d94436' : '#8fbf9f',
      fillOpacity: .3
    });

    circle.addListener('click', () => {
      infoWindow.setContent(`
        <div class="map-info">
          <strong>${area.area}</strong>
          <span>${area.condition}</span>
          <span>${nf().format(area.cases)} ${t('hot.cases', 'cases')} \u00b7 ${rising ? '+' : ''}${area.change}%</span>
        </div>`);
      infoWindow.setPosition({ lat: area.lat, lng: area.lng });
      infoWindow.open(map);
    });

    circles.push(circle);
  });
}

async function initMap() {
  const target = document.getElementById('map');

  try {
    await loadMaps();
  } catch (error) {
    target.innerHTML = `<div class="map-fallback">${t('map.offline', 'The map could not load. Check the connection and the API key.')}</div>`;
    return;
  }

  map = new google.maps.Map(target, {
    center: HOSPITAL,
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
    position: HOSPITAL,
    title: 'Dr George Mukhari Academic Hospital'
  });

  drawCircles();
}

mapCondition.addEventListener('change', () => { if (map) drawCircles(); });

initMap();

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
    await fetch(API.logout, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' }
    });
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

function render() {
  document.getElementById('statFiles').textContent = nf().format(totals.files);
  document.getElementById('statFilesDelta').textContent = t('delta.total', 'on the system');
  document.getElementById('statUploads').textContent = nf().format(totals.uploadsThisWeek);
  document.getElementById('statUploadsDelta').textContent = t('delta.week', 'in the last 7 days');
  document.getElementById('statFlagged').textContent = nf().format(totals.flagged);
  document.getElementById('statFlaggedDelta').textContent = t('delta.month', 'this month');
  document.getElementById('statSevere').textContent = nf().format(totals.severe);
  document.getElementById('statSevereDelta').textContent = t('delta.review', 'needing review');

  drawGauge();
  drawLine();
  drawDiseases();
  drawInteractions();
  drawWards();
  drawFiles();
  renderPatients();

  chartsAnimated = true;
}

render();