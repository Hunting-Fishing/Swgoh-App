const state = { catalog: null, currentRun: null };

const $ = (selector) => document.querySelector(selector);
const text = (value) => String(value ?? '').trim();
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const compact = (value) => {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return number(n);
};
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const formatAlly = (value) => text(value).replace(/\D/g, '').slice(0,9).replace(/(\d{3})(?=\d)/g, '$1-');
const dateTime = (value) => {
  const stamp = Date.parse(text(value));
  return Number.isFinite(stamp) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stamp)) : '—';
};

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

function setMessage(message = '', error = false) {
  const target = $('[data-action-message]');
  if (!target) return;
  target.textContent = message;
  target.className = 'action-message';
  if (message) target.classList.add('visible', ...(error ? ['error'] : []));
}
function setShareMessage(message = '', error = false) {
  const target = $('[data-share-message]');
  if (!target) return;
  target.innerHTML = message ? `<span class="${error ? 'err' : 'ok'}">${escapeHtml(message)}</span>` : '';
}
function setBusy(button, busy, busyLabel = 'Working…') {
  if (!button) return;
  if (!button.dataset.idle) button.dataset.idle = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.idle;
}

function actionCard(action) {
  const attempts = action.inputs?.find((input) => input.key === 'maxAttempts');
  return `<article class="action-card" data-action-card="${escapeHtml(action.key)}">
    <div class="action-kicker">${escapeHtml(action.category || 'COMMAND')}</div>
    <h2>${escapeHtml(action.label)}</h2>
    <div class="action-aliases">${(action.commandAliases || []).map((alias) => `<span class="action-chip">${escapeHtml(alias)}</span>`).join('')}<span class="action-chip">WEB NATIVE</span><span class="action-chip">DISCORD OPTIONAL</span></div>
    <p>${escapeHtml(action.description)}</p>
    <form class="action-form" data-action-form="${escapeHtml(action.key)}">
      ${attempts ? `<label><span>${escapeHtml(attempts.label)}</span><input name="maxAttempts" type="number" min="${attempts.min}" max="${attempts.max}" value="${attempts.default}" required></label>` : ''}
      <button type="submit">Run ${escapeHtml(action.label)}</button>
    </form>
  </article>`;
}

function renderCatalog(body) {
  state.catalog = body;
  const identity = body.identity || {};
  const target = $('[data-action-identity]');
  if (target) target.innerHTML = `<strong>${escapeHtml(identity.playerName || 'Verified player')}</strong> · ${escapeHtml(formatAlly(identity.allyCode))}${identity.activeGuildMember ? ` · Guild role ${escapeHtml((identity.guildRole || 'member').toUpperCase())}` : ' · No active Guild membership'}`;
  const catalog = $('[data-action-catalog]');
  if (catalog) catalog.innerHTML = (body.actions || []).map(actionCard).join('') || '<article class="action-card"><h2>No website actions available yet.</h2></article>';
  for (const form of document.querySelectorAll('[data-action-form]')) form.addEventListener('submit', runAction);
  configureShareControls();
}

function unitChip(unit) {
  return `<span class="attempt-chip">${escapeHtml(unit.name || unit.baseId)} · ${escapeHtml(unit.progression || '')}</span>`;
}
function renderRaidMax(result) {
  const summary = result.summary || {};
  const attempts = result.attempts || [];
  return `<div class="result-kpis">
    <div class="result-kpi"><span>Eligible Owned</span><strong>${number(summary.eligibleOwned)}</strong></div>
    <div class="result-kpi"><span>Validated Routes</span><strong>${number(summary.validatedRoutes)}</strong></div>
    <div class="result-kpi"><span>Attempts Built</span><strong>${number(summary.attemptsBuilt)} / 5</strong></div>
    <div class="result-kpi"><span>Validated Score Ceiling</span><strong>${compact(summary.recommendedMaxScoreCeiling)}</strong></div>
  </div>
  <div class="attempts">${attempts.map((attempt) => {
    const fallback = attempt.source === 'roster-only-fallback';
    return `<article class="attempt-card ${fallback ? 'fallback' : ''}">
      <div class="attempt-head"><div><div class="action-kicker">ATTEMPT ${number(attempt.attempt)}</div><h3>${escapeHtml(attempt.name)}</h3></div><div><span class="action-chip">${escapeHtml(attempt.difficulty?.requirement || '')}</span> <span class="action-chip">${compact(attempt.maxScoreCeiling)} ceiling</span>${fallback ? ' <span class="action-chip">ROSTER-ONLY</span>' : ' <span class="action-chip">VALIDATED ROUTE</span>'}</div></div>
      <div class="attempt-units">${(attempt.units || []).map(unitChip).join('')}</div>
      <div class="attempt-note">${escapeHtml(attempt.note || '')}</div>
    </article>`;
  }).join('')}</div>
  <div class="evidence-note"><strong>Score boundary:</strong> ${escapeHtml(result.evidence?.disclaimer || 'Difficulty ceilings are not guaranteed damage predictions.')}</div>`;
}

function renderResult(payload) {
  state.currentRun = payload;
  const panel = $('[data-action-result-panel]');
  panel?.classList.remove('hidden');
  const title = $('[data-result-title]');
  if (title) title.textContent = payload.action?.label || payload.result?.action || 'Action Result';
  const runId = $('[data-run-id]');
  if (runId) runId.textContent = payload.runId ? `Run ${payload.runId}` : '';
  const target = $('[data-action-result]');
  if (target) target.innerHTML = payload.result?.action === 'raid-max' ? renderRaidMax(payload.result) : `<pre>${escapeHtml(JSON.stringify(payload.result, null, 2))}</pre>`;
  setShareMessage();
  configureShareControls();
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runAction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const actionKey = form.dataset.actionForm;
  const button = form.querySelector('button[type="submit"]');
  const input = {};
  for (const [key, value] of new FormData(form).entries()) input[key] = /^\d+$/.test(String(value)) ? Number(value) : value;
  setBusy(button, true, 'Building…');
  setMessage(`Running ${actionKey} from your verified website roster…`);
  try {
    const result = await requestJson('/api/account/web-actions/execute', { method: 'POST', body: JSON.stringify({ actionKey, input }) });
    renderResult(result);
    setMessage(`${result.action?.label || actionKey} completed and saved. Nothing was posted automatically.`);
    await loadRecent();
  } catch (error) {
    if (error.status === 401) { location.assign('/login?next=/actions'); return; }
    setMessage(error.message, true);
  } finally { setBusy(button, false); }
}

function configureShareControls() {
  const sharing = state.catalog?.sharing || {};
  const player = $('[data-share-player]');
  const guild = $('[data-share-guild]');
  const discord = $('[data-share-discord]');
  const select = $('[data-discord-destination]');
  if (player) player.disabled = !sharing.playerPage || !state.currentRun;
  if (guild) guild.disabled = !sharing.guildPage || !state.currentRun;
  if (discord) discord.disabled = !sharing.discord || !state.currentRun || !(sharing.discordDestinations || []).length;
  if (select) {
    const destinations = sharing.discordDestinations || [];
    select.innerHTML = destinations.length ? destinations.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.displayName || row.externalId)}</option>`).join('') : '<option value="">No verified Discord channels</option>';
    select.disabled = !sharing.discord || !destinations.length;
  }
}

async function share(targetKind, button) {
  const runId = state.currentRun?.runId;
  if (!runId) return;
  setBusy(button, true, 'Publishing…');
  setShareMessage('Publishing saved result…');
  try {
    const destinationId = targetKind === 'discord' ? $('[data-discord-destination]')?.value : undefined;
    const result = await requestJson(`/api/account/web-actions/${encodeURIComponent(runId)}/share`, {
      method: 'POST', body: JSON.stringify({ targetKind, destinationId }),
    });
    const label = targetKind === 'player-page' ? 'My Player Page' : targetKind === 'guild-page' ? 'Guild Page' : 'Discord';
    setShareMessage(result.reused ? `Already published to ${label}.` : `Published to ${label}.`);
  } catch (error) { setShareMessage(error.message, true); }
  finally { setBusy(button, false); }
}

function recentRows(runs = []) {
  if (!runs.length) return '<div class="empty-state">No website actions have been run yet.</div>';
  return runs.map((run) => `<div class="recent-row"><div><strong>${escapeHtml(run.action_key || 'Action')}</strong><small>${escapeHtml(dateTime(run.created_at))} · source ${escapeHtml(dateTime(run.source_data_at))}</small></div><div><strong>${run.action_key === 'raid-max' ? compact(run.summary?.recommendedMaxScoreCeiling) : ''}</strong><small>${escapeHtml(run.status || '')}</small></div></div>`).join('');
}
async function loadRecent() {
  const target = $('[data-recent-actions]');
  try {
    const body = await requestJson('/api/account/web-actions/recent?limit=20');
    if (target) target.innerHTML = recentRows(body.runs || []);
  } catch (error) {
    if (error.status === 401) { location.assign('/login?next=/actions'); return; }
    if (target) target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadCatalog() {
  try {
    const body = await requestJson('/api/account/web-actions/catalog');
    renderCatalog(body);
  } catch (error) {
    if (error.status === 401) { location.assign('/login?next=/actions'); return; }
    setMessage(error.message, true);
    const target = $('[data-action-catalog]');
    if (target) target.innerHTML = `<article class="action-card"><h2>Action Center unavailable</h2><p>${escapeHtml(error.message)}</p></article>`;
  }
}

$('[data-share-player]')?.addEventListener('click', (event) => share('player-page', event.currentTarget));
$('[data-share-guild]')?.addEventListener('click', (event) => share('guild-page', event.currentTarget));
$('[data-share-discord]')?.addEventListener('click', (event) => share('discord', event.currentTarget));
$('[data-refresh-recent]')?.addEventListener('click', loadRecent);
$('[data-signout]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { await requestJson('/api/auth/signout', { method: 'POST', body: '{}' }); } catch {}
  location.assign('/login');
});

await Promise.all([loadCatalog(), loadRecent()]);
