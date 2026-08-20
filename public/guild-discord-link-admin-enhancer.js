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
function discordOptionsHtml() {
  const rows = Array.isArray(state.data?.availableDiscordMembers) ? state.data.availableDiscordMembers : [];
  return ['<option value="">Choose an unlinked Discord member…</option>', ...rows.map((row) => (
    `<option value="${escapeHtml(row.discordUserId)}">${escapeHtml(row.displayName || row.username || row.discordUserId)} · ${escapeHtml(row.discordUserId)}</option>`
  ))].join('');
}
function playerOptionsHtml() {
  const rows = Array.isArray(state.data?.unlinkedCurrentPlayers) ? state.data.unlinkedCurrentPlayers : [];
  return ['<option value="">Choose an unlinked SWGOH guild member…</option>', ...rows.map((row) => (
    `<option value="${escapeHtml(row.swgohAllyCode)}">${escapeHtml(row.playerName || displayAlly(row.swgohAllyCode))} · ${escapeHtml(displayAlly(row.swgohAllyCode))}</option>`
  ))].join('');
}
function suggestionsHtml() {
  const exact = Array.isArray(state.data?.exactSuggestions) ? state.data.exactSuggestions : [];
  const ambiguous = Array.isArray(state.data?.ambiguousSuggestions) ? state.data.ambiguousSuggestions : [];
  if (!exact.length && !ambiguous.length) {
    return '<div class="guild-ops-empty">No new exact-name registration suggestions are available. Manual officer pairing remains available below.</div>';
  }
  const exactRows = exact.length ? `<div class="guild-ops-table-wrap"><table class="guild-ops-table">
    <thead><tr><th>Safe Match</th><th>SWGOH Member</th><th></th></tr></thead>
    <tbody>${exact.map((row) => `<tr>
      <td><strong>${escapeHtml(row.displayName || row.username || row.discordUserId)}</strong><br><small>${escapeHtml(row.discordUserId)}</small></td>
      <td><strong>${escapeHtml(row.playerName)}</strong><br><small>${escapeHtml(displayAlly(row.swgohAllyCode))}</small></td>
      <td><button type="button" class="guild-ops-button secondary" data-use-registration-suggestion="${escapeHtml(row.discordUserId)}" data-suggestion-ally="${escapeHtml(row.swgohAllyCode)}">Select Pair</button></td>
    </tr>`).join('')}</tbody>
  </table></div>` : '';
  const ambiguousRows = ambiguous.length ? `<div class="guild-ops-statusline" style="margin-top:10px">
    <span class="guild-ops-chip warn">AMBIGUOUS · ${number(ambiguous.length)}</span>
    <small>${ambiguous.slice(0,4).map((row) => `${escapeHtml(row.displayName || row.discordUserId)} → ${escapeHtml((row.candidates || []).map((candidate) => candidate.playerName || displayAlly(candidate.swgohAllyCode)).join(' / '))}`).join('<br>')}</small>
  </div>` : '';
  return `${exactRows}${ambiguousRows}`;
}
function cardHtml() {
  const data = state.data || {};
  const availableDiscord = Array.isArray(data.availableDiscordMembers) ? data.availableDiscordMembers.length : 0;
  const unlinkedPlayers = Array.isArray(data.unlinkedCurrentPlayers) ? data.unlinkedCurrentPlayers.length : Number(data.unlinkedCurrentMembers || 0);
  const exactSuggestions = Array.isArray(data.exactSuggestions) ? data.exactSuggestions.length : 0;
  const mentionReady = Number(data.mentionReadyMembers || 0);
  const currentGuild = Number(data.currentGuildMembers || 0);
  const coverage = currentGuild ? `${mentionReady}/${currentGuild} (${number(data.mentionCoveragePercent)}%)` : '0/0';
  return `<section class="guild-ops-card guild-discord-link-admin" data-guild-discord-link-admin>
    <div class="kicker">DISCORD ↔ SWGOH REGISTRATION MANAGER</div>
    <h3>Guild Mention Coverage & Officer Pairing</h3>
    <p>Build the durable Discord ↔ SWGOH identity map used by TB assignment @mentions. Exact normalized matches can be applied in bulk; all other pairings require an officer to select both identities explicitly.</p>
    <div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>Mention Ready</span><strong>${escapeHtml(coverage)}</strong></div>
      <div class="guild-ops-kpi"><span>Current Links</span><strong>${number(data.linkedCurrentMembers)}</strong></div>
      <div class="guild-ops-kpi"><span>SWGOH Unlinked</span><strong>${number(unlinkedPlayers)}</strong></div>
      <div class="guild-ops-kpi"><span>Discord Available</span><strong>${number(availableDiscord)}</strong></div>
      <div class="guild-ops-kpi"><span>Exact Safe Matches</span><strong>${number(exactSuggestions)}</strong></div>
      <div class="guild-ops-kpi"><span>Stale Links</span><strong>${number(data.stale)}</strong></div>
    </div>
    <div class="guild-ops-statusline">
      <span class="guild-ops-chip ${data.discordMembershipChecked ? 'ready' : 'warn'}">${data.discordMembershipChecked ? 'DISCORD MEMBERSHIP VERIFIED' : 'DISCORD PRESENCE NOT CHECKED'}</span>
      ${data.discordGuildId ? `<span class="guild-ops-chip">DISCORD GUILD · ${escapeHtml(data.discordGuildId)}</span>` : ''}
      <span class="guild-ops-chip ${Number(data.discordMissing || 0) ? 'risk' : 'ready'}">LEFT DISCORD · ${number(data.discordMissing)}</span>
      <span class="guild-ops-chip ${Number(data.swgohMissing || 0) ? 'risk' : 'ready'}">LEFT SWGOH GUILD · ${number(data.swgohMissing)}</span>
    </div>

    <div class="kicker" style="margin-top:18px">EXACT SAFE SUGGESTIONS</div>
    <p>Only one-to-one normalized name matches appear here. Fuzzy or ambiguous identities are never auto-linked.</p>
    <div id="opsRegistrationSuggestions">${suggestionsHtml()}</div>
    <div class="guild-ops-actions">
      <button type="button" id="opsApplyExactMatches" ${exactSuggestions ? '' : 'disabled'}>Apply ${number(exactSuggestions)} Exact Safe Match${exactSuggestions === 1 ? '' : 'es'}</button>
    </div>

    <div class="kicker" style="margin-top:18px">OFFICER MANUAL PAIRING</div>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Discord member</span><select id="opsManualDiscordUserId" ${availableDiscord ? '' : 'disabled'}>${discordOptionsHtml()}</select></label>
      <label class="guild-ops-field"><span>Current SWGOH Guild member</span><select id="opsManualSwgohAllyCode" ${unlinkedPlayers ? '' : 'disabled'}>${playerOptionsHtml()}</select></label>
      <div class="guild-ops-field"><span>Validation</span><small>The server re-checks that the selected Discord account is human and still in this Discord server, and that the Ally Code is still in the current SWGOH Guild, immediately before saving.</small></div>
    </div>
    <div class="guild-ops-actions">
      <button type="button" id="opsManualLinkMember" ${availableDiscord && unlinkedPlayers ? '' : 'disabled'}>Verify & Link Selected Members</button>
      <button type="button" id="opsManualLinksRefresh" class="secondary">Refresh Registration Manager</button>
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
    if (announce) setMessage('Refreshing Guild registration inventory…');
    state.data = await fetchJson(api('links'));
    const existing = document.querySelector('[data-guild-discord-link-admin]');
    if (existing) {
      existing.outerHTML = cardHtml();
      bind();
      if (announce) setMessage('Guild registration inventory refreshed.');
    }
  } catch (error) {
    setMessage(error.message, true);
  } finally { state.loading = false; }
}
function refreshIntegrationIntelligence() {
  document.getElementById('opsIntegrationRefresh')?.click();
}
function selectedLabel(id) {
  const select = document.getElementById(id);
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}
function applySuggestion(discordUserId, swgohAllyCode) {
  const discordSelect = document.getElementById('opsManualDiscordUserId');
  const playerSelect = document.getElementById('opsManualSwgohAllyCode');
  if (discordSelect) discordSelect.value = text(discordUserId);
  if (playerSelect) playerSelect.value = digits(swgohAllyCode).slice(0, 9);
  setMessage('Exact-safe suggestion selected. Review both members, then click Verify & Link Selected Members.');
}
function suggestForDiscordSelection() {
  const discordUserId = text(document.getElementById('opsManualDiscordUserId')?.value);
  if (!discordUserId) return;
  const exact = Array.isArray(state.data?.exactSuggestions) ? state.data.exactSuggestions : [];
  const suggestion = exact.find((row) => text(row.discordUserId) === discordUserId);
  if (suggestion) {
    const playerSelect = document.getElementById('opsManualSwgohAllyCode');
    if (playerSelect) playerSelect.value = digits(suggestion.swgohAllyCode).slice(0, 9);
    setMessage(`Exact-safe name match found for ${suggestion.displayName || discordUserId}. Review before linking.`);
  }
}
async function manualLink() {
  const discordUserId = digits(document.getElementById('opsManualDiscordUserId')?.value);
  const swgohAllyCode = digits(document.getElementById('opsManualSwgohAllyCode')?.value);
  if (!/^\d{16,22}$/.test(discordUserId)) { setMessage('Choose an unlinked Discord member.', true); return; }
  if (!/^\d{9}$/.test(swgohAllyCode)) { setMessage('Choose an unlinked current SWGOH Guild member.', true); return; }
  const discordLabel = selectedLabel('opsManualDiscordUserId') || discordUserId;
  const playerLabel = selectedLabel('opsManualSwgohAllyCode') || displayAlly(swgohAllyCode);
  if (!confirm(`Link ${discordLabel} to ${playerLabel}? Both identities will be re-verified before the durable pairing is saved.`)) return;
  try {
    setMessage('Re-verifying Discord server membership and current SWGOH Guild membership…');
    const result = await fetchJson(api('link-member'), {
      method: 'POST',
      body: JSON.stringify({ discordUserId, swgohAllyCode }),
    });
    state.data = null;
    await loadLinks();
    setMessage(`${result.playerName || displayAlly(result.swgohAllyCode)} linked to ${result.discordDisplayName || result.discordUserId}.`);
    window.dispatchEvent(new CustomEvent('swgoh:guild-discord-links-changed'));
    refreshIntegrationIntelligence();
  } catch (error) { setMessage(error.message, true); }
}
async function applyExactMatches() {
  const suggestions = Array.isArray(state.data?.exactSuggestions) ? state.data.exactSuggestions : [];
  if (!suggestions.length) { setMessage('No exact-safe matches are available to apply.', true); return; }
  if (!confirm(`Apply ${suggestions.length} one-to-one exact normalized Discord ↔ SWGOH match${suggestions.length === 1 ? '' : 'es'}? Fuzzy and ambiguous matches will remain untouched.`)) return;
  try {
    setMessage('Re-checking and applying exact-safe Guild member matches…');
    const result = await fetchJson(api('match-guildmates'), {
      method: 'POST',
      body: JSON.stringify({ apply: true }),
    });
    const applied = Array.isArray(result?.applied) ? result.applied.length : 0;
    state.data = null;
    await loadLinks();
    setMessage(`Applied ${applied} exact-safe Guild member match${applied === 1 ? '' : 'es'}.`);
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
  document.getElementById('opsApplyExactMatches')?.addEventListener('click', applyExactMatches);
  document.getElementById('opsManualDiscordUserId')?.addEventListener('change', suggestForDiscordSelection);
  document.getElementById('opsManualLinksRefresh')?.addEventListener('click', () => loadLinks({ announce: true }));
  for (const button of document.querySelectorAll('[data-use-registration-suggestion]')) {
    button.addEventListener('click', () => applySuggestion(button.dataset.useRegistrationSuggestion, button.dataset.suggestionAlly));
  }
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
