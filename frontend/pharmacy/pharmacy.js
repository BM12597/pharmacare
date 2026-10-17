/* PharmaCare+ — pharmacy workspace.
   Placeholder data throughout. Each block is marked with the endpoint that
   replaces it once the prescription models exist. */

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
  if (!response.ok) {
    // The body is carried on the error: a refused collection says which code
    // is wrong and how many tries are left.
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
    if (me.role !== 'pharmacist') throw new Error('wrong workspace');

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

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase();
}

/* ==================================================================
   Placeholder data
   ================================================================== */

// Prescriptions and the shelf are both loaded from the server below.

// The shelf. Filled by loadStock(), and moved by every dispense.
let stock = [];

/* ==================================================================
   Translations
   ================================================================== */

const STRINGS = {
  en: {},
  af: {
    'nav.patients': 'Pasiënte', 'patients.title': 'Pasiëntlêers', 'status.review': 'Nie bevestig nie', 'table.allergies': 'Allergieë', 'action.open': 'Maak oop',
    'nav.queue': 'Wagry', 'nav.stock': 'Voorraad', 'nav.dispensed': 'Uitgereik', 'nav.settings': 'Instellings',
    'action.signout': 'Teken uit', 'action.dispense': 'Reik uit', 'action.query': 'Vra dokter', 'action.close': 'Maak toe',
    'action.open': 'Maak oop',
    'queue.title': 'Voorskrifwagry', 'queue.sub': 'Gesorteer op erns, nie aankoms nie.',
    'queue.search': 'Soek op pasiënt, lêernommer of middel', 'queue.allFlags': 'Alle voorskrifte',
    'stat.waiting': 'Wag', 'stat.flagged': 'Gemerk', 'stat.dispensed': 'Vandag uitgereik', 'stat.out': 'Uit voorraad',
    'stock.title': 'Voorraad', 'stock.sub': "'n Plaasvervanger help net as dit op die rak is.",
    'stock.search': 'Soek ’n middel', 'stock.allItems': 'Alle items', 'stock.lowOnly': 'Lae voorraad', 'stock.outOnly': 'Uit voorraad',
    'dispensed.title': 'Uitgereik', 'dispensed.sub': 'Wat uitgegaan het en wanneer.',
    'table.drug': 'Middel', 'table.form': 'Vorm', 'table.level': 'Vlak', 'table.reorder': 'Herbestel by',
    'table.status': 'Status', 'table.patient': 'Pasiënt', 'table.drugs': 'Middels', 'table.doctor': 'Voorskrywer',
    'table.outcome': 'Uitkoms', 'table.when': 'Wanneer',
    'settings.title': 'Instellings', 'settings.appearance': 'Voorkoms', 'settings.theme': 'Tema',
    'settings.light': 'Lig', 'settings.dark': 'Donker', 'settings.language': 'Taal', 'settings.save': 'Stoor instellings',
    'risk.severe': 'Ernstig', 'risk.moderate': 'Matig', 'risk.clear': 'Geen waarskuwing',
    'stock.in': 'Op voorraad', 'stock.low': 'Laag', 'stock.out': 'Uit'
  },
  zu: {
    'nav.patients': 'Iziguli', 'patients.title': 'Amafayela eziguli', 'status.review': 'Akuqinisekisiwe', 'table.allergies': 'Ukungezwani', 'action.open': 'Vula',
    'nav.queue': 'Ulayini', 'nav.stock': 'Isitoko', 'nav.dispensed': 'Okukhishiwe', 'nav.settings': 'Izilungiselelo',
    'action.signout': 'Phuma', 'action.dispense': 'Khipha', 'action.query': 'Buza udokotela', 'action.close': 'Vala',
    'action.open': 'Vula',
    'queue.title': 'Ulayini wamaphrisikhripshini', 'queue.sub': 'Kuhlelwe ngobubi, hhayi ngesikhathi.',
    'queue.search': 'Sesha ngesiguli, inombolo yefayela noma umuthi', 'queue.allFlags': 'Wonke amaphrisikhripshini',
    'stat.waiting': 'Kulindile', 'stat.flagged': 'Kuphawuliwe', 'stat.dispensed': 'Kukhishwe namuhla', 'stat.out': 'Aphelile',
    'stock.title': 'Isitoko', 'stock.sub': 'Umuthi omunye usiza uma ukhona eshalofini.',
    'stock.search': 'Sesha umuthi', 'stock.allItems': 'Konke', 'stock.lowOnly': 'Isitoko esiphansi', 'stock.outOnly': 'Aphelile',
    'dispensed.title': 'Okukhishiwe', 'dispensed.sub': 'Okuphumile nokuthi nini.',
    'table.drug': 'Umuthi', 'table.form': 'Uhlobo', 'table.level': 'Izinga', 'table.reorder': 'Oda futhi ku-',
    'table.status': 'Isimo', 'table.patient': 'Isiguli', 'table.drugs': 'Imithi', 'table.doctor': 'Udokotela',
    'table.outcome': 'Umphumela', 'table.when': 'Nini',
    'settings.title': 'Izilungiselelo', 'settings.appearance': 'Ukubukeka', 'settings.theme': 'Itimu',
    'settings.light': 'Okukhanyayo', 'settings.dark': 'Okumnyama', 'settings.language': 'Ulimi', 'settings.save': 'Londoloza',
    'risk.severe': 'Kubucayi', 'risk.moderate': 'Maphakathi', 'risk.clear': 'Alukho usongo',
    'stock.in': 'Kukhona', 'stock.low': 'Kuphansi', 'stock.out': 'Kuphelile'
  },
  nso: {
    'nav.patients': 'Balwetši', 'patients.title': 'Difaele tša balwetši', 'status.review': 'Ga se netefatšwe', 'table.allergies': 'Dialaji', 'action.open': 'Bula',
    'nav.queue': 'Mothaladi', 'nav.stock': 'Setoko', 'nav.dispensed': 'Tše abilwego', 'nav.settings': 'Dipeakanyo',
    'action.signout': 'Tšwa', 'action.dispense': 'Aba', 'action.query': 'Botšiša ngaka', 'action.close': 'Tswalela',
    'action.open': 'Bula',
    'queue.title': 'Mothaladi wa dingwalwa', 'queue.sub': 'Go hlophilwe ka bogolo bja kotsi.',
    'queue.search': 'Nyaka ka molwetši, nomoro goba sehlare', 'queue.allFlags': 'Dingwalwa ka moka',
    'stat.waiting': 'Di emetše', 'stat.flagged': 'Tše swailwego', 'stat.dispensed': 'Tše abilwego lehono', 'stat.out': 'Di felile',
    'stock.title': 'Setoko', 'stock.sub': 'Sehlare se sengwe se thuša fela ge se le gona.',
    'stock.search': 'Nyaka sehlare', 'stock.allItems': 'Tšohle', 'stock.lowOnly': 'Setoko se se nyenyane', 'stock.outOnly': 'Di felile',
    'dispensed.title': 'Tše abilwego', 'dispensed.sub': 'Se se tšwilego le gore neng.',
    'table.drug': 'Sehlare', 'table.form': 'Sebopego', 'table.level': 'Boemo', 'table.reorder': 'Odara gape ka',
    'table.status': 'Boemo', 'table.patient': 'Molwetši', 'table.drugs': 'Dihlare', 'table.doctor': 'Ngaka',
    'table.outcome': 'Sephetho', 'table.when': 'Neng',
    'settings.title': 'Dipeakanyo', 'settings.appearance': 'Ponagalo', 'settings.theme': 'Sebopego',
    'settings.light': 'Seedi', 'settings.dark': 'Leswiswi', 'settings.language': 'Leleme', 'settings.save': 'Boloka',
    'risk.severe': 'Šoro', 'risk.moderate': 'Magareng', 'risk.clear': 'Ga go temošo',
    'stock.in': 'Se gona', 'stock.low': 'Se nyenyane', 'stock.out': 'Se felile'
  }
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
   Queue

   Real prescriptions, sorted by what the screening found rather than by who
   arrived first. The warning and the prescriber's reason for going past it
   are both on the card — the reason is the point of the whole system, and it
   should not be behind a click.
   ================================================================== */

const queueList = document.getElementById('queueList');
const queueSearch = document.getElementById('queueSearch');
const queueFilter = document.getElementById('queueFilter');

let queue = [];
let dispensed = [];
let counts = { waiting: 0, flagged: 0, dispensed_today: 0 };
let queueLoaded = false;
let queueError = '';
let canDispense = false;

const SEVERITY_ORDER = { severe: 0, moderate: 1, mild: 2, unknown: 3, clear: 4 };

function severityTag(severity) {
  if (severity === 'severe') return `<span class="tag severe">${t('risk.severe', 'Severe')}</span>`;
  if (severity === 'moderate') return `<span class="tag moderate">${t('risk.moderate', 'Moderate')}</span>`;
  if (severity === 'mild') return `<span class="tag warn">${t('risk.mild', 'Mild')}</span>`;
  // A script the server could not screen is not a script with nothing wrong.
  if (severity === 'unknown') return `<span class="tag grey">${t('risk.unknown', 'Not screened')}</span>`;
  return `<span class="tag green">${t('risk.clear', 'No warning')}</span>`;
}

const WARN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.4v4.2M12 17.2h.01"/></svg>';

/* How long it has been waiting, which is what the pharmacist is judging. */
function waitedText(iso) {
  const minutes = Math.max(Math.round((Date.now() - new Date(iso).getTime()) / 60000), 0);
  if (minutes < 1) return t('wait.now', 'just now');
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? t('wait.hour', 'hour') : t('wait.hours', 'hours')}`;
  return whenText(iso);
}

function itemChip(line) {
  const shelf = line.stock;
  const short = shelf && line.quantity && shelf.level < line.quantity;

  const state = !shelf ? 'grey'
    : shelf.status === 'out' ? 'severe'
    : short || shelf.status === 'low' ? 'moderate'
    : '';

  const note = !shelf ? t('stock.notStocked', 'not stocked')
    : shelf.status === 'out' ? t('stock.out', 'out of stock')
    : short ? `${t('stock.only', 'only')} ${shelf.level}`
    : '';

  return `<span class="tag ${state}">${esc(line.drug)}${line.dose ? ' ' + esc(line.dose) : ''}${
    line.quantity ? ` ×${line.quantity}` : ''
  }${note ? ` · ${esc(note)}` : ''}</span>`;
}

function renderQueue() {
  if (!queueLoaded) {
    queueList.innerHTML = `<div class="card empty">${t('loading', 'Loading…')}</div>`;
    return;
  }

  if (queueError) {
    queueList.innerHTML = `<div class="card empty">${esc(queueError)}</div>`;
    return;
  }

  const term = queueSearch.value.trim().toLowerCase();
  const filter = queueFilter.value;
  const sortBySeverity = document.getElementById('setSortSeverity').checked;
  const showOverride = document.getElementById('setShowOverride').checked;

  let shown = queue.filter(item =>
    (!filter || item.severity === filter || (filter === 'clear' && item.severity === 'unknown')) &&
    (!term ||
      item.patient.toLowerCase().includes(term) ||
      item.file_number.toLowerCase().includes(term) ||
      item.reference.toLowerCase().includes(term) ||
      item.items.some(line => line.drug.toLowerCase().includes(term))));

  if (sortBySeverity) {
    shown = [...shown].sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5));
  }

  queueList.innerHTML = shown.length ? shown.map(item => {
    const worst = (item.screening && item.screening.findings || [])[0];

    return `
    <div class="queue-item ${item.severity === 'unknown' ? 'clear' : item.severity}" data-id="${esc(item.reference)}">
      <div>
        <div class="queue-top">
          <strong>${esc(item.patient)}</strong>
          ${severityTag(item.severity)}
        </div>
        <div class="queue-meta">${[item.reference, item.file_number,
          item.age !== null && item.age !== undefined ? item.age : '', item.ward, item.doctor]
          .filter(v => v !== '' && v !== null && v !== undefined).map(esc).join(' · ')}</div>

        <div class="queue-drugs">${item.items.map(itemChip).join('')}</div>

        ${worst ? `
          <div class="warn-box">
            ${WARN_ICON}
            <div>
              <strong>${esc(worst.title)}</strong>
              <span>${esc(worst.what)}</span>
            </div>
          </div>` : ''}

        ${item.override && showOverride ? `
          <div class="override">
            <strong>${t('queue.override', 'Prescriber went ahead anyway')}</strong>
            ${esc(item.override)}
          </div>` : ''}
      </div>

      <div class="queue-side">
        <span class="queue-wait">${esc(waitedText(item.created_at))}</span>
        <button class="link-btn" data-open="${esc(item.reference)}">${t('action.open', 'Open')}</button>
      </div>
    </div>`;
  }).join('')
    : `<div class="card empty">${
        queue.length
          ? t('empty.queueSearch', 'Nothing matches that search.')
          : t('empty.queue', 'Nothing waiting. New prescriptions appear here as doctors send them.')
      }</div>`;
}

queueSearch.addEventListener('input', renderQueue);
queueFilter.addEventListener('change', renderQueue);
document.getElementById('setSortSeverity').addEventListener('change', renderQueue);
document.getElementById('setShowOverride').addEventListener('change', renderQueue);

async function loadQueue() {
  try {
    const waiting = await callApi('/api/prescriptions/?status=waiting');
    queue = waiting.results;
    counts = waiting.counts;
    canDispense = waiting.can_dispense;
    queueError = '';

    const done = await callApi('/api/prescriptions/');
    dispensed = done.results.filter(item => item.status !== 'waiting');
  } catch (error) {
    queue = [];
    dispensed = [];
    queueError = error.message;
  }

  queueLoaded = true;
  render();
}

/* ---------- one prescription ---------- */

const backdrop = document.getElementById('modalBackdrop');
let openScript = null;

function stockTag(state) {
  if (state === 'out') return `<span class="tag severe">${t('stock.out', 'Out')}</span>`;
  if (state === 'low') return `<span class="tag moderate">${t('stock.low', 'Low')}</span>`;
  if (state === 'in') return `<span class="tag green">${t('stock.in', 'In stock')}</span>`;
  return `<span class="tag grey">${t('stock.notStocked', 'not stocked')}</span>`;
}

async function openPrescription(reference) {
  document.getElementById('modalTitle').textContent = t('loading', 'Loading…');
  document.getElementById('modalSub').textContent = reference;
  document.getElementById('modalBody').innerHTML = '';
  backdrop.classList.add('open');

  let item;
  try {
    item = (await callApi(`/api/prescriptions/${encodeURIComponent(reference)}/`)).prescription;
  } catch (error) {
    document.getElementById('modalBody').innerHTML = `<div class="gap">${INFO_ICON}<div>${esc(error.message)}</div></div>`;
    return;
  }

  openScript = item;

  document.getElementById('modalTitle').textContent = item.patient;
  document.getElementById('modalSub').textContent =
    [item.reference, item.file_number, item.ward].filter(Boolean).join(' · ');

  const hideOut = document.getElementById('setHideOut').checked;
  const findings = (item.screening && item.screening.findings) || [];
  const notes = (item.screening && item.screening.notes) || [];

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><span>${t('modal.prescriber', 'Prescriber')}</span><strong>${esc(item.doctor)}</strong></div>
    <div class="detail-row"><span>${t('modal.waiting', 'Waiting')}</span><strong>${esc(waitedText(item.created_at))}</strong></div>
    <div class="detail-row"><span>${t('table.status', 'Status')}</span><strong>${severityTag(item.severity)}</strong></div>

    <p class="section-label">${t('modal.items', 'Items')}</p>
    ${item.items.map(line => `
      <div class="swap">
        <div>
          <div>${esc(line.drug)}${line.dose ? ' ' + esc(line.dose) : ''}</div>
          <span>${esc([line.frequency, line.quantity ? `${line.quantity} ${t('label.units', 'units')}` : '']
            .filter(Boolean).join(' · ')) || t('label.noDose', 'no dose set')}${
            line.stock ? ` · ${line.stock.level} ${t('stock.onShelf', 'on the shelf')}` : ''
          }</span>
        </div>
        ${stockTag(line.stock ? line.stock.status : 'unknown')}
      </div>`).join('')}

    ${findings.length ? `
      <p class="section-label">${t('modal.warning', 'What the screening found')}</p>
      ${findings.map(found => `
        <div class="warn-box">
          ${WARN_ICON}
          <div>
            <strong>${esc(found.title)} ${severityTag(found.severity)}</strong>
            <span>${esc(found.what)}</span>
            ${found.action ? `<span style="display:block;margin-top:4px"><b>${
              t('label.doThis', 'What to do')}:</b> ${esc(found.action)}</span>` : ''}
          </div>
        </div>`).join('')}` : ''}

    ${notes.length ? `<p class="hint" style="margin-top:10px">${notes.map(esc).join(' ')}</p>` : ''}

    ${item.override ? `
      <div class="override" style="margin-top:12px">
        <strong>${t('queue.override', 'Prescriber went ahead anyway')}</strong>
        ${esc(item.override)}
      </div>` : ''}

    <div id="collectPanel"></div>

    ${item.status !== 'waiting' ? `
      <p class="section-label">${t('modal.outcome', 'Outcome')}</p>
      <div class="detail-row"><span>${esc(item.status_label)}</span><strong>${
        esc(item.handled_by || '—')} · ${esc(whenText(item.handled_at))}</strong></div>
      ${item.pharmacy_note ? `<p class="hint">${esc(item.pharmacy_note)}</p>` : ''}` : ''}`;

  // A script that has already been handled has nothing left to do to it.
  const done = item.status !== 'waiting';
  document.getElementById('dispenseButton').hidden = done || !canDispense;
  document.getElementById('queryButton').hidden = done || !canDispense;

  stopCollecting();

  const collection = item.collection;
  const panel = document.getElementById('collectPanel');

  if (done || !canDispense || !collection) return;

  // A patient who never got an email has no way to confirm, so say that here
  // rather than letting the pharmacist press Dispense and find out.
  if (!collection.emailed) {
    panel.innerHTML = `
      <div class="collect-note">
        ${WARN_ICON}
        <div>
          <strong>${t('collect.noEmail', 'No code was sent to this patient')}</strong>
          ${esc(collection.send_error || t('collect.noEmailWhy',
            'There is no email address on their file.'))}
          ${t('collect.noEmailDo', 'Dispense will ask you to say why you are handing it over without a confirmation.')}
        </div>
      </div>`;
    return;
  }

  if (collection.status === 'collected') {
    panel.innerHTML = `
      <div class="collect-state done">${TICK_ICON}
        ${t('collect.already', 'The patient has already confirmed. Press Dispense to hand it over.')}
      </div>`;
    return;
  }

  panel.innerHTML = `
    <p class="collect-hint" style="margin-top:14px;text-align:center">
      ${t('collect.sentTo', 'A collection code was emailed to')} ${esc(collection.sent_to)}.
      ${t('collect.pressDispense', 'Press Dispense to show the code they scan.')}
    </p>`;
}

queueList.addEventListener('click', event => {
  const button = event.target.closest('button[data-open]');
  if (button) { openPrescription(button.dataset.open); return; }

  const card = event.target.closest('.queue-item');
  if (card) openPrescription(card.dataset.id);
});

function closeModal() {
  stopCollecting();
  backdrop.classList.remove('open');
  openScript = null;
}

document.getElementById('closeModal').addEventListener('click', closeModal);
backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });

document.getElementById('dispenseButton').addEventListener('click', async () => {
  if (!openScript) return;

  const needsConfirm = openScript.severity === 'severe' &&
    document.getElementById('setConfirmSevere').checked;

  if (needsConfirm && !window.confirm(
    t('confirm.severe', 'This prescription carries a severe interaction warning. Dispense anyway?'))) return;

  const collection = openScript.collection;

  // No code was ever sent, so there is nobody to confirm — hand it over with
  // a reason instead.
  if (!collection || !collection.emailed) {
    handOverWithoutPatient(openScript.reference);
    return;
  }

  // Already confirmed earlier: nothing to show, just move the stock.
  if (collection.status === 'collected') {
    finishDispense(openScript.reference);
    return;
  }

  armCollection(openScript.reference);
});

document.getElementById('queryButton').addEventListener('click', async () => {
  if (!openScript) return;

  const note = window.prompt(
    t('prompt.query', 'What should the prescriber look at?'),
    t('prompt.queryDefault', ''));

  if (note === null) return;
  if (!note.trim()) { toast(t('error.noQueryNote', 'Say what you want them to look at.')); return; }

  try {
    await callApi(
      `/api/prescriptions/${encodeURIComponent(openScript.reference)}/query/`,
      { method: 'POST', body: JSON.stringify({ note }) }
    );

    toast(`${t('toast.queried', 'Sent back to')} ${openScript.doctor}`);
    closeModal();
    loadQueue();
  } catch (error) {
    toast(error.message);
  }
});

/* ==================================================================
   Stock

   The level is a number in the database, not a figure on this page. Ordering
   writes to it, dispensing takes from it, and the doctor's medicine list
   reads the same endpoint — so a substitution is only offered when the
   substitute is actually on the shelf.

   One shelf holds at most 500 units. The stepper will not let you ask for
   more than will fit, and if two people order at once the server tops up to
   the ceiling and says what really went on.
   ================================================================== */

const stockRows = document.getElementById('stockRows');
const stockSearch = document.getElementById('stockSearch');
const stockFilter = document.getElementById('stockFilter');

let stockMax = 500;
let stockLoaded = false;
let stockError = '';
let canOrder = false;

// Which row is mid-order, and how many it is asking for. Kept out here so a
// redraw does not throw away what somebody has typed.
let ordering = null;   // { id, amount }

const MINUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function stockItem(id) {
  return stock.find(item => item.id === Number(id));
}

function stepper(item) {
  const amount = ordering.amount;
  const full = item.headroom === 0;

  return `
    <div class="stepper" data-stepper="${item.id}">
      <button class="step-btn" type="button" data-step="-10" aria-label="Ten fewer"
              ${amount <= 1 ? 'disabled' : ''}>${MINUS_ICON}</button>
      <input class="step-input" type="number" inputmode="numeric" data-amount="${item.id}"
             value="${amount}" min="1" max="${item.headroom}" aria-label="How many to order" />
      <button class="step-btn" type="button" data-step="10" aria-label="Ten more"
              ${amount >= item.headroom ? 'disabled' : ''}>${PLUS_ICON}</button>
      <button class="btn step-order" type="button" data-order="${item.id}" ${full ? 'disabled' : ''}>
        ${t('action.order', 'Order')}
      </button>
      <button class="step-btn ghost" type="button" data-cancel="1"
              aria-label="${t('action.cancel', 'Cancel')}">${CLOSE_ICON}</button>
    </div>
    <span class="step-room">${
      full
        ? t('stock.full', 'Shelf is full')
        : `${t('stock.room', 'room for')} ${nf().format(item.headroom)}`
    }</span>`;
}

function renderStock() {
  if (!stockLoaded) {
    stockRows.innerHTML = `<tr><td colspan="6" class="empty">${t('loading', 'Loading…')}</td></tr>`;
    return;
  }

  if (stockError) {
    stockRows.innerHTML = `<tr><td colspan="6" class="empty">${esc(stockError)}</td></tr>`;
    return;
  }

  const term = stockSearch.value.trim().toLowerCase();
  const filter = stockFilter.value;

  const shown = stock.filter(item =>
    (!filter || filter === item.status) &&
    (!term || item.drug.toLowerCase().includes(term) || item.form.toLowerCase().includes(term)));

  stockRows.innerHTML = shown.length ? shown.map(item => {
    // The bar is read against the ceiling, so two items can be compared by
    // eye rather than each being drawn against its own scale.
    const width = Math.round((item.level / stockMax) * 100);
    const isOrdering = ordering && ordering.id === item.id;

    return `
      <tr data-row="${item.id}">
        <td class="id">${esc(item.drug)}</td>
        <td class="sub">${esc(item.form)}</td>
        <td>
          <div class="stock-level">
            <div class="stock-bar"><i class="${item.status === 'in' ? '' : item.status}" style="width:${width}%"></i></div>
            <span class="stock-count" data-level="${item.id}">${nf().format(item.level)}</span>
          </div>
        </td>
        <td class="sub">${nf().format(item.reorder_at)}</td>
        <td>${stockTag(item.status)}</td>
        <td>
          <div class="row-actions">
            ${isOrdering
              ? stepper(item)
              : canOrder
                ? `<button class="link-btn" data-reorder="${item.id}">${t('action.reorder', 'Reorder')}</button>`
                : ''}
          </div>
        </td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="6" class="empty">${
        stock.length
          ? t('empty.stock', 'Nothing matches that search.')
          : t('empty.noStock', 'Nothing on the shelf yet. Run "python manage.py seed_stock" to put the starting list in.')
      }</td></tr>`;

  // Put the cursor back in the box after a redraw, so typing is not interrupted.
  if (ordering) {
    const box = stockRows.querySelector(`[data-amount="${ordering.id}"]`);
    if (box && document.activeElement !== box) {
      box.focus();
      box.select();
    }
  }
}

/* The level counts up to its new value rather than jumping, so it is obvious
   which row just changed when several are on screen. */
function countTo(element, from, to, bar) {
  if (REDUCED_MOTION || from === to) {
    element.textContent = nf().format(to);
    if (bar) bar.style.width = Math.round((to / stockMax) * 100) + '%';
    return;
  }

  const started = performance.now();
  const duration = 650;

  function step(now) {
    const progress = Math.min((now - started) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + (to - from) * eased);

    element.textContent = nf().format(value);
    if (bar) bar.style.width = Math.round((value / stockMax) * 100) + '%';

    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function clampAmount(item, value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return 1;
  return Math.min(Math.max(number, 1), Math.max(item.headroom, 1));
}

stockRows.addEventListener('click', async event => {
  const start = event.target.closest('button[data-reorder]');
  if (start) {
    const item = stockItem(start.dataset.reorder);
    // Open on a sensible number: enough to clear the reorder point, or
    // whatever will still fit.
    const suggested = Math.max(item.reorder_at - item.level, 0) || 50;
    ordering = { id: item.id, amount: clampAmount(item, suggested) };
    renderStock();
    return;
  }

  if (event.target.closest('button[data-cancel]')) {
    ordering = null;
    renderStock();
    return;
  }

  const step = event.target.closest('button[data-step]');
  if (step && ordering) {
    const item = stockItem(ordering.id);
    ordering.amount = clampAmount(item, ordering.amount + Number(step.dataset.step));
    renderStock();
    return;
  }

  const place = event.target.closest('button[data-order]');
  if (!place) return;

  const item = stockItem(place.dataset.order);
  const amount = ordering ? ordering.amount : 0;
  if (!item || amount < 1) return;

  place.disabled = true;
  place.textContent = t('action.ordering', 'Ordering…');

  try {
    const result = await callApi(`${API.stock}${item.id}/order/`, {
      method: 'POST',
      body: JSON.stringify({ amount })
    });

    const before = item.level;
    Object.assign(item, result.item);
    ordering = null;
    renderStock();

    // Animate the row that actually changed.
    const level = stockRows.querySelector(`[data-level="${item.id}"]`);
    const bar = stockRows.querySelector(`tr[data-row="${item.id}"] .stock-bar i`);
    if (level) countTo(level, before, item.level, bar);

    toast(result.detail ||
      `${result.ordered} ${t('toast.ordered', 'added')} · ${item.drug} ${t('toast.nowAt', 'now at')} ${item.level}`);

    render();
  } catch (error) {
    toast(error.message);
    place.disabled = false;
    place.textContent = t('action.order', 'Order');
  }
});

stockRows.addEventListener('input', event => {
  const box = event.target.closest('[data-amount]');
  if (!box || !ordering) return;
  // Clamped on the way out rather than as you type, so backspacing to retype
  // a number does not fight you.
  ordering.amount = box.value;
});

stockRows.addEventListener('change', event => {
  const box = event.target.closest('[data-amount]');
  if (!box || !ordering) return;
  ordering.amount = clampAmount(stockItem(ordering.id), box.value);
  renderStock();
});

stockRows.addEventListener('keydown', event => {
  if (!event.target.closest('[data-amount]') || !ordering) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    ordering.amount = clampAmount(stockItem(ordering.id), event.target.value);
    const button = stockRows.querySelector(`button[data-order="${ordering.id}"]`);
    if (button) button.click();
  }

  if (event.key === 'Escape') {
    ordering = null;
    renderStock();
  }
});

stockSearch.addEventListener('input', renderStock);
stockFilter.addEventListener('change', renderStock);

async function loadStock() {
  try {
    const data = await callApi(API.stock);
    stock = data.results;
    stockMax = data.max;
    canOrder = data.can_order;
    stockError = '';
  } catch (error) {
    stock = [];
    stockError = error.message;
  }

  stockLoaded = true;
  renderStock();
}

/* ---------- handing it over ----------

   Pressing Dispense no longer hands anything over on its own. It puts a code
   on this screen and waits for the patient to confirm — either by scanning it
   with their own phone, or by reading their emailed code out to be typed in
   here. Only then does the stock move.

   The code on screen is good for one confirmation and a few minutes. Press
   Dispense again and a different one appears; the old one is already dead. */

let collectTimer = null;
let collectPoll = null;
let armedFor = null;

const TICK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.3 2.6 2.6 5-5"/></svg>';
const WAIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>';

function stopCollecting() {
  clearInterval(collectTimer);
  clearInterval(collectPoll);
  collectTimer = null;
  collectPoll = null;
  armedFor = null;
}

function clockText(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/* Everything below the prescription detail: the code, the clock, the box for
   typing the patient's own code into. */
function drawCollectPanel(reference, armed) {
  const holder = document.getElementById('collectPanel');
  if (!holder) return;

  const collection = armed.collection;

  if (collection.status === 'collected') {
    holder.innerHTML = `
      <div class="collect-state done">${TICK_ICON}
        ${collection.confirmed_by === 'scan'
          ? t('collect.scanned', 'The patient scanned the code. Hand the medicine over.')
          : t('collect.typed', 'The code checked out. Hand the medicine over.')}
      </div>`;
    return;
  }

  holder.innerHTML = `
    <div class="collect-panel">
      <p class="label">${t('collect.show', 'Show this to the patient')}</p>

      <div class="qr-holder" id="qrHolder">${armed.qr || ''}</div>

      <p class="collect-timer" id="collectTimer">${clockText(armed.expires_in || 0)}</p>
      <p class="collect-hint">${t('collect.hint',
        'The patient scans this with the link from their email. It works once.')}</p>

      <div class="collect-state waiting" id="collectState">
        ${WAIT_ICON}${t('collect.waiting', 'Waiting for the patient to confirm…')}
      </div>

      <div class="code-entry">
        <input type="text" id="collectCode" maxlength="8" autocomplete="off"
               spellcheck="false" placeholder="ABC-123"
               aria-label="${t('collect.codeLabel', "The patient's code")}" />
        <button class="btn" type="button" id="submitCode">${t('collect.check', 'Check')}</button>
      </div>
      <p class="collect-hint" style="margin-top:8px">${t('collect.codeHint',
        'If their phone cannot scan, ask them to read their code out and type it here.')}</p>

      <div class="collect-foot">
        <button class="btn ghost" type="button" id="newCode">${t('collect.newCode', 'Show a new code')}</button>
        <button class="btn ghost" type="button" id="cancelCollect">${t('collect.cancel', 'Cancel')}</button>
      </div>
    </div>`;

  const box = document.getElementById('collectCode');
  box.focus();

  box.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); submitCode(reference); }
  });

  document.getElementById('submitCode').addEventListener('click', () => submitCode(reference));
  document.getElementById('newCode').addEventListener('click', () => armCollection(reference));

  document.getElementById('cancelCollect').addEventListener('click', async () => {
    stopCollecting();
    try {
      await callApi(`/api/prescriptions/${encodeURIComponent(reference)}/collection/cancel/`,
        { method: 'POST', body: JSON.stringify({}) });
    } catch (error) { /* the code expires on its own anyway */ }
    openPrescription(reference);
  });

  // The clock, and the poll that catches the patient confirming on their own
  // phone without anybody here pressing anything.
  let left = armed.expires_in || 0;
  clearInterval(collectTimer);
  collectTimer = setInterval(() => {
    left -= 1;
    const clock = document.getElementById('collectTimer');
    if (!clock) { stopCollecting(); return; }

    clock.textContent = clockText(Math.max(left, 0));
    clock.classList.toggle('low', left <= 60);

    if (left <= 0) {
      stopCollecting();
      toast(t('collect.expired', 'That code expired. Show a new one.'));
      openPrescription(reference);
    }
  }, 1000);

  clearInterval(collectPoll);
  collectPoll = setInterval(() => watchForPatient(reference), 2500);
}

async function watchForPatient(reference) {
  if (document.hidden) return;

  let data;
  try {
    data = await callApi(`/api/prescriptions/${encodeURIComponent(reference)}/collection/`);
  } catch (error) {
    return;
  }

  if (!data.collection) return;

  if (data.collection.status === 'collected') {
    stopCollecting();
    toast(t('collect.confirmed', 'The patient confirmed. Hand the medicine over.'));
    // Straight through: the patient has proved who they are, so the only thing
    // left is to take the stock off the shelf.
    finishDispense(reference);
  }
}

async function submitCode(reference) {
  const box = document.getElementById('collectCode');
  const button = document.getElementById('submitCode');
  if (!box) return;

  const code = box.value.trim().toUpperCase();
  if (!code) { box.focus(); return; }

  button.disabled = true;

  try {
    await callApi(`/api/prescriptions/${encodeURIComponent(reference)}/collection/code/`,
      { method: 'POST', body: JSON.stringify({ code }) });

    stopCollecting();
    toast(t('collect.codeOk', 'That is the right code. Hand the medicine over.'));
    finishDispense(reference);
  } catch (error) {
    toast(error.message);
    box.value = '';
    box.focus();
    button.disabled = false;

    // Locked out after too many wrong tries — the panel has to be redrawn,
    // because there is no live code on the screen any more.
    if (error.status === 429 || error.status === 410) {
      stopCollecting();
      openPrescription(reference);
    }
  }
}

/* Put a fresh code on the screen. */
async function armCollection(reference) {
  const button = document.getElementById('dispenseButton');
  if (button) {
    button.disabled = true;
    button.textContent = t('collect.arming', 'Getting a code…');
  }

  let armed;
  try {
    armed = await callApi(`/api/prescriptions/${encodeURIComponent(reference)}/arm/`,
      { method: 'POST', body: JSON.stringify({}) });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = t('action.dispense', 'Dispense');
    }

    // A script written before collection codes existed, or one for a patient
    // with no email: hand it over the old way, with a reason.
    if (error.data && error.data.no_collection) {
      handOverWithoutPatient(reference);
      return;
    }

    toast(error.message);
    return;
  }

  armedFor = reference;
  if (button) {
    button.hidden = true;
    button.disabled = false;
    button.textContent = t('action.dispense', 'Dispense');
  }

  drawCollectPanel(reference, armed);
}

/* The stock half, once the patient has confirmed. */
async function finishDispense(reference, reason) {
  try {
    const result = await callApi(
      `/api/prescriptions/${encodeURIComponent(reference)}/dispense/`,
      {
        method: 'POST',
        body: JSON.stringify(reason ? { without_confirmation_reason: reason } : {})
      }
    );

    toast(result.detail || `${reference} ${t('toast.dispensed', 'dispensed')}`);
    closeModal();
    await Promise.all([loadQueue(), loadStock()]);
  } catch (error) {
    toast(error.message);
  }
}

/* No email ever went out, or the patient cannot confirm. Allowed, but the
   pharmacist says why and it goes on the record. */
function handOverWithoutPatient(reference) {
  const reason = window.prompt(t('collect.whyNoPatient',
    'Handing over without the patient confirming. Why?'), '');

  if (reason === null) return;
  if (!reason.trim()) {
    toast(t('collect.needWhy', 'A reason is needed to hand over without a confirmation.'));
    return;
  }

  finishDispense(reference, reason.trim());
}

/* ==================================================================
   Dispensed

   What went out, who handed it over, and what the pharmacist said about the
   ones that went back to the prescriber.
   ================================================================== */

const dispensedRows = document.getElementById('dispensedRows');
const dispensedSearch = document.getElementById('dispensedSearch');

function outcomeTag(status) {
  if (status === 'dispensed') return `<span class="tag green">${t('outcome.dispensed', 'Dispensed')}</span>`;
  if (status === 'queried') return `<span class="tag moderate">${t('outcome.queried', 'Queried')}</span>`;
  if (status === 'cancelled') return `<span class="tag grey">${t('outcome.cancelled', 'Cancelled')}</span>`;
  return `<span class="tag">${t('outcome.waiting', 'Waiting')}</span>`;
}

function renderDispensed() {
  if (!queueLoaded) {
    dispensedRows.innerHTML = `<tr><td colspan="5" class="empty">${t('loading', 'Loading…')}</td></tr>`;
    return;
  }

  const term = dispensedSearch.value.trim().toLowerCase();
  const shown = dispensed.filter(item =>
    !term ||
    item.patient.toLowerCase().includes(term) ||
    item.reference.toLowerCase().includes(term) ||
    item.items.some(line => line.drug.toLowerCase().includes(term)));

  dispensedRows.innerHTML = shown.length ? shown.map(item => `
    <tr>
      <td class="id">${esc(item.patient)}<div class="sub">${esc(item.reference)}</div></td>
      <td class="sub">${esc(item.items.map(line =>
        // What actually went out, which is not always what was asked for.
        line.dispensed_quantity && line.dispensed_quantity !== line.quantity
          ? `${line.drug} \u00d7${line.dispensed_quantity} of ${line.quantity}`
          : line.quantity ? `${line.drug} \u00d7${line.quantity}` : line.drug
      ).join(', '))}</td>
      <td class="sub">${esc(item.doctor)}</td>
      <td>${outcomeTag(item.status)}${
        item.pharmacy_note ? `<div class="sub" style="margin-top:4px">${esc(item.pharmacy_note)}</div>` : ''
      }</td>
      <td class="sub">${esc(whenText(item.handled_at || item.created_at))}<div class="sub">${
        esc(item.handled_by || '')}</div></td>
    </tr>`).join('')
    : `<tr><td colspan="5" class="empty">${
        dispensed.length
          ? t('empty.dispensedSearch', 'Nothing matches that search.')
          : t('empty.dispensed', 'Nothing dispensed yet. Scripts appear here once they are handed over or sent back.')
      }</td></tr>`;
}

dispensedSearch.addEventListener('input', renderDispensed);

/* ==================================================================
   Patient files

   The same record the doctor writes and the admin reads in — one record in
   one place, so a dose a doctor corrected this morning is the dose shown
   here. This workspace reads it and downloads the original. It cannot change
   it, and if this page sent an edit anyway the server would refuse it.
   ================================================================== */

const patientRows = document.getElementById('patientRows');
const patientSearch = document.getElementById('patientSearch');
const conditionFilter = document.getElementById('conditionFilter');
const resultCount = document.getElementById('resultCount');

let patientFiles = [];
let patientsLoaded = false;
let patientsError = '';
let patientTotal = 0;
let patientShown = 0;

const INFO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.8h.01"/></svg>';

function gapState(detail) {
  return `<div class="gap">${INFO_ICON}<div>${esc(detail)}</div></div>`;
}

function renderPatients() {
  if (!patientsLoaded) {
    patientRows.innerHTML = `<tr><td colspan="6" class="empty">${t('loading', 'Loading…')}</td></tr>`;
    resultCount.textContent = '';
    return;
  }

  if (patientsError) {
    patientRows.innerHTML = `<tr><td colspan="6" class="empty">${esc(patientsError)}</td></tr>`;
    return;
  }

  patientRows.innerHTML = patientFiles.length ? patientFiles.map(p => `
    <tr>
      <td>
        <div class="who">
          <span class="initials">${esc(initials(p.full_name))}</span>
          <div>
            <strong>${esc(p.full_name)}</strong>
            <span>${[p.age, p.sex, p.ward].filter(v => v !== '' && v !== null && v !== undefined).map(esc).join(' · ')}</span>
          </div>
        </div>
      </td>
      <td class="id">${esc(p.file_number)}${p.needs_review
        ? ` <span class="tag review">${t('status.review', 'Not confirmed')}</span>` : ''}</td>
      <td><div class="chip-list" style="justify-content:flex-start">${
        (p.conditions.length ? p.conditions : ['—']).slice(0, 3).map(c => `<span class="tag">${esc(c)}</span>`).join('')
      }</div></td>
      <td><div class="chip-list" style="justify-content:flex-start">${
        p.allergies.length
          ? p.allergies.map(a => `<span class="tag severe">${esc(a)}</span>`).join('')
          : `<span class="tag grey">${t('f.noneRecorded', 'None recorded')}</span>`
      }</div></td>
      <td class="sub">${esc(whenText(p.updated_at))}</td>
      <td>
        <div class="row-actions">
          <button class="link-btn" data-patient="${esc(p.file_number)}">${t('action.open', 'Open')}</button>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${
        patientTotal
          ? t('empty.search', 'No patient file matches that search.')
          : t('empty.patients', 'No patient files on the system yet. Admin reads them in from the paper file.')
      }</td></tr>`;

  resultCount.textContent = patientTotal
    ? `${nf().format(patientShown)} ${t('result.of', 'of')} ${nf().format(patientTotal)} ${t('result.files', 'files')}`
    : '';
}

async function loadPatients() {
  const params = new URLSearchParams();
  if (patientSearch.value.trim()) params.set('q', patientSearch.value.trim());
  if (conditionFilter.value) params.set('condition', conditionFilter.value);

  try {
    const data = await callApi(`${API.patients}?${params}`);
    patientFiles = data.results;
    patientTotal = data.total;
    patientShown = data.shown;
    patientsError = '';

    const current = conditionFilter.value;
    conditionFilter.innerHTML =
      `<option value="">${t('patients.allConditions', 'All conditions')}</option>` +
      data.conditions.map(c =>
        `<option value="${esc(c)}"${c === current ? ' selected' : ''}>${esc(c)}</option>`).join('');
  } catch (error) {
    patientFiles = [];
    patientsError = error.message;
  }

  patientsLoaded = true;
  renderPatients();
}

let patientSearchTimer;
patientSearch.addEventListener('input', () => {
  clearTimeout(patientSearchTimer);
  patientSearchTimer = setTimeout(loadPatients, 220);
});
conditionFilter.addEventListener('change', loadPatients);

/* ---------- the file itself, read only ---------- */

const fileBackdrop = document.getElementById('fileBackdrop');

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
      ${fieldRow(t('f.language', 'Language'), patient.language)}
      ${fieldRow(t('f.phone', 'Phone'), patient.phone)}
      ${fieldRow(t('f.email', 'Email'), patient.email)}
      ${fieldRow(t('f.kin', 'Next of kin'), patient.next_of_kin)}
      ${fieldRow(t('f.kinPhone', 'Their number'), patient.next_of_kin_phone)}
    </div>`);

  const encounterBlock = sectionBlock('02', t('sec.encounter', 'Encounter and triage'), `
    <div class="field-grid">
      ${fieldRow(t('f.date', 'Date'), encounter.date)}
      ${fieldRow(t('f.time', 'Time'), encounter.time)}
      ${fieldRow(t('f.type', 'Type'), encounter.type)}
      ${fieldRow(t('f.triage', 'Triage'), encounter.triage)}
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
       <p class="pdf-note">${t('f.wasText',
         'The record on the left was read from this document. Worth a look if something does not add up.')}</p>`
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

async function openPatientFile(fileNumber) {
  document.getElementById('fileTitle').textContent = t('loading', 'Loading…');
  document.getElementById('fileSub').textContent = fileNumber;
  document.getElementById('fileBody').innerHTML = '';
  document.getElementById('fileTools').innerHTML = '';
  document.getElementById('fileFoot').textContent = '';
  fileBackdrop.classList.add('open');

  let patient;
  try {
    patient = (await callApi(API.patients + encodeURIComponent(fileNumber) + '/')).patient;
  } catch (error) {
    document.getElementById('fileTitle').textContent = t('f.notFound', 'File not found');
    document.getElementById('fileBody').innerHTML = gapState(error.message);
    return;
  }

  document.getElementById('fileTitle').textContent = patient.full_name;
  document.getElementById('fileSub').textContent =
    [patient.file_number, patient.ward, patient.age !== null && patient.age !== undefined
      ? `${patient.age} ${t('f.years', 'years')}` : ''].filter(Boolean).join(' · ');

  const firstDoc = (patient.documents || []).find(d => d.download_url);

  document.getElementById('fileTools').innerHTML = `
    ${patient.needs_review ? `<span class="tag review">${t('status.review', 'Not confirmed')}</span>` : ''}
    ${firstDoc ? `<button class="btn ghost" type="button" data-download="${firstDoc.id}">${t('action.retrieve', 'Download original')}</button>` : ''}`;

  document.getElementById('fileBody').innerHTML = `
    ${patient.needs_review ? `
      <div class="flagged">
        ${WARN_ICON}
        <div>
          <strong>${t('f.reviewTitle', 'Not yet confirmed by a doctor')}</strong>
          ${t('f.reviewBodyPharmacy', 'These details were read out of the uploaded document and no doctor has checked them against it yet. Worth a word with the prescriber before dispensing against this file.')}
        </div>
      </div>` : ''}

    ${patient.allergies && patient.allergies.length ? `
      <div class="flagged">
        ${WARN_ICON}
        <div>
          <strong>${t('f.allergyTitle', 'Allergies on file')}</strong>
          ${esc(patient.allergies.join(', '))}
        </div>
      </div>` : ''}

    <div class="sheet-cols">
      <div>${recordHtml(patient)}</div>
      <div class="original">${originalHtml(patient)}${historyHtml(patient)}</div>
    </div>`;

  document.getElementById('fileFoot').textContent = patient.confirmed_at
    ? `${t('f.confirmedBy', 'Confirmed by')} ${patient.confirmed_by || '—'} · ${whenText(patient.confirmed_at)}`
    : `${t('f.created', 'Created')} ${whenText(patient.created_at)}${patient.created_by ? ' · ' + patient.created_by : ''}`;
}

patientRows.addEventListener('click', event => {
  const button = event.target.closest('button[data-patient]');
  if (button) openPatientFile(button.dataset.patient);
});

/* Downloading goes through Django, which checks the session before handing
   over a single byte. The storage URL never reaches the browser. */
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-download]');
  if (button) window.open(`${API.files}${button.dataset.download}/download/`, '_blank', 'noopener');
});

function closeFile() { fileBackdrop.classList.remove('open'); }

document.getElementById('closeFile').addEventListener('click', closeFile);
fileBackdrop.addEventListener('click', event => { if (event.target === fileBackdrop) closeFile(); });

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
  const outOfStock = stock.filter(s => s.status === 'out').length;

  document.getElementById('statWaiting').textContent = nf().format(counts.waiting);
  document.getElementById('statWaitingDelta').textContent = t('delta.queue', 'in the queue now');
  document.getElementById('statFlagged').textContent = nf().format(counts.flagged);
  document.getElementById('statFlaggedDelta').textContent = t('delta.check', 'need checking');
  document.getElementById('statDispensed').textContent = nf().format(counts.dispensed_today);
  document.getElementById('statDispensedDelta').textContent = t('delta.today', 'today');
  document.getElementById('statOut').textContent = nf().format(outOfStock);
  document.getElementById('statOutDelta').textContent = t('delta.reorder', 'need reordering');

  renderQueue();
  renderStock();
  renderDispensed();
  renderPatients();
}

/* ==================================================================
   Boot
   ================================================================== */

(async function start() {
  const me = await requireSession();
  if (!me) return;

  render();
  loadPatients();
  loadStock();
  loadQueue();

  // Somebody else is dispensing from the same shelf, so the queue and the
  // levels are refreshed while this tab is being looked at.
  setInterval(() => {
    if (document.hidden) return;
    loadQueue();
    loadStock();
  }, 30000);
})();