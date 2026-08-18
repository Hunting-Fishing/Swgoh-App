const OPS_PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { report: null, loading: false, timer: 0 };

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : '0';
const isRoute = () => location.pathname.replace(/\/+$/, '') === OPS_PATH;

function allyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((value) => value.length === 9) || '';
}
function reportApi() {
  return `/api/account/guild-discord-admin/${allyCode()}/integration-report`;
}
async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}
function dateTime(value, fallback = '—') {
  const stamp = Date.parse(text(value));
  if (!Number.isFinite(stamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(stamp));
}
function displayAlly(value) {
  const code = digits(value);
  return code.length === 9 ? `${code.slice(0,3)}-${code.slice(3,6)}-${code.slice(6)}` : '—';
}
function sourceLabel(value) {
  const source = text(value).toLowerCase();
  if (source === 'discord-player') return 'Discord Player';
  if (source.includes('command-center')) return 'Web Officer';
  return text(value) || 'Stored';
}
function healthTone(ready, risk = false) {
  if (risk) return 'risk';
  return ready ? 'ready' : 'warn';
}

function donationRows(report) {
  const members = Array.isArray(report?.donations?.members) ? report.donations.members : [];
  if (!members.length) {
    return '<div class="guild-ops-empty">No explicit GIVE/KEEP overrides are currently stored for current Guild members.</div>';
  }
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table">
    <thead><tr><th>Member</th><th>GIVE</th><th>KEEP</th><th>Overrides</th><th>Source</th><th>Updated</th></tr></thead>
    <tbody>${members.map((row) => {
      const units = Array.isArray(row.units) ? row.units : [];
      const sources = Array.isArray(row.sources) ? row.sources.map(sourceLabel) : [];
      const unitDetail = units.length
        ? `<details><summary>${number(row.overrideCount)} unit override${Number(row.overrideCount) === 1 ? '' : 's'}</summary><div class="guild-ops-note">${units.map((unit) => `<code>${escapeHtml(unit.baseId)}</code> · <strong>${escapeHtml(text(unit.preference).toUpperCase())}</strong> · ${escapeHtml(sourceLabel(unit.source))}`).join('<br>')}</div></details>`
        : number(row.overrideCount);
      return `<tr>
        <td><strong>${escapeHtml(row.name || 'Guild member')}</strong><br><small>${escapeHtml(displayAlly(row.allyCode))}</small></td>
        <td><span class="guild-ops-chip ready">${number(row.give)}</span></td>
        <td><span class="guild-ops-chip warn">${number(row.keep)}</span></td>
        <td>${unitDetail}</td>
        <td><small>${escapeHtml(sources.join(' + ') || 'Stored')}</small></td>
        <td><small>${escapeHtml(dateTime(row.lastUpdatedAt))}</small></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function latestDeliveryHtml(report) {
  const latest = report?.delivery?.latest;
  if (!latest) return '<div class="guild-ops-empty">No persisted Discord delivery attempts yet.</div>';
  const failed = latest.status === 'failed';
  return `<div class="guild-ops-statusline">
    <span class="guild-ops-chip ${healthTone(latest.status === 'delivered', failed)}">${escapeHtml(text(latest.status).toUpperCase() || 'UNKNOWN')}</span>
    <span class="guild-ops-chip">${escapeHtml(text(latest.runType).toUpperCase() || 'RUN')} · ${escapeHtml(latest.deliveryKind || 'delivery')}</span>
    <span class="guild-ops-chip">${escapeHtml(dateTime(latest.deliveredAt || latest.attemptedAt))}</span>
    ${latest.httpStatus ? `<span class="guild-ops-chip ${healthTone(Number(latest.httpStatus) < 400, Number(latest.httpStatus) >= 400)}">HTTP ${number(latest.httpStatus)}</span>` : ''}
  </div>${failed && latest.errorMessage ? `<div class="guild-ops-note warn"><strong>Latest delivery error:</strong> ${escapeHtml(latest.errorMessage)}</div>` : ''}`;
}

function recentAuditHtml(report) {
  const rows = Array.isArray(report?.recentAudit) ? report.recentAudit.slice(0, 6) : [];
  if (!rows.length) return '<div class="guild-ops-empty">No recent Operations audit entries.</div>';
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table">
    <thead><tr><th>Time</th><th>Action</th><th>Entity</th></tr></thead>
    <tbody>${rows.map((row) => `<tr><td><small>${escapeHtml(dateTime(row.occurredAt))}</small></td><td><strong>${escapeHtml(row.action)}</strong></td><td><small>${escapeHtml(row.entityType)}${row.entityId ? ` · ${escapeHtml(row.entityId)}` : ''}</small></td></tr>`).join('')}</tbody>
  </table></div>`;
}

function cardHtml() {
  const r = state.report || {};
  const discord = r.discord || {};
  const destinations = r.destinations || {};
  const schedules = r.schedules || {};
  const delivery = r.delivery || {};
  const donations = r.donations || {};
  const guild = r.guild || {};
  const deliveryReady = discord.bound && discord.durableState && discord.botConfigured && discord.deliveryEnabled && Number(destinations.verified || 0) > 0;
  const scheduleRisk = Number(schedules.errors || 0) > 0;
  return `<section class="guild-ops-card guild-integration-report" data-guild-integration-report>
    <div class="kicker">GUILD INTEGRATION INTELLIGENCE</div>
    <h3>Operations Health & Donation Preferences</h3>
    <p>Read-only officer view across canonical Guild state, durable Discord registration, scheduled Operations, delivery receipts, and GIVE/KEEP preferences. No mock values are generated.</p>

    <div class="guild-ops-statusline">
      <span class="guild-ops-chip ${healthTone(discord.bound)}">${discord.bound ? 'GUILD ↔ DISCORD BOUND' : 'DISCORD NOT BOUND'}</span>
      <span class="guild-ops-chip ${healthTone(discord.durableState)}">${discord.durableState ? 'DURABLE STATE READY' : 'DURABLE STATE MISSING'}</span>
      <span class="guild-ops-chip ${healthTone(discord.botConfigured)}">${discord.botConfigured ? 'BOT API READY' : 'BOT API MISSING'}</span>
      <span class="guild-ops-chip ${healthTone(discord.deliveryEnabled)}">${discord.deliveryEnabled ? 'PUBLISH GATE ON' : 'PUBLISH GATE OFF'}</span>
      <span class="guild-ops-chip ${healthTone(deliveryReady)}">${deliveryReady ? 'DELIVERY READY' : 'DELIVERY NEEDS ATTENTION'}</span>
      <span class="guild-ops-chip ${healthTone(!scheduleRisk, scheduleRisk)}">${scheduleRisk ? `${number(schedules.errors)} SCHEDULE ERROR(S)` : 'SCHEDULES HEALTHY'}</span>
    </div>

    <div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>Linked Members</span><strong>${number(discord.linkedMemberCount)} / ${number(guild.memberCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Verified Channels</span><strong>${number(destinations.verified)}</strong></div>
      <div class="guild-ops-kpi"><span>Active Schedules</span><strong>${number(schedules.active)}</strong></div>
      <div class="guild-ops-kpi"><span>In Flight</span><strong>${number(schedules.inFlight)}</strong></div>
      <div class="guild-ops-kpi"><span>Delivered (Recent)</span><strong>${number(delivery.delivered)}</strong></div>
      <div class="guild-ops-kpi"><span>Failed (Recent)</span><strong>${number(delivery.failed)}</strong></div>
      <div class="guild-ops-kpi"><span>Preference Members</span><strong>${number(donations.memberCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Unit Overrides</span><strong>${number(donations.overrideCount)}</strong></div>
    </div>

    <div class="guild-ops-grid three">
      <div class="guild-ops-field"><span>Canonical Guild refresh</span><strong>${escapeHtml(dateTime(guild.lastSyncedAt))}</strong><small>${escapeHtml(guild.name || 'Current Guild')} · ${number(guild.galacticPower)} GP</small></div>
      <div class="guild-ops-field"><span>Next scheduled Operation</span><strong>${escapeHtml(dateTime(schedules.nextRunAt, schedules.active ? 'Not scheduled' : 'No active schedules'))}</strong><small>${number(schedules.active)} active · ${number(schedules.paused)} paused</small></div>
      <div class="guild-ops-field"><span>Registration coverage</span><strong>${number(discord.linkedMemberCount)} linked · ${number(discord.unlinkedMemberCount)} unlinked</strong><small>${number(discord.officerRoleCount)} configured Discord officer role(s)</small></div>
    </div>

    <div class="guild-ops-actions">
      <button type="button" id="opsIntegrationRefresh" class="secondary">Refresh Integration Intelligence</button>
    </div>
    <div id="opsIntegrationMessage" class="guild-ops-inline-result"></div>

    <div class="kicker" style="margin-top:18px">LATEST DISCORD DELIVERY</div>
    ${latestDeliveryHtml(r)}

    <div class="kicker" style="margin-top:18px">GIVE / KEEP INTELLIGENCE</div>
    <div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>GIVE</span><strong>${number(donations.giveCount)}</strong></div>
      <div class="guild-ops-kpi"><span>KEEP</span><strong>${number(donations.keepCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Members</span><strong>${number(donations.memberCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Total Overrides</span><strong>${number(donations.overrideCount)}</strong></div>
    </div>
    <div class="guild-ops-note"><strong>Precedence:</strong> Discord player preferences are merged first. If the same player/unit also has a Command Center officer preference, the canonical web officer value wins—matching the live Operations planner.</div>
    ${donationRows(r)}

    <div class="kicker" style="margin-top:18px">RECENT OPERATIONS AUDIT</div>
    ${recentAuditHtml(r)}
  </section>`;
}

function setMessage(message, error = false) {
  const target = document.getElementById('opsIntegrationMessage');
  if (!target) return;
  target.innerHTML = message ? `<span class="guild-ops-chip ${error ? 'risk' : 'ready'}">${escapeHtml(message)}</span>` : '';
}

async function loadReport({ announce = false } = {}) {
  if (state.loading || allyCode().length !== 9) return;
  state.loading = true;
  try {
    if (announce) setMessage('Refreshing integration intelligence…');
    state.report = await fetchJson(reportApi());
    const existing = document.querySelector('[data-guild-integration-report]');
    if (existing) {
      existing.outerHTML = cardHtml();
      bind();
      if (announce) setMessage('Integration intelligence refreshed.');
    }
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    state.loading = false;
  }
}

function bind() {
  document.getElementById('opsIntegrationRefresh')?.addEventListener('click', () => loadReport({ announce: true }));
}

function installCard() {
  if (!isRoute() || document.querySelector('[data-guild-integration-report]')) return;
  const adminCard = document.querySelector('[data-guild-discord-admin]');
  if (!adminCard) return;
  adminCard.insertAdjacentHTML('afterend', cardHtml());
  bind();
  loadReport();
}
function scheduleInstall() {
  clearTimeout(state.timer);
  state.timer = setTimeout(installCard, 120);
}
function install() {
  if (!location.pathname.startsWith('/guild')) return;
  scheduleInstall();
  new MutationObserver(() => {
    if (isRoute() && !document.querySelector('[data-guild-integration-report]')) scheduleInstall();
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
