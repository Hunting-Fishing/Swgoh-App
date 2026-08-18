const OPS_PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { directory: [], detail: null, opener: null, catalog: null, timer: 0, loading: false };

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : '0';
const isRoute = () => location.pathname.replace(/\/+$/, '') === OPS_PATH;

function allyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode')).slice(0, 9);
  const input = digits(document.getElementById('allyCode')?.value).slice(0, 9);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)).slice(0, 9); } catch {}
  return [query, input, stored].find((value) => value.length === 9) || '';
}
function readApi(path = '') { return `/api/account/guild-discord-admin/${allyCode()}/member-operations${path}`; }
function writeApi(path) { return `/api/account/guild-operations/${allyCode()}${path}`; }
async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store', ...options,
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
function displayAlly(value) {
  const code = digits(value).slice(0, 9);
  return code.length === 9 ? `${code.slice(0,3)}-${code.slice(3,6)}-${code.slice(6)}` : '—';
}
function dateTime(value, fallback = '—') {
  const stamp = Date.parse(text(value));
  if (!Number.isFinite(stamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stamp));
}
function localDateTime(value) {
  const stamp = Date.parse(text(value));
  if (!Number.isFinite(stamp)) return '';
  const date = new Date(stamp);
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function activeControl(detail) {
  const control = detail?.control || {};
  const ignored = Date.parse(control.ignoredUntil || '') > Date.now();
  return control.available === false || ignored;
}
function ensureStylesheet() {
  if (document.querySelector('link[data-guild-member-ops-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-member-operations-drawer.css';
  link.dataset.guildMemberOpsCss = 'true';
  document.head.appendChild(link);
}
async function loadCatalog() {
  if (state.catalog) return state.catalog;
  try {
    const body = await fetchJson('/data/catalog.json?guild-member-ops=1');
    state.catalog = Array.isArray(body?.units) ? body.units : [];
  } catch { state.catalog = []; }
  return state.catalog;
}

function directoryRows(members = state.directory) {
  if (!members.length) return '<div class="guild-ops-empty">No current canonical Guild members are available.</div>';
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table"><thead><tr><th>Member</th><th>GP</th><th>Character GP</th><th>Ship GP</th><th>Synced</th><th></th></tr></thead><tbody>${members.map((row) => `<tr>
    <td><strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(displayAlly(row.allyCode))}</small></td>
    <td>${number(row.galacticPower)}</td><td>${number(row.characterPower)}</td><td>${number(row.shipPower)}</td>
    <td><small>${escapeHtml(dateTime(row.lastSyncedAt))}</small></td>
    <td><button type="button" class="guild-ops-button secondary" data-member-open="${escapeHtml(row.playerId)}">Open Control</button></td>
  </tr>`).join('')}</tbody></table></div>`;
}
function directoryCard() {
  return `<section class="guild-ops-card guild-member-ops-directory" data-guild-member-ops-directory>
    <div class="kicker">MEMBER OPERATIONS CONTROL</div>
    <h3>Guild Member Command Drawer</h3>
    <p>Open one current Guild member to review and manage their Operations availability, GIVE/KEEP preferences, Discord identity, hard reserves, latest TB/TW assignments, upcoming planner runs, and recent Operations activity.</p>
    <div class="guild-member-ops-search-row">
      <label class="guild-ops-field"><span>Find Guild member</span><input id="opsMemberDirectorySearch" type="search" autocomplete="off" placeholder="Name or Ally Code"></label>
      <button type="button" id="opsMemberDirectoryRefresh" class="secondary">Refresh Members</button>
    </div>
    <div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>Current Members</span><strong>${number(state.directory.length)}</strong></div>
      <div class="guild-ops-kpi"><span>Control Mode</span><strong>OFFICER</strong></div>
      <div class="guild-ops-kpi"><span>Assignment Source</span><strong>PERSISTED RUNS</strong></div>
    </div>
    <div id="opsMemberDirectoryRows">${directoryRows()}</div>
  </section>`;
}
function setDirectoryRows() {
  const raw = text(document.getElementById('opsMemberDirectorySearch')?.value).toLowerCase();
  const codeQuery = digits(raw);
  const filtered = !raw ? state.directory : state.directory.filter((row) =>
    row.name.toLowerCase().includes(raw) || Boolean(codeQuery && digits(row.allyCode).includes(codeQuery))
  );
  const target = document.getElementById('opsMemberDirectoryRows');
  if (target) target.innerHTML = directoryRows(filtered);
  bindMemberButtons();
}

function donationHtml(detail) {
  const rows = Array.isArray(detail?.donations) ? detail.donations : [];
  if (!rows.length) return '<div class="guild-ops-empty">No explicit GIVE/KEEP preferences for this member.</div>';
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table"><thead><tr><th>Unit</th><th>Preference</th><th>Source</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr>
    <td><code>${escapeHtml(row.baseId)}</code></td>
    <td><span class="guild-ops-chip ${row.preference === 'give' ? 'ready' : 'warn'}">${escapeHtml(row.preference.toUpperCase())}</span></td>
    <td><small>${escapeHtml(row.source || 'stored')}</small></td><td><small>${escapeHtml(dateTime(row.updatedAt))}</small></td>
    <td><button type="button" class="guild-ops-button secondary" data-pref-clear="${escapeHtml(row.baseId)}">Clear</button></td>
  </tr>`).join('')}</tbody></table></div>`;
}
function hardReserveHtml(detail) {
  const hard = detail?.hardReservations || {};
  if (!hard.available) return `<div class="guild-ops-note warn">Hard-reserve detail unavailable: ${escapeHtml(hard.reason || 'Discord-linked durable reservation state is not available for this member.')}</div>`;
  const rows = Array.isArray(hard.rows) ? hard.rows : [];
  if (!rows.length) return '<div class="guild-ops-empty">No hard ROTE reserves are set for this member.</div>';
  return rows.map((row) => `<div class="guild-member-ops-assignment"><strong>${escapeHtml(row.phase)} · ${escapeHtml(row.unitName || row.baseId)}</strong><br><small><code>${escapeHtml(row.baseId)}</code>${row.updatedAt ? ` · updated ${escapeHtml(dateTime(row.updatedAt))}` : ''}</small></div>`).join('');
}
function assignmentHtml(run, type) {
  if (!run?.runId) return `<div class="guild-ops-empty">No persisted ${type.toUpperCase()} assignment run yet.</div>`;
  const rows = Array.isArray(run.assignments) ? run.assignments : [];
  const header = `<div class="guild-ops-statusline"><span class="guild-ops-chip ${run.status === 'published' ? 'ready' : 'warn'}">${escapeHtml(text(run.status).toUpperCase())}</span><span class="guild-ops-chip">${escapeHtml(dateTime(run.publishedAt || run.createdAt))}</span></div>`;
  if (!rows.length) return `${header}<div class="guild-ops-empty">This member has no assignment in the latest persisted ${type.toUpperCase()} run.</div>`;
  return `${header}${rows.map((row) => type === 'tb'
    ? `<div class="guild-member-ops-assignment"><strong>${escapeHtml(row.phase || '?')} · ${escapeHtml(row.operation || 'Operation')} · ${escapeHtml(row.unitName || row.baseId)}</strong><br><small>${row.locked ? '🔒 Locked · ' : ''}${row.help ? '⚠️ HELP · ' : ''}${row.preference ? `${escapeHtml(row.preference.toUpperCase())} · ` : ''}<code>${escapeHtml(row.baseId)}</code></small></div>`
    : `<div class="guild-member-ops-assignment"><strong>P${number(row.priority || 1)} · ${escapeHtml(row.zoneName || 'Territory')} · ${escapeHtml(row.teamName || 'Defense team')}</strong></div>`
  ).join('')}`;
}
function schedulesHtml(detail) {
  const rows = Array.isArray(detail?.upcomingPlannerRuns) ? detail.upcomingPlannerRuns : [];
  if (!rows.length) return '<div class="guild-ops-empty">No active scheduled TB/TW planner runs.</div>';
  return rows.map((row) => `<div class="guild-member-ops-assignment"><strong>${escapeHtml(text(row.runType).toUpperCase())} · ${escapeHtml(row.name || 'Scheduled Operation')}</strong><br><small>${escapeHtml(dateTime(row.nextRunAt))} · ${row.autoPublish ? 'auto-publish enabled' : 'preview only'}${row.stage && row.stage !== 'idle' ? ` · ${escapeHtml(row.stage)}` : ''}</small>${row.lastError ? `<div class="guild-ops-note warn">${escapeHtml(row.lastError)}</div>` : ''}</div>`).join('');
}
function auditHtml(detail) {
  const rows = Array.isArray(detail?.recentAudit) ? detail.recentAudit : [];
  if (!rows.length) return '<div class="guild-ops-empty">No recent member-specific Operations audit entries.</div>';
  return rows.slice(0, 12).map((row) => `<div class="guild-member-ops-assignment"><strong>${escapeHtml(row.action || 'Operations activity')}</strong><br><small>${escapeHtml(dateTime(row.occurredAt))} · ${escapeHtml(row.entityType || 'entity')}</small></div>`).join('');
}
function drawerHtml(detail) {
  const p = detail.player || {};
  const control = detail.control || {};
  const excluded = activeControl(detail);
  const discord = detail.discord || {};
  return `<div class="guild-member-ops-drawer-inner">
    <div class="guild-member-ops-drawer-head">
      <div><div class="kicker">MEMBER OPERATIONS CONTROL</div><h2>${escapeHtml(p.name || 'Guild member')}</h2><div class="guild-ops-statusline"><span class="guild-ops-chip">${escapeHtml(displayAlly(p.allyCode))}</span><span class="guild-ops-chip ${excluded ? 'risk' : 'ready'}">${excluded ? 'EXCLUDED' : 'AVAILABLE'}</span><span class="guild-ops-chip ${discord.linked ? 'ready' : 'warn'}">${discord.linked ? 'DISCORD LINKED' : 'DISCORD UNLINKED'}</span></div></div>
      <button type="button" class="guild-member-ops-close secondary" id="opsMemberDrawerClose" aria-label="Close member Operations drawer">✕</button>
    </div>
    <div class="guild-ops-kpis"><div class="guild-ops-kpi"><span>GP</span><strong>${number(p.galacticPower)}</strong></div><div class="guild-ops-kpi"><span>Character GP</span><strong>${number(p.characterPower)}</strong></div><div class="guild-ops-kpi"><span>Ship GP</span><strong>${number(p.shipPower)}</strong></div><div class="guild-ops-kpi"><span>Synced</span><strong>${escapeHtml(dateTime(p.lastSyncedAt))}</strong></div></div>

    <section class="guild-member-ops-section"><h3>Availability & Timed Ignore</h3><div class="guild-member-ops-two">
      <label class="guild-ops-field"><span>Availability</span><select id="opsMemberAvailable"><option value="true" ${control.available !== false ? 'selected' : ''}>Available</option><option value="false" ${control.available === false ? 'selected' : ''}>Unavailable</option></select></label>
      <label class="guild-ops-field"><span>Ignore until</span><input id="opsMemberIgnoredUntil" type="datetime-local" value="${escapeHtml(localDateTime(control.ignoredUntil))}"></label>
    </div><label class="guild-ops-field"><span>Officer reason</span><input id="opsMemberIgnoreReason" maxlength="500" value="${escapeHtml(control.ignoreReason || '')}" placeholder="Vacation, event conflict, officer exclusion…"></label>
    <div class="guild-member-ops-inline-actions"><button type="button" id="opsMemberSaveControl">Save Availability</button><button type="button" id="opsMemberClearControl" class="secondary">Clear Exclusion</button></div><div id="opsMemberControlMessage" class="guild-ops-inline-result"></div><div class="guild-ops-note"><strong>Current source:</strong> ${escapeHtml(control.source || 'none')} · ${escapeHtml(dateTime(control.updatedAt))}</div></section>

    <section class="guild-member-ops-section"><h3>GIVE / KEEP Preferences</h3><div class="guild-member-ops-two"><label class="guild-ops-field"><span>Unit</span><input id="opsMemberPreferenceUnit" list="opsMemberUnitCatalog" autocomplete="off" placeholder="Search or enter Base ID"><datalist id="opsMemberUnitCatalog"></datalist></label><label class="guild-ops-field"><span>Preference</span><select id="opsMemberPreferenceValue"><option value="give">GIVE</option><option value="keep">KEEP</option><option value="default">DEFAULT / CLEAR</option></select></label></div><div class="guild-member-ops-inline-actions"><button type="button" id="opsMemberSavePreference">Save Preference</button></div><div id="opsMemberPreferenceMessage" class="guild-ops-inline-result"></div>${donationHtml(detail)}</section>

    <section class="guild-member-ops-section"><h3>Discord Identity</h3><div class="guild-ops-statusline"><span class="guild-ops-chip ${discord.bound ? 'ready' : 'warn'}">${discord.bound ? 'GUILD BOUND' : 'GUILD NOT BOUND'}</span><span class="guild-ops-chip ${discord.linked ? 'ready' : 'warn'}">${discord.linked ? `USER ${escapeHtml(discord.discordUserId)}` : 'NO PLAYER LINK'}</span></div><div class="guild-member-ops-inline-actions"><button type="button" id="opsMemberOpenLinkAdmin" class="secondary">Open Link Administration</button></div></section>

    <section class="guild-member-ops-section"><h3>Hard ROTE Reserves</h3><div class="guild-ops-note">Read-only here. Creating a hard reserve remains behind the Discord-linked live ownership verification gate.</div>${hardReserveHtml(detail)}</section>
    <section class="guild-member-ops-section"><h3>Latest ROTE Assignments</h3>${assignmentHtml(detail.assignments?.tb, 'tb')}</section>
    <section class="guild-member-ops-section"><h3>Latest TW Defense Assignments</h3>${assignmentHtml(detail.assignments?.tw, 'tw')}</section>
    <section class="guild-member-ops-section"><h3>Upcoming Planner Runs</h3><div class="guild-ops-note">These are future planner executions, not guaranteed assignments for this member.</div>${schedulesHtml(detail)}</section>
    <section class="guild-member-ops-section"><h3>Recent Member Operations Activity</h3>${auditHtml(detail)}</section>
  </div>`;
}

function ensureDrawer() {
  let backdrop = document.querySelector('.guild-member-ops-backdrop');
  let drawer = document.querySelector('.guild-member-ops-drawer');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'guild-member-ops-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);
  }
  if (!drawer) {
    drawer = document.createElement('aside');
    drawer.className = 'guild-member-ops-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Guild Member Operations Control');
    document.body.appendChild(drawer);
  }
  return { backdrop, drawer };
}
function closeDrawer() {
  const { backdrop, drawer } = ensureDrawer();
  backdrop.classList.remove('open'); drawer.classList.remove('open'); document.body.classList.remove('guild-member-ops-lock');
  setTimeout(() => { if (!drawer.classList.contains('open')) drawer.innerHTML = ''; }, 220);
  state.opener?.focus?.(); state.opener = null;
}
async function openDrawer(playerId, opener) {
  state.opener = opener || document.activeElement;
  const { backdrop, drawer } = ensureDrawer();
  drawer.innerHTML = '<div class="guild-member-ops-drawer-inner"><div class="guild-ops-empty">Loading current member Operations intelligence…</div></div>';
  backdrop.classList.add('open'); drawer.classList.add('open'); document.body.classList.add('guild-member-ops-lock');
  try {
    state.detail = await fetchJson(readApi(`/${encodeURIComponent(playerId)}`));
    drawer.innerHTML = drawerHtml(state.detail);
    bindDrawer();
    populateCatalog();
    document.getElementById('opsMemberDrawerClose')?.focus();
  } catch (error) {
    drawer.innerHTML = `<div class="guild-member-ops-drawer-inner"><div class="guild-ops-error">${escapeHtml(error.message)}</div><button type="button" id="opsMemberDrawerClose" class="secondary">Close</button></div>`;
    document.getElementById('opsMemberDrawerClose')?.addEventListener('click', closeDrawer);
  }
}
async function populateCatalog() {
  const target = document.getElementById('opsMemberUnitCatalog');
  if (!target) return;
  const catalog = await loadCatalog();
  target.innerHTML = catalog.slice(0, 1000).map((unit) => `<option value="${escapeHtml(text(unit.baseId || unit.base_id).toUpperCase())}">${escapeHtml(unit.name || unit.nameKey || '')}</option>`).join('');
}
async function reloadOpenMember() {
  const playerId = state.detail?.player?.playerId;
  if (!playerId) return;
  state.detail = await fetchJson(readApi(`/${encodeURIComponent(playerId)}`));
  const drawer = document.querySelector('.guild-member-ops-drawer');
  if (drawer?.classList.contains('open')) { drawer.innerHTML = drawerHtml(state.detail); bindDrawer(); populateCatalog(); }
  window.dispatchEvent(new CustomEvent('swgoh:guild-operations-member-changed', { detail: { playerId } }));
  document.getElementById('opsIntegrationRefresh')?.click();
}
function setInline(id, message, error = false) {
  const target = document.getElementById(id); if (!target) return;
  target.innerHTML = message ? `<span class="guild-ops-chip ${error ? 'risk' : 'ready'}">${escapeHtml(message)}</span>` : '';
}
async function saveControl(clear = false) {
  const playerId = state.detail?.player?.playerId; if (!playerId) return;
  const available = clear ? true : document.getElementById('opsMemberAvailable')?.value !== 'false';
  const localUntil = clear ? '' : text(document.getElementById('opsMemberIgnoredUntil')?.value);
  const ignoredUntil = localUntil ? new Date(localUntil).toISOString() : '';
  const ignoreReason = clear ? '' : text(document.getElementById('opsMemberIgnoreReason')?.value);
  try {
    setInline('opsMemberControlMessage', clear ? 'Clearing member exclusion…' : 'Saving member availability…');
    await fetchJson(writeApi('/member-control'), { method: 'POST', body: JSON.stringify({ playerId, available, ignoredUntil, ignoreReason }) });
    await reloadOpenMember();
    setInline('opsMemberControlMessage', clear ? 'Member exclusion cleared.' : 'Member availability saved.');
  } catch (error) { setInline('opsMemberControlMessage', error.message, true); }
}
async function savePreference(baseIdOverride = '', preferenceOverride = '') {
  const playerId = state.detail?.player?.playerId; if (!playerId) return;
  const baseId = text(baseIdOverride || document.getElementById('opsMemberPreferenceUnit')?.value).toUpperCase();
  const preference = text(preferenceOverride || document.getElementById('opsMemberPreferenceValue')?.value).toLowerCase();
  if (!/^[A-Z0-9_:-]{2,120}$/.test(baseId)) { setInline('opsMemberPreferenceMessage', 'Choose a valid SWGOH unit Base ID.', true); return; }
  try {
    setInline('opsMemberPreferenceMessage', 'Saving donation preference…');
    await fetchJson(writeApi('/donation-preference'), { method: 'POST', body: JSON.stringify({ playerId, baseId, preference }) });
    await reloadOpenMember();
    setInline('opsMemberPreferenceMessage', preference === 'default' ? `${baseId} returned to DEFAULT.` : `${baseId} set to ${preference.toUpperCase()}.`);
  } catch (error) { setInline('opsMemberPreferenceMessage', error.message, true); }
}
function bindDrawer() {
  document.getElementById('opsMemberDrawerClose')?.addEventListener('click', closeDrawer);
  document.getElementById('opsMemberSaveControl')?.addEventListener('click', () => saveControl(false));
  document.getElementById('opsMemberClearControl')?.addEventListener('click', () => saveControl(true));
  document.getElementById('opsMemberSavePreference')?.addEventListener('click', () => savePreference());
  document.getElementById('opsMemberOpenLinkAdmin')?.addEventListener('click', () => {
    closeDrawer();
    document.querySelector('[data-guild-discord-link-admin]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  for (const button of document.querySelectorAll('[data-pref-clear]')) button.addEventListener('click', () => savePreference(button.dataset.prefClear, 'default'));
}
function bindMemberButtons() {
  for (const button of document.querySelectorAll('[data-member-open]')) button.addEventListener('click', () => openDrawer(button.dataset.memberOpen, button));
}
function bindDirectory() {
  document.getElementById('opsMemberDirectorySearch')?.addEventListener('input', setDirectoryRows);
  document.getElementById('opsMemberDirectoryRefresh')?.addEventListener('click', () => loadDirectory(true));
  bindMemberButtons();
}
async function loadDirectory() {
  if (state.loading || allyCode().length !== 9) return;
  state.loading = true;
  try {
    const body = await fetchJson(readApi());
    state.directory = Array.isArray(body?.members) ? body.members : [];
    const existing = document.querySelector('[data-guild-member-ops-directory]');
    if (existing) { existing.outerHTML = directoryCard(); bindDirectory(); }
  } catch (error) {
    const target = document.getElementById('opsMemberDirectoryRows');
    if (target) target.innerHTML = `<div class="guild-ops-error">${escapeHtml(error.message)}</div>`;
  } finally { state.loading = false; }
}
function installCard() {
  if (!isRoute() || document.querySelector('[data-guild-member-ops-directory]')) return;
  const integration = document.querySelector('[data-guild-integration-report]');
  const links = document.querySelector('[data-guild-discord-link-admin]');
  const anchor = integration || links;
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend', directoryCard());
  bindDirectory();
  loadDirectory();
}
function scheduleInstall() { clearTimeout(state.timer); state.timer = setTimeout(installCard, 160); }
function install() {
  if (!location.pathname.startsWith('/guild')) return;
  ensureStylesheet(); ensureDrawer(); scheduleInstall();
  new MutationObserver(() => { if (isRoute() && !document.querySelector('[data-guild-member-ops-directory]')) scheduleInstall(); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.querySelector('.guild-member-ops-drawer.open')) closeDrawer(); });
  window.addEventListener('swgoh:guild-discord-links-changed', () => { if (state.detail?.player?.playerId) reloadOpenMember().catch(() => {}); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
