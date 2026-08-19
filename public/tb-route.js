const root = document.querySelector('[data-route-root]');
const eventBox = document.querySelector('[data-route-event]');
const boundary = document.querySelector('[data-route-boundary]');
const form = document.querySelector('[data-route-form]');
const zoneInputs = document.querySelector('[data-route-zone-inputs]');
const submitButton = document.querySelector('[data-route-submit]');
const inputResult = document.querySelector('[data-route-input-result]');
const results = document.querySelector('[data-route-results]');
const summary = document.querySelector('[data-route-summary]');
const commandList = document.querySelector('[data-route-command-list]');
const source = document.querySelector('[data-route-source]');
const recalculate = document.querySelector('[data-route-recalculate]');

let snapshot = null;

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function safeHref(value) {
  try {
    const url = new URL(text(value), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

function tp(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value));
}

function stars(value) {
  const count = Math.max(0, Math.min(3, Math.trunc(number(value))));
  return count ? '★'.repeat(count) : '0★';
}

function when(value) {
  const time = Date.parse(text(value));
  if (!Number.isFinite(time)) return 'No phase timer saved';
  const diff = time - Date.now();
  if (diff <= 0) return 'Phase timer elapsed';
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  let body = null;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.code = body?.code || 'REQUEST_FAILED';
    error.details = body?.details || null;
    error.status = response.status;
    throw error;
  }
  return body;
}

function renderEvent(body) {
  snapshot = body;
  if (!body?.configured || !body?.event) {
    eventBox.innerHTML = '<small>ACTIVE EVENT</small><strong>Not configured</strong><span>Create the active ROTE event first</span>';
    boundary.classList.add('error');
    boundary.innerHTML = `${escapeHtml(body?.evidenceBoundary || 'No active durable TB event is configured.')} <a href="/guild/tb/today#officer-controls">Open Officer Event Controls →</a>`;
    zoneInputs.innerHTML = '<div class="route-loading">No active territory state is available. Configure the event and current territories before generating a route.</div>';
    submitButton.disabled = true;
    return;
  }
  const event = body.event;
  eventBox.innerHTML = `<small>ACTIVE EVENT · ${escapeHtml(event.sourceKind || 'state')}</small><strong>${escapeHtml(event.currentPhase || '—')}</strong><span>${escapeHtml(when(event.phaseEndsAt))}</span>`;
  boundary.classList.remove('error');
  boundary.textContent = body.evidenceBoundary || 'Current TB event state loaded.';
  renderZoneInputs(body.zones);
}

function renderZoneInputs(zones) {
  const rows = array(zones);
  if (!rows.length) {
    zoneInputs.innerHTML = '<div class="route-loading">No territories are configured for the current phase. Save the current zone state first.</div>';
    submitButton.disabled = true;
    return;
  }
  zoneInputs.innerHTML = rows.map((zone) => {
    const command = text(zone.commandState || 'hold').toLowerCase();
    const cap = zone.preloadCapTp == null ? 'No cap saved' : `${tp(zone.preloadCapTp)} cap`;
    return `<article class="route-zone-input" data-route-zone="${escapeHtml(zone.planetId)}">
      <div class="route-zone-meta">
        <strong>${escapeHtml(zone.planetId)}</strong>
        <span class="route-command-pill ${escapeHtml(command)}">${escapeHtml(command.toUpperCase())}</span>
        <b>${tp(zone.currentTp)} TP · ${escapeHtml(stars(zone.currentStars))} → ${escapeHtml(stars(zone.targetStars))}</b>
        <span>${escapeHtml(cap)}${zone.lockedByOfficer ? ' · OFFICER LOCK' : ''}</span>
      </div>
      <label><span>Remaining mission / fleet TP</span><input data-route-mission type="number" min="0" step="1" inputmode="numeric" placeholder="Enter 0 if complete" required></label>
      <label><span>Remaining Operations TP</span><input data-route-operation type="number" min="0" step="1" inputmode="numeric" placeholder="Enter 0 if complete" required></label>
    </article>`;
  }).join('');
  submitButton.disabled = false;
}

function collectPreviewInput() {
  const remaining = form.elements.remainingGuildDeploymentTp.value;
  if (remaining === '' || !Number.isFinite(Number(remaining)) || Number(remaining) < 0) {
    throw new Error('Enter the current remaining Guild deployable TP.');
  }
  const remainingTpByPlanet = {};
  for (const row of document.querySelectorAll('[data-route-zone]')) {
    const planetId = text(row.dataset.routeZone);
    const mission = row.querySelector('[data-route-mission]')?.value ?? '';
    const operation = row.querySelector('[data-route-operation]')?.value ?? '';
    if (mission === '' || operation === '') throw new Error(`Enter both remaining TP values for ${planetId}. Use 0 only when that source is complete.`);
    if (Number(mission) < 0 || Number(operation) < 0 || !Number.isFinite(Number(mission)) || !Number.isFinite(Number(operation))) {
      throw new Error(`${planetId} remaining TP must be non-negative numbers.`);
    }
    remainingTpByPlanet[planetId] = {
      remainingMissionTp: Math.trunc(Number(mission)),
      remainingOperationTp: Math.trunc(Number(operation)),
    };
  }
  return {
    remainingGuildDeploymentTp: Math.trunc(Number(remaining)),
    remainingTpByPlanet,
    riskMode: 'safe',
  };
}

function summaryCard(label, value) {
  return `<article><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`;
}

function fact(label, value) {
  return `<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`;
}

function renderPlan(body) {
  const plan = body?.plan;
  if (!plan) throw new Error('The server did not return a route plan.');
  results.hidden = false;
  const reference = plan.thresholdReference || {};
  summary.innerHTML = [
    summaryCard('Deployment allocated', tp(plan.allocatedDeploymentTp)),
    summaryCard('Deployment unallocated', tp(plan.unallocatedDeploymentTp)),
    summaryCard('Blocked territories', String(number(plan.blockedZones))),
    summaryCard('Threshold reference', text(reference.version) || '—'),
  ].join('');

  commandList.innerHTML = array(plan.zones).map((zone) => {
    const command = text(zone.command || 'hold').toLowerCase();
    const blocked = zone.blocked === true;
    return `<article class="route-command ${escapeHtml(command)}${blocked ? ' blocked' : ''}">
      <div class="route-command-head">
        <div>
          <h3>${escapeHtml(zone.planetName || zone.planetId)}</h3>
          ${zone.lockedByOfficer ? '<span class="route-lock">◆ OFFICER LOCK PRESERVED</span>' : ''}
        </div>
        <span class="route-order-badge">${escapeHtml(zone.commandLabel || command.toUpperCase())}</span>
      </div>
      <div class="route-facts">
        ${fact('Current TP', tp(zone.currentTp))}
        ${fact('Target', `${stars(zone.targetStars)} · ${tp(zone.targetThresholdTp)}`)}
        ${fact('Safe ceiling', tp(zone.safeCeilingTp))}
        ${fact('Preload cap', tp(zone.preloadCapTp))}
        ${fact('Known remaining TP', tp(number(zone.remainingMissionTp) + number(zone.remainingOperationTp)))}
        ${fact('Deploy recommendation', tp(zone.recommendedDeploymentTp))}
      </div>
      <p class="route-explanation">${escapeHtml(zone.explanation)}</p>
      ${zone.blockingCode ? `<span class="route-warning">${escapeHtml(zone.blockingCode)}</span>` : ''}
    </article>`;
  }).join('') || '<div class="route-loading">No route commands were returned.</div>';

  const href = safeHref(reference.sourceUrl);
  source.innerHTML = `<b>Evidence boundary:</b> ${escapeHtml(body.evidenceBoundary || plan.sourceBoundary || '')}<br>
    <b>Threshold data:</b> ${escapeHtml(reference.sourceName || 'Versioned ROTE reference')} · ${escapeHtml(reference.sourceKind || 'reference')}${href !== '#' ? ` · <a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">source ↗</a>` : ''}.<br>
    This result is a non-persisted officer preview. Recalculate whenever current TP or remaining actions change.`;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function load() {
  try {
    const body = await api('/api/account/web-actions/tb/event');
    renderEvent(body);
  } catch (error) {
    eventBox.innerHTML = '<small>ACTIVE EVENT</small><strong>Unavailable</strong><span>Could not load authenticated TB state</span>';
    boundary.classList.add('error');
    boundary.textContent = `${error.message}${error.code ? ` (${error.code})` : ''}`;
    zoneInputs.innerHTML = '<div class="route-loading">Route inputs are unavailable.</div>';
    submitButton.disabled = true;
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  inputResult.classList.remove('error');
  results.hidden = true;
  try {
    const input = collectPreviewInput();
    submitButton.disabled = true;
    submitButton.textContent = 'Calculating…';
    const body = await api('/api/account/web-actions/tb/route/preview', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    inputResult.textContent = 'Safe preview generated from the current durable event state plus your explicit remaining-TP inputs.';
    renderPlan(body);
  } catch (error) {
    inputResult.classList.add('error');
    const missing = array(error?.details?.missingPlanets);
    inputResult.textContent = missing.length
      ? `${error.message} Missing: ${missing.join(', ')}.`
      : `${error.message}${error.code ? ` (${error.code})` : ''}`;
  } finally {
    submitButton.disabled = !(snapshot?.configured && array(snapshot?.zones).length);
    submitButton.textContent = 'Generate Safe Preview';
  }
});

recalculate?.addEventListener('click', () => {
  results.hidden = true;
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

if (root) load();
