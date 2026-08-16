const mode = document.body.dataset.authMode === 'signup' ? 'signup' : 'login';
const form = document.querySelector('[data-auth-form]');
const message = document.querySelector('[data-auth-message]');
const submit = document.querySelector('[data-auth-submit]');
const sessionCard = document.querySelector('[data-session-card]');
const sessionEmail = document.querySelector('[data-session-email]');
const signoutButton = document.querySelector('[data-signout]');

function setMessage(text = '', type = 'info') {
  if (!message) return;
  message.textContent = text;
  message.className = 'auth-message';
  if (!text) return;
  message.classList.add('is-visible', `is-${type}`);
}

function setBusy(busy) {
  if (!submit) return;
  submit.disabled = busy;
  submit.textContent = busy
    ? (mode === 'signup' ? 'Creating account…' : 'Authenticating…')
    : (mode === 'signup' ? 'Create Command Center Account' : 'Enter Command Center');
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = body?.code || '';
    throw error;
  }
  return body;
}

function showExistingSession(user) {
  if (!sessionCard || !form) return;
  form.hidden = true;
  sessionCard.classList.add('is-visible');
  if (sessionEmail) sessionEmail.textContent = user?.email || 'Signed-in user';
}

async function checkSession() {
  try {
    const state = await requestJson('/api/auth/status');
    if (state?.authenticated) showExistingSession(state.user);
    else if (state?.auth?.enabled === false) setMessage('Account services are not configured on this deployment yet.', 'error');
  } catch {
    // The form remains usable; the submit request will surface a concrete error if Auth is unavailable.
  }
}

for (const button of document.querySelectorAll('[data-toggle-password]')) {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} password`);
  });
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage();

  const data = new FormData(form);
  const email = String(data.get('email') || '').trim();
  const password = String(data.get('password') || '');

  if (mode === 'signup') {
    const confirmation = String(data.get('passwordConfirm') || '');
    if (password !== confirmation) {
      setMessage('The password confirmation does not match.', 'error');
      return;
    }
    if (password.length < 8) {
      setMessage('Use at least 8 characters for your password.', 'error');
      return;
    }
  }

  setBusy(true);
  try {
    const payload = mode === 'signup'
      ? {
          email,
          password,
          displayName: String(data.get('displayName') || '').trim(),
        }
      : { email, password };

    const result = await requestJson(mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (result?.authenticated) {
      setMessage(mode === 'signup' ? 'Account created. Opening secure onboarding…' : 'Authenticated. Opening secure onboarding…', 'success');
      window.setTimeout(() => {
        window.location.assign('/onboarding');
      }, 450);
      return;
    }

    if (result?.requiresEmailConfirmation) {
      form.reset();
      setMessage('Account created. Check your email, confirm the address, then return here to sign in.', 'success');
      return;
    }

    setMessage('Account request completed, but no active session was returned.', 'info');
  } catch (error) {
    setMessage(error?.message || 'Authentication failed.', 'error');
  } finally {
    setBusy(false);
  }
});

signoutButton?.addEventListener('click', async () => {
  signoutButton.disabled = true;
  try {
    await requestJson('/api/auth/signout', { method: 'POST', body: '{}' });
  } catch {
    // The server clears local cookies even when upstream token revocation is unavailable.
  }
  window.location.reload();
});

checkSession();
