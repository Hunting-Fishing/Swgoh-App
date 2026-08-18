const OPS_PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { schedules: [], loading: false, timer: 0 };

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const isRoute = () => location.pathname.replace(/\/+$/, '') === OPS_PATH;

function allyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((value) => value.length === 9) || '';
}
function scheduleApi(suffix = '') { return `/api/account/guild-operation-schedules/${allyCode()}${suffix}`; }
async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function defaultLocalDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function localToIso(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) throw new Error('Choose a valid first run date and time.');
  return date.toISOString();
}
function timezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}
function planOptions(kind) {
  const select = document.getElementById(kind === 'tw' ? 'opsTwPlanSelect' : 'opsTbPlanSelect');
  if (!select) return '<option value="">Save a plan first</option>';
  return [...select.options]
    .filter((option) => text(option.value))
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</option>`).join('') || '<option value="">Save a plan first</option>';
}
function destinationOptions() {
  const select = document.getElementById('opsDestination') || document.getElementById('opsDeliveryDestination');
  if (!select) return '<option value="">Use verified default destination</option>';
  return `<option value="">Use verified default destination</option>${[...select.options].filter((o) => text(o.value)).map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.textContent)}</option>`).join('')}`;
}

function statusTone(status, stage) {
  if (status === 'failed' || stage === 'failed') return 'risk';
  if (status === 'completed' || stage === 'complete') return 'ready';
  if (status === 'paused') return 'warn';
  return 'ready';
}
function scheduleRows() {
  if (!state.schedules.length) return '<div class="guild-ops-empty">No scheduled assignments yet.</div>';
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table"><thead><tr><th>Schedule</th><th>Plan</th><th>Next run</th><th>State</th><th>Delivery</th><th>Actions</th></tr></thead><tbody>${state.schedules.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.recurrenceKind)} · ${escapeHtml(row.scheduledTimezone)}</small></td>
      <td><span class="guild-ops-chip">${escapeHtml(row.runType.toUpperCase())}</span><small>${escapeHtml(row.planId)}</small></td>
      <td>${escapeHtml(formatDate(row.nextRunAt))}<small>Last: ${escapeHtml(formatDate(row.lastRunAt))}</small></td>
      <td><span class="guild-ops-chip ${statusTone(row.status,row.stage)}">${escapeHtml(row.status.toUpperCase())}</span><small>${escapeHtml(row.stage)}${row.lastError ? ` · ${escapeHtml(row.lastError)}` : ''}</small></td>
      <td>${row.autoPublish ? 'Auto-publish' : 'Preview only'}<small>${row.includeMentions ? '@mentions' : 'no mentions'} · ${row.sendDms ? 'DMs' : 'no DMs'}</small></td>
      <td><div class="guild-ops-actions compact">
        <button type="button" class="secondary" data-schedule-toggle="${escapeHtml(row.id)}" data-next-status="${row.status === 'paused' ? 'active' : 'paused'}">${row.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button type="button" class="secondary" data-schedule-delete="${escapeHtml(row.id)}">Delete</button>
      </div></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function cardHtml() {
  return `<section class="guild-ops-card guild-ops-scheduler" data-guild-ops-scheduler>
    <div class="kicker">AUTOMATED OPERATIONS · SERVER WORKER</div>
    <h3>Scheduled TB / TW Assignments</h3>
    <p>Every scheduled run <strong>forces a fresh canonical Guild sync first</strong>. The server then rebuilds the assignment preview and fails closed if it is incomplete or unsafe. No browser needs to remain open.</p>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Operation</span><select id="opsScheduleType"><option value="tb">TB / ROTE Operations</option><option value="tw">TW Defense</option></select></label>
      <label class="guild-ops-field"><span>Saved plan</span><select id="opsSchedulePlan">${planOptions('tb')}</select></label>
      <label class="guild-ops-field"><span>Schedule name</span><input id="opsScheduleName" value="ROTE Scheduled Assignment"></label>
      <label class="guild-ops-field"><span>Recurrence</span><select id="opsScheduleRecurrence"><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      <label class="guild-ops-field"><span>First run</span><input id="opsScheduleRunAt" type="datetime-local" value="${escapeHtml(defaultLocalDateTime())}"></label>
      <label class="guild-ops-field"><span>Timezone</span><input id="opsScheduleTimezone" value="${escapeHtml(timezone())}" placeholder="America/Phoenix"></label>
      <label class="guild-ops-field"><span>Discord destination</span><select id="opsScheduleDestination">${destinationOptions()}</select></label>
      <label class="guild-ops-inline"><input id="opsSchedulePublish" type="checkbox" checked> Auto-publish when publish-ready</label>
      <label class="guild-ops-inline"><input id="opsScheduleMentions" type="checkbox"> Include linked @mentions</label>
      <label class="guild-ops-inline"><input id="opsScheduleDms" type="checkbox"> Send member DMs</label>
    </div>
    <div class="guild-ops-actions"><button type="button" id="opsScheduleSave">Create Schedule</button></div>
    <div id="opsScheduleMessage" class="guild-ops-inline-result"></div>
    <div class="guild-ops-note"><strong>Safety:</strong> scheduled publish is blocked if the pre-run Guild refresh fails, the officer loses authority, a TB requirement is unresolved, an Operation slot is unfilled, a pre-assignment is invalid, or TW defense demand cannot be satisfied.</div>
    <div id="opsScheduleList">${scheduleRows()}</div>
  </section>`;
}

function updatePlanOptions() {
  const type = text(document.getElementById('opsScheduleType')?.value) || 'tb';
  const plan = document.getElementById('opsSchedulePlan');
  if (plan) plan.innerHTML = planOptions(type);
  const name = document.getElementById('opsScheduleName');
  if (name && /Scheduled Assignment$/.test(name.value)) name.value = `${type.toUpperCase()} Scheduled Assignment`;
}

async function loadSchedules() {
  if (state.loading || allyCode().length !== 9) return;
  state.loading = true;
  try {
    const body = await fetchJson(scheduleApi());
    state.schedules = Array.isArray(body?.schedules) ? body.schedules : [];
    const list = document.getElementById('opsScheduleList');
    if (list) list.innerHTML = scheduleRows();
    bindRowActions();
  } catch (error) {
    const message = document.getElementById('opsScheduleMessage');
    if (message) message.innerHTML = `<span class="guild-ops-chip risk">${escapeHtml(error.message)}</span>`;
  } finally { state.loading = false; }
}

async function createSchedule() {
  const message = document.getElementById('opsScheduleMessage');
  const type = text(document.getElementById('opsScheduleType')?.value) || 'tb';
  const planId = text(document.getElementById('opsSchedulePlan')?.value);
  if (!planId) { if (message) message.textContent = 'Save/select a plan before scheduling it.'; return; }
  const runAtLocal = text(document.getElementById('opsScheduleRunAt')?.value);
  const localClock = runAtLocal.split('T')[1] || '00:00';
  const payload = {
    runType: type,
    planId,
    name: text(document.getElementById('opsScheduleName')?.value) || `${type.toUpperCase()} Scheduled Assignment`,
    recurrenceKind: text(document.getElementById('opsScheduleRecurrence')?.value) || 'once',
    scheduledTimezone: text(document.getElementById('opsScheduleTimezone')?.value) || timezone(),
    scheduledLocalTime: localClock,
    nextRunAt: localToIso(runAtLocal),
    destinationId: text(document.getElementById('opsScheduleDestination')?.value),
    autoPublish: document.getElementById('opsSchedulePublish')?.checked === true,
    includeMentions: document.getElementById('opsScheduleMentions')?.checked === true,
    sendDms: document.getElementById('opsScheduleDms')?.checked === true,
  };
  try {
    if (message) message.textContent = 'Saving durable schedule…';
    await fetchJson(scheduleApi(), { method: 'POST', body: JSON.stringify(payload) });
    if (message) message.innerHTML = '<span class="guild-ops-chip ready">Schedule saved. A fresh Guild sync will run before every assignment.</span>';
    await loadSchedules();
  } catch (error) {
    if (message) message.innerHTML = `<span class="guild-ops-chip risk">${escapeHtml(error.message)}</span>`;
  }
}

function bindRowActions() {
  for (const button of document.querySelectorAll('[data-schedule-toggle]')) button.onclick = async () => {
    try {
      await fetchJson(scheduleApi(`/${button.dataset.scheduleToggle}/status`), { method: 'POST', body: JSON.stringify({ status: button.dataset.nextStatus }) });
      await loadSchedules();
    } catch (error) { alert(error.message); }
  };
  for (const button of document.querySelectorAll('[data-schedule-delete]')) button.onclick = async () => {
    if (!confirm('Delete this scheduled Guild Operation?')) return;
    try {
      await fetchJson(scheduleApi(`/${button.dataset.scheduleDelete}`), { method: 'DELETE' });
      await loadSchedules();
    } catch (error) { alert(error.message); }
  };
}

function installCard() {
  if (!isRoute() || document.querySelector('[data-guild-ops-scheduler]')) return;
  const shell = document.querySelector('.guild-ops-shell');
  if (!shell) return;
  const deliveryCard = document.getElementById('opsSaveDelivery')?.closest('.guild-ops-card');
  if (!deliveryCard) return;
  const destinationCard = deliveryCard.nextElementSibling?.classList?.contains('guild-ops-card')
    ? deliveryCard.nextElementSibling
    : deliveryCard;
  destinationCard.insertAdjacentHTML('afterend', cardHtml());
  document.getElementById('opsScheduleType')?.addEventListener('change', updatePlanOptions);
  document.getElementById('opsScheduleSave')?.addEventListener('click', createSchedule);
  loadSchedules();
}
function scheduleInstall() { clearTimeout(state.timer); state.timer = setTimeout(installCard, 100); }
function install() {
  if (!location.pathname.startsWith('/guild')) return;
  scheduleInstall();
  new MutationObserver(() => { if (isRoute()) scheduleInstall(); }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
