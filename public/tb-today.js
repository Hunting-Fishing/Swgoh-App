import { ROTE_PLANETS } from './rote-map-data.js';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const API = '/api/account/web-actions/tb';
let snapshot = null;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `TB Command Center returned HTTP ${response.status}`);
    error.code = body?.code || '';
    error.status = response.status;
    throw error;
  }
  return body;
}

function phasePlanetOptions(phase) {
  const currentPhase = String(phase || '').toUpperCase();
  const sourcePhaseById = new Map(ROTE_PLANETS.map((planet) => [planet.id, String(planet.phase || '').toUpperCase()]));
  const rows = ROTE_PLANETS.filter((planet) =>
    String(planet.phase || '').toUpperCase() === currentPhase
    || (planet.bonus === true && sourcePhaseById.get(planet.unlockFrom) === currentPhase));
  return rows.map((planet) => `<option value="${escapeHtml(planet.id)}">${escapeHtml(planet.name)}${planet.bonus ? ' · BONUS' : ''}</option>`).join('');
}

function taskIcon(type) {
  return ({ acknowledge: '⚠', operation: '⬢', special: '★', combat: '⚔', fleet: '✦', deploy: '⬇' })[type] || '•';
}

function taskLabel(type) {
  return ({ acknowledge: 'COMMAND', operation: 'OPERATION', special: 'SPECIAL MISSION', combat: 'COMBAT MISSION', fleet: 'FLEET MISSION', deploy: 'DEPLOYMENT' })[type] || String(type || 'TASK').toUpperCase();
}

function statusClass(status) {
  return ['completed','acknowledged','skipped','blocked'].includes(status) ? status : 'pending';
}

function zoneMarkup(zone) {
  const command = String(zone.commandState || '').toUpperCase();
  const message = zone.commandMessage || 'No officer note';
  return `<article class="tb-zone command-${escapeHtml(String(zone.commandState || '').toLowerCase())}">
    <span>${escapeHtml(zone.phase)} · ${escapeHtml(zone.planetId)}</span>
    <strong>${escapeHtml(command)}</strong>
    <small>${escapeHtml(message)}</small>
    <div><b>${number(zone.currentTp)} TP</b><b>${Number(zone.currentStars || 0)}★ → ${Number(zone.targetStars || 0)}★ target</b></div>
  </article>`;
}

function taskMarkup(task) {
  const status = String(task.status || 'pending');
  const team = task.payload?.recommendationName || task.recommendedTeamId || '';
  const commandTag = task.payload?.commandTag || '';
  const canMutate = Boolean(task.durableId);
  const primaryStatus = task.actionType === 'acknowledge' ? 'acknowledged' : 'completed';
  const primaryLabel = task.actionType === 'acknowledge' ? 'Acknowledge' : 'Mark Complete';
  return `<article class="tb-task ${escapeHtml(statusClass(status))}" data-task-id="${escapeHtml(task.durableId || '')}">
    <div class="tb-task-order"><span>${taskIcon(task.actionType)}</span><b>${Number(task.order || 0)}</b></div>
    <div class="tb-task-copy">
      <header><span>${escapeHtml(taskLabel(task.actionType))}${task.planetId ? ` · ${escapeHtml(task.planetId)}` : ''}</span><b>${escapeHtml(status.toUpperCase())}</b></header>
      <h3>${escapeHtml(task.title || task.missionId || task.actionKey)}</h3>
      <p>${escapeHtml(task.explanation || '')}</p>
      ${(commandTag || team) ? `<div class="tb-task-tags">${commandTag ? `<span>${escapeHtml(commandTag)}</span>` : ''}${team ? `<span>SQUAD · ${escapeHtml(team)}</span>` : ''}</div>` : ''}
      <div class="tb-task-actions">
        ${task.missionId ? '<a href="/guild/tb">Open Mission Map</a>' : ''}
        ${canMutate && !['completed','acknowledged'].includes(status) ? `<button type="button" data-set-status="${primaryStatus}">${primaryLabel}</button><button type="button" class="quiet" data-set-status="skipped">Skip</button>` : ''}
        ${canMutate && ['completed','acknowledged','skipped'].includes(status) ? '<button type="button" class="quiet" data-set-status="pending">Reopen</button>' : ''}
      </div>
    </div>
  </article>`;
}

function renderEmpty(message, code = '') {
  $('[data-tb-tasks]').innerHTML = `<div class="tb-empty"><strong>${escapeHtml(message)}</strong>${code ? `<span>${escapeHtml(code)}</span>` : ''}<a href="/guild/tb">Open TB War Room</a></div>`;
  $('[data-tb-task-count]').textContent = '0';
}

function render(data) {
  snapshot = data;
  const boundary = $('[data-tb-boundary]');
  const clock = $('[data-tb-event-clock]');
  const summary = $('[data-tb-summary]');
  const zones = $('[data-tb-zones]');
  const tasks = $('[data-tb-tasks]');
  const count = $('[data-tb-task-count]');
  boundary.textContent = data.evidenceBoundary || '';

  if (!data.configured || !data.event) {
    clock.innerHTML = '<small>EVENT STATE</small><strong>NOT CONFIGURED</strong><span>No active durable TB event</span>';
    summary.innerHTML = '';
    zones.innerHTML = '';
    renderEmpty('No active TB event is configured. Static ROTE reference data is not being treated as live state.');
    populateOfficerForms(data);
    return;
  }

  const event = data.event;
  const phaseEnd = event.phaseEndsAt ? new Date(event.phaseEndsAt) : null;
  const phaseText = phaseEnd && Number.isFinite(phaseEnd.getTime())
    ? `Phase ends ${phaseEnd.toLocaleString()}`
    : 'Phase end time not set';
  clock.innerHTML = `<small>${escapeHtml(event.tbKey.toUpperCase())} · ${escapeHtml(event.sourceKind.toUpperCase())}</small><strong>${escapeHtml(event.currentPhase)}</strong><span>${escapeHtml(phaseText)}</span>`;

  const byType = data.summary?.byType || {};
  summary.innerHTML = `
    <article><span>Total orders</span><strong>${number(data.summary?.total)}</strong></article>
    <article><span>Operations</span><strong>${number(byType.operation)}</strong></article>
    <article><span>Missions</span><strong>${number(data.summary?.missionTasks)}</strong></article>
    <article><span>Deployment</span><strong>${number(byType.deploy)}</strong></article>
    <article><span>Hold / Stop</span><strong>${number(data.summary?.blockedCommands)}</strong></article>
    <article><span>Queue state</span><strong>${data.durable ? 'DURABLE' : 'LIVE PREVIEW'}</strong></article>`;
  zones.innerHTML = (data.zones || []).length
    ? data.zones.map(zoneMarkup).join('')
    : '<div class="tb-zone-empty">No territory commands have been entered for this phase yet.</div>';
  count.textContent = number((data.tasks || []).length);
  tasks.innerHTML = (data.tasks || []).length ? data.tasks.map(taskMarkup).join('') : '<div class="tb-empty"><strong>No actionable orders generated yet.</strong><span>Officers can add territory commands below. Missions are only generated for configured territories.</span></div>';
  bindTaskActions();
  populateOfficerForms(data);
}

function populateOfficerForms(data) {
  const eventForm = $('[data-tb-event-form]');
  const phase = data?.event?.currentPhase || eventForm?.elements?.currentPhase?.value || 'P1';
  if (eventForm?.elements?.currentPhase) eventForm.elements.currentPhase.value = phase;
  const select = $('[data-tb-planet-select]');
  if (select) select.innerHTML = phasePlanetOptions(phase);
}

async function load({ persist = true } = {}) {
  const tasks = $('[data-tb-tasks]');
  tasks.innerHTML = '<div class="tb-loading">Synchronizing Today in TB…</div>';
  try {
    let data = await api('/today');
    if (persist && data.configured) {
      try { data = await api('/today/refresh', { method: 'POST', body: '{}' }); }
      catch (error) { console.warn('[tb-today] durable refresh failed', error); }
    }
    render(data);
  } catch (error) {
    $('[data-tb-boundary]').textContent = error.message;
    renderEmpty(error.status === 401 ? 'Sign in to Command Center to load your verified TB orders.' : 'Today in TB could not load.', error.code || error.message);
    if (error.status === 401) $('[data-tb-tasks]').insertAdjacentHTML('beforeend', '<a class="tb-signin" href="/account">Open Account</a>');
  }
}

function bindTaskActions() {
  for (const button of document.querySelectorAll('[data-set-status]')) {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-task-id]');
      const actionId = card?.dataset.taskId;
      if (!actionId) return;
      button.disabled = true;
      try {
        await api(`/action/${actionId}/status`, { method: 'POST', body: JSON.stringify({ status: button.dataset.setStatus }) });
        await load({ persist: false });
      } catch (error) {
        button.disabled = false;
        window.alert(error.message);
      }
    });
  }
}

$('[data-tb-refresh]')?.addEventListener('click', () => load({ persist: true }));

$('[data-tb-event-form]')?.addEventListener('change', (event) => {
  if (event.target?.name === 'currentPhase') {
    const select = $('[data-tb-planet-select]');
    if (select) select.innerHTML = phasePlanetOptions(event.target.value);
  }
});

$('[data-tb-event-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const result = $('[data-tb-officer-result]');
  const payload = {
    id: snapshot?.event?.id || undefined,
    status: 'active',
    currentPhase: form.elements.currentPhase.value,
    startedAt: form.elements.startedAt.value || undefined,
    endsAt: form.elements.endsAt.value || undefined,
    phaseEndsAt: form.elements.phaseEndsAt.value || undefined,
  };
  result.textContent = 'Saving event…';
  try {
    await api('/event', { method: 'POST', body: JSON.stringify(payload) });
    result.textContent = 'Active TB event saved.';
    await load({ persist: true });
  } catch (error) {
    result.textContent = `${error.message}${error.status === 403 ? ' · Verified Guild officer access is required.' : ''}`;
  }
});

$('[data-tb-zone-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const result = $('[data-tb-officer-result]');
  if (!snapshot?.event?.id) {
    result.textContent = 'Create the active TB event first.';
    return;
  }
  const payload = {
    eventId: snapshot.event.id,
    phase: snapshot.event.currentPhase,
    planetId: form.elements.planetId.value,
    commandState: form.elements.commandState.value,
    targetStars: Number(form.elements.targetStars.value || 0),
    commandMessage: form.elements.commandMessage.value,
  };
  result.textContent = 'Saving territory command…';
  try {
    await api('/zone', { method: 'POST', body: JSON.stringify(payload) });
    result.textContent = 'Territory command saved.';
    await load({ persist: true });
  } catch (error) {
    result.textContent = `${error.message}${error.status === 403 ? ' · Verified Guild officer access is required.' : ''}`;
  }
});

load({ persist: true });
