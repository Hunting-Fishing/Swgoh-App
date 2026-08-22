const PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = {
  catalog: null,
  roster: null,
  workspace: null,
  timer: 0,
  enhancing: false,
  immutable: {
    phase: 'P1',
    planId: '',
    versions: [],
    loading: false,
    loaded: false,
    error: '',
    delivery: {},
  },
};

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const isRoute = () => location.pathname.replace(/\/+$/, '') === PATH;

function allyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((value) => value.length === 9) || '';
}

function api(suffix = '') {
  return `/api/account/guild-operations/${allyCode()}${suffix}`;
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
    error.code = body?.code;
    throw error;
  }
  return body;
}

async function loadReferenceData() {
  const code = allyCode();
  if (code.length !== 9) return;
  const [workspace, roster, catalog] = await Promise.all([
    fetchJson(api('/workspace')),
    fetchJson(`/api/guild/by-player/${code}/roster`),
    fetchJson('/data/catalog.json?guild-ops-professional=1'),
  ]);
  state.workspace = workspace;
  state.roster = roster;
  state.catalog = Array.isArray(catalog?.units) ? catalog.units : [];
}

function ensureStyle() {
  if (document.querySelector('link[data-guild-ops-professional-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-operations-professional.css?v=20260822-immutable2';
  link.dataset.guildOpsProfessionalStyle = 'true';
  document.head.appendChild(link);
}

function relativeAge(value) {
  const when = Date.parse(value || '');
  if (!Number.isFinite(when)) return 'unknown freshness';
  const seconds = Math.max(0, Math.floor((Date.now() - when) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h old`;
  return `${Math.floor(seconds / 86400)}d old`;
}

function freshnessTone(value) {
  const age = Date.now() - Date.parse(value || 0);
  if (!Number.isFinite(age)) return 'warn';
  if (age <= 30 * 60 * 1000) return 'ready';
  if (age <= 3 * 60 * 60 * 1000) return 'warn';
  return 'risk';
}

function injectFreshnessBar() {
  const shell = document.querySelector('.guild-ops-shell');
  const hero = shell?.querySelector('.guild-ops-hero');
  if (!shell || !hero || document.querySelector('[data-ops-professional-freshness]')) return;
  const syncedAt = state.workspace?.guild?.lastSyncedAt;
  const bar = document.createElement('div');
  bar.className = 'guild-ops-professional-bar';
  bar.dataset.opsProfessionalFreshness = 'true';
  bar.innerHTML = `
    <div>
      <span class="guild-ops-chip ${freshnessTone(syncedAt)}">ROSTER · ${escapeHtml(relativeAge(syncedAt))}</span>
      <small>Last canonical Guild sync: ${escapeHtml(syncedAt ? new Date(syncedAt).toLocaleString() : 'unknown')}</small>
    </div>
    <div class="guild-ops-professional-actions">
      <span class="guild-ops-shortcut-hint">⌘/Ctrl+S save · ⌘/Ctrl+Enter preview · Alt+1…5 workflow</span>
      <button type="button" id="opsProfessionalRefresh" class="guild-ops-button secondary">Refresh Guild Now</button>
    </div>`;
  hero.insertAdjacentElement('afterend', bar);
  document.getElementById('opsProfessionalRefresh')?.addEventListener('click', refreshGuild);
}

async function refreshGuild() {
  const button = document.getElementById('opsProfessionalRefresh');
  if (button) { button.disabled = true; button.textContent = 'Refreshing…'; }
  try {
    await fetchJson(`/api/guild/by-player/${allyCode()}/roster?refresh=1`);
    window.dispatchEvent(new CustomEvent('swgoh:guild-command-snapshot', { detail: { force: true, source: 'guild-operations' } }));
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = 'Refresh failed — retry'; button.title = error.message; }
  }
}

function catalogOptions() {
  return (state.catalog || [])
    .filter((unit) => unit?.baseId && unit?.name)
    .slice()
    .sort((a, b) => text(a.name).localeCompare(text(b.name)))
    .map((unit) => `<option value="${escapeHtml(unit.baseId)}">${escapeHtml(unit.name)} · ${escapeHtml(unit.baseId)}</option>`)
    .join('');
}

function ensureUnitDatalist() {
  if (document.getElementById('guildOpsUnitIds')) return;
  const datalist = document.createElement('datalist');
  datalist.id = 'guildOpsUnitIds';
  datalist.innerHTML = (state.catalog || [])
    .filter((unit) => unit?.baseId && unit?.name)
    .slice()
    .sort((a, b) => text(a.name).localeCompare(text(b.name)))
    .map((unit) => `<option value="${escapeHtml(unit.baseId)}">${escapeHtml(unit.name)}</option>`)
    .join('');
  document.body.appendChild(datalist);
  for (const id of ['opsRuleWhen', 'opsRuleThen']) {
    const input = document.getElementById(id);
    if (input) input.setAttribute('list', 'guildOpsUnitIds');
  }
}

function currentPlanId() {
  return text(document.getElementById('opsTbPlanSelect')?.value);
}

function immutableStatus(version = {}) {
  if (text(version.status).toLowerCase() === 'cancelled' || version.cancelledAt) return { label: 'CANCELLED', tone: 'risk' };
  if (version.supersededByRunId) return { label: 'SUPERSEDED', tone: 'warn' };
  if (version.approvedAt && text(version.approvedPlanHash).toLowerCase() === text(version.planHash).toLowerCase()) return { label: 'APPROVED', tone: 'ready' };
  return { label: 'REVIEW REQUIRED', tone: 'warn' };
}

function immutableSummary(version = {}) {
  const phase = version?.diagnostics?.phaseSummary || {};
  const assigned = Number(phase.assigned ?? version?.assignments?.length ?? 0);
  const unfilled = Number(phase.unfilled ?? version?.unfilled?.length ?? 0);
  const help = Number(phase.helpAssignments ?? 0);
  return `${assigned} assigned · ${unfilled} unfilled · ${help} HELP/risk`;
}

function deliveryPreviewMarkup(runId, delivery = {}) {
  const preview = delivery?.preview;
  const published = delivery?.published;
  if (!preview && !published) return '';
  const coverage = preview?.mentionCoverage || published?.mentionCoverage || {};
  const destination = preview?.destination || published?.destination || {};
  const chunks = Array.isArray(preview?.chunks) ? preview.chunks : [];
  return `<section class="guild-ops-stage10-preview">
    <div class="kicker">STAGE 10 · EXACT DELIVERY PREVIEW</div>
    <div class="guild-ops-immutable-metrics">
      <span>Destination: <b>${escapeHtml(destination.display_name || destination.displayName || preview?.channelId || published?.channelId || 'verified channel')}</b></span>
      <span>Mentions: <b>${Number(coverage.linkedMembers || 0)}/${Number(coverage.assignedMembers || 0)} linked</b></span>
      <span>Existing delivered chunks: <b>${Number(preview?.delivered || published?.reusedChunks || 0)}</b></span>
    </div>
    ${chunks.length ? `<div class="guild-ops-stage10-chunks">${chunks.map((chunk, index) => `<details${index === 0 ? ' open' : ''}><summary>Discord message ${index + 1} · ${Number(chunk?.content?.length || 0)} chars</summary><pre>${escapeHtml(chunk?.content || '')}</pre></details>`).join('')}</div>` : ''}
    ${published ? `<div class="guild-ops-inline-result"><span class="guild-ops-chip ready">PUBLISHED · ${Number(published.newMessages || 0)} new · ${Number(published.reusedChunks || 0)} reused</span></div>` : ''}
    ${preview && !published ? `<label class="guild-ops-immutable-publish-confirm"><span>Final network confirmation</span><input type="text" autocomplete="off" spellcheck="false" placeholder="Type PUBLISH" data-immutable-publish-confirm="${escapeHtml(runId)}"></label><button type="button" data-immutable-publish="${escapeHtml(runId)}" disabled>Publish Approved Artifact to Discord</button>` : ''}
  </section>`;
}

function immutableVersionMarkup(entry = {}) {
  const version = entry?.version || {};
  const verification = entry?.verification || {};
  const status = immutableStatus(version);
  const id = text(version.id);
  const hash = text(version.planHash);
  const approved = status.label === 'APPROVED';
  const actionable = !approved && status.label !== 'CANCELLED' && status.label !== 'SUPERSEDED';
  const delivery = state.immutable.delivery[id] || {};
  return `<article class="guild-ops-immutable-version" data-immutable-version="${escapeHtml(id)}">
    <header>
      <div><span class="guild-ops-chip ${status.tone}">${escapeHtml(status.label)}</span><strong>v${Number(version.versionNumber || 0)} · ${escapeHtml(version.rotePhase || state.immutable.phase)}</strong></div>
      <small>${escapeHtml(version.createdAt ? new Date(version.createdAt).toLocaleString() : '')}</small>
    </header>
    <div class="guild-ops-immutable-metrics"><span>${escapeHtml(immutableSummary(version))}</span><span>Hash verification: <b>${verification.valid === true ? 'VALID' : 'FAILED'}</b></span></div>
    <label class="guild-ops-immutable-hash-label"><span>IMMUTABLE PLAN HASH · FULL 64 CHARACTERS</span><code>${escapeHtml(hash || 'hash unavailable')}</code></label>
    ${actionable ? `<label class="guild-ops-immutable-review"><input type="checkbox" data-immutable-review="${escapeHtml(id)}"> <span>I reviewed this exact v${Number(version.versionNumber || 0)} artifact and hash.</span></label>` : ''}
    ${approved ? `<label class="guild-ops-immutable-review"><input type="checkbox" data-immutable-mentions="${escapeHtml(id)}"${delivery.includeMentions === false ? '' : ' checked'}> <span>Mention linked assigned members in the verified Discord channel.</span></label>` : ''}
    <div class="guild-ops-actions">
      ${actionable ? `<button type="button" data-immutable-approve="${escapeHtml(id)}" data-plan-hash="${escapeHtml(hash)}" disabled>Approve Exact Artifact</button><button type="button" class="secondary" data-immutable-cancel="${escapeHtml(id)}">Cancel Version</button>` : ''}
      ${approved ? `<button type="button" class="secondary" data-immutable-stage10-preview="${escapeHtml(id)}">Preview Stage 10 Delivery</button><button type="button" class="secondary" data-immutable-stage10-status="${escapeHtml(id)}">Delivery Status</button>` : ''}
    </div>
    ${approved ? deliveryPreviewMarkup(id, delivery) : ''}
  </article>`;
}

function renderImmutablePanel() {
  const root = document.querySelector('[data-ops-immutable-review]');
  if (!root) return;
  const planId = currentPlanId();
  const binding = state.workspace?.discordBinding;
  const versions = state.immutable.versions || [];
  root.innerHTML = `
    <div class="kicker">IMMUTABLE OFFICER ASSIGNMENT REVIEW</div>
    <div class="guild-ops-immutable-head">
      <div><h3>Website approval and Stage 10 delivery for the exact assignment artifact</h3><p>Generate from the saved web plan, inspect the exact immutable hash, approve it, preview the exact Discord messages, then explicitly publish.</p></div>
      <span class="guild-ops-chip ${binding?.verified ? 'ready' : 'warn'}">${binding?.verified ? 'VERIFIED GUILD BINDING' : 'BINDING REQUIRED'}</span>
    </div>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Saved ROTE plan</span><strong>${escapeHtml(planId ? document.getElementById('opsTbPlanSelect')?.selectedOptions?.[0]?.textContent || planId : 'Select a saved plan')}</strong></label>
      <label class="guild-ops-field"><span>ROTE phase</span><select id="opsImmutablePhase">${['P1','P2','P3','P4','P5','P6'].map((phase) => `<option value="${phase}"${phase === state.immutable.phase ? ' selected' : ''}>${phase}</option>`).join('')}</select></label>
      <div class="guild-ops-field"><span>Version state</span><strong>${state.immutable.loading ? 'Working…' : `${versions.length} version(s) loaded`}</strong></div>
    </div>
    <div class="guild-ops-actions">
      <button type="button" id="opsImmutableGenerate" ${!planId || state.immutable.loading ? 'disabled' : ''}>Generate Immutable Version</button>
      <button type="button" id="opsImmutableRefresh" class="secondary" ${!planId || state.immutable.loading ? 'disabled' : ''}>Refresh Version History</button>
    </div>
    ${state.immutable.error ? `<div class="guild-ops-inline-result"><span class="guild-ops-chip risk">${escapeHtml(state.immutable.error)}</span></div>` : ''}
    <div class="guild-ops-immutable-history">${versions.length ? versions.map(immutableVersionMarkup).join('') : `<div class="guild-ops-inline-result">${state.immutable.loaded ? 'No immutable versions exist for this plan and phase yet.' : 'Select a plan and load its immutable history.'}</div>`}</div>`;
}

async function loadImmutableVersions(force = false) {
  const planId = currentPlanId();
  if (!planId) {
    state.immutable.planId = '';
    state.immutable.versions = [];
    state.immutable.loaded = true;
    renderImmutablePanel();
    return;
  }
  if (!force && state.immutable.loaded && state.immutable.planId === planId) return;
  state.immutable.loading = true;
  state.immutable.error = '';
  state.immutable.planId = planId;
  renderImmutablePanel();
  try {
    const body = await fetchJson(api(`/tb/plans/${planId}/assignment-versions?phase=${encodeURIComponent(state.immutable.phase)}`));
    state.immutable.versions = Array.isArray(body?.versions) ? body.versions : [];
    state.immutable.loaded = true;
  } catch (error) {
    state.immutable.versions = [];
    state.immutable.loaded = true;
    state.immutable.error = error?.message || 'Immutable version history is unavailable.';
  } finally {
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

async function generateImmutableVersion() {
  const planId = currentPlanId();
  if (!planId || state.immutable.loading) return;
  state.immutable.loading = true;
  state.immutable.error = '';
  renderImmutablePanel();
  try {
    await fetchJson(api(`/tb/plans/${planId}/immutable-preview`), { method:'POST', body:JSON.stringify({phase:state.immutable.phase}) });
    state.immutable.loaded = false;
    state.immutable.delivery = {};
    await loadImmutableVersions(true);
  } catch (error) {
    state.immutable.error = error?.message || 'Immutable preview creation failed.';
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

async function approveImmutableVersion(runId, planHash) {
  if (!runId || !/^[0-9a-f]{64}$/i.test(planHash) || state.immutable.loading) return;
  state.immutable.loading = true;
  state.immutable.error = '';
  renderImmutablePanel();
  try {
    await fetchJson(api(`/tb/assignment-versions/${runId}/approve`), { method:'POST', body:JSON.stringify({planHash}) });
    state.immutable.loaded = false;
    delete state.immutable.delivery[runId];
    await loadImmutableVersions(true);
  } catch (error) {
    state.immutable.error = error?.message || 'Immutable artifact approval failed.';
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

async function cancelImmutableVersion(runId) {
  if (!runId || state.immutable.loading) return;
  const reason = window.prompt('Optional cancellation reason for the immutable audit log:', 'Officer replaced this assignment version');
  if (reason === null) return;
  state.immutable.loading = true;
  state.immutable.error = '';
  renderImmutablePanel();
  try {
    await fetchJson(api(`/tb/assignment-versions/${runId}/cancel`), { method:'POST', body:JSON.stringify({reason}) });
    state.immutable.loaded = false;
    delete state.immutable.delivery[runId];
    await loadImmutableVersions(true);
  } catch (error) {
    state.immutable.error = error?.message || 'Immutable artifact cancellation failed.';
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

function immutableMentions(runId) {
  const checkbox = document.querySelector(`[data-immutable-mentions="${CSS.escape(runId)}"]`);
  if (checkbox) return checkbox.checked;
  return state.immutable.delivery[runId]?.includeMentions !== false;
}

async function previewImmutableDelivery(runId) {
  if (!runId || state.immutable.loading) return;
  const includeMentions = immutableMentions(runId);
  state.immutable.loading = true;
  state.immutable.error = '';
  renderImmutablePanel();
  try {
    const preview = await fetchJson(api(`/tb/assignment-versions/${runId}/stage10-preview`), { method:'POST', body:JSON.stringify({includeMentions}) });
    state.immutable.delivery[runId] = { includeMentions, preview };
  } catch (error) {
    state.immutable.error = error?.message || 'Stage 10 delivery preview failed.';
  } finally {
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

async function refreshImmutableDeliveryStatus(runId) {
  if (!runId || state.immutable.loading) return;
  const includeMentions = immutableMentions(runId);
  state.immutable.loading = true;
  state.immutable.error = '';
  renderImmutablePanel();
  try {
    const status = await fetchJson(api(`/tb/assignment-versions/${runId}/stage10-status`), { method:'POST', body:JSON.stringify({includeMentions}) });
    state.immutable.delivery[runId] = { ...(state.immutable.delivery[runId] || {}), includeMentions, status };
  } catch (error) {
    state.immutable.error = error?.message || 'Stage 10 delivery status failed.';
  } finally {
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

async function publishImmutableDelivery(runId, planHash) {
  const delivery = state.immutable.delivery[runId];
  if (!runId || !delivery?.preview || !/^[0-9a-f]{64}$/i.test(planHash) || state.immutable.loading) return;
  const confirmation = document.querySelector(`[data-immutable-publish-confirm="${CSS.escape(runId)}"]`);
  if (text(confirmation?.value).toUpperCase() !== 'PUBLISH') return;
  if (!window.confirm('Publish this exact approved immutable artifact to the verified Discord destination now?')) return;
  state.immutable.loading = true;
  state.immutable.error = '';
  renderImmutablePanel();
  try {
    const published = await fetchJson(api(`/tb/assignment-versions/${runId}/publish-immutable`), {
      method:'POST',
      body:JSON.stringify({ includeMentions:delivery.includeMentions !== false, confirm:'PUBLISH', planHash }),
    });
    state.immutable.delivery[runId] = { ...delivery, published };
  } catch (error) {
    state.immutable.error = error?.message || 'Stage 10 immutable publish failed.';
  } finally {
    state.immutable.loading = false;
    renderImmutablePanel();
  }
}

function immutableReviewPanel() {
  let root = document.querySelector('[data-ops-immutable-review]');
  let created = false;
  if (!root) {
    const anchor = document.getElementById('guildOpsRequirements') || document.querySelector('.guild-ops-shell .guild-ops-card');
    if (!anchor) return;
    root = document.createElement('section');
    root.className = 'guild-ops-card guild-ops-immutable-review-card';
    root.dataset.opsImmutableReview = 'true';
    anchor.insertAdjacentElement('beforebegin', root);
    created = true;
    root.addEventListener('change', (event) => {
      if (event.target?.id === 'opsImmutablePhase') {
        state.immutable.phase = event.target.value || 'P1';
        state.immutable.loaded = false;
        state.immutable.versions = [];
        state.immutable.delivery = {};
        void loadImmutableVersions(true);
        return;
      }
      const reviewed = event.target?.closest?.('[data-immutable-review]');
      if (reviewed) {
        const button = root.querySelector(`[data-immutable-approve="${CSS.escape(reviewed.dataset.immutableReview || '')}"]`);
        if (button) button.disabled = !reviewed.checked;
        return;
      }
      const mentions = event.target?.closest?.('[data-immutable-mentions]');
      if (mentions) {
        const runId = mentions.dataset.immutableMentions || '';
        state.immutable.delivery[runId] = { includeMentions:mentions.checked };
        renderImmutablePanel();
      }
    });
    root.addEventListener('input', (event) => {
      const confirmation = event.target?.closest?.('[data-immutable-publish-confirm]');
      if (!confirmation) return;
      const runId = confirmation.dataset.immutablePublishConfirm || '';
      const button = root.querySelector(`[data-immutable-publish="${CSS.escape(runId)}"]`);
      if (button) button.disabled = text(confirmation.value).toUpperCase() !== 'PUBLISH';
    });
    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('#opsImmutableGenerate')) { void generateImmutableVersion(); return; }
      if (event.target?.closest?.('#opsImmutableRefresh')) { void loadImmutableVersions(true); return; }
      const approve = event.target?.closest?.('[data-immutable-approve]');
      if (approve) { void approveImmutableVersion(approve.dataset.immutableApprove, approve.dataset.planHash); return; }
      const cancel = event.target?.closest?.('[data-immutable-cancel]');
      if (cancel) { void cancelImmutableVersion(cancel.dataset.immutableCancel); return; }
      const stage10Preview = event.target?.closest?.('[data-immutable-stage10-preview]');
      if (stage10Preview) { void previewImmutableDelivery(stage10Preview.dataset.immutableStage10Preview); return; }
      const stage10Status = event.target?.closest?.('[data-immutable-stage10-status]');
      if (stage10Status) { void refreshImmutableDeliveryStatus(stage10Status.dataset.immutableStage10Status); return; }
      const publish = event.target?.closest?.('[data-immutable-publish]');
      if (publish) {
        const version = state.immutable.versions.find((entry) => text(entry?.version?.id) === text(publish.dataset.immutablePublish))?.version;
        void publishImmutableDelivery(publish.dataset.immutablePublish, text(version?.planHash));
      }
    });
  }
  const select = document.getElementById('opsTbPlanSelect');
  if (select && select.dataset.immutableReviewBound !== 'true') {
    select.dataset.immutableReviewBound = 'true';
    select.addEventListener('change', () => {
      state.immutable.planId = '';
      state.immutable.loaded = false;
      state.immutable.versions = [];
      state.immutable.delivery = {};
      state.immutable.error = '';
      void loadImmutableVersions(true);
    });
  }
  if (created) renderImmutablePanel();
  if (!state.immutable.loading && (!state.immutable.loaded || state.immutable.planId !== currentPlanId())) void loadImmutableVersions();
}

async function mutateTbPlan(mutator) {
  const id = currentPlanId();
  if (!id) throw new Error('Save or select a ROTE plan first.');
  const detail = await fetchJson(api(`/tb/plans/${id}`));
  const plan = detail?.plan;
  if (!plan?.id) throw new Error('The selected ROTE plan could not be loaded.');
  const next = JSON.parse(JSON.stringify(plan));
  mutator(next);
  await fetchJson(api('/tb/plans'), { method:'POST', body:JSON.stringify({ ...next, status:'draft' }) });
  location.reload();
}

function requirementEditor() {
  if (document.querySelector('[data-ops-requirement-editor]')) return;
  const board = document.getElementById('guildOpsRequirements');
  const slotSelect = document.getElementById('opsPreSlot');
  if (!board || !slotSelect) return;
  const card = document.createElement('section');
  card.className = 'guild-ops-card guild-ops-requirement-editor';
  card.dataset.opsRequirementEditor = 'true';
  const slotOptions = [...slotSelect.options].map((option) => option.outerHTML).join('');
  card.innerHTML = `
    <div class="kicker">OFFICER REQUIREMENT EDITOR</div>
    <h3>Override, ignore, or restore a specific Operation slot</h3>
    <p>Canonical requirements remain untouched. Every change below is stored as an officer overlay and appears in the audit trail.</p>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Operation slot</span><select id="opsOverrideSlot">${slotOptions}</select></label>
      <label class="guild-ops-field"><span>Replacement unit</span><select id="opsOverrideUnit"><option value="">Keep canonical unit</option>${catalogOptions()}</select></label>
      <label class="guild-ops-field"><span>Required relic</span><input id="opsOverrideRelic" type="number" min="0" max="9" placeholder="Keep canonical"></label>
      <label class="guild-ops-field"><span>Required rarity</span><input id="opsOverrideRarity" type="number" min="1" max="7" placeholder="Keep canonical"></label>
    </div>
    <div class="guild-ops-actions">
      <button type="button" id="opsOverrideSave">Save Officer Override</button>
      <button type="button" id="opsOverrideReset" class="secondary">Restore Canonical Requirement</button>
      <button type="button" id="opsOverrideIgnore" class="secondary">Ignore This Slot</button>
      <button type="button" id="opsOverrideInclude" class="secondary">Re-include This Slot</button>
    </div>
    <div id="opsOverrideResult" class="guild-ops-inline-result"></div>`;
  board.insertAdjacentElement('afterend', card);

  const run = async (fn) => {
    const result = document.getElementById('opsOverrideResult');
    try { if (result) result.textContent = 'Saving officer overlay…'; await fn(); }
    catch (error) { if (result) result.innerHTML = `<span class="guild-ops-chip risk">${escapeHtml(error.message)}</span>`; }
  };
  document.getElementById('opsOverrideSave')?.addEventListener('click', () => run(async () => {
    const slotId = text(document.getElementById('opsOverrideSlot')?.value);
    if (!slotId) throw new Error('Choose an Operation slot.');
    const baseId = text(document.getElementById('opsOverrideUnit')?.value).toUpperCase();
    const relicRaw = text(document.getElementById('opsOverrideRelic')?.value);
    const rarityRaw = text(document.getElementById('opsOverrideRarity')?.value);
    if (!baseId && !relicRaw && !rarityRaw) throw new Error('Choose at least one override field.');
    await mutateTbPlan((plan) => {
      plan.requirementOverrides = plan.requirementOverrides || {};
      plan.requirementOverrides[slotId] = {
        ...(baseId ? { baseId } : {}),
        ...(relicRaw ? { requiredRelic:Number(relicRaw) } : {}),
        ...(rarityRaw ? { requiredRarity:Number(rarityRaw) } : {}),
      };
    });
  }));
  document.getElementById('opsOverrideReset')?.addEventListener('click', () => run(() => mutateTbPlan((plan) => {
    plan.requirementOverrides = plan.requirementOverrides || {};
    delete plan.requirementOverrides[text(document.getElementById('opsOverrideSlot')?.value)];
  })));
  document.getElementById('opsOverrideIgnore')?.addEventListener('click', () => run(() => mutateTbPlan((plan) => {
    const slotId = text(document.getElementById('opsOverrideSlot')?.value);
    if (!slotId) throw new Error('Choose an Operation slot.');
    plan.ignoredSlots = [...new Set([...(plan.ignoredSlots || []), slotId])];
  })));
  document.getElementById('opsOverrideInclude')?.addEventListener('click', () => run(() => mutateTbPlan((plan) => {
    const slotId = text(document.getElementById('opsOverrideSlot')?.value);
    if (!slotId) throw new Error('Choose an Operation slot.');
    plan.ignoredSlots = (plan.ignoredSlots || []).filter((value) => text(value) !== slotId);
  })));
}

function enhanceIgnoreField(inputId, title) {
  const input = document.getElementById(inputId);
  if (!input || input.parentElement?.querySelector('[data-ignore-chips]')) return;
  const values = text(input.value).split(',').map((v) => v.trim()).filter(Boolean);
  const wrap = document.createElement('div');
  wrap.className = 'guild-ops-ignore-chips';
  wrap.dataset.ignoreChips = 'true';
  wrap.innerHTML = values.length
    ? values.map((value) => `<button type="button" class="guild-ops-chip warn" data-remove-ignore="${escapeHtml(value)}" title="Re-include ${escapeHtml(title)}">${escapeHtml(value)} ×</button>`).join('')
    : `<small>No ignored ${escapeHtml(title)}.</small>`;
  input.insertAdjacentElement('afterend', wrap);
  for (const button of wrap.querySelectorAll('[data-remove-ignore]')) button.addEventListener('click', () => {
    const remove = button.dataset.removeIgnore;
    input.value = text(input.value).split(',').map((v) => v.trim()).filter((v) => v && v !== remove).join(', ');
    input.dispatchEvent(new Event('input', { bubbles:true }));
    wrap.remove();
    enhanceIgnoreField(inputId, title);
  });
}

function twStructuredBuilder() {
  const raw = document.getElementById('opsTwTeamUnits');
  if (!raw || document.querySelector('[data-tw-unit-builder]')) return;
  raw.placeholder = 'Structured picker below writes this field automatically';
  const builder = document.createElement('div');
  builder.className = 'guild-ops-unit-builder';
  builder.dataset.twUnitBuilder = 'true';
  builder.innerHTML = `
    <label class="guild-ops-field"><span>Find unit</span><select id="opsTwUnitPicker"><option value="">Search/select unit</option>${catalogOptions()}</select></label>
    <label class="guild-ops-field"><span>Minimum relic</span><select id="opsTwUnitRelic">${Array.from({length:10},(_,i)=>`<option value="${i}" ${i===5?'selected':''}>R${i}</option>`).join('')}</select></label>
    <button type="button" id="opsTwUnitAdd" class="guild-ops-button secondary">Add Unit to Team</button>`;
  raw.insertAdjacentElement('afterend', builder);
  document.getElementById('opsTwUnitAdd')?.addEventListener('click', () => {
    const baseId = text(document.getElementById('opsTwUnitPicker')?.value).toUpperCase();
    const relic = Number(document.getElementById('opsTwUnitRelic')?.value || 0);
    if (!baseId) return;
    const tokens = text(raw.value).split(',').map((v)=>v.trim()).filter(Boolean);
    const filtered = tokens.filter((token)=>text(token.split(':')[0]).toUpperCase()!==baseId);
    filtered.push(`${baseId}:R${relic}`);
    raw.value = filtered.join(', ');
    raw.dispatchEvent(new Event('input',{bubbles:true}));
  });
}

function humanizePreassignments() {
  const map = new Map((state.roster?.members || []).map((member)=>[text(member.playerId || member.id),member]));
  const card = [...document.querySelectorAll('.guild-ops-card')].find((node)=>/PRE-ASSIGNMENTS/.test(text(node.querySelector('.kicker')?.textContent)));
  if (!card || card.dataset.humanized === 'true') return;
  for (const row of card.querySelectorAll('tbody tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;
    const id = text(cells[2].textContent);
    const member = map.get(id);
    if (member) cells[2].innerHTML = `<strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.allyCode || '')}</small>`;
  }
  card.dataset.humanized = 'true';
}

function installKeyboardShortcuts() {
  if (document.body.dataset.guildOpsShortcuts === 'true') return;
  document.body.dataset.guildOpsShortcuts = 'true';
  document.addEventListener('keydown', (event) => {
    if (!isRoute()) return;
    const target = event.target;
    const typing = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const button = document.querySelector('.guild-ops-tab.active')?.textContent?.includes('TW') ? document.getElementById('opsTwSave') : document.getElementById('opsTbSave');
      button?.click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      const button = document.querySelector('.guild-ops-tab.active')?.textContent?.includes('TW') ? document.getElementById('opsTwPreview') : document.getElementById('opsTbPreview');
      button?.click();
      return;
    }
    if (!typing && event.altKey && /^[1-5]$/.test(event.key)) {
      event.preventDefault();
      document.querySelectorAll('.guild-ops-step')[Number(event.key)-1]?.click();
    }
  });
}

function addAccessibilityLabels() {
  for (const button of document.querySelectorAll('.guild-ops-step, .guild-ops-tab')) if (!button.getAttribute('type')) button.setAttribute('type','button');
  for (const table of document.querySelectorAll('.guild-ops-table')) table.setAttribute('role','table');
}

async function enhance() {
  if (!isRoute() || state.enhancing || !document.querySelector('.guild-ops-shell')) return;
  state.enhancing = true;
  try {
    ensureStyle();
    if (!state.workspace || !state.catalog || !state.roster) await loadReferenceData();
    injectFreshnessBar();
    ensureUnitDatalist();
    immutableReviewPanel();
    enhanceIgnoreField('opsIgnoredMissions','missions');
    enhanceIgnoreField('opsIgnoredPlatoons','Operations');
    requirementEditor();
    twStructuredBuilder();
    humanizePreassignments();
    installKeyboardShortcuts();
    addAccessibilityLabels();
  } catch (error) {
    console.warn('Guild Operations professional enhancement unavailable:', error?.message || error);
  } finally {
    state.enhancing = false;
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(enhance,90);
}

function install() {
  if (!location.pathname.startsWith('/guild')) return;
  schedule();
  new MutationObserver((mutations) => {
    if (!isRoute()) return;
    if (mutations.some((mutation)=>[...mutation.addedNodes].some((node)=>node.nodeType===1))) schedule();
  }).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('swgoh:guild-command-snapshot', () => {
    state.workspace = null;
    state.roster = null;
    state.immutable.loaded = false;
    state.immutable.delivery = {};
    schedule();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();