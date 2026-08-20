const EVENT_API = '/api/account/tb-operations/event/current';
const LEDGER_API = '/api/account/tb-operations/event/current/ledger';
const SYNC_API = '/api/account/tb-operations/event/current/reference-sync';
const SELF_API = '/api/account/tb-operations/contributions/self';
const OFFICER_API = '/api/account/tb-operations/contributions/officer';
const ACCOUNT_API = '/api/account/status';
const OPS_PATH = '/guild/operations';
const pendingMemory = new Map();

const state = {
  loading: false,
  loaded: false,
  event: null,
  ledger: null,
  account: null,
  viewer: null,
  error: '',
  errorCode: '',
  errorStatus: 0,
  message: '',
  phase: 'All',
  planet: 'All',
  status: 'All',
  search: '',
  timer: 0,
};

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function samePlayer(a = {}, b = {}) {
  const leftId = text(a.playerId || a.id);
  const rightId = text(b.playerId || b.id);
  if (leftId && rightId && leftId === rightId) return true;
  const leftAlly = digits(a.allyCode || a.ally_code);
  const rightAlly = digits(b.allyCode || b.ally_code);
  return Boolean(leftAlly && rightAlly && leftAlly === rightAlly);
}

export function operationLedgerState(entry = {}) {
  const contribution = entry?.effectiveContribution || null;
  const status = text(contribution?.status).toLowerCase();
  if (status === 'mismatch') return 'MISMATCH';
  if (status === 'verified') return 'VERIFIED';
  if (status === 'filled') return 'FILLED';
  if (status === 'unknown') return 'UNKNOWN';
  if (entry?.assignment) return 'ASSIGNED';
  return 'VACANT';
}

export function operationLedgerSummary(entries = []) {
  const summary = { total: 0, VACANT: 0, ASSIGNED: 0, FILLED: 0, VERIFIED: 0, MISMATCH: 0, UNKNOWN: 0 };
  for (const entry of array(entries)) {
    const status = operationLedgerState(entry);
    summary.total += 1;
    summary[status] = (summary[status] || 0) + 1;
  }
  return Object.freeze(summary);
}

export function operationLedgerViewerRows(entries = [], viewer = {}, phase = '') {
  const wantedPhase = text(phase).toUpperCase();
  return Object.freeze(array(entries).filter((entry) => {
    if (wantedPhase && wantedPhase !== 'ALL' && text(entry?.slot?.phase).toUpperCase() !== wantedPhase) return false;
    return samePlayer(entry?.assignment, viewer) || samePlayer(entry?.effectiveContribution, viewer);
  }));
}

export function roteLedgerPendingKey(kind, slotId, contributor = '') {
  return `swgoh:rote-operation-pending:${text(kind)}:${text(slotId)}:${digits(contributor) || 'self'}`;
}

function createEvidenceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `rote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function pendingEvidenceId(kind, slotId, contributor = '') {
  const key = roteLedgerPendingKey(kind, slotId, contributor);
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) return stored;
    const next = createEvidenceId();
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    if (!pendingMemory.has(key)) pendingMemory.set(key, createEvidenceId());
    return pendingMemory.get(key);
  }
}

function clearPendingEvidence(kind, slotId, contributor = '') {
  const key = roteLedgerPendingKey(kind, slotId, contributor);
  try { sessionStorage.removeItem(key); } catch {}
  pendingMemory.delete(key);
}

function displayAlly(value) {
  const code = digits(value);
  return code.length === 9 ? `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}` : '—';
}

function dateTime(value) {
  const stamp = Date.parse(text(value));
  if (!Number.isFinite(stamp)) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stamp));
}

function ensureStylesheet() {
  if (document.querySelector('link[data-rote-ledger-ui-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/rote-operation-ledger-ui.css?v=20260820-a4';
  link.dataset.roteLedgerUiCss = 'true';
  document.head.appendChild(link);
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

function viewerFromAccount(account = {}) {
  const links = array(account?.playerLinks);
  const verified = links.filter((row) => text(row?.verification_status).toLowerCase() === 'verified');
  const link = verified.find((row) => row?.is_primary === true) || verified[0] || null;
  const player = link?.player || {};
  if (!player?.id && !player?.ally_code) return null;
  return Object.freeze({
    playerId: text(player.id),
    allyCode: digits(player.ally_code),
    name: text(player.name),
  });
}

function rosterMembers() {
  const body = window.__swgohGuildRosterSnapshot?.body || {};
  return array(body?.members);
}

function memberLabel(identity = {}) {
  const members = rosterMembers();
  const match = members.find((member) => samePlayer({ playerId: member?.playerId || member?.id, allyCode: member?.allyCode }, identity));
  if (match) return text(match.name || match.playerName) || displayAlly(match.allyCode);
  if (samePlayer(identity, state.viewer)) return state.viewer?.name || displayAlly(state.viewer?.allyCode);
  return displayAlly(identity?.allyCode) !== '—' ? displayAlly(identity?.allyCode) : (text(identity?.playerId) || '—');
}

function catalogUnits() {
  return array(window.__swgohCatalogSnapshot?.body?.units);
}

function unitLabel(baseId) {
  const id = text(baseId).toUpperCase();
  const unit = catalogUnits().find((row) => text(row?.baseId || row?.id).toUpperCase() === id);
  return text(unit?.name || unit?.unitName) || id || 'Unknown unit';
}

function requirementLabel(slot = {}) {
  const relic = Number(slot.requiredRelic);
  if (slot.requiredRelic !== null && slot.requiredRelic !== undefined && Number.isFinite(relic) && relic > 0) return `R${relic}`;
  if (slot.requiredRarity !== null && slot.requiredRarity !== undefined) return `${Number(slot.requiredRarity)}★`;
  if (slot.requiredRelic !== null && slot.requiredRelic !== undefined && Number.isFinite(relic)) return `R${relic}`;
  return 'Requirement unknown';
}

function contributionProgressionLabel(contribution = {}) {
  const relic = Number(contribution?.relic);
  if (contribution?.relic !== null && contribution?.relic !== undefined && Number.isFinite(relic) && relic > 0) return `R${relic}`;
  if (contribution?.rarity !== null && contribution?.rarity !== undefined) return `${Number(contribution.rarity)}★`;
  if (contribution?.relic !== null && contribution?.relic !== undefined && Number.isFinite(relic)) return `R${relic}`;
  return '';
}

function stateClass(value) { return text(value).toLowerCase(); }

function statePill(value) {
  const status = text(value).toUpperCase() || 'UNKNOWN';
  return `<span class="rote-ledger-state ${escapeHtml(stateClass(status))}">${escapeHtml(status)}</span>`;
}

function sourceLabel(entry = {}) {
  const contribution = entry?.effectiveContribution;
  if (contribution) return text(contribution.sourceKind).toUpperCase() || 'GUILD DATA';
  if (entry?.assignment) return text(entry.assignment.source).toUpperCase() || 'ASSIGNMENT';
  return text(entry?.slot?.sourceKind).toUpperCase() || 'REFERENCE';
}

function actualLabel(entry = {}) {
  const contribution = entry?.effectiveContribution;
  if (!contribution) return '—';
  if (!contribution.contributorIdentityResolved && !contribution.allyCode) return 'UNKNOWN';
  return memberLabel(contribution);
}

function assignmentLabel(entry = {}) {
  return entry?.assignment ? memberLabel(entry.assignment) : '—';
}

function auditMarkup(entry = {}) {
  const rows = array(entry?.contributions);
  if (!rows.length) return `<small>${Number(entry?.contributionHistoryCount || 0)} evidence row${Number(entry?.contributionHistoryCount || 0) === 1 ? '' : 's'}</small>`;
  return `<details class="rote-ledger-audit"><summary>${rows.length} evidence row${rows.length === 1 ? '' : 's'}</summary>${rows.map((row) => `<div class="rote-ledger-audit-row"><strong>${escapeHtml(text(row.status).toUpperCase())}</strong> · ${escapeHtml(text(row.sourceKind).toUpperCase() || 'UNKNOWN SOURCE')} · ${escapeHtml(memberLabel(row))}<br><small>${escapeHtml(dateTime(row.observedAt))}${row.mismatchReasons?.length ? ` · ${escapeHtml(row.mismatchReasons.join(', '))}` : ''}</small></div>`).join('')}</details>`;
}

function filteredOfficerRows() {
  const rows = array(state.ledger?.slots);
  const query = text(state.search).toLowerCase();
  return rows.filter((entry) => {
    const slot = entry?.slot || {};
    const status = operationLedgerState(entry);
    if (state.phase !== 'All' && slot.phase !== state.phase) return false;
    if (state.planet !== 'All' && slot.planetId !== state.planet) return false;
    if (state.status !== 'All' && status !== state.status) return false;
    if (!query) return true;
    return [slot.phase, slot.planetId, slot.operationName, slot.operationId, slot.requiredBaseId, unitLabel(slot.requiredBaseId), assignmentLabel(entry), actualLabel(entry), status]
      .join(' ').toLowerCase().includes(query);
  });
}

function options(values, selected, allLabel = 'All') {
  return `<option value="All">${escapeHtml(allLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
}

function officerTableMarkup(rows) {
  if (!rows.length) return '<div class="rote-ledger-note">No Operation slots match the current filters.</div>';
  return `<div class="rote-ledger-table-wrap"><table class="rote-ledger-table"><thead><tr><th>Phase / Planet</th><th>Operation / Slot</th><th>Required</th><th>Assigned</th><th>Actual</th><th>State</th><th>Evidence</th><th></th></tr></thead><tbody>${rows.map((entry) => {
    const slot = entry.slot || {};
    const status = operationLedgerState(entry);
    const contribution = entry.effectiveContribution;
    const progression = contributionProgressionLabel(contribution);
    return `<tr data-rote-ledger-slot="${escapeHtml(slot.id)}">
      <td><strong>${escapeHtml(slot.phase || '—')}</strong><small>${escapeHtml(slot.planetId || 'Unknown planet')}</small></td>
      <td><strong>${escapeHtml(slot.operationName || slot.operationId || 'Operation')}</strong><small>Slot ${Number(slot.slotIndex || 0)}</small></td>
      <td><strong>${escapeHtml(unitLabel(slot.requiredBaseId))}</strong><small>${escapeHtml(slot.requiredBaseId)} · ${escapeHtml(requirementLabel(slot))}</small></td>
      <td><strong>${escapeHtml(assignmentLabel(entry))}</strong>${entry.assignment ? `<small>${escapeHtml(dateTime(entry.assignment.assignedAt))}</small>` : ''}</td>
      <td><strong>${escapeHtml(actualLabel(entry))}</strong>${contribution ? `<small>${escapeHtml(text(contribution.baseId) || slot.requiredBaseId)}${progression ? ` · ${escapeHtml(progression)}` : ''}</small>` : ''}</td>
      <td>${statePill(status)}${contribution?.mismatchReasons?.length ? `<small>${escapeHtml(contribution.mismatchReasons.join(', '))}</small>` : ''}</td>
      <td><small>${escapeHtml(sourceLabel(entry))}</small>${auditMarkup(entry)}</td>
      <td><button type="button" class="secondary" data-rote-ledger-confirm="${escapeHtml(slot.id)}">Confirm Actual</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function officerHost() {
  if (location.pathname.replace(/\/+$/, '') !== OPS_PATH) return null;
  const anchor = document.getElementById('guildOpsRequirements');
  if (!anchor) return null;
  let host = document.getElementById('roteOperationLedgerOfficer');
  if (!host) {
    host = document.createElement('section');
    host.id = 'roteOperationLedgerOfficer';
    host.className = 'guild-ops-card rote-ledger-card';
    anchor.insertAdjacentElement('afterend', host);
  }
  return host;
}

function memberHost() {
  if (location.hash !== '#guild') return null;
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel) return null;
  let host = document.getElementById('roteOperationLedgerMember');
  if (!host) {
    host = document.createElement('section');
    host.id = 'roteOperationLedgerMember';
    host.className = 'card workspace-intro rote-ledger-card';
    panel.appendChild(host);
  }
  return host;
}

function markRendered(host) {
  if (host) host.dataset.roteLedgerRendered = 'true';
}

function renderOfficer() {
  const host = officerHost();
  if (!host) return;
  markRendered(host);
  if (state.loading && !state.loaded) {
    host.innerHTML = '<div class="rote-ledger-note">Loading durable ROTE Operation ledger…</div>';
    return;
  }
  if (state.error) {
    host.innerHTML = `<div class="kicker">ROTE OPERATION LEDGER</div><h3>Contribution evidence unavailable</h3><div class="rote-ledger-note danger">${escapeHtml(state.error)}</div><div class="rote-ledger-actions"><button type="button" class="secondary" id="roteLedgerOfficerRetry">Retry Ledger</button></div>`;
    document.getElementById('roteLedgerOfficerRetry')?.addEventListener('click', () => refresh(true));
    return;
  }
  const entries = array(state.ledger?.slots);
  const summary = operationLedgerSummary(entries);
  const phases = [...new Set(entries.map((entry) => text(entry?.slot?.phase)).filter(Boolean))].sort();
  const planets = [...new Set(entries.map((entry) => text(entry?.slot?.planetId)).filter(Boolean))].sort();
  const rows = filteredOfficerRows();
  host.innerHTML = `<div class="rote-ledger-head"><div><div class="kicker">A4 · DURABLE OPERATION CONTRIBUTION LEDGER</div><h3>Assigned ≠ Actually Filled</h3><p>Track who was assigned, who actually contributed, and whether the evidence is verified, mismatched or still unknown. Historical contribution evidence remains append-only.</p></div><div class="rote-ledger-actions"><button type="button" class="secondary" id="roteLedgerRefresh">Refresh Ledger</button><button type="button" id="roteLedgerSync">Sync Canonical Slots</button></div></div>
    ${state.message ? `<div class="rote-ledger-note">${escapeHtml(state.message)}</div>` : ''}
    <div class="rote-ledger-kpis"><div class="rote-ledger-kpi"><span>Total Slots</span><strong>${summary.total}</strong></div><div class="rote-ledger-kpi"><span>Verified</span><strong>${summary.VERIFIED}</strong></div><div class="rote-ledger-kpi"><span>Filled</span><strong>${summary.FILLED}</strong></div><div class="rote-ledger-kpi"><span>Assigned</span><strong>${summary.ASSIGNED}</strong></div><div class="rote-ledger-kpi"><span>Mismatch</span><strong>${summary.MISMATCH}</strong></div><div class="rote-ledger-kpi"><span>Unknown / Vacant</span><strong>${summary.UNKNOWN + summary.VACANT}</strong></div></div>
    <div class="rote-ledger-filters"><label>Phase<select id="roteLedgerPhase">${options(phases, state.phase)}</select></label><label>Planet<select id="roteLedgerPlanet">${options(planets, state.planet)}</select></label><label>State<select id="roteLedgerStatus">${options(['VACANT','ASSIGNED','FILLED','VERIFIED','MISMATCH','UNKNOWN'], state.status)}</select></label><label>Search<input id="roteLedgerSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Unit, member, Operation…"></label></div>
    ${entries.length ? officerTableMarkup(rows) : `<div class="rote-ledger-note warn"><strong>No durable Operation slots are registered for this active ROTE event.</strong><br>Use <em>Sync Canonical Slots</em> to register the current reference requirements. This does not create assignments or contribution evidence.</div>`}
    <div class="rote-ledger-note"><strong>Evidence boundary:</strong> ${escapeHtml(state.ledger?.evidenceBoundary || 'Assignment and contribution remain separate evidence.')}</div>`;
  document.getElementById('roteLedgerRefresh')?.addEventListener('click', () => refresh(true));
  document.getElementById('roteLedgerSync')?.addEventListener('click', syncReference);
  document.getElementById('roteLedgerPhase')?.addEventListener('change', (event) => { state.phase = event.target.value; renderOfficer(); });
  document.getElementById('roteLedgerPlanet')?.addEventListener('change', (event) => { state.planet = event.target.value; renderOfficer(); });
  document.getElementById('roteLedgerStatus')?.addEventListener('change', (event) => { state.status = event.target.value; renderOfficer(); });
  document.getElementById('roteLedgerSearch')?.addEventListener('input', (event) => { state.search = event.target.value; renderOfficer(); });
  for (const button of host.querySelectorAll('[data-rote-ledger-confirm]')) button.addEventListener('click', () => openOfficerDialog(button.dataset.roteLedgerConfirm));
}

function canSelfConfirm(entry, viewer) {
  if (!viewer || !samePlayer(entry?.assignment, viewer)) return false;
  const status = operationLedgerState(entry);
  return status === 'ASSIGNED' || status === 'UNKNOWN';
}

function renderMember() {
  const host = memberHost();
  if (!host) return;
  markRendered(host);
  if (state.loading && !state.loaded) {
    host.innerHTML = '<div class="rote-ledger-note">Loading your durable ROTE Operation assignments…</div>';
    return;
  }
  if (state.error) {
    const signedOut = state.errorCode === 'AUTH_REQUIRED' || state.errorStatus === 401;
    host.innerHTML = `<div class="kicker">MY ROTE OPERATIONS</div><h3>${signedOut ? 'Sign in to view your assignments' : 'Operation ledger unavailable'}</h3><div class="rote-ledger-note ${signedOut ? '' : 'danger'}">${escapeHtml(state.error)}</div><div class="rote-ledger-actions"><button type="button" class="secondary" id="roteLedgerMemberRetry">Retry</button></div>`;
    document.getElementById('roteLedgerMemberRetry')?.addEventListener('click', () => refresh(true));
    return;
  }
  const currentPhase = text(state.event?.event?.currentPhase || state.ledger?.phase || '');
  const rows = operationLedgerViewerRows(state.ledger?.slots, state.viewer || {}, currentPhase);
  host.innerHTML = `<div class="rote-ledger-head"><div><div class="kicker">MY ROTE OPERATIONS · ${escapeHtml(currentPhase || 'ACTIVE EVENT')}</div><h3>${escapeHtml(state.viewer?.name || 'Verified Guild Member')}</h3><p>Your assignments and recorded contributions are shown separately. A missing report is never treated as skipped or failed.</p></div><div class="rote-ledger-actions"><button type="button" class="secondary" id="roteLedgerMemberRefresh">Refresh</button></div></div>
    ${state.message ? `<div class="rote-ledger-note">${escapeHtml(state.message)}</div>` : ''}
    <div class="rote-ledger-member-list">${rows.length ? rows.map((entry) => {
      const slot = entry.slot || {};
      const status = operationLedgerState(entry);
      return `<div class="rote-ledger-member-row"><div><strong>${escapeHtml(slot.operationName || slot.operationId || 'Operation')}</strong><small>${escapeHtml(slot.phase)} · ${escapeHtml(slot.planetId)} · Slot ${Number(slot.slotIndex || 0)}</small></div><div><strong>${escapeHtml(unitLabel(slot.requiredBaseId))}</strong><small>${escapeHtml(slot.requiredBaseId)} · ${escapeHtml(requirementLabel(slot))}</small></div><div>${statePill(status)}<small>${escapeHtml(actualLabel(entry) === '—' ? 'No contribution recorded' : `Actual: ${actualLabel(entry)}`)}</small></div>${canSelfConfirm(entry, state.viewer) ? `<button type="button" data-rote-self-confirm="${escapeHtml(slot.id)}">I Filled This</button>` : '<span></span>'}</div>`;
    }).join('') : `<div class="rote-ledger-note">No assignment or contribution evidence is currently attached to your verified player for ${escapeHtml(currentPhase || 'this active event')}.</div>`}</div>
    <div class="rote-ledger-note"><strong>Important:</strong> pressing <em>I Filled This</em> records your explicit Guild evidence. Railway/server/network failures do not create FAILED or SKIPPED battle outcomes.</div>`;
  document.getElementById('roteLedgerMemberRefresh')?.addEventListener('click', () => refresh(true));
  for (const button of host.querySelectorAll('[data-rote-self-confirm]')) button.addEventListener('click', () => selfConfirm(button.dataset.roteSelfConfirm));
}

function render() {
  renderOfficer();
  renderMember();
}

function ensureDialog() {
  let dialog = document.getElementById('roteLedgerOfficerDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'roteLedgerOfficerDialog';
  dialog.className = 'rote-ledger-dialog';
  dialog.innerHTML = `<form method="dialog" id="roteLedgerOfficerForm"><div class="kicker">OFFICER CONTRIBUTION CONFIRMATION</div><h3 id="roteLedgerDialogTitle">Operation Slot</h3><p id="roteLedgerDialogMeta"></p><div class="rote-ledger-dialog-grid"><label>Actual contributor Ally Code<input id="roteLedgerContributor" inputmode="numeric" maxlength="11" placeholder="123456789 · blank only for UNKNOWN"></label><label>Evidence status<select id="roteLedgerOfficerStatus"><option value="verified">VERIFIED</option><option value="unknown">UNKNOWN</option></select></label></div><div id="roteLedgerDialogMessage" class="rote-ledger-inline-message"></div><div class="rote-ledger-dialog-actions"><button type="button" class="secondary" id="roteLedgerDialogCancel">Cancel</button><button type="submit">Record Evidence</button></div></form>`;
  document.body.appendChild(dialog);
  document.getElementById('roteLedgerDialogCancel')?.addEventListener('click', () => dialog.close());
  document.getElementById('roteLedgerOfficerForm')?.addEventListener('submit', submitOfficerConfirmation);
  return dialog;
}

function entryBySlotId(slotId) {
  return array(state.ledger?.slots).find((entry) => text(entry?.slot?.id) === text(slotId)) || null;
}

function openOfficerDialog(slotId) {
  const entry = entryBySlotId(slotId);
  if (!entry) return;
  const dialog = ensureDialog();
  dialog.dataset.slotId = slotId;
  const slot = entry.slot || {};
  document.getElementById('roteLedgerDialogTitle').textContent = `${slot.phase || ''} · ${slot.operationName || slot.operationId || 'Operation'} · Slot ${Number(slot.slotIndex || 0)}`;
  document.getElementById('roteLedgerDialogMeta').textContent = `${unitLabel(slot.requiredBaseId)} · ${requirementLabel(slot)} · assignment ${assignmentLabel(entry)}`;
  const input = document.getElementById('roteLedgerContributor');
  if (input) input.value = digits(entry?.effectiveContribution?.allyCode || entry?.assignment?.allyCode || '');
  const status = document.getElementById('roteLedgerOfficerStatus');
  if (status) status.value = entry?.effectiveContribution?.status === 'unknown' ? 'unknown' : 'verified';
  const message = document.getElementById('roteLedgerDialogMessage');
  if (message) { message.textContent = ''; message.className = 'rote-ledger-inline-message'; }
  dialog.showModal();
}

async function submitOfficerConfirmation(event) {
  event.preventDefault();
  const dialog = document.getElementById('roteLedgerOfficerDialog');
  const slotId = text(dialog?.dataset.slotId);
  const allyCode = digits(document.getElementById('roteLedgerContributor')?.value);
  const status = text(document.getElementById('roteLedgerOfficerStatus')?.value).toLowerCase() || 'verified';
  const message = document.getElementById('roteLedgerDialogMessage');
  if (status !== 'unknown' && allyCode.length !== 9) {
    if (message) { message.textContent = 'A valid 9-digit Ally Code is required for VERIFIED evidence.'; message.className = 'rote-ledger-inline-message error'; }
    return;
  }
  const evidenceId = pendingEvidenceId('officer', slotId, allyCode || 'unknown');
  try {
    if (message) { message.textContent = 'Recording append-only contribution evidence…'; message.className = 'rote-ledger-inline-message'; }
    await fetchJson(OFFICER_API, { method: 'POST', body: JSON.stringify({
      id: evidenceId,
      eventId: state.event?.event?.id,
      slotRecordId: slotId,
      ...(allyCode ? { contributorAllyCode: allyCode } : {}),
      status,
      observedAt: new Date().toISOString(),
    }) });
    clearPendingEvidence('officer', slotId, allyCode || 'unknown');
    dialog?.close();
    state.message = 'Contribution evidence recorded. Assignment and actual contributor remain separately auditable.';
    await refresh(true);
  } catch (error) {
    if (message) { message.textContent = `${error.message} Retry will reuse the same evidence ID.`; message.className = 'rote-ledger-inline-message error'; }
  }
}

async function selfConfirm(slotId) {
  const evidenceId = pendingEvidenceId('self', slotId, state.viewer?.allyCode || 'self');
  try {
    state.message = 'Recording your contribution…';
    render();
    await fetchJson(SELF_API, { method: 'POST', body: JSON.stringify({
      id: evidenceId,
      eventId: state.event?.event?.id,
      slotRecordId: slotId,
      observedAt: new Date().toISOString(),
    }) });
    clearPendingEvidence('self', slotId, state.viewer?.allyCode || 'self');
    state.message = 'Your Operation contribution was recorded as Guild evidence.';
    await refresh(true);
  } catch (error) {
    state.message = `Contribution was not confirmed by the server: ${error.message}. Retry will reuse the same evidence ID.`;
    render();
  }
}

async function syncReference() {
  try {
    state.message = 'Synchronizing canonical ROTE Operation slot definitions…';
    render();
    const result = await fetchJson(SYNC_API, { method: 'POST' });
    state.message = `Canonical Operation slots synchronized: ${Number(result.savedSlots || 0)} saved${array(result.skipped).length ? ` · ${array(result.skipped).length} unresolved skipped safely` : ''}. No assignment or contribution was inferred.`;
    await refresh(true);
  } catch (error) {
    state.message = `Canonical slot sync failed: ${error.message}`;
    render();
  }
}

async function refresh(force = false) {
  if (state.loading) return;
  if (state.loaded && !force) { render(); return; }
  state.loading = true;
  state.error = '';
  state.errorCode = '';
  state.errorStatus = 0;
  render();
  try {
    const [account, event] = await Promise.all([fetchJson(ACCOUNT_API), fetchJson(EVENT_API)]);
    const ledger = await fetchJson(LEDGER_API);
    state.account = account;
    state.event = event;
    state.ledger = ledger;
    state.viewer = viewerFromAccount(account);
    if (state.phase !== 'All' && !array(ledger?.slots).some((entry) => entry?.slot?.phase === state.phase)) state.phase = 'All';
    state.loaded = true;
  } catch (error) {
    state.error = error.message || 'ROTE Operation ledger is unavailable.';
    state.errorCode = error.code || '';
    state.errorStatus = Number(error.status || 0);
  } finally {
    state.loading = false;
    render();
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    const officer = officerHost();
    const member = memberHost();
    if (!officer && !member) return;
    ensureStylesheet();
    if (!state.loaded && !state.loading && !state.error) {
      refresh(false);
      return;
    }
    if (officer && officer.dataset.roteLedgerRendered !== 'true') renderOfficer();
    if (member && member.dataset.roteLedgerRendered !== 'true') renderMember();
  }, 40);
}

function install() {
  ensureStylesheet();
  schedule();
  const observer = new MutationObserver(() => schedule());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('swgoh:guild-command-snapshot', () => {
    state.loaded = false;
    state.error = '';
    state.errorCode = '';
    state.errorStatus = 0;
    schedule();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

export { requirementLabel as operationLedgerRequirementLabel, samePlayer as operationLedgerSamePlayer };
