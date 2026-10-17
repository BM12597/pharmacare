/* PharmaCare+ — research workspace.
   The modelling happens in Django with pandas and scikit-learn. This file
   uploads the data, shows what came back, and draws the charts as SVG. */

const API = {
  me: '/api/auth/me/',
  logout: '/api/auth/logout/',
  profile: '/api/research/profile/',
  train: '/api/research/train/',
  review: '/api/research/review/',
  models: '/api/research/models/',
  settings: '/api/research/settings/'
};

const LOGIN_URL = '/login/';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/* Every call that changes something goes through here, so the CSRF header and
   the error handling are written once. */
async function callApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'That did not work.');
  return data;
}

async function requireSession() {
  try {
    const response = await fetch(API.me, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('no session');

    const me = await response.json();
    if (me.role !== 'researcher' && !me.is_superuser) throw new Error('wrong workspace');

    document.querySelector('.side-user').textContent = me.full_name || me.user_id;
    document.querySelector('.side-role').textContent = `${me.role_label} \u00b7 ${me.user_id}`;
  } catch (error) {
    window.location.href = LOGIN_URL;
  }
}

requireSession();

/* ==================================================================
   Translations
   ================================================================== */

const STRINGS = {
  en: {},
  af: {
    'nav.dataset': 'Datastel', 'nav.results': 'Resultate', 'nav.review': 'Hersienlys', 'nav.settings': 'Instellings',
    'action.signout': 'Teken uit',
    'dataset.title': 'Datastel', 'dataset.sub': 'Laai data op, gaan dit na, en lei dan af.',
    'results.title': 'Resultate', 'results.sub': 'Twee modelle op dieselfde verdeling.',
    'review.title': 'Hersienlys', 'review.sub': 'Pare waaroor die model onseker was.',
    'settings.title': 'Instellings', 'settings.theme': 'Tema', 'settings.light': 'Lig', 'settings.dark': 'Donker',
    'settings.language': 'Taal', 'settings.save': 'Stoor instellings'
  },
  zu: {
    'nav.dataset': 'Idatha', 'nav.results': 'Imiphumela', 'nav.review': 'Okuhlolwayo', 'nav.settings': 'Izilungiselelo',
    'action.signout': 'Phuma',
    'dataset.title': 'Idatha', 'dataset.sub': 'Layisha idatha, uyihlole, bese uqeqesha.',
    'results.title': 'Imiphumela', 'results.sub': 'Amamodeli amabili kudatha efanayo.',
    'review.title': 'Okudinga ukuhlolwa', 'review.sub': 'Imithi imodeli engaqiniseki ngayo.',
    'settings.title': 'Izilungiselelo', 'settings.theme': 'Itimu', 'settings.light': 'Okukhanyayo',
    'settings.dark': 'Okumnyama', 'settings.language': 'Ulimi', 'settings.save': 'Londoloza'
  },
  nso: {
    'nav.dataset': 'Datha', 'nav.results': 'Dipoelo', 'nav.review': 'Tše di nyakago tlhahlobo', 'nav.settings': 'Dipeakanyo',
    'action.signout': 'Tšwa',
    'dataset.title': 'Datha', 'dataset.sub': 'Romela datha, o e hlahlobe, o tlwaetše mmotlolo.',
    'results.title': 'Dipoelo', 'results.sub': 'Mebotlolo e mebedi go datha e tee.',
    'review.title': 'Tlhahlobo', 'review.sub': 'Dihlare tšeo mmotlolo o sa kgonego go di tseba.',
    'settings.title': 'Dipeakanyo', 'settings.theme': 'Sebopego', 'settings.light': 'Seedi',
    'settings.dark': 'Leswiswi', 'settings.language': 'Leleme', 'settings.save': 'Boloka'
  }
};

let lang = 'en';

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
}

const nf = new Intl.NumberFormat('en-ZA');
const pct = value => value === null || value === undefined ? '—' : (value * 100).toFixed(1) + '%';

/* ==================================================================
   Navigation
   ================================================================== */

function showPanel(name) {
  document.querySelectorAll('.side-nav button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));

  // Both of these can change from another workspace between visits, so they
  // are fetched on the way in rather than once at startup.
  if (name === 'review') loadReview();
  if (name === 'models') loadModels();
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

document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });

/* ==================================================================
   Upload and profile
   ================================================================== */

let currentFile = null;
let currentProfile = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileState = document.getElementById('fileState');
const profilePanel = document.getElementById('profilePanel');
const resultsPanel = document.getElementById('resultsPanel');

function setStep(step) {
  document.querySelectorAll('.step-chip').forEach(chip => {
    const number = Number(chip.dataset.step);
    chip.classList.toggle('active', number === step);
    chip.classList.toggle('done', number < step);
  });
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});

['dragenter', 'dragover'].forEach(type =>
  dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(type =>
  dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('drag'); }));

dropzone.addEventListener('drop', event => {
  if (event.dataTransfer.files.length) handleFile(event.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
  fileInput.value = '';
});

function readableSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleFile(file) {
  currentFile = file;
  resultsPanel.innerHTML = '';

  fileState.innerHTML = `<div class="run-state"><span class="spinner"></span>${t('state.reading', 'Reading')} ${file.name} \u00b7 ${readableSize(file.size)}</div>`;
  profilePanel.innerHTML = '';

  const body = new FormData();
  body.append('file', file);

  try {
    const response = await fetch(API.profile, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
      body
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      fileState.innerHTML = `<div class="warn-strip">${data.detail || t('error.read', 'That file could not be read.')}</div>`;
      return;
    }

    currentProfile = data;
    fileState.innerHTML = `<div class="run-state">${file.name} \u00b7 ${readableSize(file.size)} \u00b7 ${nf.format(data.rows)} ${t('label.rows', 'rows')} \u00b7 ${data.columns.length} ${t('label.columns', 'columns')}</div>`;
    drawProfile(data);
    setStep(2);
  } catch (error) {
    fileState.innerHTML = `<div class="warn-strip">${t('error.server', 'Cannot reach the server.')}</div>`;
  }
}

function drawProfile(data) {
  const quality = data.columns.filter(c => c.missing > 0);

  // A file of interacting pairs has no label column, so the usual setup does
  // not apply. Offer the graph pipeline instead.
  if (data.edge_list) {
    drawPairSetup(data);
    return;
  }

  const columnPickers = data.columns
    .filter(c => c.name !== data.suggested_target)
    .map(column => {
      const checked = data.suggested_features.includes(column.name) ? 'checked' : '';
      return `
        <label class="col-pick">
          <input type="checkbox" value="${column.name}" ${checked} />
          <span class="col-name">${column.name}</span>
          <span class="col-meta">${column.kind} \u00b7 ${column.unique} ${t('label.unique', 'unique')}${column.missing ? ` \u00b7 ${column.missing_pct}% ${t('label.missing', 'missing')}` : ''}</span>
        </label>`;
    }).join('');

  const previewKeys = data.columns.slice(0, 9).map(c => c.name);

  profilePanel.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h3>${t('profile.title', 'What is in the file')}</h3>
      <p class="card-sub">${nf.format(data.rows)} ${t('label.rows', 'rows')} \u00b7 ${data.columns.length} ${t('label.columns', 'columns')}${quality.length ? ` \u00b7 ${quality.length} ${t('label.withMissing', 'with missing values')}` : ` \u00b7 ${t('label.noMissing', 'no missing values')}`}</p>

      <div class="scroll-x">
        <table class="mini-table">
          <thead><tr>${previewKeys.map(k => `<th>${k}</th>`).join('')}</tr></thead>
          <tbody>
            ${data.preview.slice(0, 5).map(row =>
              `<tr>${previewKeys.map(k => `<td class="sub">${row[k] === null || row[k] === undefined ? '—' : row[k]}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>${t('profile.setup', 'Set up the run')}</h3>
      <p class="card-sub">${t('profile.setupSub', 'Confirm what to predict, and which columns the model may use.')}</p>

      <div class="field" style="max-width:340px;margin-bottom:16px">
        <label for="targetSelect">${t('profile.target', 'Column to predict')}</label>
        <select id="targetSelect">
          ${data.columns.map(c =>
            `<option value="${c.name}" ${c.name === data.suggested_target ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>

      <p class="chart-title">${t('profile.features', 'Features')}</p>
      <div id="featureList">${columnPickers}</div>

      <div class="send-row">
        <button class="btn" type="button" id="runTraining">${t('action.train', 'Train the model')}</button>
        <button class="btn ghost" type="button" id="selectAll">${t('action.selectAll', 'Select all')}</button>
        <button class="btn ghost" type="button" id="selectNone">${t('action.selectNone', 'Clear')}</button>
      </div>

      <div id="runState" style="margin-top:14px"></div>
    </div>`;

  // Changing the target has to remove it from the feature list, or the model
  // is handed the answer.
  document.getElementById('targetSelect').addEventListener('change', event => {
    const target = event.target.value;
    document.querySelectorAll('#featureList .col-pick').forEach(row => {
      const isTarget = row.querySelector('input').value === target;
      row.style.display = isTarget ? 'none' : '';
      if (isTarget) row.querySelector('input').checked = false;
    });
  });

  document.getElementById('selectAll').addEventListener('click',
    () => document.querySelectorAll('#featureList input').forEach(box => {
      if (box.closest('.col-pick').style.display !== 'none') box.checked = true;
    }));

  document.getElementById('selectNone').addEventListener('click',
    () => document.querySelectorAll('#featureList input').forEach(box => { box.checked = false; }));

  document.getElementById('runTraining').addEventListener('click', runTraining);
}

function drawPairSetup(data) {
  const edge = data.edge_list;
  const previewKeys = data.columns.slice(0, 6).map(c => c.name);

  profilePanel.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h3>${t('profile.title', 'What is in the file')}</h3>
      <p class="card-sub">${nf.format(data.rows)} ${t('label.rows', 'rows')} \u00b7 ${data.columns.length} ${t('label.columns', 'columns')} \u00b7 ${nf.format(edge.nodes)} ${t('label.distinctDrugs', 'distinct drugs')}</p>

      <div class="scroll-x">
        <table class="mini-table">
          <thead><tr>${previewKeys.map(k => `<th>${k}</th>`).join('')}</tr></thead>
          <tbody>
            ${data.preview.slice(0, 5).map(row =>
              `<tr>${previewKeys.map(k => `<td class="sub">${row[k] === null || row[k] === undefined ? '—' : row[k]}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>${t('pairs.title', 'Every row here is an interaction')}</h3>
      <p class="card-sub">${t('pairs.sub', 'There is no column saying which pairs do not interact, so there is nothing to separate yet.')}</p>

      <div class="warn-strip">
        ${WARN_ICON}
        <div>${t('pairs.explain', 'A model needs both kinds of example. Pairs that are listed become positives, and pairs of drugs that never appear together are sampled as negatives. Each pair is then described by its position in the interaction graph — how many partners each drug has, how many they share, and three link-prediction scores — so the model learns from structure rather than from the drug names.')}</div>
      </div>

      <div class="field" style="max-width:340px;margin-bottom:14px">
        <label for="pairLeft">${t('pairs.columns', 'Drug columns')}</label>
        <div style="display:flex;gap:8px">
          <select id="pairLeft">${data.columns.map(c => `<option ${c.name === edge.left ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
          <select id="pairRight">${data.columns.map(c => `<option ${c.name === edge.right ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        </div>
      </div>

      <div class="field" style="max-width:340px">
        <label for="negativeRatio">${t('pairs.ratio', 'Negative pairs to generate')}</label>
        <select id="negativeRatio">
          <option value="0.5">${t('pairs.half', 'Half as many as positives')}</option>
          <option value="1" selected>${t('pairs.equal', 'One for each positive (balanced)')}</option>
          <option value="2">${t('pairs.double', 'Twice as many (closer to reality)')}</option>
        </select>
        <p class="hint" style="margin-top:6px">${t('pairs.ratioNote', 'Real prescriptions contain far more safe pairs than dangerous ones. A balanced set is easier to read; an unbalanced one is more honest.')}</p>
      </div>

      <div class="send-row">
        <button class="btn" type="button" id="runPairTraining">${t('action.buildTrain', 'Build the dataset and train')}</button>
      </div>

      <div id="runState" style="margin-top:14px"></div>
    </div>`;

  document.getElementById('runPairTraining').addEventListener('click', runPairTraining);
}

async function runPairTraining() {
  const left = document.getElementById('pairLeft').value;
  const right = document.getElementById('pairRight').value;

  if (left === right) { toast(t('error.sameColumn', 'Pick two different columns.')); return; }

  const runState = document.getElementById('runState');
  const button = document.getElementById('runPairTraining');
  button.disabled = true;
  runState.innerHTML = `<div class="run-state"><span class="spinner"></span>${t('state.building', 'Building the interaction graph and training. This takes a few seconds on a large file.')}</div>`;

  const body = new FormData();
  body.append('file', currentFile);
  body.append('pair_left', left);
  body.append('pair_right', right);
  body.append('negative_ratio', document.getElementById('negativeRatio').value);

  try {
    const response = await fetch(API.train, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
      body
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      runState.innerHTML = `<div class="warn-strip">${data.detail || t('error.train', 'Training failed.')}</div>`;
      return;
    }

    runState.innerHTML = `<div class="run-state">${t('state.done', 'Done. Results are in the Results section, and the run has been kept under Models.')}</div>`;
    setStep(3);
    drawResults(data);
    showPanel('results');
    loadModels();
  } catch (error) {
    runState.innerHTML = `<div class="warn-strip">${t('error.server', 'Cannot reach the server.')}</div>`;
  } finally {
    button.disabled = false;
  }
}

/* ==================================================================
   Training
   ================================================================== */

async function runTraining() {
  if (!currentFile) { toast(t('error.noFile', 'Upload a file first.')); return; }

  const target = document.getElementById('targetSelect').value;
  const features = [...document.querySelectorAll('#featureList input:checked')].map(box => box.value);

  if (!features.length) { toast(t('error.noFeatures', 'Choose at least one feature.')); return; }

  const runState = document.getElementById('runState');
  const button = document.getElementById('runTraining');
  button.disabled = true;
  runState.innerHTML = `<div class="run-state"><span class="spinner"></span>${t('state.training', 'Training on')} ${nf.format(currentProfile.rows)} ${t('label.rows', 'rows')}\u2026</div>`;

  const body = new FormData();
  body.append('file', currentFile);
  body.append('target', target);
  body.append('features', JSON.stringify(features));
  body.append('test_size', document.getElementById('setTestSize').value);

  try {
    const response = await fetch(API.train, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
      body
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      runState.innerHTML = `<div class="warn-strip">${data.detail || t('error.train', 'Training failed.')}</div>`;
      return;
    }

    runState.innerHTML = `<div class="run-state">${t('state.done', 'Done. Results are in the Results section, and the run has been kept under Models.')}</div>`;
    setStep(3);
    drawResults(data);
    showPanel('results');
    loadModels();
  } catch (error) {
    runState.innerHTML = `<div class="warn-strip">${t('error.server', 'Cannot reach the server.')}</div>`;
  } finally {
    button.disabled = false;
  }
}

/* ==================================================================
   Charts
   ================================================================== */

const WARN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.4v4.2M12 17.2h.01"/></svg>';

/* A curve on unit axes: ROC and precision-recall both fit this shape. */
function curveChart(points, { diagonal = false, xLabel = '', yLabel = '' } = {}) {
  if (!points || !points.length) return `<p class="card-sub">${t('chart.noCurve', 'Only drawn for a two-class label.')}</p>`;

  const w = 260, h = 200, pad = 34;
  const px = x => pad + x * (w - pad - 10);
  const py = y => h - pad - y * (h - pad - 14);

  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const value = i / 4;
    grid += `<line x1="${px(0)}" y1="${py(value)}" x2="${px(1)}" y2="${py(value)}" stroke="var(--line)" stroke-width="1"/>`;
    grid += `<text x="${px(0) - 6}" y="${py(value) + 3.5}" font-size="9" fill="var(--muted)" text-anchor="end">${value.toFixed(1)}</text>`;
  }

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%">
      ${grid}
      ${diagonal ? `<line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(1)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 4" opacity=".5"/>` : ''}
      <path d="${path} L ${px(points[points.length - 1].x).toFixed(1)} ${py(0).toFixed(1)} L ${px(points[0].x).toFixed(1)} ${py(0).toFixed(1)} Z" fill="var(--green)" opacity=".1"/>
      <path d="${path}" fill="none" stroke="var(--green)" stroke-width="2.2" stroke-linejoin="round"/>
      <text x="${px(0.5)}" y="${h - 6}" font-size="10" fill="var(--muted)" text-anchor="middle">${xLabel}</text>
      <text x="10" y="${py(0.5)}" font-size="10" fill="var(--muted)" text-anchor="middle" transform="rotate(-90 10 ${py(0.5)})">${yLabel}</text>
    </svg>`;
}

/* Confusion matrix drawn as a heatmap, since that is what it is. */
function confusionChart(confusion) {
  const { labels, matrix } = confusion;
  const size = labels.length;
  const cell = size > 4 ? 46 : 62;
  const left = 66, top = 28;
  const w = left + cell * size + 10;
  const h = top + cell * size + 30;

  const max = Math.max(...matrix.flat(), 1);
  let cells = '';

  matrix.forEach((row, r) => {
    row.forEach((value, c) => {
      const intensity = value / max;
      const x = left + c * cell;
      const y = top + r * cell;
      const correct = r === c;

      cells += `
        <rect x="${x}" y="${y}" width="${cell - 3}" height="${cell - 3}" rx="5"
              fill="var(--green)" opacity="${(0.08 + intensity * 0.82).toFixed(2)}"/>
        <text x="${x + (cell - 3) / 2}" y="${y + (cell - 3) / 2 + 4}" font-size="12"
              font-weight="${correct ? 800 : 600}" text-anchor="middle"
              fill="${intensity > 0.55 ? 'var(--surface)' : 'var(--ink)'}">${value}</text>`;
    });

    cells += `<text x="${left - 8}" y="${top + r * cell + cell / 2}" font-size="10" fill="var(--muted)" text-anchor="end">${labels[r]}</text>`;
  });

  labels.forEach((label, c) => {
    cells += `<text x="${left + c * cell + (cell - 3) / 2}" y="${top - 9}" font-size="10" fill="var(--muted)" text-anchor="middle">${label}</text>`;
  });

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px">
      ${cells}
      <text x="${left + (cell * size) / 2}" y="${h - 8}" font-size="10" fill="var(--muted)" text-anchor="middle">${t('chart.predicted', 'predicted')}</text>
      <text x="12" y="${top + (cell * size) / 2}" font-size="10" fill="var(--muted)" text-anchor="middle" transform="rotate(-90 12 ${top + (cell * size) / 2})">${t('chart.actual', 'actual')}</text>
    </svg>`;
}

/* Correlation between numeric features, red for negative and green for positive. */
function correlationChart(correlation) {
  const { labels, matrix } = correlation;
  if (!labels.length) return `<p class="card-sub">${t('chart.noCorr', 'Needs at least two numeric columns.')}</p>`;

  const size = labels.length;
  const cell = size > 8 ? 26 : 34;
  const left = 96, top = 96;
  const w = left + cell * size + 8;
  const h = top + cell * size + 8;

  let cells = '';

  matrix.forEach((row, r) => {
    row.forEach((value, c) => {
      const x = left + c * cell;
      const y = top + r * cell;
      const colour = value >= 0 ? 'var(--green)' : 'var(--danger)';

      cells += `
        <rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" rx="3"
              fill="${colour}" opacity="${Math.min(Math.abs(value), 1).toFixed(2)}">
          <title>${labels[r]} vs ${labels[c]}: ${value}</title>
        </rect>`;

      if (size <= 8) {
        cells += `<text x="${x + (cell - 2) / 2}" y="${y + (cell - 2) / 2 + 3}" font-size="8"
                  text-anchor="middle" fill="${Math.abs(value) > 0.6 ? 'var(--surface)' : 'var(--muted)'}">${value.toFixed(1)}</text>`;
      }
    });

    cells += `<text x="${left - 6}" y="${top + r * cell + cell / 2}" font-size="9" fill="var(--muted)" text-anchor="end">${labels[r].slice(0, 16)}</text>`;
  });

  labels.forEach((label, c) => {
    const x = left + c * cell + (cell - 2) / 2;
    cells += `<text x="${x}" y="${top - 6}" font-size="9" fill="var(--muted)" text-anchor="start" transform="rotate(-55 ${x} ${top - 6})">${label.slice(0, 16)}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%">${cells}</svg>`;
}

function weightBars(items, valueKey = 'weight') {
  if (!items || !items.length) return `<p class="card-sub">${t('chart.noWeights', 'Nothing to show for this model.')}</p>`;

  const max = Math.max(...items.map(i => Math.abs(i[valueKey]))) || 1;

  return items.map(item => {
    const value = item[valueKey];
    const width = (Math.abs(value) / max) * 100;
    return `
      <div class="bar-row">
        <div class="bar-top">
          <span title="${item.feature}">${item.feature}</span>
          <span>${value >= 0 ? '+' : ''}${value.toFixed(3)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${value < 0 ? 'negative' : ''}" style="width:${width}%"></div></div>
      </div>`;
  }).join('');
}

function balanceBars(balance) {
  const total = balance.reduce((sum, item) => sum + item.count, 0) || 1;

  return balance.map(item => `
    <div class="bar-row">
      <div class="bar-top"><span>${item.label}</span><span>${nf.format(item.count)} · ${((item.count / total) * 100).toFixed(1)}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(item.count / total) * 100}%"></div></div>
    </div>`).join('');
}

const MODEL_NAMES = {
  logistic_regression: 'Logistic regression',
  lightgbm: 'LightGBM'
};

function drawResults(data) {
  const warnings = (data.warnings || []).map(text =>
    `<div class="warn-strip">${WARN_ICON}<div>${text}</div></div>`).join('');

  const models = Object.entries(data.models).map(([key, model]) => {
    const m = model.metrics;
    const isBest = key === data.best_model;

    return `
      <div class="card model-card">
        <div class="model-head">
          <h3>${MODEL_NAMES[key] || key}</h3>
          ${isBest ? `<span class="tag green">${t('label.best', 'Best on F1')}</span>` : ''}
          ${model.cv_mean !== null && model.cv_mean !== undefined
            ? `<span class="tag">${t('label.cv', '5-fold CV')} ${pct(model.cv_mean)} ± ${(model.cv_std * 100).toFixed(1)}</span>` : ''}
        </div>

        <div class="metric-row">
          <div class="metric"><strong>${pct(m.accuracy)}</strong><span>${t('metric.accuracy', 'Accuracy')}</span></div>
          <div class="metric"><strong>${pct(m.precision)}</strong><span>${t('metric.precision', 'Precision')}</span></div>
          <div class="metric"><strong>${pct(m.recall)}</strong><span>${t('metric.recall', 'Recall')}</span></div>
          <div class="metric"><strong>${pct(m.f1)}</strong><span>${t('metric.f1', 'F1')}</span></div>
          <div class="metric"><strong>${m.roc_auc === null ? '—' : m.roc_auc.toFixed(3)}</strong><span>${t('metric.auc', 'ROC AUC')}</span></div>
        </div>

        <div class="chart-pair">
          <div>
            <p class="chart-title">${t('chart.confusion', 'Confusion matrix')}</p>
            ${confusionChart(model.confusion)}
          </div>
          <div>
            <p class="chart-title">${t('chart.roc', 'ROC curve')}</p>
            ${curveChart(model.roc, { diagonal: true, xLabel: 'false positive rate', yLabel: 'true positive rate' })}
          </div>
          <div>
            <p class="chart-title">${t('chart.pr', 'Precision-recall')}</p>
            ${curveChart(model.pr, { xLabel: 'recall', yLabel: 'precision' })}
          </div>
        </div>

        <div style="margin-top:20px">
          <p class="chart-title">${key === 'logistic_regression'
            ? t('chart.coefficients', 'Coefficients — which features push the prediction, and which way')
            : t('chart.importances', 'Permutation importance — how much accuracy drops when a feature is shuffled')}</p>
          ${key === 'logistic_regression'
            ? weightBars(model.coefficients)
            : weightBars(model.importances)}
        </div>
      </div>`;
  }).join('');

  const graph = data.graph ? `
    <div class="card" style="margin-bottom:14px">
      <h3>${t('results.graph', 'The interaction graph')}</h3>
      <p class="card-sub">${t('results.graphSub', 'Built from the pairs in the file, before any training')}</p>
      <div class="metric-row">
        <div class="metric"><strong>${nf.format(data.graph.nodes)}</strong><span>${t('graph.nodes', 'Drugs')}</span></div>
        <div class="metric"><strong>${nf.format(data.graph.documented_pairs)}</strong><span>${t('graph.pairs', 'Documented pairs')}</span></div>
        <div class="metric"><strong>${data.graph.mean_degree}</strong><span>${t('graph.mean', 'Mean partners')}</span></div>
        <div class="metric"><strong>${nf.format(data.graph.max_degree)}</strong><span>${t('graph.max', 'Most connected')}</span></div>
        <div class="metric"><strong>${(data.graph.density * 100).toFixed(1)}%</strong><span>${t('graph.density', 'Density')}</span></div>
      </div>
      <p class="hint" style="margin-top:12px">${t('graph.note', 'Trained on')} ${nf.format(data.graph.positives_used)} ${t('graph.positives', 'documented pairs and')} ${nf.format(data.graph.negatives_generated)} ${t('graph.negatives', 'generated negatives.')}</p>
    </div>` : '';

  resultsPanel.innerHTML = `
    ${warnings}
    ${graph}

    <div class="card" style="margin-bottom:14px">
      <h3>${t('results.run', 'This run')}</h3>
      <p class="card-sub">${t('results.runSub', 'Predicting')} <strong>${data.target}</strong> \u00b7 ${data.classes.length} ${t('label.classes', 'classes')} \u00b7 ${nf.format(data.rows_trained)} ${t('label.trainRows', 'training rows')}, ${nf.format(data.rows_tested)} ${t('label.testRows', 'held back')}</p>

      <div class="chart-pair">
        <div>
          <p class="chart-title">${t('chart.balance', 'Class balance')}</p>
          ${balanceBars(data.class_balance)}
          <p class="hint" style="margin-top:8px">${t('chart.balanceNote', 'A badly skewed label makes accuracy misleading. Look at F1 instead.')}</p>
        </div>
        <div>
          <p class="chart-title">${t('chart.correlation', 'Feature correlation')}</p>
          ${correlationChart(data.correlation)}
          <p class="hint" style="margin-top:8px">${t('chart.corrNote', 'Two features that move together add little over one of them.')}</p>
        </div>
      </div>
    </div>

    ${models}`;

  // Grow the bars once they are on screen.
  requestAnimationFrame(() => {
    document.querySelectorAll('#resultsPanel .bar-fill').forEach((fill, index) => {
      const target = fill.style.width;
      fill.style.width = '0%';
      setTimeout(() => { fill.style.width = target; }, 40 + index * 25);
    });
  });
}

/* ==================================================================
   Review queue

   Pairs the model was not sure about. A decision here is not a note to self:
   the server applies it to every later screening run, which is the only
   reason the queue is worth filling in.
   ================================================================== */

let reviewItems = [];
let reviewCounts = { waiting: 0, confirmed: 0, rejected: 0 };
let reviewThreshold = 70;

const reviewRows = document.getElementById('reviewRows');
const reviewSearch = document.getElementById('reviewSearch');
const reviewStatus = document.getElementById('reviewStatus');
const reviewSummary = document.getElementById('reviewSummary');
const reviewBadge = document.getElementById('reviewCount');

async function loadReview() {
  const params = new URLSearchParams({
    status: reviewStatus.value,
    q: reviewSearch.value.trim()
  });

  reviewRows.innerHTML = `<tr><td colspan="5" class="empty">${t('state.loading', 'Loading\u2026')}</td></tr>`;

  try {
    const data = await callApi(`${API.review}?${params}`);
    reviewItems = data.items;
    reviewCounts = data.counts;
    reviewThreshold = data.threshold;
    renderReview();
  } catch (error) {
    reviewRows.innerHTML = `<tr><td colspan="5" class="empty">${error.message}</td></tr>`;
  }
}

function confidenceClass(value) {
  if (value === null || value === undefined) return '';
  if (value < 0.55) return 'verylow';
  if (value < 0.65) return 'low';
  return '';
}

function renderReview() {
  reviewBadge.hidden = !reviewCounts.waiting;
  reviewBadge.textContent = reviewCounts.waiting;

  reviewSummary.textContent =
    `${reviewCounts.waiting} ${t('review.countWaiting', 'waiting')} \u00b7 ` +
    `${reviewCounts.confirmed} ${t('review.countConfirmed', 'confirmed')} \u00b7 ` +
    `${reviewCounts.rejected} ${t('review.countRejected', 'rejected')} \u00b7 ` +
    `${t('review.thresholdNote', 'queued below')} ${reviewThreshold}% ${t('review.confidence', 'confidence')}`;

  if (!reviewItems.length) {
    reviewRows.innerHTML = `<tr><td colspan="5" class="empty">${
      reviewStatus.value === 'waiting'
        ? t('empty.review', 'Nothing waiting for review. Pairs arrive here when a prescription is screened and the model is unsure.')
        : t('empty.reviewFiltered', 'Nothing here.')
    }</td></tr>`;
    return;
  }

  reviewRows.innerHTML = reviewItems.map(item => {
    const decided = item.status !== 'waiting';
    const confidence = item.confidence;

    return `
    <tr>
      <td>
        <div class="pair-cell">
          <strong>${item.pair}</strong>
          <span>${item.times_seen > 1
            ? `${t('review.seen', 'seen')} ${item.times_seen}\u00d7`
            : t('review.seenOnce', 'seen once')}${item.context ? ` \u00b7 ${item.context}` : ''}</span>
        </div>
      </td>
      <td>
        ${confidence === null || confidence === undefined
          ? `<span class="sub">${t('review.noScore', 'no model score')}</span>`
          : `<div class="confidence">
               <div class="bar-track"><div class="bar-fill ${confidenceClass(confidence)}" style="width:${confidence * 100}%"></div></div>
               <span>${(confidence * 100).toFixed(0)}%</span>
             </div>`}
      </td>
      <td><span class="tag ${item.prediction === 'interaction' ? 'moderate' : item.prediction === 'unknown' ? 'grey' : 'green'}">${item.prediction}</span></td>
      <td class="sub">${item.source_label}${decided
        ? `<br>${t('review.decidedBy', 'decided by')} ${item.decided_by || '\u2014'}`
        : ''}</td>
      <td>
        <div class="row-actions">
          ${decided
            ? `<span class="tag ${item.status === 'confirmed' ? 'moderate' : 'green'}">${item.status_label}</span>
               <button class="link-btn" data-reopen="${item.id}">${t('action.reopen', 'Reopen')}</button>`
            : `<button class="link-btn" data-confirm="${item.id}">${t('action.confirm', 'Confirm')}</button>
               <button class="link-btn danger" data-reject="${item.id}">${t('action.reject', 'Reject')}</button>`}
        </div>
      </td>
    </tr>`;
  }).join('');
}

let searchTimer;
reviewSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadReview, 250);
});

reviewStatus.addEventListener('change', loadReview);

reviewRows.addEventListener('click', async event => {
  const button = event.target.closest('button[data-confirm], button[data-reject], button[data-reopen]');
  if (!button) return;

  const id = button.dataset.confirm || button.dataset.reject || button.dataset.reopen;
  const decision = button.dataset.confirm ? 'confirmed'
    : button.dataset.reject ? 'rejected' : 'waiting';

  button.disabled = true;

  try {
    const data = await callApi(`${API.review}${id}/`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });

    toast(decision === 'confirmed'
      ? `${data.item.pair} ${t('toast.confirmed', 'will be treated as an interaction from now on')}`
      : decision === 'rejected'
        ? `${data.item.pair} ${t('toast.rejected', 'will no longer be flagged')}`
        : `${data.item.pair} ${t('toast.reopened', 'put back in the queue')}`);

    await loadReview();
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});

/* ==================================================================
   Models

   A run that is only a set of numbers on a page changes nothing. Each one is
   kept here, and promoting one points the prescribing check at it.
   ================================================================== */

const livePanel = document.getElementById('livePanel');
const modelRows = document.getElementById('modelRows');

const LIVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.3 2.6 2.6 5-5"/></svg>';

async function loadModels() {
  modelRows.innerHTML = `<div class="card empty">${t('state.loading', 'Loading\u2026')}</div>`;

  try {
    const data = await callApi(API.models);
    renderModels(data);
  } catch (error) {
    modelRows.innerHTML = `<div class="card empty">${error.message}</div>`;
  }
}

function renderModels(data) {
  const live = data.live;

  livePanel.innerHTML = live
    ? `<div class="live-card">
         ${LIVE_ICON}
         <div>
           <strong>${live.name} ${t('models.isLive', 'is answering the prescribing check')}</strong>
           <p>${t('models.liveSince', 'Promoted')} ${new Date(live.promoted_at).toLocaleString('en-ZA')}${
             live.promoted_by ? ` ${t('models.by', 'by')} ${live.promoted_by}` : ''
           }. ${t('models.liveNote', 'Trained on')} ${live.dataset || t('models.aFile', 'an uploaded file')}, ${nf.format(live.rows_trained)} ${t('label.trainRows', 'training rows')}.</p>
         </div>
       </div>`
    : `<div class="card" style="margin-bottom:14px">
         <h3>${t('models.shipped', 'The shipped models are answering')}</h3>
         <p class="card-sub" style="margin:0">${
           data.shipped_installed
             ? t('models.shippedOn', 'The .pkl files built by build_pipeline.py are installed and in use. Promote a model below to use that one instead.')
             : t('models.shippedOff', 'No .pkl files are installed and nothing has been promoted, so prescriptions cannot be screened against drug pairs yet. Train a pair model and promote it, or copy the .pkl files into backend/models/.')
         }</p>
       </div>`;

  if (!data.models.length) {
    modelRows.innerHTML = `<div class="card empty">${t('empty.models', 'No models yet. Train one from the Dataset section.')}</div>`;
    return;
  }

  modelRows.innerHTML = data.models.map(model => `
    <div class="model-row ${model.status}">
      <div>
        <div class="model-top">
          <strong>${model.name}</strong>
          <span class="tag ${model.status === 'live' ? 'green' : 'grey'}">${model.status_label}</span>
          <span class="tag">${model.task_label}</span>
        </div>
        <div class="model-meta">
          ${model.dataset || t('models.aFile', 'an uploaded file')} \u00b7
          ${nf.format(model.dataset_rows)} ${t('label.rows', 'rows')} \u00b7
          ${nf.format(model.rows_trained)} ${t('models.trainedOn', 'trained')}, ${nf.format(model.rows_tested)} ${t('label.testRows', 'held back')}<br>
          ${new Date(model.trained_at).toLocaleString('en-ZA')}${model.trained_by ? ` \u00b7 ${model.trained_by}` : ''}${
            model.size_mb ? ` \u00b7 ${model.size_mb} MB ${t('models.saved', 'saved')}` : ''}
        </div>
        <div class="model-scores">
          <span>${t('metric.accuracy', 'Accuracy')} <b>${pct(model.accuracy)}</b></span>
          <span>${t('metric.f1', 'F1')} <b>${pct(model.f1)}</b></span>
          <span>${t('metric.auc', 'ROC AUC')} <b>${model.roc_auc === null || model.roc_auc === undefined ? '\u2014' : model.roc_auc.toFixed(3)}</b></span>
        </div>
      </div>
      <div class="row-actions">
        ${model.status === 'live'
          ? `<button class="link-btn" data-retire="${model.id}">${t('action.retire', 'Step back to shipped')}</button>`
          : model.can_promote
            ? `<button class="link-btn" data-promote="${model.id}">${t('action.promote', 'Make this live')}</button>
               <button class="link-btn danger" data-delete="${model.id}">${t('action.delete', 'Delete')}</button>`
            : `<span class="sub">${t('models.notPromotable', 'Recorded for comparison. Only a pair model can take over the prescribing check.')}</span>
               <button class="link-btn danger" data-delete="${model.id}">${t('action.delete', 'Delete')}</button>`}
      </div>
    </div>`).join('');
}

modelRows.addEventListener('click', async event => {
  const button = event.target.closest('button[data-promote], button[data-retire], button[data-delete]');
  if (!button) return;

  const id = button.dataset.promote || button.dataset.retire || button.dataset.delete;
  const action = button.dataset.promote ? 'promote' : button.dataset.retire ? 'retire' : 'delete';

  if (action === 'delete' && !window.confirm(t('confirm.delete', 'Delete this run and its saved model?'))) return;

  button.disabled = true;

  try {
    await callApi(`${API.models}${id}/${action}/`, { method: 'POST' });
    toast(action === 'promote'
      ? t('toast.promoted', 'Prescriptions are now screened against this model.')
      : action === 'retire'
        ? t('toast.retired', 'Back to the shipped models.')
        : t('toast.deleted', 'Run deleted.'));
    await loadModels();
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});

/* ==================================================================
   Settings

   Two kinds, kept apart on purpose. Theme and language are this browser's
   business and stay in localStorage. The test split, the leakage warning and
   the review threshold decide what the server does with everybody's data, so
   they are saved on the server and apply to the whole workspace.
   ================================================================== */

const themeToggle = document.getElementById('themeToggle');
const langSelect = document.getElementById('langSelect');
const setTestSize = document.getElementById('setTestSize');
const setLeak = document.getElementById('setLeak');
const setThreshold = document.getElementById('setThreshold');
const setAutoRaise = document.getElementById('setAutoRaise');
const settingsState = document.getElementById('settingsState');

function applyTheme(name) {
  document.querySelectorAll('#themeToggle button').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === name));
  document.body.classList.toggle('dark', name === 'dark');
  document.querySelector('meta[name="theme-color"]').content = name === 'dark' ? '#0e1210' : '#ffffff';
}

themeToggle.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  applyTheme(button.dataset.theme);
  try { localStorage.setItem('pc-research-theme', button.dataset.theme); } catch (error) { /* private window */ }
});

langSelect.addEventListener('change', event => {
  lang = event.target.value;
  applyLanguage();
  renderReview();
  try { localStorage.setItem('pc-research-lang', lang); } catch (error) { /* private window */ }
});

/* Read back what this browser remembers. Wrapped because localStorage throws
   outright in a private window rather than returning nothing. */
try {
  const savedTheme = localStorage.getItem('pc-research-theme');
  if (savedTheme) applyTheme(savedTheme);

  const savedLang = localStorage.getItem('pc-research-lang');
  if (savedLang && STRINGS[savedLang]) {
    lang = savedLang;
    langSelect.value = savedLang;
    applyLanguage();
  }
} catch (error) { /* nothing remembered, which is fine */ }

function fillSettings(data) {
  setTestSize.value = String(data.test_size);
  setLeak.checked = data.warn_leakage;
  setThreshold.value = data.review_threshold;
  setAutoRaise.checked = data.auto_raise;

  settingsState.textContent = data.updated_at
    ? `${t('settings.lastSaved', 'Last saved')} ${new Date(data.updated_at).toLocaleString('en-ZA')}${
        data.updated_by ? ` ${t('models.by', 'by')} ${data.updated_by}` : ''}`
    : '';
}

async function loadSettings() {
  try {
    fillSettings(await callApi(API.settings));
  } catch (error) {
    settingsState.textContent = error.message;
  }
}

document.getElementById('saveSettings').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;

  try {
    const data = await callApi(`${API.settings}save/`, {
      method: 'POST',
      body: JSON.stringify({
        test_size: Number(setTestSize.value),
        warn_leakage: setLeak.checked,
        review_threshold: Number(setThreshold.value),
        auto_raise: setAutoRaise.checked
      })
    });

    fillSettings(data);
    reviewThreshold = data.review_threshold;
    renderReview();
    toast(t('toast.saved', 'Saved for the whole workspace'));
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

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
   Boot
   ================================================================== */

resultsPanel.innerHTML = `<div class="card empty">${t('empty.results', 'Upload a dataset and train a model to see results here.')}</div>`;

loadSettings();
loadReview();
loadModels();