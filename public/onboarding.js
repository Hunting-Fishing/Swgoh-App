const views = new Map([...document.querySelectorAll('[data-view]')].map((node) => [node.dataset.view, node]));
const message = document.querySelector('[data-message]');
const linkForm = document.querySelector('[data-link-form]');
const linkButton = document.querySelector('[data-link-button]');
const startButton = document.querySelector('[data-start-verification]');
const checkButton = document.querySelector('[data-check-verification]');
const refreshButton = document.querySelector('[data-refresh-state]');
const signoutButton = document.querySelector('[data-signout]');

let accountState = null;
let challengeState = null;
let discordAutoLinkAttempted = false;

function showView(name) {
  for (const [key, node] of views) node.classList.toggle('hidden', key !== name);
}

function setMessage(text = '', type = 'info') {
  if (!message) return;
  message.textContent = text;
  message.className = 'onboard-message';
  if (text) message.classList.add('is-visible', type);
}

function setBusy(button, busy, busyText = 'Working…') {
  if (!button) return;
  if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.idleText;
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
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = body?.code || '';
    throw error;
  }
  return body;
}

function formatAlly(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 9);
  return digits.replace(/(\d{3})(?=\d)/g, '$1-');
}

function readableCosmetic(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown cosmetic';
  return raw
    .replace(/^(PLAYERPORTRAIT|PLAYERTITLE|PORTRAIT|TITLE)[_:-]*/i, '')
    .replace(/[_:-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || raw;
}

function currentLink() {
  return accountState?.playerLinks?.find((row) => row?.verification_status !== 'rejected') || null;
}

function currentMembership() {
  return accountState?.guildMemberships?.find((row) => row?.status !== 'left') || null;
}

function updateSteps(stage) {
  const order = ['account', 'player', 'verify'];
  const current = order.indexOf(stage);
  for (const node of document.querySelectorAll('[data-step]')) {
    const index = order.indexOf(node.dataset.step);
    node.classList.toggle('is-active', index === current);
    node.classList.toggle('is-complete', index >= 0 && index < current);
  }
  if (stage === 'done') {
    for (const node of document.querySelectorAll('[data-step]')) {
      node.classList.remove('is-active');
      node.classList.add('is-complete');
    }
  }
}

function renderPendingIdentity(link, membership) {
  const player = link?.player || {};
  const guild = membership?.guild || {};
  const name = document.querySelector('[data-player-name]');
  const ally = document.querySelector('[data-player-ally]');
  const guildName = document.querySelector('[data-guild-name]');
  if (name) name.textContent = player.name || 'SWGOH Player';
  if (ally) ally.textContent = `Ally ${formatAlly(player.ally_code)}`;
  if (guildName) guildName.textContent = guild.name || 'Guild detected';
}

function renderChallenge(challenge) {
  challengeState = challenge;
  const type = challenge?.type === 'title' ? 'Player Title' : 'Player Portrait';
  const target = document.querySelector('[data-challenge-target]');
  const typeNode = document.querySelector('[data-challenge-type]');
  const action = document.querySelector('[data-challenge-action]');
  const expiry = document.querySelector('[data-challenge-expiry]');
  if (typeNode) typeNode.textContent = `Target ${type}`;
  if (target) {
    target.textContent = readableCosmetic(challenge?.targetValue);
    target.title = challenge?.targetValue || '';
  }
  if (action) action.textContent = `Change your ${type.toLowerCase()} to “${readableCosmetic(challenge?.targetValue)}”.`;
  if (expiry) {
    const date = new Date(challenge?.expiresAt || '');
    expiry.textContent = Number.isNaN(date.getTime()) ? 'soon' : date.toLocaleString();
  }
}

async function refreshState({ quiet = false } = {}) {
  if (!quiet) setMessage();
  try {
    const auth = await requestJson('/api/auth/status');
    if (!auth?.authenticated) {
      showView('signin');
      updateSteps('account');
      return;
    }

    accountState = await requestJson('/api/account/status');
    let link = currentLink();
    let membership = currentMembership();

    if (!link && accountState?.discordPlayerLink?.allyCode && !discordAutoLinkAttempted) {
      discordAutoLinkAttempted = true;
      setMessage(`Discord link found for Ally ${formatAlly(accountState.discordPlayerLink.allyCode)}. Connecting your SWGOH player automatically…`, 'info');
      try {
        await requestJson('/api/account/link-player/discord', {
          method: 'POST',
          body: '{}',
        });
        accountState = await requestJson('/api/account/status');
        link = currentLink();
        membership = currentMembership();
        setMessage('Your existing Discord ↔ SWGOH player link was found automatically. SWGOH ownership verification is still required before Guild access is activated.', 'success');
      } catch (error) {
        setMessage(error?.message || 'The Discord player link could not be imported automatically. You can still enter your Ally Code manually.', 'error');
      }
    }

    if (link?.verification_status === 'verified' && membership?.status === 'active') {
      showView('verified');
      updateSteps('done');
      return;
    }

    if (!link) {
      showView('link');
      updateSteps('player');
      return;
    }

    renderPendingIdentity(link, membership);
    let verification = null;
    try {
      verification = await requestJson('/api/account/verification');
    } catch (error) {
      if (error.status === 401) {
        showView('signin');
        updateSteps('account');
        return;
      }
    }

    if (verification?.challenge) {
      renderChallenge(verification.challenge);
      showView('challenge');
    } else {
      showView('pending');
    }
    updateSteps('verify');
  } catch (error) {
    showView(error?.status === 401 ? 'signin' : 'link');
    updateSteps(error?.status === 401 ? 'account' : 'player');
    setMessage(error?.message || 'Could not load onboarding state.', 'error');
  }
}

linkForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage();
  const data = new FormData(linkForm);
  const allyCode = String(data.get('allyCode') || '').replace(/\D/g, '');
  if (!/^\d{9}$/.test(allyCode)) {
    setMessage('Enter a valid 9-digit Ally Code.', 'error');
    return;
  }
  setBusy(linkButton, true, 'Finding Player…');
  try {
    await requestJson('/api/account/link-player', {
      method: 'POST',
      body: JSON.stringify({ allyCode }),
    });
    setMessage('Live player and Guild identity found. Ownership verification is required before access is activated.', 'success');
    await refreshState({ quiet: true });
  } catch (error) {
    setMessage(error?.message || 'Could not link that Ally Code.', 'error');
  } finally {
    setBusy(linkButton, false);
  }
});

startButton?.addEventListener('click', async () => {
  setMessage();
  setBusy(startButton, true, 'Preparing Challenge…');
  try {
    const result = await requestJson('/api/account/verification/start', { method: 'POST', body: '{}' });
    renderChallenge(result.challenge);
    showView('challenge');
    updateSteps('verify');
    setMessage('Verification challenge created from your live unlocked profile cosmetics.', 'info');
  } catch (error) {
    setMessage(error?.message || 'Could not create a verification challenge.', 'error');
  } finally {
    setBusy(startButton, false);
  }
});

checkButton?.addEventListener('click', async () => {
  setMessage();
  setBusy(checkButton, true, 'Checking Live Profile…');
  try {
    const result = await requestJson('/api/account/verification/check', { method: 'POST', body: '{}' });
    if (result?.verified) {
      setMessage('Player ownership verified. Guild access is now active.', 'success');
      await refreshState({ quiet: true });
      return;
    }
    if (result?.challenge) renderChallenge(result.challenge);
    setMessage('The live profile has not changed to the requested cosmetic yet. Save the change in SWGOH, then try again.', 'info');
  } catch (error) {
    setMessage(error?.message || 'Verification check failed.', 'error');
  } finally {
    setBusy(checkButton, false);
  }
});

refreshButton?.addEventListener('click', () => refreshState());

signoutButton?.addEventListener('click', async () => {
  signoutButton.disabled = true;
  try { await requestJson('/api/auth/signout', { method: 'POST', body: '{}' }); } catch {}
  window.location.assign('/login');
});

const allyInput = document.querySelector('#allyCode');
allyInput?.addEventListener('input', () => {
  const digits = allyInput.value.replace(/\D/g, '').slice(0, 9);
  allyInput.value = formatAlly(digits);
});

refreshState();
