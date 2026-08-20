const EVENT_API = '/api/account/web-actions/tb/event';
const SLOT_SYNC_API = '/api/account/tb-operations/event/current/reference-sync';
const OPS_PATH = '/guild/operations';

const text = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const state = { checking: false, configured: null, event: null, error: '', message: '', timer: 0 };

function isOfficerOperationsRoute() {
  return location.pathname.replace(/\/+$/, '') === OPS_PATH;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `${url} returned HTTP ${response.status}`);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

function host() {
  if (!isOfficerOperationsRoute()) return null;
  const ledger = document.getElementById('roteOperationLedgerOfficer');
  const anchor = ledger || document.getElementById('guildOpsRequirements');
  if (!anchor) return null;
  let panel = document.getElementById('roteOperationEventBootstrap');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'roteOperationEventBootstrap';
    panel.className = 'guild-ops-card rote-ledger-card';
    anchor.insertAdjacentElement(ledger ? 'beforebegin' : 'afterend', panel);
  }
  return panel;
}

function phaseOptions(selected = 'P1') {
  return ['P1','P2','P3','P4','P5','P6']
    .map((phase) => `<option value="${phase}" ${phase === selected ? 'selected' : ''}>${phase}</option>`)
    .join('');
}

function render() {
  const panel = host();
  if (!panel) return;
  panel.dataset.roteEventBootstrapRendered = 'true';
  if (state.checking) {
    panel.hidden = false;
    panel.innerHTML = '<div class="rote-ledger-note">Checking durable ROTE event state…</div>';
    return;
  }
  if (state.configured === true) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `<div class="rote-ledger-head"><div><div class="kicker">ROTE EVENT ACTIVATION</div><h3>No durable active ROTE event yet</h3><p>Select the actual current in-game phase. Command Center will create an <strong>officer-entered</strong> active event and sync canonical Operation slot requirements. It will not infer who was assigned or who filled anything.</p></div></div>
    ${state.error ? `<div class="rote-ledger-note danger">${escapeHtml(state.error)}</div>` : ''}
    ${state.message ? `<div class="rote-ledger-note">${escapeHtml(state.message)}</div>` : ''}
    <div class="rote-ledger-actions"><label>Current live phase <select id="roteBootstrapPhase">${phaseOptions('P1')}</select></label><button type="button" id="roteBootstrapActivate">Activate Event + Sync Slots</button></div>
    <div class="rote-ledger-note warn"><strong>Evidence boundary:</strong> this records an officer-confirmed event phase, not canonical live event telemetry. Unknown start/end times stay unknown.</div>`;
  document.getElementById('roteBootstrapActivate')?.addEventListener('click', activate);
}

async function currentEvent() {
  return fetchJson(EVENT_API);
}

async function activate() {
  const phase = text(document.getElementById('roteBootstrapPhase')?.value).toUpperCase();
  if (!/^P[1-6]$/.test(phase)) return;
  state.error = '';
  state.message = `Activating ${phase} and synchronizing canonical Operation slots…`;
  render();
  try {
    const latest = await currentEvent();
    let event = latest?.event || null;
    if (!latest?.configured || !event?.id) {
      const saved = await fetchJson(EVENT_API, {
        method: 'POST',
        body: JSON.stringify({
          currentPhase: phase,
          status: 'active',
          metadata: { activationSurface: 'rote-operation-ledger-a4' },
        }),
      });
      event = saved?.event || null;
    } else if (text(event.currentPhase).toUpperCase() !== phase) {
      throw new Error(`An active durable ROTE event already exists in ${text(event.currentPhase).toUpperCase() || 'another phase'}. Update the event phase through TB Command Center instead of creating a competing event.`);
    }

    if (!event?.id) throw new Error('The durable ROTE event was not confirmed by the server.');
    const synced = await fetchJson(SLOT_SYNC_API, { method: 'POST' });
    state.configured = true;
    state.event = event;
    state.message = `${phase} active · ${Number(synced?.savedSlots || 0)} canonical Operation slots synchronized.`;
    render();
    window.dispatchEvent(new CustomEvent('swgoh:guild-command-snapshot', { detail: { source: 'rote-operation-event-bootstrap', phase, eventId: event.id } }));
  } catch (error) {
    state.error = `${error.message} No assignment or contribution evidence was inferred.`;
    state.message = '';
    render();
  }
}

async function check() {
  if (!isOfficerOperationsRoute() || state.checking) return;
  const panel = host();
  if (!panel) return;
  state.checking = true;
  render();
  try {
    const snapshot = await currentEvent();
    state.configured = snapshot?.configured === true && Boolean(snapshot?.event?.id);
    state.event = snapshot?.event || null;
    state.error = '';
  } catch (error) {
    state.configured = null;
    state.error = error.message || 'Durable ROTE event state is unavailable.';
  } finally {
    state.checking = false;
    render();
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    if (!isOfficerOperationsRoute()) return;
    const panel = host();
    if (!panel) return;
    if (panel.dataset.roteEventBootstrapRendered !== 'true') render();
    if (state.configured === null && !state.checking) check();
  }, 60);
}

function install() {
  if (!isOfficerOperationsRoute()) return;
  schedule();
  const observer = new MutationObserver(() => schedule());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('swgoh:guild-command-snapshot', () => {
    state.configured = null;
    state.error = '';
    schedule();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

export { isOfficerOperationsRoute as roteOperationBootstrapRouteMatches };
