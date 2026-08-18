const OPS_PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { data: null, loading: false, timer: 0 };

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
function api(action) {
  return `/api/account/guild-discord-admin/${allyCode()}/${action}`;
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
function displayAlly(value) {
  const code = digits(value).slice(0, 9);
  return code.length === 9 ? `${code.slice(0,3)}-${code.slice(3,6)}-${code.slice(6)}` : '—';
}
function linkStatus(row) {
  if (!row?.stale) return '<span class="guild-ops-chip ready">CURRENT</span>';
  const reasons = Array.isArray(row.staleReasons) ? row.staleReasons : [];
  return `<span class="guild-ops-chip risk">STALE</span>${reasons.length ? `<br><small>${reasons.map(escapeHtml).join('<br>')}</small>` : ''}`;
}
function discordPresence(row, checked) {
  if (!checked || row?.discordMemberPresent == null) return '<span class="guild-ops-chip warn">NOT CHECKED</span>';
  return row.discordMemberPresent
    ? '<span class="guild-ops-chip ready">IN SERVER</span>'
    : '<span class="guild-ops-chip risk">LEFT SERVER</span>';
}
function rowsHtml() {
  const data = state.data || {};
  const rows = Array.isArray(data.links) ? data.links : [];
  if (!rows.length) return '<div class="guild-ops-empty">No durable Discord ↔ SWGOH player links are stored for this Guild.</div>';
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table">
    <thead><tr><th>Status</th><th>Discord Member</th><th>Discord Presence</th><th>SWGOH Player</th><th>Guild Membership</th><th></th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${linkStatus(row)}</td>
      <td><strong>${escapeHtml(row.discordDisplayName || 'Discord user')}</strong><br><small>${escapeHtml(row.discordUserId)}</small></td>
      <td>${discordPresence(row, data.discordMembershipChecked === true)}</td>
      <td><strong>${escapeHtml(row.playerName || 'Linked Ally Code')}</strong><br><small>${escapeHtml(displayAlly(row.swgohAllyCode))}</small></td>
      <td><span class="guild-ops-chip ${row.currentGuildMember ? 'ready' : 'risk'}">${row.currentGuildMember ? 'CURRENT GUILD' : 'LEFT GUILD'}</span></td>
      <td><button type="button" class="guild-ops-button secondary" data-manual-unlink="${escapeHtml(row.discordUserId)}" data-link-label="${escapeHtml(row.playerName || displayAlly(row.swgohAllyCode))}">Unlink</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}
function cardHtml() {
  const data = state.data || {};
  return `<section class="guild-ops-card guild-discord-link-admin" data-guild-discord-link-admin>
    <div class="kicker">DISCORD ↔ SWGOH PLAYER LINKS</div>
    <h3>Manual Link Management & Stale-Link Cleanup</h3>
    <p>Use this only when exact automatic matching cannot resolve a member. Command Center verifies the Discord user against the bound server and the Ally Code against the current canonical SWGOH Guild before saving.</p>
    <div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>Total Links</span><strong>${number(data.total)}</strong></div>
      <div class="guild-ops-kpi"><span>Current</span><strong>${number(data.current)}</strong></div>
      <div class="guild-ops-kpi"><span>Stale</span><strong>${number(data.stale)}</strong></div>
      <div class="guild-ops-kpi"><span>Left Discord</span><strong>${number(data.discordMissing)}</strong></div>
      <div class="guild-ops-kpi"><span>Left SWGOH Guild</span><strong>${number(data.swgohMissing)}</strong></div>
      <div class="guild-ops-kpi"><span>Current Unlinked</span><strong>${number(data.unlinkedCurrentMembers)}</strong></div>
    </div>
    <div class="guild-ops-statusline">
      <span class="guild-ops-chip ${data.discordMembershipChecked ? 'ready' : 'warn'}">${data.discordMembershipChecked ? 'DISCORD MEMBERSHIP VERIFIED' : 'DISCORD PRESENCE NOT CHECKED'}</span>
      ${data.discordGuildId ? `<span class="guild-ops-chip">DISCORD GUILD · ${escapeHtml(data.discordGuildId)}</span>` : ''}
    </div>

    <div class="kicker" style="margin-top:18px">MANUAL CURRENT-MEMBER LINK</div>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Discord user ID</span><input id="opsManualDiscordUserId" inputmode="numeric" autocomplete="off" placeholder="Copy User ID from Discord"></label>
      <label class="guild-ops-field"><span>Current SWGOH Ally Code</span><input id="opsManualSwgohAllyCode" inputmode="numeric" autocomplete="off" placeholder="123-456-789"></label>
      <div class="guild-ops-field"><span>Validation</span><small>Both identities must currently belong to the Guild/server. Existing links and player controls are handled by the durable link service.</small></div>
    </div>
    <div class="guild-ops-actions">
      <button type="button" id="opsManualLinkMember">Verify & Link Member</button>
      <button type="button" id="opsManualLinksRefresh" class="secondary">Refresh Links</button>
    </div>
    <div id="opsManualLinkMessage" class="guild-ops-inline-result"></div>

    <div class="kicker" style="margin-top:18px">CURRENT DURABLE LINKS</div>
    <div id="opsManualLinkRows">${rowsHtml()}</div>
  </section>`;
}
function setMessage(message, error = false) {
  const target = document.getElementById('opsManualLinkMessage');
  if (!target) return;
  target.innerHTML = message ? `<span class="guild-ops-chip ${error ? 'risk' : 'ready'}">${escapeHtml(message)}</span>` : '';
}
async function loadLinks({ announce = false } = {}) {
  if (state.loading || allyCode().length !== 9) return;
  state.loading = true;
  try {
    if (announce) setMessage('Refreshing durable player links…');
    state.data = await fetchJson(api('links'));
    const existing = document.querySelector('[data-guild-discord-link-admin]');
    if (existing) {
      existing.outerHTML = cardHtml();
      bind();
      if (announce) setMessage('Player links refreshed.');
    }
  } catch (error) {
    setMessage(error.message, true);
  } finally { state.loading = false; }
}
function refreshIntegrationIntelligence() {
  document.getElementById('opsIntegrationRefresh')?.click();
}
async function manualLink() {
  const discordUserId = digits(document.getElementById('opsManualDiscordUserId')?.value);
  const swgohAllyCode = digits(document.getElementById('opsManualSwgohAllyCode')?.value);
  if (!/^\d{16,22}$/.test(discordUserId)) { setMessage('Enter a valid Discord user ID.', true); return; }
  if (!/^\d{9}$/.test(swgohAllyCode)) { setMessage('Enter a valid 9-digit SWGOH Ally Code.', true); return; }
  if (!confirm(`Link Discord user ${discordUserId} to SWGOH Ally Code ${displayAlly(swgohAllyCode)}? Both identities will be verified first.`)) return;
  try {
    setMessage('Verifying Discord server membership and current SWGOH Guild membership…');
    const result = await fetchJson(api('link-member'), {
      method: 'POST',
      body: JSON.stringify({ discordUserId, swgohAllyCode }),
    });
    state.data = null;
    await loadLinks();
    setMessage(`${result.playerName || displayAlly(result.swgohAllyCode)} linked to Discord user ${result.discordDisplayName || result.discordUserId}.`);
    window.dispatchEvent(new CustomEvent('swgoh:guild-discord-links-changed'));
    refreshIntegrationIntelligence();
  } catch (error) { setMessage(error.message, true); }
}
async function manualUnlink(discordUserId, label) {
  if (!confirm(`Unlink ${label || discordUserId} from Discord user ${discordUserId}? This also clears that Discord user's player-specific donation/availability controls.`)) return;
  try {
    setMessage(`Unlinking ${label || discordUserId}…`);
    await fetchJson(api('unlink-member'), {
      method: 'POST',
      body: JSON.stringify({ discordUserId }),
    });
    state.data = null;
    await loadLinks();
    setMessage(`${label || discordUserId} was unlinked. Canonical Guild history was not deleted.`);
    window.dispatchEvent(new CustomEvent('swgoh:guild-discord-links-changed'));
    refreshIntegrationIntelligence();
  } catch (error) { setMessage(error.message, true); }
}
function bind() {
  document.getElementById('opsManualLinkMember')?.addEventListener('click', manualLink);
  document.getElementById('opsManualLinksRefresh')?.addEventListener('click', () => loadLinks({ announce: true }));
  for (const button of document.querySelectorAll('[data-manual-unlink]')) {
    button.addEventListener('click', () => manualUnlink(button.dataset.manualUnlink, button.dataset.linkLabel));
  }
}
function installCard() {
  if (!isRoute() || document.querySelector('[data-guild-discord-link-admin]')) return;
  const adminCard = document.querySelector('[data-guild-discord-admin]');
  if (!adminCard) return;
  const integrationCard = document.querySelector('[data-guild-integration-report]');
  if (integrationCard) integrationCard.insertAdjacentHTML('beforebegin', cardHtml());
  else adminCard.insertAdjacentHTML('afterend', cardHtml());
  bind();
  loadLinks();
}
function scheduleInstall() { clearTimeout(state.timer); state.timer = setTimeout(installCard, 140); }
function install() {
  if (!location.pathname.startsWith('/guild')) return;
  scheduleInstall();
  new MutationObserver(() => {
    if (isRoute() && !document.querySelector('[data-guild-discord-link-admin]')) scheduleInstall();
  }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
