/* PharmaCare+ — the patient's collection page.

   Opened from the link in the email. There is no account and no sign-in: the
   token in the address is the credential, which is why this page asks for as
   little as possible and shows nothing until the server says the link is good.

   Two ways to collect, and the server treats them the same:

     scan   the camera reads the code on the pharmacist's screen and posts it
            back together with this link's own token. Both halves have to name
            the same prescription.
     code   the patient reads their own code out and the pharmacist types it
            in at the counter. Nothing happens on this page at all.

   The camera needs HTTPS or localhost. On a phone over plain HTTP the browser
   refuses, so the page says so and points at the code instead of failing
   silently. */

const LINK_TOKEN = window.location.pathname.split('/').filter(Boolean)[1] || '';
const API = `/api/collect/${encodeURIComponent(LINK_TOKEN)}/`;

const sheet = document.getElementById('sheet');
const scanner = document.getElementById('scanner');
const video = document.getElementById('video');
const frame = document.getElementById('frame');
const scanHint = document.getElementById('scanHint');

let state = null;
let polling = null;
let stream = null;
let scanning = false;

/* ------------------------------------------------------------------ */

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let toastTimer;
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 4000);
}

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.3 2.6 2.6 5-5"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>';
const CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 8.6A1.8 1.8 0 0 1 5.4 6.8h2L8.8 4.6h6.4l1.4 2.2h2a1.8 1.8 0 0 1 1.8 1.8v8.8a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8Z"/><circle cx="12" cy="12.8" r="3.2"/></svg>';
const WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.4v4.2M12 17.2h.01"/></svg>';

/* The camera is only available on a secure page. Said plainly rather than
   letting getUserMedia throw something nobody can act on. */
const CAMERA_POSSIBLE =
  window.isSecureContext &&
  navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

/* ------------------------------------------------------------------ */

async function load() {
  try {
    const response = await fetch(API, { headers: { 'Accept': 'application/json' } });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      draw({ error: data.detail || 'This link is not valid.' });
      return;
    }

    state = data;
    draw();
  } catch (error) {
    draw({ error: 'Could not reach the pharmacy system. Check your connection and try again.' });
  }
}

function draw(options = {}) {
  if (options.error) {
    sheet.innerHTML = `
      <div class="state problem">
        ${WARN}
        <div>
          <strong>This link does not work</strong>
          ${esc(options.error)}
        </div>
      </div>
      <p class="foot">If you were sent this by the hospital, ask the pharmacy to check the
      prescription reference for you.</p>`;
    return;
  }

  if (!state) return;

  const collected = state.status === 'collected';
  const dispensed = state.prescription_status === 'dispensed';

  const banner = collected || dispensed
    ? `<div class="state done">
         ${TICK}
         <div>
           <strong>Confirmed</strong>
           ${dispensed
             ? 'The pharmacist has handed your medicine over.'
             : 'Hand this to the pharmacist — they are getting your medicine now.'}
         </div>
       </div>`
    : state.armed
      ? `<div class="state ready">
           ${CAMERA}
           <div>
             <strong>The pharmacist is ready</strong>
             Scan the code on their screen, or read your code out to them.
           </div>
         </div>`
      : `<div class="state waiting">
           ${CLOCK}
           <div>
             <strong>Waiting for the pharmacy</strong>
             Show this page at the counter. When the pharmacist is ready, this
             page will tell you.
           </div>
         </div>`;

  const scanButton = (collected || dispensed) ? '' : CAMERA_POSSIBLE
    ? `<button class="btn" type="button" id="startScan" ${state.armed ? '' : 'disabled'}>
         ${CAMERA}
         <span>${state.armed ? 'Scan the pharmacist’s code' : 'Waiting for the pharmacist…'}</span>
       </button>`
    : `<p class="foot" style="margin-top:0">
         Your phone cannot open the camera on this page, so read the code above out
         to the pharmacist instead. It works just the same.
       </p>`;

  sheet.innerHTML = `
    ${banner}

    <div class="card">
      <h1>${esc(state.patient)}</h1>
      <p class="sub">${esc(state.reference)} &middot; prescribed by ${esc(state.prescriber)}</p>
    </div>

    ${(collected || dispensed) ? '' : `
      <div class="card code-card">
        <p class="label">Your collection code</p>
        <p class="code">${esc(state.code)}</p>
        <p class="code-note">
          Read this out to the pharmacist if you cannot scan. It works once, and only
          for this prescription.
        </p>
      </div>

      ${scanButton}
    `}

    <div class="card" style="margin-top:14px">
      <p class="label">What was prescribed</p>
      ${state.items.map(item => `
        <div class="med">
          <strong>${esc(item.drug)}${item.dose ? ' ' + esc(item.dose) : ''}</strong>
          <span>${esc([item.frequency, item.quantity ? `${item.quantity} units` : '']
            .filter(Boolean).join(' · ')) || 'as directed'}</span>
        </div>`).join('')}
    </div>

    <p class="foot">
      Only give your code to the pharmacist handing your medicine over.
      Nobody from the hospital will ask for it any other way.
    </p>`;

  const start = document.getElementById('startScan');
  if (start) start.addEventListener('click', openCamera);
}

/* The page watches for the counter arming, so the patient does not have to
   keep refreshing while they stand in the queue. */
function startPolling() {
  clearInterval(polling);
  polling = setInterval(async () => {
    if (document.hidden || scanning) return;
    const was = state && `${state.armed}|${state.status}`;
    await load();
    const now = state && `${state.armed}|${state.status}`;
    if (was !== now && state && state.armed) {
      toast('The pharmacist is ready for you.');
    }
  }, 4000);
}

/* ==================================================================
   The camera
   ================================================================== */

async function openCamera() {
  if (!CAMERA_POSSIBLE) {
    toast('This phone cannot open the camera here. Read your code out instead.');
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // The back camera, which is the one pointing at the counter.
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
  } catch (error) {
    const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
    toast(denied
      ? 'The camera was blocked. Allow it, or read your code out to the pharmacist.'
      : 'The camera could not be opened. Read your code out to the pharmacist instead.');
    return;
  }

  scanner.hidden = false;
  scanning = true;
  scanHint.textContent = 'Looking for a code…';

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => {});

  requestAnimationFrame(readFrame);
}

function closeCamera() {
  scanning = false;
  scanner.hidden = true;

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
}

document.getElementById('closeScan').addEventListener('click', closeCamera);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && scanning) closeCamera();
});

/* One frame at a time, decoded in the page. Nothing from the camera leaves
   the phone — only the code that was read off the screen. */
function readFrame() {
  if (!scanning) return;

  if (video.readyState !== video.HAVE_ENOUGH_DATA) {
    requestAnimationFrame(readFrame);
    return;
  }

  const context = frame.getContext('2d', { willReadFrequently: true });
  frame.width = video.videoWidth;
  frame.height = video.videoHeight;
  context.drawImage(video, 0, 0, frame.width, frame.height);

  let found = null;
  try {
    const pixels = context.getImageData(0, 0, frame.width, frame.height);
    found = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
  } catch (error) {
    found = null;
  }

  if (found && found.data) {
    confirmScan(found.data);
    return;
  }

  requestAnimationFrame(readFrame);
}

async function confirmScan(payload) {
  scanning = false;
  scanHint.textContent = 'Checking…';

  // The QR carries the whole confirm address. Anything else on a counter — a
  // poster, somebody's bank QR — is not ours and is said so plainly.
  let url;
  try {
    url = new URL(payload, window.location.origin);
  } catch (error) {
    url = null;
  }

  // The code on the counter screen carries this patient's own link token as
  // well as the one-use token. A code off somebody else's screen names a
  // different link and is turned away here, before it reaches the server.
  const parts = url ? url.pathname.split('/').filter(Boolean) : [];
  const mine = url &&
    parts[0] === 'collect' &&
    parts[1] === LINK_TOKEN &&
    parts[2] === 'confirm' &&
    parts[3];

  if (!mine) {
    scanHint.textContent = 'That is not your prescription code.';
    toast('That code is not for this prescription. Ask the pharmacist to show yours.');
    setTimeout(() => { scanning = true; scanHint.textContent = 'Looking for a code…'; requestAnimationFrame(readFrame); }, 1800);
    return;
  }

  try {
    const response = await fetch(confirmUrl(parts[3]), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      scanHint.textContent = data.detail || 'That did not work.';
      toast(data.detail || 'That code did not work.');
      setTimeout(() => {
        closeCamera();
        load();
      }, 2200);
      return;
    }

    closeCamera();
    await load();
    toast('Confirmed. The pharmacist is getting your medicine.');
  } catch (error) {
    scanHint.textContent = 'Could not reach the pharmacy system.';
    setTimeout(closeCamera, 2000);
  }
}

/* ==================================================================
   Boot
   ================================================================== */

load().then(startPolling);