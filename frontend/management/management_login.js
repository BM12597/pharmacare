/* PharmaCare+ — IT support sign in.
   Signs in against the Django API. Nothing is verified in the browser: the
   server checks the credentials and whether the account may reach this
   portal at all. */

const API = {
  csrf: '/api/auth/csrf/',
  login: '/api/auth/login/',
  me: '/api/auth/me/'
};

const PORTAL_URL = '/management/';

const form = document.getElementById('authForm');
const userIdInput = document.getElementById('userId');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submitButton');
const authError = document.getElementById('authError');
const togglePassword = document.getElementById('togglePassword');

/* ---------- show / hide the password ---------- */

const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.2M6.6 6.7A17.4 17.4 0 0 0 2 13s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

togglePassword.innerHTML = EYE_OPEN;

togglePassword.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  togglePassword.innerHTML = showing ? EYE_OPEN : EYE_CLOSED;
  togglePassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  togglePassword.setAttribute('aria-pressed', String(!showing));
  passwordInput.focus();
});

/* ---------- CSRF ---------- */

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

async function ensureCsrf() {
  if (!getCookie('csrftoken')) {
    await fetch(API.csrf, { credentials: 'same-origin' });
  }
  return getCookie('csrftoken');
}

/* ---------- sign in ---------- */

function showError(message) {
  authError.textContent = message;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  showError('');

  const userId = userIdInput.value.trim();
  const password = passwordInput.value;

  if (!userId || !password) {
    showError('Enter your support ID and password.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Signing in…';

  try {
    const token = await ensureCsrf();

    const response = await fetch(API.login, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token || '' },
      body: JSON.stringify({ user_id: userId, password, scope: 'management' })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      window.location.href = data.redirect || PORTAL_URL;
      return;
    }

    showError(data.detail || 'Those details did not work. Check the ID and try again.');
    passwordInput.value = '';
    passwordInput.focus();
  } catch (error) {
    showError('Cannot reach the server. Check that it is running and try again.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in';
  }
});

/* ---------- skip the form if already signed in ---------- */

fetch(API.me, { credentials: 'same-origin' })
  .then(response => (response.ok ? response.json() : null))
  .then(data => {
    if (data && data.can_manage) window.location.href = PORTAL_URL;
  })
  .catch(() => {});

userIdInput.focus();