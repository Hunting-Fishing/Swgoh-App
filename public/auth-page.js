const CANONICAL_BROWSER_ORIGIN = 'https://swgohcommandcenter.app';

if (window.location.hostname.endsWith('.up.railway.app')) {
  const canonicalUrl = new URL(`${window.location.pathname}${window.location.search}${window.location.hash}`, CANONICAL_BROWSER_ORIGIN);
  window.location.replace(canonicalUrl.href);
}

const mode = document.body.dataset.authMode === 'signup' ? 'signup' : 'login';
const form = document.querySelector('[data-auth-form]');
const message = document.querySelector('[data-auth-message]');
const submit = document.querySelector('[data-auth-submit]');
const sessionCard = document.querySelector('[data-session-card]');
const sessionEmail = document.querySelector('[data-session-email]');
const signoutButton = document.querySelector('[data-signout]');
const socialButtons = [...document.querySelectorAll('[data-social-provider]')];

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

function oauthErrorMessage(code) {
  const value = String(code || '').trim().toLowerCase();
  if (!value) return '';
  if (value.includes('discord_not_enabled')) return 'Discord sign-in is not enabled yet. An administrator must finish the Discord OAuth provider setup.';
  if (value.includes('google_not_enabled')) return 'Google sign-in is not enabled yet. An administrator must finish the Google OAuth provider setup.';
  if (value.includes('access_denied')) return 'Social sign-in was cancelled or access was denied.';
  if (value.includes('state')) return 'The social sign-in security check expired or did not match. Please start again.';
  if (value.includes('missing_auth_code')) return 'The social provider did not return a usable authorization code. Please try again.';
  return 'Social sign-in could not be completed. Please try again or use email and password.';
}

function showOAuthReturnError() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('oauth_error');
  if (!code) return;
  setMessage(oauthErrorMessage(code), 'error');
  params.delete('oauth_error');
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}

function setSocialProviderState(provider, enabled) {
  const button = socialButtons.find((node) => node.dataset.socialProvider === provider);
  if (!button) return;
  button.classList.toggle('is-disabled', !enabled);
  button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  if (!button.dataset.oauthHref) button.dataset.oauthHref = button.getAttribute('href') || '';
  button.setAttribute('href', enabled ? button.dataset.oauthHref : '#');
  button.title = enabled ? '' : `${provider[0].toUpperCase()}${provider.slice(1)} sign-in setup is pending.`;
}

async function checkSocialProviders() {
  try {
    const state = await requestJson('/api/auth/providers');
    const social = state?.social || {};
    for (const provider of ['discord', 'google']) setSocialProviderState(provider, social[provider] === true);
  } catch {
    for (const provider of ['discord', 'google']) setSocialProviderState(provider, false);
  }
}

for (const button of socialButtons) {
  button.addEventListener('click', (event) => {
    if (!button.classList.contains('is-disabled')) return;
    event.preventDefault();
    const provider = button.dataset.socialProvider || 'social';
    setMessage(`${provider[0].toUpperCase()}${provider.slice(1)} sign-in is not enabled yet. Email/password remains available.`, 'info');
  });
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

showOAuthReturnError();
checkSocialProviders();
checkSession();
