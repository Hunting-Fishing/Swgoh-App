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
const applyButton = document.querySelector('[data-route-apply]');
const applyStatus = document.querySelector('[data-route-apply-status]');

let snapshot = null;
let lastPreviewInput = null;
let lastPreviewBody = null;

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

function resetApplyState() {
  lastPreviewInput = null;
  lastPreviewBody = null;
  if (applyButton) {
    applyButton.disabled = true;
    applyButton.textContent = 'Apply Safe Orders';
  }
  if (applyStatus) {
    applyStatus.className = 'route-apply-status';
    applyStatus.textContent = '';
  }
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
  const previewFingerprint = text(plan.inputFingerprint);
  const hasFingerprint = /^[0-9a-f]{64}$/i.test(previewFingerprint);
  const blockedCount = number(plan.blockedZones);
  summary.innerHTML = [
    summaryCard('Deployment allocated', tp(plan.allocatedDeploymentTp)),
    summaryCard('Deployment unallocated', tp(plan.unallocatedDeploymentTp)),
    summaryCard('Blocked territories', String(blockedCount)),
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
    <b>Input fingerprint:</b> <code>${escapeHtml(previewFingerprint || 'unavailable')}</code><br>
    This result is a non-persisted officer preview until Apply Safe Orders succeeds.`;

  if (applyButton) {
    applyButton.disabled = blockedCount > 0 || !hasFingerprint;
    applyButton.title = blockedCount > 0
      ? 'Resolve all blocked territories before applying.'
      : hasFingerprint ? 'Apply these orders to unlocked territory commands.' : 'Optimizer fingerprint unavailable.';
  }
  if (applyStatus) {
    applyStatus.className = 'route-apply-status';
    applyStatus.textContent = blockedCount > 0
      ? 'Apply is disabled because this preview contains blocked territories.'
      : 'Preview verified. Applying will re-run the optimizer against current server state before any command changes.';
  }
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
  resetApplyState();
  try {
    const input = collectPreviewInput();
    submitButton.disabled = true;
    submitButton.textContent = 'Calculating…';
    const body = await api('/api/account/web-actions/tb/route/preview', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    lastPreviewInput = input;
    lastPreviewBody = body;
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

applyButton?.addEventListener('click', async () => {
  const fingerprint = text(lastPreviewBody?.plan?.inputFingerprint);
  if (!lastPreviewInput || !/^[0-9a-f]{64}$/i.test(fingerprint)) {
    applyStatus.className = 'route-apply-status error';
    applyStatus.textContent = 'Generate a fresh safe preview before applying route orders.';
    applyButton.disabled = true;
    return;
  }
  if (number(lastPreviewBody?.plan?.blockedZones) > 0) {
    applyStatus.className = 'route-apply-status error';
    applyStatus.textContent = 'Resolve all blocked territories and recalculate before applying.';
    applyButton.disabled = true;
    return;
  }

  const unlocked = array(lastPreviewBody?.plan?.zones).filter((zone) => !(zone.lockedByOfficer === true || zone.commandSource === 'officer-lock'));
  const locked = array(lastPreviewBody?.plan?.zones).length - unlocked.length;
  const confirmed = window.confirm(`Apply ${unlocked.length} optimizer order${unlocked.length === 1 ? '' : 's'} to the active ${text(lastPreviewBody?.event?.currentPhase || 'TB')} event?${locked ? ` ${locked} officer-locked zone${locked === 1 ? '' : 's'} will remain unchanged.` : ''}\n\nThe server will reject this if current territory state changed after the preview.`);
  if (!confirmed) return;

  applyButton.disabled = true;
  applyButton.textContent = 'Applying…';
  applyStatus.className = 'route-apply-status';
  applyStatus.textContent = 'Re-running optimizer against current server state and opening atomic audit transaction…';
  try {
    const body = await api('/api/account/web-actions/tb/route/apply', {
      method: 'POST',
      body: JSON.stringify({ ...lastPreviewInput, expectedInputFingerprint: fingerprint }),
    });
    applyStatus.className = 'route-apply-status success';
    applyStatus.innerHTML = `<strong>Orders applied.</strong> ${escapeHtml(String(number(body.appliedZoneCount)))} unlocked zone${number(body.appliedZoneCount) === 1 ? '' : 's'} updated; ${escapeHtml(String(number(body.lockedZoneCount)))} locked zone${number(body.lockedZoneCount) === 1 ? '' : 's'} preserved.<br>Audit snapshot <code>${escapeHtml(body.snapshotId || 'saved')}</code> · fingerprint <code>${escapeHtml(body.inputFingerprint || fingerprint)}</code>.`;
    applyButton.textContent = 'Orders Applied';
    lastPreviewInput = null;
    lastPreviewBody = null;
    await load();
  } catch (error) {
    applyStatus.className = 'route-apply-status error';
    const blocked = array(error?.details?.blockedPlanets);
    applyStatus.textContent = blocked.length
      ? `${error.message} Blocked: ${blocked.join(', ')}.`
      : `${error.message}${error.code ? ` (${error.code})` : ''}`;
    applyButton.textContent = error.code === 'ROUTE_PREVIEW_STALE' ? 'Recalculate Required' : 'Apply Safe Orders';
    applyButton.disabled = error.code === 'ROUTE_PREVIEW_STALE';
  }
});

recalculate?.addEventListener('click', () => {
  results.hidden = true;
  resetApplyState();
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

if (root) load();
