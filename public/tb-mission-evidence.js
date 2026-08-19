const API = '/api/account/web-actions/tb';
const CSS = '/tb-mission-evidence.css?v=20260819-evidence1';
const CARD_SELECTOR = '[data-rote-exact-mission-card]';

const state = {
  loading: false,
  cachedKey: '',
  cache: new Map(),
  authError: null,
  observer: null,
  syncQueued: false,
};

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;

function ensureCss() {
  if (document.querySelector(`link[href="${CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS;
  document.head.appendChild(link);
}

function cards() {
  return [...document.querySelectorAll(CARD_SELECTOR)];
}

function missionId(card) {
  return text(card?.dataset?.roteExactMissionCard);
}

function resultLabel(value) {
  const code = text(value).toLowerCase();
  return code === 'failed' ? 'FAILED' : code === 'skipped' ? 'SKIPPED' : code.toUpperCase();
}

function countBadges(summary = {}) {
  const counts = summary.counts || {};
  return `<div class="tb-evidence-counts">
    <b class="full">2/2 ${Number(counts['2/2'] || 0)}</b>
    <b class="partial">1/2 ${Number(counts['1/2'] || 0)}</b>
    <b class="fail">0/2 ${Number(counts['0/2'] || 0)}</b>
    <b class="fail">FAIL ${Number(counts.failed || 0)}</b>
    <b>SKIP ${Number(counts.skipped || 0)}</b>
  </div>`;
}

function historyLine(summary = {}) {
  const last = array(summary.lastFive).map(resultLabel);
  return `<div class="tb-evidence-history">${last.length ? `Last ${last.length}: ${escapeHtml(last.join(' · '))}` : 'No reports yet.'}</div>`;
}

function officerMarkup(evidence) {
  const rows = array(evidence.officerCurrentEventReports);
  if (!rows.length) return '';
  return `<details class="tb-evidence-officer">
    <summary>OFFICER CORRECTIONS · ${rows.length} CURRENT EVENT REPORT${rows.length === 1 ? '' : 'S'}</summary>
    <div class="tb-evidence-officer-list">${rows.map((row) => `<div class="tb-evidence-officer-row" data-attempt-id="${escapeAttr(row.id)}">
      <span><strong>${escapeHtml(row.playerName || row.allyCode || 'Guild member')}</strong><small>Revision ${Number(row.revision || 1)} · ${escapeHtml(resultLabel(row.resultCode))}</small></span>
      <select data-correction-result aria-label="Correct result">
        ${['2/2','1/2','0/2','failed','skipped'].map((result) => `<option value="${escapeAttr(result)}"${text(row.resultCode) === result ? ' selected' : ''}>${escapeHtml(resultLabel(result))}</option>`).join('')}
      </select>
      <input data-correction-reason maxlength="600" placeholder="Correction reason" aria-label="Correction reason">
      <button type="button" data-correct-attempt>Correct</button>
    </div>`).join('')}</div>
  </details>`;
}

function evidenceMarkup(evidence) {
  const community = evidence.community || {};
  const guild = evidence.guild || {};
  const you = evidence.you || {};
  const current = you.currentEventReport;
  const sources = array(community.sourceIds);
  const reportControls = evidence.canReport
    ? `<div class="tb-evidence-report">
        <span>REPORT THIS EVENT</span>
        ${['2/2','1/2','0/2','failed','skipped'].map((result) => `<button type="button" data-tb-evidence-report="${escapeAttr(evidence.missionId)}" data-result="${escapeAttr(result)}">${escapeHtml(resultLabel(result))}</button>`).join('')}
        <input data-tb-evidence-note maxlength="1200" placeholder="Optional note: team, key speed, mistake, strategy…" aria-label="Optional mission report note">
        <div class="tb-evidence-report-status" data-tb-evidence-status></div>
      </div>`
    : current
      ? `<div class="tb-evidence-current">Current event recorded: <strong>${escapeHtml(resultLabel(current.resultCode))}</strong> · revision ${Number(current.revision || 1)}. Officer correction preserves the prior revision.</div>`
      : `<div class="tb-evidence-current">Reporting is available only when this mission belongs to the active TB phase.</div>`;

  return `<section class="tb-mission-evidence" data-tb-mission-evidence="${escapeAttr(evidence.missionId)}">
    <header><span>MISSION EVIDENCE · COMMUNITY / YOUR GUILD / YOU</span><small>${escapeHtml(evidence.phase)} · reported outcomes ≠ guaranteed success</small></header>
    <div class="tb-evidence-grid">
      <article class="tb-evidence-card community">
        <span>COMMUNITY</span>
        <strong>${sources.length} reference source${sources.length === 1 ? '' : 's'}</strong>
        <p>${Number(community.planningTeamClaims || 0)} planning team claim${Number(community.planningTeamClaims || 0) === 1 ? '' : 's'} attached. No win rate is inferred.</p>
        <div class="tb-evidence-history">${sources.length ? escapeHtml(sources.slice(0, 3).join(' · ')) : 'Reference evidence not attached.'}</div>
      </article>
      <article class="tb-evidence-card guild">
        <span>YOUR GUILD</span>
        <strong>${Number(guild.attempts || 0)} attempt${Number(guild.attempts || 0) === 1 ? '' : 's'} · ${Number(guild.reports || 0)} report${Number(guild.reports || 0) === 1 ? '' : 's'}</strong>
        <p>Current corrected revisions across your verified Guild history.</p>
        ${countBadges(guild)}${historyLine(guild)}
      </article>
      <article class="tb-evidence-card you">
        <span>YOU</span>
        <strong>${Number(you.attempts || 0)} attempt${Number(you.attempts || 0) === 1 ? '' : 's'} · ${Number(you.reports || 0)} report${Number(you.reports || 0) === 1 ? '' : 's'}</strong>
        <p>Your own verified-account mission history.</p>
        ${countBadges(you)}${historyLine(you)}
      </article>
    </div>
    ${reportControls}
    ${officerMarkup(evidence)}
    <small class="tb-evidence-boundary">${escapeHtml(guild.evidenceBoundary || 'Guild reports are evidence, not universal probability.')}</small>
  </section>`;
}

function authMarkup() {
  return `<section class="tb-mission-evidence"><div class="tb-evidence-auth">Sign in with a verified Guild identity to see <strong>Your Guild</strong> and <strong>You</strong> mission evidence or report an outcome. <a href="/account">Open Account →</a></div></section>`;
}

function attach(card, markup) {
  const body = card.querySelector('.rote-exact-body') || card;
  body.querySelector(':scope > [data-tb-mission-evidence]')?.remove();
  body.querySelector(':scope > .tb-mission-evidence')?.remove();
  body.insertAdjacentHTML('beforeend', markup);
  bindCard(body);
}

function renderVisible() {
  for (const card of cards()) {
    const id = missionId(card);
    if (!id) continue;
    const evidence = state.cache.get(id);
    if (evidence) attach(card, evidenceMarkup(evidence));
    else if (state.authError) attach(card, authMarkup());
    else if (!card.querySelector('[data-tb-mission-evidence]')) attach(card, '<section class="tb-mission-evidence"><div class="tb-evidence-loading">Loading Guild mission evidence…</div></section>');
  }
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
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `Mission evidence request failed (${response.status}).`);
    error.status = response.status;
    error.code = body?.code || 'TB_MISSION_EVIDENCE_FAILED';
    error.details = body?.details || null;
    throw error;
  }
  return body;
}

async function loadEvidence(ids, { force = false } = {}) {
  const unique = [...new Set(ids.map(text).filter(Boolean))].sort();
  if (!unique.length || state.loading) return;
  const key = unique.join('|');
  if (!force && key === state.cachedKey && unique.every((id) => state.cache.has(id))) {
    renderVisible();
    return;
  }
  state.loading = true;
  state.authError = null;
  renderVisible();
  try {
    const params = new URLSearchParams();
    for (const id of unique) params.append('missionId', id);
    const body = await api(`${API}/mission-evidence?${params.toString()}`);
    for (const mission of array(body.missions)) state.cache.set(text(mission.missionId), mission);
    state.cachedKey = key;
  } catch (error) {
    if (error.status === 401 || error.status === 403) state.authError = error;
    else console.warn('[TB mission evidence]', error);
  } finally {
    state.loading = false;
    renderVisible();
  }
}

function cardMissionIds() {
  return cards().map(missionId).filter(Boolean);
}

function statusNode(container) {
  return container.querySelector('[data-tb-evidence-status]');
}

async function submitReport(container, missionIdValue, resultCode) {
  const status = statusNode(container);
  const note = text(container.querySelector('[data-tb-evidence-note]')?.value);
  if (status) { status.className = 'tb-evidence-report-status'; status.textContent = 'Saving verified-account report…'; }
  try {
    await api(`${API}/mission-attempt`, {
      method: 'POST',
      body: JSON.stringify({ missionId: missionIdValue, resultCode, note }),
    });
    if (status) { status.className = 'tb-evidence-report-status success'; status.textContent = `${resultLabel(resultCode)} saved.`; }
    await loadEvidence(cardMissionIds(), { force: true });
    window.dispatchEvent(new CustomEvent('swgoh:tb-mission-evidence-updated', { detail: { missionId: missionIdValue } }));
  } catch (error) {
    if (status) { status.className = 'tb-evidence-report-status error'; status.textContent = `${error.message}${error.code ? ` (${error.code})` : ''}`; }
  }
}

async function correctReport(row) {
  const attemptId = text(row.dataset.attemptId);
  const resultCode = text(row.querySelector('[data-correction-result]')?.value);
  const correctionReason = text(row.querySelector('[data-correction-reason]')?.value);
  const button = row.querySelector('[data-correct-attempt]');
  if (correctionReason.length < 3) {
    row.querySelector('[data-correction-reason]')?.focus();
    return;
  }
  if (button) { button.disabled = true; button.textContent = 'Saving…'; }
  try {
    await api(`${API}/mission-attempt/${encodeURIComponent(attemptId)}/correct`, {
      method: 'POST',
      body: JSON.stringify({ resultCode, correctionReason }),
    });
    await loadEvidence(cardMissionIds(), { force: true });
    window.dispatchEvent(new CustomEvent('swgoh:tb-mission-evidence-updated', { detail: { attemptId } }));
  } catch (error) {
    if (button) button.title = `${error.message}${error.code ? ` (${error.code})` : ''}`;
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = 'Correct'; }
  }
}

function bindCard(container) {
  for (const button of container.querySelectorAll('[data-tb-evidence-report]')) {
    if (button.dataset.bound === '1') continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => submitReport(container, text(button.dataset.tbEvidenceReport), text(button.dataset.result)));
  }
  for (const button of container.querySelectorAll('[data-correct-attempt]')) {
    if (button.dataset.bound === '1') continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => correctReport(button.closest('[data-attempt-id]')));
  }
}

function queueSync() {
  if (state.syncQueued) return;
  state.syncQueued = true;
  setTimeout(() => {
    state.syncQueued = false;
    const ids = cardMissionIds();
    if (ids.length) loadEvidence(ids);
  }, 80);
}

function install() {
  ensureCss();
  queueSync();
  state.observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === 1 && (node.matches?.(CARD_SELECTOR) || node.querySelector?.(CARD_SELECTOR))))) queueSync();
  });
  state.observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('swgoh:workspace-activated', (event) => {
    if (event.detail?.id === 'rote') queueSync();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
