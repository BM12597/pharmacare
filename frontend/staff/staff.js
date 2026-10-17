/* PharmaCare+ — doctor workspace.
   The screening below runs against a small rule table so the workflow can be
   demonstrated end to end. The trained model replaces checkScript() once the
   endpoint exists; everything around it stays as is. */

const API = {
  me: '/api/auth/me/',
  logout: '/api/auth/logout/',
  patients: '/api/patients/',
  files: '/api/patients/files/',
  stock: '/api/stock/'
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
  if (!response.ok) throw new Error(data.detail || 'That did not work.');
  return data;
}

async function requireSession() {
  try {
    const me = await callApi(API.me);
    if (me.role !== 'doctor') throw new Error('wrong workspace');

    document.querySelector('.side-user').textContent = me.full_name || me.user_id;
    document.querySelector('.side-role').textContent = `${me.role_label} \u00b7 ${me.user_id}`;
    return me;
  } catch (error) {
    window.location.href = LOGIN_URL;
    return null;
  }
}

/* Escaped, because a patient file is text somebody typed and it ends up
   inside innerHTML. A surname with an apostrophe should not break the page. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function bytesText(value) {
  if (value === null || value === undefined) return '\u2014';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Number(value);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function whenText(iso) {
  if (!iso) return '\u2014';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '\u2014';

  const now = new Date();
  const time = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  if (when.toDateString() === now.toDateString()) return `${t('when.today', 'Today')}, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (when.toDateString() === yesterday.toDateString()) return `${t('when.yesterday', 'Yesterday')}, ${time}`;

  return when.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ==================================================================
   Placeholder data
   ================================================================== */

/* The patients on the system, loaded from the server rather than listed here.
   The admin workspace reads the files in; this is the same record, and an edit
   made here is what everybody else sees next time they open it. */
let patients = [];
let patientsLoaded = false;
let patientsError = '';

/* The screening code below works on a flat shape — meds as plain names, one
   field per thing it checks. This maps the server's record onto it, so the
   screening did not have to be rewritten to read real data. */
function toLocal(record) {
  return {
    file: record.file_number,
    name: record.full_name,
    age: record.age,
    sex: record.sex,
    ward: record.ward || '',
    conditions: record.conditions || [],
    meds: (record.medication || []).map(item => item.name).filter(Boolean),
    allergies: record.allergies || [],
    seen: record.updated_at,
    needsReview: record.needs_review
  };
}

// → GET /api/drugs/
/* What the pharmacy has on the shelf, loaded from the same endpoint the
   pharmacy orders against. Suggesting a medicine nobody can dispense wastes
   everybody's time, so the list and the shelf are the same thing.

   Typing something that is not on it is still allowed — it is screened like
   anything else — but the form says it is not stocked. */
let drugs = [];
let shelf = [];

// What this doctor has sent, loaded from the server in loadSent().
let sent = [];
let sentLoaded = false;

/* ==================================================================
   Translations
   ================================================================== */

const STRINGS = {
  en: {},
  af: {
    'status.review': 'Nie bevestig nie', 'action.edit': 'Wysig', 'action.save': 'Stoor veranderinge', 'action.confirm': 'Bevestig as nagegaan', 'action.cancelEdit': 'Verwerp',
    'nav.prescribe': 'Skryf voor', 'nav.patients': 'Pasiënte', 'nav.sent': 'Gestuur', 'nav.settings': 'Instellings',
    'action.signout': 'Teken uit', 'action.load': 'Laai lêer', 'action.add': 'Voeg by',
    'action.send': 'Stuur na apteek', 'action.clear': 'Maak skoon', 'action.close': 'Maak toe',
    'prescribe.title': 'Skryf ’n voorskrif', 'prescribe.sub': 'Laai die lêer, voeg dan elke middel by.',
    'prescribe.patient': 'Pasiënt', 'prescribe.items': 'Medikasie', 'prescribe.screening': 'Nagaan',
    'patients.title': 'Pasiënte', 'patients.sub': 'Lêers waarteen jy kan voorskryf.',
    'sent.title': 'Na apteek gestuur', 'sent.sub': 'Wat jy voorgeskryf het en wat gebeur het.',
    'table.patient': 'Pasiënt', 'table.file': 'Lêernommer', 'table.conditions': 'Toestande',
    'table.meds': 'Op medikasie', 'table.updated': 'Laas gesien', 'table.drugs': 'Medikasie',
    'table.flag': 'Waarskuwing', 'table.status': 'Status', 'table.when': 'Gestuur',
    'settings.title': 'Instellings', 'settings.appearance': 'Voorkoms', 'settings.theme': 'Tema',
    'settings.light': 'Lig', 'settings.dark': 'Donker', 'settings.language': 'Taal', 'settings.save': 'Stoor instellings',
    'risk.severe': 'Ernstig', 'risk.moderate': 'Matig', 'risk.clear': 'Geen waarskuwing',
    'screen.clear': 'Geen probleem gevind nie', 'screen.none': 'Voeg medikasie by om na te gaan'
  },
  zu: {
    'status.review': 'Akuqinisekisiwe', 'action.edit': 'Hlela', 'action.save': 'Londoloza izinguquko', 'action.confirm': 'Qinisekisa', 'action.cancelEdit': 'Lahla',
    'nav.prescribe': 'Bhala', 'nav.patients': 'Iziguli', 'nav.sent': 'Okuthunyelwe', 'nav.settings': 'Izilungiselelo',
    'action.signout': 'Phuma', 'action.load': 'Layisha ifayela', 'action.add': 'Engeza',
    'action.send': 'Thumela ekhemisi', 'action.clear': 'Sula', 'action.close': 'Vala',
    'prescribe.title': 'Bhala iphrisikhripshini', 'prescribe.sub': 'Layisha ifayela, bese wengeza imithi.',
    'prescribe.patient': 'Isiguli', 'prescribe.items': 'Imithi', 'prescribe.screening': 'Ukuhlola',
    'patients.title': 'Iziguli', 'patients.sub': 'Amafayela ongabhalela wona.',
    'sent.title': 'Okuthunyelwe ekhemisi', 'sent.sub': 'Okubhalile nokwenzekile.',
    'table.patient': 'Isiguli', 'table.file': 'Inombolo yefayela', 'table.conditions': 'Izifo',
    'table.meds': 'Imithi ayisebenzisayo', 'table.updated': 'Kugcine ebonwa', 'table.drugs': 'Imithi',
    'table.flag': 'Isexwayiso', 'table.status': 'Isimo', 'table.when': 'Kuthunyelwe',
    'settings.title': 'Izilungiselelo', 'settings.appearance': 'Ukubukeka', 'settings.theme': 'Itimu',
    'settings.light': 'Okukhanyayo', 'settings.dark': 'Okumnyama', 'settings.language': 'Ulimi', 'settings.save': 'Londoloza',
    'risk.severe': 'Kubucayi', 'risk.moderate': 'Maphakathi', 'risk.clear': 'Alukho usongo',
    'screen.clear': 'Ayikho inkinga etholakele', 'screen.none': 'Engeza imithi ukuze kuhlolwe'
  },
  nso: {
    'status.review': 'Ga se netefatšwe', 'action.edit': 'Fetola', 'action.save': 'Boloka diphetogo', 'action.confirm': 'Netefatša', 'action.cancelEdit': 'Lahla',
    'nav.prescribe': 'Ngwala', 'nav.patients': 'Balwetši', 'nav.sent': 'Tše rometšwego', 'nav.settings': 'Dipeakanyo',
    'action.signout': 'Tšwa', 'action.load': 'Bula faele', 'action.add': 'Oketša',
    'action.send': 'Romela khemising', 'action.clear': 'Hlwekiša', 'action.close': 'Tswalela',
    'prescribe.title': 'Ngwala sengwalwa', 'prescribe.sub': 'Bula faele, o oketše dihlare.',
    'prescribe.patient': 'Molwetši', 'prescribe.items': 'Dihlare', 'prescribe.screening': 'Tlhahlobo',
    'patients.title': 'Balwetši', 'patients.sub': 'Difaele tšeo o ka ngwalelago.',
    'sent.title': 'Tše rometšwego khemising', 'sent.sub': 'Seo o se ngwadilego le seo se diregilego.',
    'table.patient': 'Molwetši', 'table.file': 'Nomoro ya faele', 'table.conditions': 'Malwetši',
    'table.meds': 'Dihlare tša gagwe', 'table.updated': 'Bonwe la mafelelo', 'table.drugs': 'Dihlare',
    'table.flag': 'Temošo', 'table.status': 'Boemo', 'table.when': 'Go romelwa',
    'settings.title': 'Dipeakanyo', 'settings.appearance': 'Ponagalo', 'settings.theme': 'Sebopego',
    'settings.light': 'Seedi', 'settings.dark': 'Leswiswi', 'settings.language': 'Leleme', 'settings.save': 'Boloka',
    'risk.severe': 'Šoro', 'risk.moderate': 'Magareng', 'risk.clear': 'Ga go temošo',
    'screen.clear': 'Ga go bothata bjo bo hweditšwego', 'screen.none': 'Oketša dihlare gore go hlahlobje'
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
   Prescribing
   ================================================================== */

let activePatient = null;
let script = [];   // { drug, dose, freq }

function drawDrugOptions() {
  document.getElementById('drugOptions').innerHTML = shelf.map(item =>
    `<option value="${esc(item.drug)}">${esc(item.form)} \u00b7 ${
      item.status === 'out'
        ? t('stock.outNow', 'out of stock')
        : `${item.level} ${t('stock.onShelf', 'on the shelf')}`
    }</option>`).join('');
}

async function loadStock() {
  try {
    const data = await callApi(API.stock);
    shelf = data.results;
    drugs = shelf.map(item => item.drug);
  } catch (error) {
    shelf = [];
    drugs = [];
  }
  drawDrugOptions();
  checkScript();
}

function shelfFor(name) {
  const needle = (name || '').trim().toLowerCase();
  return shelf.find(item => item.drug.toLowerCase() === needle) ||
         shelf.find(item => needle.startsWith(item.drug.toLowerCase()));
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase();
}

function drawPatientCard(found) {
  document.getElementById('patientPanel').innerHTML = `
    <div class="patient-card">
      <span class="initials">${esc(initials(found.name))}</span>
      <div>
        <strong>${esc(found.name)}</strong>
        <div class="meta">${[found.file, found.age, found.sex, found.ward].filter(v => v !== '' && v !== null && v !== undefined).map(esc).join(' · ')}</div>
        <div class="chips">
          ${found.conditions.map(c => `<span class="tag">${esc(c)}</span>`).join('')}
          ${found.meds.map(m => `<span class="tag green">${esc(m)}</span>`).join('')}
          ${found.allergies.map(a => `<span class="allergy">${t('label.allergy', 'Allergy')}: ${esc(a)}</span>`).join('')}
        </div>
        ${found.needsReview ? `<p class="hint" style="margin-top:8px;color:var(--warn)">${
          t('prescribe.unconfirmed', 'This file has not been confirmed yet. Open it from Patients and check it against the original before prescribing.')
        }</p>` : ''}
      </div>
    </div>`;
}

/* The lookup asks the server, so a file number, a surname or an ID number all
   work and the whole patient list does not have to be in the browser. */
async function loadPatient(term) {
  const needle = (term || '').trim();
  if (!needle) { toast(t('error.noTerm', 'Enter a file number, ID number or name.')); return; }

  const panel = document.getElementById('patientPanel');
  panel.innerHTML = `<div class="empty-slot">${t('loading', 'Loading…')}</div>`;

  let found = null;
  try {
    // An exact file number first, which is how most lookups are done.
    const exact = await callApi(API.patients + encodeURIComponent(needle.toUpperCase()) + '/')
      .catch(() => null);

    if (exact) {
      found = toLocal(exact.patient);
    } else {
      const data = await callApi(`${API.patients}?q=${encodeURIComponent(needle)}`);
      if (data.results.length) found = toLocal(data.results[0]);
    }
  } catch (error) {
    panel.innerHTML = `<div class="empty-slot">${esc(error.message)}</div>`;
    activePatient = null;
    checkScript();
    return;
  }

  if (!found) {
    panel.innerHTML =
      `<div class="empty-slot">${t('error.noPatient', 'No file matches that. Check the number, or search by surname.')}</div>`;
    activePatient = null;
    checkScript();
    return;
  }

  activePatient = found;
  document.getElementById('patientLookup').value = found.file;
  drawPatientCard(found);
  checkScript();
}

document.getElementById('loadPatient').addEventListener('click',
  () => loadPatient(document.getElementById('patientLookup').value));

document.getElementById('patientLookup').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); loadPatient(event.target.value); }
});

/* ---------- building the script ---------- */

function addDrug() {
  const drugInput = document.getElementById('drugInput');
  const doseInput = document.getElementById('doseInput');
  const freqInput = document.getElementById('freqInput');

  const name = drugInput.value.trim();
  if (!name) { drugInput.focus(); return; }

  // Match the canonical spelling where we know the drug.
  const known = drugs.find(d => d.toLowerCase() === name.toLowerCase());

  const qtyInput = document.getElementById('qtyInput');
  const quantity = Number.parseInt(qtyInput.value, 10);

  script.push({
    drug: known || name,
    dose: doseInput.value.trim(),
    freq: freqInput.value.trim() || document.getElementById('setFreq').value,
    // How many units the pharmacy hands over, which is what comes off the
    // shelf when it is dispensed.
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null
  });

  drugInput.value = '';
  doseInput.value = '';
  freqInput.value = '';
  qtyInput.value = '';
  drugInput.focus();

  drawScript();
  checkScript();
}

document.getElementById('addDrug').addEventListener('click', addDrug);

['drugInput', 'doseInput', 'freqInput', 'qtyInput'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); addDrug(); }
  });
});

function drawScript() {
  const lines = document.getElementById('scriptLines');

  if (!script.length) {
    lines.innerHTML = `<div class="empty-slot">${t('empty.script', 'Nothing added yet. Each medicine is checked as you add it.')}</div>`;
    return;
  }

  const flagged = new Set(findings().flatMap(f => f.drugs || []));

  lines.innerHTML = script.map((item, index) => {
    // Whether the pharmacy can actually hand this over, said here rather than
    // left for the patient to find out at the counter.
    const held = shelfFor(item.drug);
    const shortOf = held && item.quantity && held.level < item.quantity;

    const stockNote = !shelf.length ? ''
      : !held ? `<span class="tag grey">${t('stock.notStocked', 'not stocked')}</span>`
      : held.status === 'out' ? `<span class="tag severe">${t('stock.out', 'out of stock')}</span>`
      : shortOf ? `<span class="tag moderate">${t('stock.short', 'only')} ${held.level}</span>`
      : held.status === 'low' ? `<span class="tag moderate">${t('stock.low', 'low')} \u00b7 ${held.level}</span>`
      : `<span class="tag green">${held.level} ${t('stock.onShelf', 'on the shelf')}</span>`;

    return `
    <div class="script-line ${flagged.has(item.drug) ? 'flag' : ''}">
      <div class="name">
        <strong>${esc(item.drug)}</strong>
        <span>${esc([item.dose, item.freq, item.quantity ? `${item.quantity} ${t('label.units', 'units')}` : '']
          .filter(Boolean).join(' \u00b7 ')) || t('label.noDose', 'no dose set')}</span>
      </div>
      ${stockNote}
      <button class="icon-btn" type="button" data-remove="${index}" aria-label="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>`;
  }).join('');
}

document.getElementById('scriptLines').addEventListener('click', event => {
  const button = event.target.closest('button[data-remove]');
  if (!button) return;
  script.splice(Number(button.dataset.remove), 1);
  drawScript();
  checkScript();
});

const INFO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.8h.01"/></svg>';
const WARN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.4v4.2M12 17.2h.01"/></svg>';
const OK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="m8.4 12.2 2.4 2.4 4.8-4.8"/></svg>';

/* ---------- the screening itself ----------

   The verdict comes from the server, which runs the trained interaction model
   together with the allergy and condition checks against the patient file.
   The same endpoint grades the script again when it is sent, so what is shown
   here and what the pharmacist reads cannot drift apart.

   The substitutions below are the one thing kept in the page: the model says
   what the problem is, not what to use instead. */

const SWAPS = {
  'warfarin|amiodarone': { from: 'Amiodarone', to: 'Sotalol', note: 'No warfarin interaction' },
  'warfarin|aspirin': { from: 'Aspirin', to: 'Paracetamol', note: 'No effect on clotting' },
  'warfarin|acetylsalicylic acid': { from: 'Aspirin', to: 'Paracetamol', note: 'No effect on clotting' },
  'rifampicin|dolutegravir': { from: 'Dolutegravir once daily', to: 'Dolutegravir twice daily', note: 'Standard adjustment' },
  'ibuprofen|enalapril': { from: 'Ibuprofen', to: 'Paracetamol', note: 'Kinder to the kidneys' },
  'ibuprofen|chronic kidney disease': { from: 'Ibuprofen', to: 'Paracetamol', note: 'Kinder to the kidneys' },
  'metformin|chronic kidney disease': { from: 'Metformin', to: 'Insulin glargine', note: 'No build-up in reduced kidney function' }
};

function swapFor(finding) {
  const parts = (finding.title || '').toLowerCase().split('+').map(p => p.trim());
  if (parts.length < 2) return null;
  return SWAPS[`${parts[0]}|${parts[1]}`] || SWAPS[`${parts[1]}|${parts[0]}`] || null;
}

const RANK = { severe: 0, moderate: 1, mild: 2, unknown: 3, clear: 4 };

// The last verdict the server gave, so drawScript() can mark the lines that
// are implicated without asking again.
let currentFindings = [];
let screeningNotes = [];
let modelAvailable = null;
let screeningBusy = false;

function findings() {
  const floor = RANK[document.getElementById('setSeverity').value];
  return currentFindings.filter(f => (RANK[f.severity] ?? 5) <= floor || f.severity === 'severe');
}

function worstOf(list) {
  if (list.some(f => f.severity === 'severe')) return 'severe';
  if (list.some(f => f.severity === 'moderate')) return 'moderate';
  if (list.some(f => f.severity === 'mild')) return 'mild';
  return 'clear';
}

/* Asked for on a short delay, so adding three medicines in a row is one
   request rather than three. */
let screenTimer;

function checkScript() {
  // An answer about an older combination would be worse than none.
  const panel = document.getElementById('aiResponse');
  if (panel) panel.innerHTML = '';

  clearTimeout(screenTimer);

  if (!script.length) {
    currentFindings = [];
    screeningNotes = [];
    drawScreening();
    return;
  }

  screeningBusy = true;
  drawScreening();
  screenTimer = setTimeout(runScreening, 250);
}

async function runScreening() {
  const asked = script.map(item => item.drug);

  try {
    const verdict = await callApi('/api/prescriptions/screen/', {
      method: 'POST',
      body: JSON.stringify({
        drugs: asked,
        file_number: activePatient ? activePatient.file : ''
      })
    });

    // A slower earlier request must not overwrite a newer answer.
    if (asked.join('|') !== script.map(item => item.drug).join('|')) return;

    currentFindings = (verdict.findings || []).map(finding => ({
      ...finding,
      action: finding.action || actionFor(finding),
      swap: swapFor(finding)
    }));
    screeningNotes = verdict.notes || [];
    modelAvailable = verdict.model_available;
  } catch (error) {
    currentFindings = [];
    screeningNotes = [t('screen.offline',
      'The screening service could not be reached, so this script has not been checked.')];
    modelAvailable = null;
  }

  screeningBusy = false;
  drawScreening();
}

/* The model says what happens; for a documented pair it does not say what to
   do about it. Where there is nothing to add, the finding stands on its own. */
function actionFor(finding) {
  if (finding.kind === 'interaction' && finding.source === 'predicted') {
    return t('screen.predicted',
      'Not documented — the model inferred this from the interaction graph. Treat as a prompt to check, not a finding.');
  }
  if (finding.severity === 'severe') {
    return t('screen.severeAction', 'Consider an alternative, or monitor closely and say why below.');
  }
  return t('screen.moderateAction', 'Usually manageable. Counsel the patient and monitor.');
}

function drawScreening() {
  const state = document.getElementById('screenState');
  const box = document.getElementById('findings');
  const overrideBox = document.getElementById('overrideBox');

  if (!script.length) {
    state.innerHTML = `<div class="screen-state clear">${OK_ICON}${t('screen.none', 'Add medication to run a check')}</div>`;
    box.innerHTML = '';
    overrideBox.innerHTML = '';
    drawScript();
    return;
  }

  if (screeningBusy) {
    state.innerHTML = `<div class="screen-state clear"><span class="spinner"></span>${
      t('screen.checking', 'Checking the combination…')}</div>`;
  }

  const list = findings();
  const worst = worstOf(list);
  const showSwaps = document.getElementById('setSubs').checked;

  if (!screeningBusy) {
    if (!list.length) {
      // Nothing found and nothing checked are different things, and the
      // difference matters more here than anywhere else in the system.
      state.innerHTML = modelAvailable === false
        ? `<div class="screen-state moderate">${WARN_ICON}${
            t('screen.notChecked', 'Drug pairs were not checked on this server')}</div>`
        : `<div class="screen-state clear">${OK_ICON}${t('screen.clear', 'No problems found')}</div>`;
    } else {
      const label = worst === 'severe'
        ? `${list.length} ${t('screen.severeFound', 'problem(s), one or more severe')}`
        : `${list.length} ${t('screen.moderateFound', 'problem(s) to consider')}`;
      state.innerHTML = `<div class="screen-state ${worst}">${WARN_ICON}${label}</div>`;
    }
  }

  box.innerHTML = list.map(item => `
    <div class="finding ${item.severity}">
      <strong>${esc(item.title)} <span class="tag ${item.severity === 'severe' ? 'severe' : 'moderate'}">${
        t('risk.' + item.severity, item.severity)}</span>${
        item.source === 'predicted'
          ? ` <span class="tag grey">${t('screen.model', 'model estimate')}</span>`
          : item.source === 'documented'
            ? ` <span class="tag">${t('screen.documented', 'documented')}</span>`
            : ''
      }</strong>
      <div class="what">${esc(item.what)}</div>
      ${item.action ? `<div class="do"><b>${t('label.doThis', 'What to do')}:</b> ${esc(item.action)}</div>` : ''}
      ${item.swap && showSwaps ? `
        <div class="swap">
          <div>
            <div>${esc(item.swap.from)} → <strong>${esc(item.swap.to)}</strong></div>
            <span>${esc(item.swap.note)}</span>
          </div>
          <button class="link-btn" type="button" data-swap="${esc(item.swap.from)}|${esc(item.swap.to)}">${
            t('action.swap', 'Swap')}</button>
        </div>` : ''}
    </div>`).join('')
    + (screeningNotes.length
      ? `<div class="finding" style="border-left-color:var(--line)">
           <div class="what">${screeningNotes.map(esc).join(' ')}</div>
         </div>`
      : '');

  // Anything the screening raised needs a written reason. The pharmacist
  // reads it before dispensing, and the server refuses the script without it.
  const needsReason = worst !== 'clear' && document.getElementById('setRequireReason').checked;
  const existing = document.getElementById('overrideReason');
  const keep = existing ? existing.value : '';

  overrideBox.innerHTML = needsReason ? `
    <div class="override-box">
      <label for="overrideReason">${t('label.reason', 'Why are you prescribing past this warning?')}</label>
      <textarea id="overrideReason" placeholder="${esc(t('label.reasonPlaceholder',
        'e.g. Patient stable on this combination, INR monitored weekly'))}">${esc(keep)}</textarea>
      <p>${t('label.reasonNote', 'The pharmacist reads this before dispensing.')}</p>
    </div>` : '';

  drawScript();
}

document.getElementById('findings').addEventListener('click', event => {
  const button = event.target.closest('button[data-swap]');
  if (!button) return;

  const [from, to] = button.dataset.swap.split('|');
  const index = script.findIndex(item => from.toLowerCase().startsWith(item.drug.toLowerCase()) ||
                                         item.drug.toLowerCase().startsWith(from.split(' ')[0].toLowerCase()));
  if (index === -1) { toast(t('toast.swapMiss', 'That medicine is on the file, not on this script.')); return; }

  script[index] = { ...script[index], drug: to.split(' ')[0] };
  toast(`${from} → ${to}`);
  checkScript();
});

['setSeverity', 'setSubs', 'setRequireReason'].forEach(id =>
  document.getElementById(id).addEventListener('change', drawScreening));

/* ==================================================================
   Second opinion

   The request goes to Django, which holds the Anthropic key and calls the
   API server-side. The key never reaches the browser.
   ================================================================== */

const aiButton = document.getElementById('checkAi');
const aiResponse = document.getElementById('aiResponse');

function severityTagFor(severity) {
  if (severity === 'severe') return `<span class="tag severe">${t('risk.severe', 'Severe')}</span>`;
  if (severity === 'moderate') return `<span class="tag moderate">${t('risk.moderate', 'Moderate')}</span>`;
  return `<span class="tag green">${t('risk.mild', 'Mild')}</span>`;
}

function renderAi(data) {
  const findingsHtml = (data.findings || []).map(item => `
    <div class="finding ${item.severity === 'severe' ? 'severe' : 'moderate'}">
      <strong>${item.title || ''} ${severityTagFor(item.severity)}</strong>
      <div class="what">${item.what || ''}</div>
      ${item.action ? `<div class="do"><b>${t('label.doThis', 'What to do')}:</b> ${item.action}</div>` : ''}
    </div>`).join('');

  aiResponse.innerHTML = `
    <div class="ai-panel">
      ${data.summary ? `<p class="ai-summary">${data.summary}</p>` : ''}
      ${findingsHtml || `<p class="ai-summary">${t('ai.nothing', 'Nothing further to add beyond the checks above.')}</p>`}
      <span class="ai-foot">${t('ai.foot', 'Decision support only. The prescribing decision stays with you, and this does not replace the package insert or a clinical pharmacist.')}</span>
    </div>`;
}

aiButton.addEventListener('click', async () => {
  if (!script.length) { toast(t('error.noDrugs', 'Add at least one medicine.')); return; }

  aiButton.disabled = true;
  aiResponse.innerHTML = `<div class="ai-panel"><div class="ai-loading"><span class="spinner"></span>${t('ai.working', 'Checking the combination\u2026')}</div></div>`;

  try {
    const response = await fetch('/api/screen/second-opinion/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || '' },
      body: JSON.stringify({
        drugs: script.map(item => ({ drug: item.drug, dose: item.dose, frequency: item.freq })),
        patient: activePatient ? {
          age: activePatient.age,
          sex: activePatient.sex,
          conditions: activePatient.conditions,
          current_medication: activePatient.meds,
          allergies: activePatient.allergies
        } : null
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      aiResponse.innerHTML = `<div class="ai-panel">${data.detail || t('ai.failed', 'The check could not be completed. Try again in a moment.')}</div>`;
      return;
    }

    renderAi(data);
  } catch (error) {
    aiResponse.innerHTML = `<div class="ai-panel">${t('ai.offline', 'Cannot reach the server. The rule checks above still apply.')}</div>`;
  } finally {
    aiButton.disabled = false;
  }
});

/* ---------- sending ---------- */

document.getElementById('sendScript').addEventListener('click', async () => {
  if (!activePatient) { toast(t('error.noPatientYet', 'Load a patient file first.')); return; }
  if (!script.length) { toast(t('error.noDrugs', 'Add at least one medicine.')); return; }

  const reasonField = document.getElementById('overrideReason');
  if (reasonField && !reasonField.value.trim()) {
    toast(t('error.noReason', 'Give a reason before sending a flagged prescription.'));
    reasonField.focus();
    return;
  }

  const button = document.getElementById('sendScript');
  button.disabled = true;
  button.textContent = t('action.sending', 'Sending…');

  try {
    const result = await callApi('/api/prescriptions/new/', {
      method: 'POST',
      body: JSON.stringify({
        file_number: activePatient.file,
        override_reason: reasonField ? reasonField.value.trim() : '',
        items: script.map(item => ({
          drug: item.drug,
          dose: item.dose,
          frequency: item.freq,
          quantity: item.quantity
        }))
      })
    });

    const made = result.prescription;
    toast(`${made.reference} \u00b7 ${t('toast.sent', 'sent to pharmacy for')} ${made.patient}`);

    script = [];
    if (!document.getElementById('setKeepOpen').checked) {
      activePatient = null;
      document.getElementById('patientLookup').value = '';
      document.getElementById('patientPanel').innerHTML = '';
    }

    checkScript();
    // The shelf moves when the pharmacy dispenses, so what is on it now may
    // already be different from when this script was started.
    loadSent();
    loadStock();
  } catch (error) {
    // The server grades the script again on the way in. If it found something
    // this page did not, it says so rather than letting the script through.
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = t('action.send', 'Send to pharmacy');
  }
});

document.getElementById('clearScript').addEventListener('click', () => {
  script = [];
  checkScript();
});

/* ==================================================================
   Patients
   ================================================================== */

const patientRows = document.getElementById('patientRows');
const patientSearch = document.getElementById('patientSearch');
const wardFilter = document.getElementById('wardFilter');

function renderPatients() {
  if (!patientsLoaded) {
    patientRows.innerHTML = `<tr><td colspan="6" class="empty">${t('loading', 'Loading…')}</td></tr>`;
    return;
  }

  if (patientsError) {
    patientRows.innerHTML = `<tr><td colspan="6" class="empty">${esc(patientsError)}</td></tr>`;
    return;
  }

  const term = patientSearch.value.trim().toLowerCase();
  const ward = wardFilter.value;

  const shown = patients.filter(p =>
    (!ward || p.ward === ward) &&
    (!term || p.name.toLowerCase().includes(term) || p.file.toLowerCase().includes(term)));

  patientRows.innerHTML = shown.length ? shown.map(p => `
    <tr>
      <td>
        <div class="who">
          <span class="initials">${esc(initials(p.name))}</span>
          <div>
            <strong>${esc(p.name)}</strong>
            <span>${[p.age, p.sex, p.ward].filter(v => v !== '' && v !== null && v !== undefined).map(esc).join(' · ')}</span>
          </div>
        </div>
      </td>
      <td class="id">${esc(p.file)}${p.needsReview
        ? ` <span class="tag review">${t('status.review', 'Not confirmed')}</span>` : ''}</td>
      <td><div class="chip-list" style="justify-content:flex-start">${
        (p.conditions.length ? p.conditions : ['—']).map(c => `<span class="tag">${esc(c)}</span>`).join('')
      }</div></td>
      <td class="sub">${esc(p.meds.join(', ')) || '—'}</td>
      <td class="sub">${esc(whenText(p.seen))}</td>
      <td>
        <div class="row-actions">
          <button class="link-btn" data-file="${esc(p.file)}">${t('action.open', 'Open')}</button>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${
        patients.length
          ? t('empty.patients', 'No file matches that search.')
          : t('empty.noPatients', 'No patient files on the system yet. Admin reads them in from the paper file.')
      }</td></tr>`;
}

patientSearch.addEventListener('input', renderPatients);
wardFilter.addEventListener('change', renderPatients);

async function loadPatients() {
  try {
    const data = await callApi(API.patients);
    patients = data.results.map(toLocal);
    patientsError = '';

    // The ward filter and the prescribing lookup both come from what is
    // actually on file, so neither offers something that is not there.
    const currentWard = wardFilter.value;
    wardFilter.innerHTML = `<option value="">${t('patients.allWards', 'All wards')}</option>` +
      [...new Set(patients.map(p => p.ward).filter(Boolean))].sort()
        .map(w => `<option value="${esc(w)}"${w === currentWard ? ' selected' : ''}>${esc(w)}</option>`).join('');

    document.getElementById('patientOptions').innerHTML = patients
      .map(p => `<option value="${esc(p.file)}">${esc(p.name)}${p.ward ? ' · ' + esc(p.ward) : ''}</option>`)
      .join('');
  } catch (error) {
    patients = [];
    patientsError = error.message;
  }

  patientsLoaded = true;
  renderPatients();
}

/* ---------- the patient file, which this workspace can change ----------

   Two modes in one sheet. Reading is the default, because most of the time a
   doctor is looking rather than correcting. Edit turns the same fields into
   inputs, and Save writes the whole record in one request — the server keeps
   the version that was there before, so an edit can always be traced back.

   Nothing is saved as you type. A half-typed allergy is worse than none. */

const backdrop = document.getElementById('modalBackdrop');
let openFile = null;      // the record as the server last returned it
let draft = null;         // what the doctor has changed, before saving
let editing = false;

function fieldRow(label, value, options = {}) {
  const empty = value === null || value === undefined || value === '';
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

/* An editable version of the same row. The name in data-field is what gets
   sent, so the markup and the request cannot drift apart. */
function inputRow(label, field, value, options = {}) {
  const classes = ['field', 'editing'];
  if (options.wide) classes.push('wide');

  const control = options.area
    ? `<textarea class="edit-area" data-field="${field}">${esc(value || '')}</textarea>`
    : `<input class="edit-input${options.short ? ' short' : ''}" data-field="${field}"
              type="${options.type || 'text'}" value="${esc(value === null || value === undefined ? '' : value)}"
              placeholder="${esc(options.placeholder || '')}" />`;

  return `
    <div class="${classes.join(' ')}">
      <span class="label">${esc(label)}</span>
      ${control}
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

const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function chipEditor(label, field, values, kind) {
  return `
    <div class="field editing">
      <span class="label">${esc(label)}</span>
      <div class="chip-edit" data-chips="${field}">
        ${(values || []).map((value, index) => `
          <span class="chip${kind === 'allergy' ? ' allergy-chip' : ''}">
            ${esc(value)}
            <button type="button" data-chip-remove="${field}:${index}"
                    aria-label="${t('action.remove', 'Remove')} ${esc(value)}">${CROSS}</button>
          </span>`).join('')}
        <input class="chip-add" data-chip-add="${field}" type="text"
               placeholder="${esc(t('action.addChip', '+ add'))}" />
      </div>
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

function medicationBlock(record) {
  if (!editing) {
    return (record.medication || []).length
      ? (record.medication || []).map(item => `
          <div class="med">
            <strong>${esc(item.name)}</strong>
            <span class="how">${esc([item.dose, item.frequency].filter(Boolean).join(' · ')) || t('f.noDose', 'no dose recorded')}</span>
          </div>`).join('')
      : `<p class="hint">${t('f.noMeds', 'No current medication recorded.')}</p>`;
  }

  return `
    ${(record.medication || []).map((item, index) => `
      <div class="med-edit" data-med="${index}">
        <input type="text" data-med-field="name:${index}" value="${esc(item.name)}"
               list="drugOptions" placeholder="${esc(t('f.medName', 'Medicine'))}" />
        <input type="text" data-med-field="dose:${index}" value="${esc(item.dose)}"
               placeholder="${esc(t('f.medDose', 'Dose'))}" />
        <input type="text" data-med-field="frequency:${index}" value="${esc(item.frequency)}"
               placeholder="${esc(t('f.medFreq', 'How often'))}" />
        <button class="icon-btn" type="button" data-med-remove="${index}"
                aria-label="${t('action.remove', 'Remove')}">${CROSS}</button>
      </div>`).join('')}
    <button class="link-btn add-med" type="button" id="addMed">${t('action.addMed', '+ Add a medicine')}</button>`;
}

function recordHtml(record) {
  const encounter = record.encounter || {};
  const observations = record.observations || {};

  const identification = sectionBlock('01', t('sec.id', 'Patient identification'),
    editing
      ? `<div class="field-grid">
          ${inputRow(t('f.name', 'Full name'), 'full_name', record.full_name)}
          ${fieldRow(t('f.fileNo', 'File number'), record.file_number)}
          ${inputRow(t('f.idNo', 'ID number'), 'id_number', record.id_number)}
          ${inputRow(t('f.dob', 'Date of birth'), 'date_of_birth', record.date_of_birth, { type: 'date' })}
          ${inputRow(t('f.statedAge', 'Age, if no date of birth'), 'stated_age', record.stated_age, { short: true })}
          ${inputRow(t('f.sex', 'Sex (F, M or O)'), 'sex', record.sex, { short: true })}
          ${inputRow(t('f.ward', 'Ward'), 'ward', record.ward)}
          ${inputRow(t('f.area', 'Home area'), 'home_area', record.home_area)}
          ${inputRow(t('f.language', 'Language'), 'language', record.language)}
          ${inputRow(t('f.phone', 'Phone'), 'phone', record.phone)}
          ${inputRow(t('f.email', 'Email for the collection code'), 'email', record.email, { type: 'email' })}
          ${inputRow(t('f.kin', 'Next of kin'), 'next_of_kin', record.next_of_kin)}
          ${inputRow(t('f.kinPhone', 'Their number'), 'next_of_kin_phone', record.next_of_kin_phone)}
          ${inputRow(t('f.address', 'Address'), 'address', record.address, { wide: true })}
        </div>`
      : `<div class="field-grid">
          ${fieldRow(t('f.name', 'Full name'), record.full_name)}
          ${fieldRow(t('f.fileNo', 'File number'), record.file_number)}
          ${fieldRow(t('f.idNo', 'ID number'), record.id_number)}
          ${fieldRow(t('f.dob', 'Date of birth'), record.date_of_birth)}
          ${fieldRow(t('f.age', 'Age'), record.age)}
          ${fieldRow(t('f.sex', 'Sex'), record.sex_label || record.sex)}
          ${fieldRow(t('f.ward', 'Ward'), record.ward)}
          ${fieldRow(t('f.area', 'Home area'), record.home_area)}
          ${fieldRow(t('f.language', 'Language'), record.language)}
          ${fieldRow(t('f.phone', 'Phone'), record.phone)}
          ${fieldRow(t('f.email', 'Email'), record.email)}
          ${fieldRow(t('f.kin', 'Next of kin'), record.next_of_kin)}
          ${fieldRow(t('f.kinPhone', 'Their number'), record.next_of_kin_phone)}
          ${fieldRow(t('f.address', 'Address'), record.address, { wide: true })}
        </div>`);

  const encounterBlock = sectionBlock('02', t('sec.encounter', 'Encounter and triage'),
    editing
      ? `<div class="field-grid">
          ${inputRow(t('f.date', 'Date'), 'encounter.date', encounter.date)}
          ${inputRow(t('f.time', 'Time'), 'encounter.time', encounter.time)}
          ${inputRow(t('f.type', 'Type'), 'encounter.type', encounter.type)}
          ${inputRow(t('f.triage', 'Triage'), 'encounter.triage', encounter.triage)}
          ${inputRow(t('f.referred', 'Referred by'), 'encounter.referred_by', encounter.referred_by)}
          ${inputRow(t('f.complaint', 'Presenting complaint'), 'encounter.presenting_complaint',
                     encounter.presenting_complaint, { wide: true, area: true })}
        </div>`
      : `<div class="field-grid">
          ${fieldRow(t('f.date', 'Date'), encounter.date)}
          ${fieldRow(t('f.time', 'Time'), encounter.time)}
          ${fieldRow(t('f.type', 'Type'), encounter.type)}
          ${fieldRow(t('f.triage', 'Triage'), encounter.triage)}
          ${fieldRow(t('f.referred', 'Referred by'), encounter.referred_by)}
          ${fieldRow(t('f.complaint', 'Presenting complaint'), encounter.presenting_complaint, { wide: true, stack: true })}
        </div>`);

  const history = sectionBlock('03', t('sec.history', 'Medical history'), `
    ${editing
      ? chipEditor(t('f.conditions', 'Conditions'), 'conditions', record.conditions)
      : chipRow(t('f.conditions', 'Conditions'), record.conditions)}
    ${editing
      ? chipEditor(t('f.allergies', 'Allergies'), 'allergies', record.allergies, 'allergy')
      : chipRow(t('f.allergies', 'Allergies'), record.allergies, 'allergy')}
    <p class="section-label" style="margin-top:16px">${t('f.meds', 'Current medication')}</p>
    ${medicationBlock(record)}
    ${editing
      ? inputRow(t('f.notes', 'Other history'), 'history_notes', record.history_notes, { wide: true, area: true })
      : (record.history_notes ? `<div class="field stack" style="border-bottom:0">
          <span class="label">${t('f.notes', 'Other history')}</span>
          <span class="value">${esc(record.history_notes)}</span>
        </div>` : '')}`);

  const obsBlock = sectionBlock('04', t('sec.obs', 'Observations'),
    editing
      ? `<div class="field-grid">
          ${OBSERVATIONS.map(([key, label]) =>
            inputRow(t('obs.' + key, label), 'observations.' + key, observations[key], { short: true })).join('')}
        </div>`
      : `<div class="obs-grid">
          ${OBSERVATIONS.map(([key, label]) => {
            const value = observations[key];
            return `<div class="obs${value ? '' : ' empty'}">
              <strong>${value ? esc(value) : '—'}</strong>
              <span>${esc(t('obs.' + key, label))}</span>
            </div>`;
          }).join('')}
        </div>`);

  const assessment = sectionBlock('05', t('sec.assessment', 'Clinical assessment'),
    editing
      ? inputRow(t('sec.assessment', 'Clinical assessment'), 'assessment', record.assessment, { wide: true, area: true })
      : `<div class="field stack" style="border-bottom:0">
          <span class="value${record.assessment ? '' : ' empty'}">${esc(record.assessment || t('field.blank', 'Not recorded'))}</span>
        </div>`);

  const plan = sectionBlock('06', t('sec.plan', 'Plan and follow-up'),
    editing
      ? inputRow(t('sec.plan', 'Plan and follow-up'), 'plan', record.plan, { wide: true, area: true })
      : `<div class="field stack" style="border-bottom:0">
          <span class="value${record.plan ? '' : ' empty'}">${esc(record.plan || t('field.blank', 'Not recorded'))}</span>
        </div>`);

  return identification + encounterBlock + history + obsBlock + assessment + plan;
}

function originalHtml(record) {
  const documents = record.documents || [];

  if (!documents.length) {
    return sectionBlock('—', t('sec.original', 'Original document'),
      `<div class="gap">${INFO_ICON}<div>${t('f.noDoc',
        'No document is attached to this record. It was entered by hand.')}</div></div>`);
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
           ? t('f.wasImage', 'This page had no text layer, so it was read as a picture. Worth checking closely against the record.')
           : t('f.wasText', 'The record on the left was read from this document. Check it against the page before confirming.')
       }</p>`
    : '';

  return sectionBlock('—', t('sec.original', 'Original document'), list + frame);
}

function historyHtml(record) {
  const versions = record.versions || [];

  if (!versions.length) {
    return sectionBlock('—', t('sec.history2', 'Edit history'),
      `<div class="gap">${INFO_ICON}<div>${t('f.noEdits',
        'Nothing has been changed since this record was created.')}</div></div>`);
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

function drawSheet() {
  const record = editing ? draft : openFile;
  if (!record) return;

  document.getElementById('modalTitle').textContent = record.full_name || t('f.noName', 'No name on file');
  document.getElementById('modalSub').textContent =
    [record.file_number, record.ward, record.age !== null && record.age !== undefined ? `${record.age} ${t('f.years', 'years')}` : '']
      .filter(Boolean).join(' · ');

  const firstDoc = (openFile.documents || []).find(d => d.download_url);

  document.getElementById('sheetTools').innerHTML = `
    ${openFile.needs_review ? `<span class="tag review">${t('status.review', 'Not confirmed')}</span>` : ''}
    ${firstDoc ? `<button class="btn ghost" type="button" data-download="${firstDoc.id}">${t('action.retrieve', 'Download original')}</button>` : ''}
    ${editing
      ? `<button class="btn" type="button" id="saveRecord">${t('action.save', 'Save changes')}</button>
         <button class="btn ghost" type="button" id="cancelEdit">${t('action.cancelEdit', 'Discard')}</button>`
      : `<button class="btn" type="button" id="startEdit">${t('action.edit', 'Edit')}</button>
         ${openFile.needs_review
           ? `<button class="btn ghost" type="button" id="confirmRecord">${t('action.confirm', 'Confirm as checked')}</button>`
           : ''}`}`;

  const body = document.getElementById('modalBody');
  body.classList.toggle('editing', editing);

  body.innerHTML = `
    ${openFile.needs_review ? `
      <div class="flagged">
        ${WARN_ICON}
        <div>
          <strong>${t('f.reviewTitle', 'Not yet confirmed')}</strong>
          ${t('f.reviewBodyDoctor', 'These details were read out of the uploaded document. Check them against the page on the right, then confirm the record — or edit it, which confirms it as well.')}
        </div>
      </div>` : ''}

    ${editing ? `
      <div class="pending-note">
        ${INFO_ICON}
        <div>
          <strong>${t('f.editing', 'You are editing this record')}</strong>
          ${t('f.editingBody', 'Nothing is saved until you press Save. The version that is there now is kept, with your name and the time.')}
        </div>
      </div>` : ''}

    <div class="sheet-cols">
      <div>
        ${recordHtml(record)}
        ${editing ? `
          <div class="save-note">
            <label for="editNote">${t('f.note', 'Why, in a line (optional)')}</label>
            <input class="edit-input" id="editNote" type="text"
                   placeholder="${esc(t('f.notePlaceholder', 'e.g. Added CKD from today’s bloods'))}" />
          </div>` : ''}
      </div>
      <div class="original">${originalHtml(openFile)}${historyHtml(openFile)}</div>
    </div>`;

  document.getElementById('sheetFoot').textContent = openFile.confirmed_at
    ? `${t('f.confirmedBy', 'Confirmed by')} ${openFile.confirmed_by || '—'} · ${whenText(openFile.confirmed_at)}`
    : `${t('f.created', 'Created')} ${whenText(openFile.created_at)}${openFile.created_by ? ' · ' + openFile.created_by : ''}`;
}

async function openPatientSheet(fileNumber) {
  editing = false;
  draft = null;

  document.getElementById('modalTitle').textContent = t('loading', 'Loading…');
  document.getElementById('modalSub').textContent = fileNumber;
  document.getElementById('modalBody').innerHTML = '';
  document.getElementById('sheetTools').innerHTML = '';
  document.getElementById('sheetFoot').textContent = '';
  backdrop.classList.add('open');

  try {
    const data = await callApi(API.patients + encodeURIComponent(fileNumber) + '/');
    openFile = data.patient;
  } catch (error) {
    document.getElementById('modalTitle').textContent = t('f.notFound', 'File not found');
    document.getElementById('modalBody').innerHTML = `<div class="gap">${INFO_ICON}<div>${esc(error.message)}</div></div>`;
    return;
  }

  drawSheet();
}

patientRows.addEventListener('click', event => {
  const button = event.target.closest('button[data-file]');
  if (button) openPatientSheet(button.dataset.file);
});

/* Downloading goes through Django, which checks the session before handing
   over a single byte. The storage URL never reaches the browser. */
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-download]');
  if (button) window.open(`${API.files}${button.dataset.download}/download/`, '_blank', 'noopener');
});

/* ---------- editing ---------- */

/* A deep copy, so Discard really discards and the sheet can be redrawn from
   the server's version without a half-finished edit bleeding into it. */
function startEdit() {
  draft = JSON.parse(JSON.stringify(openFile));
  draft.medication = draft.medication || [];
  draft.conditions = draft.conditions || [];
  draft.allergies = draft.allergies || [];
  draft.encounter = draft.encounter || {};
  draft.observations = draft.observations || {};
  editing = true;
  drawSheet();
}

function cancelEdit() {
  editing = false;
  draft = null;
  drawSheet();
}

/* Typing updates the draft rather than the record, so the two never get
   confused and Save sends one coherent thing. */
document.getElementById('modalBody').addEventListener('input', event => {
  if (!editing || !draft) return;

  const field = event.target.dataset.field;
  if (field) {
    const [head, tail] = field.split('.');
    if (tail) {
      draft[head] = draft[head] || {};
      draft[head][tail] = event.target.value;
    } else {
      draft[head] = event.target.value;
    }
    return;
  }

  const med = event.target.dataset.medField;
  if (med) {
    const [key, index] = med.split(':');
    draft.medication[Number(index)][key] = event.target.value;
  }
});

document.getElementById('modalBody').addEventListener('keydown', event => {
  if (!editing || !draft) return;

  const field = event.target.dataset.chipAdd;
  if (field && event.key === 'Enter') {
    event.preventDefault();
    const value = event.target.value.trim();
    if (!value) return;
    if (!draft[field].includes(value)) draft[field].push(value);
    drawSheet();
    // Put the cursor back where it was, so several can be typed in a row.
    const next = document.querySelector(`[data-chip-add="${field}"]`);
    if (next) next.focus();
  }
});

/* A typed allergy that was never committed with Enter would be lost on save,
   which for an allergy is not acceptable. Leaving the box commits it. */
document.getElementById('modalBody').addEventListener('focusout', event => {
  if (!editing || !draft) return;

  const field = event.target.dataset.chipAdd;
  const value = (event.target.value || '').trim();
  if (!field || !value) return;

  if (!draft[field].includes(value)) draft[field].push(value);
  event.target.value = '';
  drawSheet();
});

document.getElementById('modalBody').addEventListener('click', event => {
  if (event.target.closest('#addMed')) {
    draft.medication.push({ name: '', dose: '', frequency: '' });
    drawSheet();
    const rows = document.querySelectorAll('[data-med-field^="name:"]');
    if (rows.length) rows[rows.length - 1].focus();
    return;
  }

  const removeMed = event.target.closest('button[data-med-remove]');
  if (removeMed) {
    draft.medication.splice(Number(removeMed.dataset.medRemove), 1);
    drawSheet();
    return;
  }

  const removeChip = event.target.closest('button[data-chip-remove]');
  if (removeChip) {
    const [field, index] = removeChip.dataset.chipRemove.split(':');
    draft[field].splice(Number(index), 1);
    drawSheet();
  }
});

document.getElementById('sheetTools').addEventListener('click', async event => {
  if (event.target.closest('#startEdit')) { startEdit(); return; }
  if (event.target.closest('#cancelEdit')) { cancelEdit(); return; }

  const confirmButton = event.target.closest('#confirmRecord');
  if (confirmButton) {
    confirmButton.disabled = true;
    try {
      const data = await callApi(
        `${API.patients}${encodeURIComponent(openFile.file_number)}/confirm/`, { method: 'POST' });
      openFile = data.patient;
      toast(t('toast.confirmed', 'Record confirmed'));
      drawSheet();
      loadPatients();
    } catch (error) {
      toast(error.message);
      confirmButton.disabled = false;
    }
    return;
  }

  const saveButton = event.target.closest('#saveRecord');
  if (!saveButton) return;

  const noteField = document.getElementById('editNote');

  // Only what this sheet can change is sent. The file number identifies the
  // record, so it is not in here.
  const payload = {
    full_name: draft.full_name,
    id_number: draft.id_number,
    date_of_birth: draft.date_of_birth || '',
    stated_age: draft.stated_age,
    sex: draft.sex,
    ward: draft.ward,
    home_area: draft.home_area,
    address: draft.address,
    language: draft.language,
    phone: draft.phone,
    email: draft.email,
    next_of_kin: draft.next_of_kin,
    next_of_kin_phone: draft.next_of_kin_phone,
    encounter: draft.encounter,
    conditions: draft.conditions,
    allergies: draft.allergies,
    medication: draft.medication.filter(item => (item.name || '').trim()),
    history_notes: draft.history_notes,
    observations: draft.observations,
    assessment: draft.assessment,
    plan: draft.plan,
    note: noteField ? noteField.value : ''
  };

  saveButton.disabled = true;
  saveButton.textContent = t('action.saving', 'Saving…');

  try {
    const data = await callApi(
      `${API.patients}${encodeURIComponent(openFile.file_number)}/save/`,
      { method: 'POST', body: JSON.stringify(payload) }
    );

    openFile = data.patient;
    editing = false;
    draft = null;

    toast(data.changed.length
      ? `${t('toast.saved2', 'Saved')} · ${data.changed.length} ${t('toast.fields', 'field(s) changed')}`
      : t('toast.nothing', 'Nothing was different, so nothing was saved.'));

    drawSheet();

    // The prescribing panel may be holding the old version of this patient.
    await loadPatients();
    if (activePatient && activePatient.file === openFile.file_number) {
      activePatient = toLocal(openFile);
      drawPatientCard(activePatient);
      checkScript();
    }
  } catch (error) {
    toast(error.message);
    saveButton.disabled = false;
    saveButton.textContent = t('action.save', 'Save changes');
  }
});

function closeModal() {
  if (editing && !window.confirm(t('confirm.discard',
    'You have changes that have not been saved. Close anyway?'))) return;
  backdrop.classList.remove('open');
  openFile = null;
  draft = null;
  editing = false;
}

document.getElementById('closeModal').addEventListener('click', closeModal);
backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (backdrop.classList.contains('open')) closeModal();
  closeDrawer();
});

document.getElementById('prescribeFor').addEventListener('click', () => {
  if (!openFile) return;
  const file = openFile.file_number;
  if (editing && !window.confirm(t('confirm.discard',
    'You have changes that have not been saved. Close anyway?'))) return;

  backdrop.classList.remove('open');
  editing = false;
  draft = null;
  openFile = null;

  showPanel('prescribe');
  loadPatient(file);
});

/* ==================================================================
   Sent
   ================================================================== */

const sentRows = document.getElementById('sentRows');
const sentSearch = document.getElementById('sentSearch');

function flagTag(flag) {
  if (flag === 'severe') return `<span class="tag severe">${t('risk.severe', 'Severe')}</span>`;
  if (flag === 'moderate') return `<span class="tag moderate">${t('risk.moderate', 'Moderate')}</span>`;
  if (flag === 'mild') return `<span class="tag warn">${t('risk.mild', 'Mild')}</span>`;
  // Not screened is not the same as nothing found, and the list says which.
  if (flag === 'unknown') return `<span class="tag grey">${t('risk.unknown', 'Not screened')}</span>`;
  return `<span class="tag green">${t('risk.clear', 'None')}</span>`;
}

function statusTag(status) {
  if (status === 'dispensed') return `<span class="tag green">${t('status.dispensed', 'Dispensed')}</span>`;
  if (status === 'queried') return `<span class="tag moderate">${t('status.queried', 'Queried')}</span>`;
  return `<span class="tag">${t('status.waiting', 'Waiting')}</span>`;
}

function renderSent() {
  if (!sentLoaded) {
    sentRows.innerHTML = `<tr><td colspan="5" class="empty">${t('loading', 'Loading…')}</td></tr>`;
    return;
  }

  const term = sentSearch.value.trim().toLowerCase();
  const shown = sent.filter(item =>
    !term ||
    item.patient.toLowerCase().includes(term) ||
    item.reference.toLowerCase().includes(term) ||
    item.items.some(line => line.drug.toLowerCase().includes(term)));

  sentRows.innerHTML = shown.length ? shown.map(item => `
    <tr>
      <td class="id">${esc(item.patient)}<div class="sub">${esc(item.reference)}</div></td>
      <td class="sub">${esc(item.items.map(line =>
        line.quantity ? `${line.drug} \u00d7${line.quantity}` : line.drug).join(', '))}</td>
      <td>${flagTag(item.severity)}</td>
      <td>${statusTag(item.status)}${
        // Why it came back is the whole reason a doctor opens this tab.
        item.status === 'queried' && item.pharmacy_note
          ? `<div class="sub" style="margin-top:4px">${esc(item.pharmacy_note)}</div>`
          : ''
      }</td>
      <td class="sub">${esc(whenText(item.created_at))}</td>
    </tr>`).join('')
    : `<tr><td colspan="5" class="empty">${
        sent.length
          ? t('empty.sent', 'Nothing matches that search.')
          : t('empty.noSent', 'Nothing sent yet. Prescriptions you send appear here with what the pharmacy did with them.')
      }</td></tr>`;
}

async function loadSent() {
  try {
    const data = await callApi('/api/prescriptions/?mine=1');
    sent = data.results;
  } catch (error) {
    sent = [];
  }
  sentLoaded = true;
  renderSent();
}

sentSearch.addEventListener('input', renderSent);

/* ==================================================================
   Settings
   ================================================================== */

document.getElementById('themeToggle').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  document.querySelectorAll('#themeToggle button').forEach(b => b.classList.toggle('active', b === button));
  document.body.classList.toggle('dark', button.dataset.theme === 'dark');
  document.querySelector('meta[name="theme-color"]').content = button.dataset.theme === 'dark' ? '#0e1210' : '#ffffff';
});

document.getElementById('langSelect').addEventListener('change', event => {
  lang = event.target.value;
  applyLanguage();
});

document.getElementById('localeSelect').addEventListener('change', event => {
  locale = event.target.value;
  render();
});

document.getElementById('setWard').addEventListener('change', event => {
  wardFilter.value = event.target.value;
  renderPatients();
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
  toastTimer = setTimeout(() => element.classList.remove('show'), 2800);
}

/* ==================================================================
   Render
   ================================================================== */

function render() {
  renderPatients();
  renderSent();
  checkScript();
}

/* ==================================================================
   Boot
   ================================================================== */

(async function start() {
  const me = await requireSession();
  if (!me) return;

  render();
  await Promise.all([loadPatients(), loadStock(), loadSent()]);

  // The default ward is only applied if that ward actually has patients on
  // file, otherwise it would filter the list down to nothing.
  const preferred = document.getElementById('setWard').value;
  if (preferred && [...wardFilter.options].some(option => option.value === preferred)) {
    wardFilter.value = preferred;
  }

  renderPatients();
})();