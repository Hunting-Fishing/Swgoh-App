const OPS_PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { status: null, match: null, loading: false, timer: 0 };

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
function adminApi(action = 'status') {
  return `/api/account/guild-discord-admin/${allyCode()}/${action}`;
}
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

function tone(value) { return value ? 'ready' : 'warn'; }
function statusCardHtml() {
  const s = state.status || {};
  const destinations = Array.isArray(s.destinations) ? s.destinations : [];
  return `<section class="guild-ops-card guild-discord-admin" data-guild-discord-admin>
    <div class="kicker">DISCORD GUILD ADMINISTRATION</div>
    <h3>Verified Channels & Member Registration</h3>
    <p>Command Center validates delivery channels against the Discord server already bound by <code>/tb setup</code>. Player matching is conservative: only one unambiguous exact normalized name match may be auto-linked.</p>
    <div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>Discord Binding</span><strong>${s.bound ? 'BOUND' : 'NOT BOUND'}</strong></div>
      <div class="guild-ops-kpi"><span>Bot</span><strong>${s.botConfigured ? 'READY' : 'MISSING'}</strong></div>
      <div class="guild-ops-kpi"><span>Linked Members</span><strong>${number(s.linkedMemberCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Unlinked Members</span><strong>${number(s.unlinkedMemberCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Destinations</span><strong>${number(destinations.length)}</strong></div>
    </div>
    <div class="guild-ops-statusline">
      <span class="guild-ops-chip ${tone(s.bound)}">${s.bound ? `DISCORD GUILD · ${escapeHtml(s.discordGuildId)}` : 'RUN /tb setup'}</span>
      <span class="guild-ops-chip ${tone(s.commandChannelId)}">${s.commandChannelId ? `COMMAND CHANNEL · ${escapeHtml(s.commandChannelId)}` : 'NO COMMAND CHANNEL'}</span>
      <span class="guild-ops-chip ${tone(s.botConfigured)}">${s.botConfigured ? 'BOT API READY' : 'BOT TOKEN NOT CONFIGURED'}</span>
    </div>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Discord channel ID</span><input id="opsDiscordVerifyChannelId" inputmode="numeric" autocomplete="off" placeholder="Right-click channel → Copy Channel ID"></label>
      <div class="guild-ops-field"><span>Verification rule</span><small>Channel must belong to the bound Discord Guild and be a supported text/announcement/forum channel.</small></div>
      <div class="guild-ops-field"><span>Security</span><small>The browser never receives the Discord bot token or webhook secret.</small></div>
    </div>
    <div class="guild-ops-actions">
      <button type="button" id="opsDiscordVerifyChannel">Verify Channel</button>
      <button type="button" id="opsDiscordRefreshAdmin" class="secondary">Refresh Discord Status</button>
    </div>
    <div id="opsDiscordAdminMessage" class="guild-ops-inline-result"></div>
    <div class="kicker" style="margin-top:18px">VERIFIED DELIVERY DESTINATIONS</div>
    <div id="opsDiscordDestinationRows">${destinationRows(destinations)}</div>
    <div class="kicker" style="margin-top:18px">GUILD MEMBER REGISTRATION</div>
    <p>Preview compares current canonical SWGOH Guild member names with Discord nicknames, global names and usernames. Fuzzy matches are never applied automatically.</p>
    <div class="guild-ops-actions">
      <button type="button" id="opsDiscordMatchPreview" class="secondary">Preview Exact Matches</button>
      <button type="button" id="opsDiscordMatchApply" disabled>Apply Exact Matches</button>
    </div>
    <div id="opsDiscordMatchResult">${matchHtml()}</div>
  </section>`;
}

function destinationRows(destinations) {
  if (!destinations.length) return '<div class="guild-ops-empty">No Discord delivery destinations are registered.</div>';
  return `<div class="guild-ops-table-wrap"><table class="guild-ops-table"><thead><tr><th>Destination</th><th>Type</th><th>Discord ID</th><th>Status</th><th></th></tr></thead><tbody>${destinations.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.displayName || 'Discord destination')}</strong></td>
      <td>${escapeHtml(row.kind)}</td>
      <td><small>${escapeHtml(row.externalId || 'server secret')}</small></td>
      <td><span class="guild-ops-chip ${row.verified ? 'ready' : 'warn'}">${row.verified ? 'VERIFIED' : 'UNVERIFIED'}</span></td>
      <td>${row.kind === 'channel' && row.verified ? `<button type="button" class="guild-ops-button secondary" data-discord-unverify="${escapeHtml(row.id)}">Unverify</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function matchHtml() {
  const result = state.match;
  if (!result) return '<div class="guild-ops-empty">Run a preview before applying any automatic links.</div>';
  const exact = Array.isArray(result.exact) ? result.exact : [];
  const ambiguous = Array.isArray(result.ambiguous) ? result.ambiguous : [];
  return `<div class="guild-ops-kpis">
      <div class="guild-ops-kpi"><span>Exact</span><strong>${number(exact.length)}</strong></div>
      <div class="guild-ops-kpi"><span>Ambiguous</span><strong>${number(ambiguous.length)}</strong></div>
      <div class="guild-ops-kpi"><span>Unmatched Discord</span><strong>${number(result.unmatchedCount)}</strong></div>
      <div class="guild-ops-kpi"><span>Applied</span><strong>${number(result.applied?.length)}</strong></div>
    </div>
    ${exact.length ? `<div class="guild-ops-table-wrap"><table class="guild-ops-table"><thead><tr><th>Discord</th><th>SWGOH Player</th><th>Ally Code</th><th>Safety</th></tr></thead><tbody>${exact.map((row) => `<tr><td>${escapeHtml(row.discordName)}</td><td><strong>${escapeHtml(row.playerName)}</strong></td><td>${escapeHtml(row.allyCode)}</td><td><span class="guild-ops-chip ready">EXACT UNIQUE</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="guild-ops-note">No new exact unique matches were found.</div>'}
    ${ambiguous.length ? `<div class="guild-ops-note warn"><strong>${number(ambiguous.length)} ambiguous Discord member(s) require manual review.</strong><br>${ambiguous.slice(0,10).map((row) => `${escapeHtml(row.discordName)} → ${escapeHtml((row.candidates || []).map((candidate) => `${candidate.name} (${candidate.allyCode})`).join(' / '))}`).join('<br>')}</div>` : ''}
    <div class="guild-ops-note"><strong>Safety:</strong> ${escapeHtml(result.safety || 'Only exact unique matches may be auto-linked.')}</div>`;
}

function setMessage(message, error = false) {
  const target = document.getElementById('opsDiscordAdminMessage');
  if (!target) return;
  target.innerHTML = message ? `<span class="guild-ops-chip ${error ? 'risk' : 'ready'}">${escapeHtml(message)}</span>` : '';
}

async function loadStatus() {
  if (state.loading || allyCode().length !== 9) return;
  state.loading = true;
  try {
    state.status = await fetchJson(adminApi('status'));
    const existing = document.querySelector('[data-guild-discord-admin]');
    if (existing) {
      existing.outerHTML = statusCardHtml();
      bind();
    }
  } catch (error) {
    setMessage(error.message, true);
  } finally { state.loading = false; }
}

async function verifyChannel() {
  const channelId = text(document.getElementById('opsDiscordVerifyChannelId')?.value);
  if (!/^\d{16,22}$/.test(channelId)) { setMessage('Enter a valid Discord channel ID.', true); return; }
  try {
    setMessage('Validating channel ownership with Discord…');
    await fetchJson(adminApi('verify-channel'), { method: 'POST', body: JSON.stringify({ channelId }) });
    state.status = null;
    await loadStatus();
    setMessage('Discord channel verified for this Guild.');
  } catch (error) { setMessage(error.message, true); }
}

async function unverifyChannel(destinationId) {
  if (!confirm('Unverify this Discord assignment destination? Existing audit history is retained.')) return;
  try {
    await fetchJson(adminApi('unverify-channel'), { method: 'POST', body: JSON.stringify({ destinationId }) });
    state.status = null;
    await loadStatus();
    setMessage('Discord channel unverified.');
  } catch (error) { setMessage(error.message, true); }
}

async function matchGuildmates(apply) {
  const target = document.getElementById('opsDiscordMatchResult');
  try {
    if (target) target.innerHTML = `<div class="guild-ops-empty">${apply ? 'Applying exact unique links…' : 'Comparing Discord members with the canonical Guild roster…'}</div>`;
    state.match = await fetchJson(adminApi('match-guildmates'), { method: 'POST', body: JSON.stringify({ apply }) });
    if (target) target.innerHTML = matchHtml();
    const applyButton = document.getElementById('opsDiscordMatchApply');
    if (applyButton) applyButton.disabled = apply || !state.match.exact?.length;
    if (apply) {
      state.status = null;
      await loadStatus();
      setMessage(`${number(state.match.applied?.length)} exact Guild member link(s) applied.`);
    }
  } catch (error) {
    if (target) target.innerHTML = `<div class="guild-ops-error">${escapeHtml(error.message)}</div>`;
  }
}

function bind() {
  document.getElementById('opsDiscordVerifyChannel')?.addEventListener('click', verifyChannel);
  document.getElementById('opsDiscordRefreshAdmin')?.addEventListener('click', () => { state.status = null; loadStatus(); });
  document.getElementById('opsDiscordMatchPreview')?.addEventListener('click', () => matchGuildmates(false));
  document.getElementById('opsDiscordMatchApply')?.addEventListener('click', () => {
    if (!state.match?.exact?.length) return;
    if (!confirm(`Apply ${state.match.exact.length} exact unique Discord-to-SWGOH player link(s)?`)) return;
    matchGuildmates(true);
  });
  for (const button of document.querySelectorAll('[data-discord-unverify]')) {
    button.addEventListener('click', () => unverifyChannel(button.dataset.discordUnverify));
  }
}

function installCard() {
  if (!isRoute() || document.querySelector('[data-guild-discord-admin]')) return;
  const deliveryCard = document.getElementById('opsSaveDelivery')?.closest('.guild-ops-card');
  if (!deliveryCard) return;
  const destinationCard = deliveryCard.nextElementSibling?.classList?.contains('guild-ops-card')
    ? deliveryCard.nextElementSibling
    : deliveryCard;
  destinationCard.insertAdjacentHTML('afterend', statusCardHtml());
  bind();
  loadStatus();
}
function scheduleInstall() { clearTimeout(state.timer); state.timer = setTimeout(installCard, 100); }
function install() {
  if (!location.pathname.startsWith('/guild')) return;
  scheduleInstall();
  new MutationObserver(() => { if (isRoute()) scheduleInstall(); }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
