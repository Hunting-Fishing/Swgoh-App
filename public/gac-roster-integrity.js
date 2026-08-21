import { allyCode, combinedRosterIntegrity, rosterIntegrity } from './gac-roster-integrity-model.js';

const state = {
  key: '',
  mine: null,
  opponent: null,
  loading: false,
  checkedAt: 0,
  requestId: 0,
  timer: null,
};

const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function ownerCode() {
  return allyCode(
    document.getElementById('allyCode')?.value ||
    window.__swgohAccountAllyCode ||
    window.__swgohPlayerRosterSnapshot?.allyCode ||
    window.__swgohLiveSnapshot?.allyCode
  );
}

function opponentCode() {
  return allyCode(
    document.querySelector('[data-gacv2-opponent]')?.value ||
    document.getElementById('gacOpponentCode')?.value
  );
}

function formatAllyCode(value) {
  return allyCode(value).replace(/(\d{3})(?=\d)/g, '$1-');
}

function ageLabel(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return 'age not exposed';
  const value = Math.max(0, Math.floor(Number(seconds)));
  if (value < 60) return `${value}s old`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s old`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m old`;
}

function countLabel(actual, expected) {
  const left = actual === null || actual === undefined ? '—' : Number(actual).toLocaleString();
  if (expected === null || expected === undefined) return left;
  return `${left} / ${Number(expected).toLocaleString()} expected`;
}

function coverageBadge(label, value) {
  const normalized = clean(value).toLowerCase() || 'unknown';
  const stateClass = ['known', 'partial', 'observed', 'unverified', 'unknown'].includes(normalized) ? normalized : 'unknown';
  return `<span class="gac-roster-cap is-${stateClass}"><b>${escapeHtml(label)}</b><small>${escapeHtml(normalized.toUpperCase())}</small></span>`;
}

function cardHtml(label, integrity, body = null) {
  if (!integrity) {
    return `<article class="gac-roster-truth-card is-waiting"><header><span>${escapeHtml(label)}</span><b>WAITING</b></header><strong>Roster not loaded</strong><small>Load both Ally Codes to verify roster truth.</small></article>`;
  }
  const name = clean(body?.player?.name) || formatAllyCode(integrity.actualAllyCode || integrity.expectedAllyCode);
  const issues = [...integrity.blocking, ...integrity.warnings];
  const visibleIssues = issues.slice(0, 5);
  const hiddenIssueCount = Math.max(0, issues.length - visibleIssues.length);
  const statusLabel = integrity.status === 'good' ? 'LIVE · VERIFIED' : integrity.status === 'warn' ? 'LIVE · WARNING' : 'TRUTH BLOCKED';
  return `<article class="gac-roster-truth-card is-${escapeHtml(integrity.status)}">
    <header><span>${escapeHtml(label)}</span><b>${escapeHtml(statusLabel)}</b></header>
    <div class="gac-roster-truth-identity"><strong>${escapeHtml(name || 'Unknown player')}</strong><small>${escapeHtml(formatAllyCode(integrity.actualAllyCode || integrity.expectedAllyCode))}</small></div>
    <div class="gac-roster-truth-source"><span>${escapeHtml(integrity.source.response)} · ${escapeHtml(integrity.freshness.cacheState)}</span><b>${escapeHtml(ageLabel(integrity.freshness.ageSeconds))}</b></div>
    <div class="gac-roster-truth-counts"><span><small>CHARACTERS</small><b>${escapeHtml(countLabel(integrity.counts.characters, integrity.expectedCounts.characters))}</b></span><span><small>SHIPS</small><b>${escapeHtml(countLabel(integrity.counts.ships, integrity.expectedCounts.ships))}</b></span></div>
    <div class="gac-roster-truth-caps">${coverageBadge('Characters', integrity.coverage.characters)}${coverageBadge('Ships', integrity.coverage.ships)}${coverageBadge('Profile GP', integrity.coverage.profileGp)}${coverageBadge('Unit GP', integrity.coverage.unitGp)}${coverageBadge('Zetas', integrity.coverage.zetas)}${coverageBadge('Omicrons', integrity.coverage.omicrons)}</div>
    ${issues.length ? `<div class="gac-roster-truth-issues">${visibleIssues.map((issue) => `<small>⚠ ${escapeHtml(issue)}</small>`).join('')}${hiddenIssueCount ? `<small>+ ${hiddenIssueCount} additional integrity warning${hiddenIssueCount === 1 ? '' : 's'}</small>` : ''}</div>` : '<div class="gac-roster-truth-clean">✓ Live source, identity, freshness and roster coverage passed the current checks.</div>'}
  </article>`;
}

function combinedLabel(status) {
  if (status === 'good') return 'BOTH LIVE ROSTERS VERIFIED';
  if (status === 'warn') return 'ROSTER WARNING · CHECK COVERAGE';
  if (status === 'blocked') return 'ROSTER TRUTH BLOCKED';
  return 'WAITING FOR MATCHUP';
}

function publish() {
  const combined = combinedRosterIntegrity(state.mine?.integrity, state.opponent?.integrity);
  const detail = Object.freeze({
    status: combined,
    key: state.key,
    checkedAt: state.checkedAt,
    mine: state.mine?.integrity || null,
    opponent: state.opponent?.integrity || null,
  });
  window.__gacRosterIntegrity = detail;
  window.dispatchEvent(new CustomEvent('gac-roster-integrity-updated', { detail }));
}

function ensureHost() {
  const root = document.querySelector('[data-gacv2-root]');
  const setup = root?.querySelector('.gacv2-setup');
  if (!root || !setup) return null;
  let host = root.querySelector('[data-gac-roster-integrity]');
  if (!host) {
    host = document.createElement('section');
    host.dataset.gacRosterIntegrity = 'true';
    host.className = 'gac-roster-integrity';
    setup.insertAdjacentElement('afterend', host);
  }
  return host;
}

function render() {
  const host = ensureHost();
  if (!host) return;
  const combined = combinedRosterIntegrity(state.mine?.integrity, state.opponent?.integrity);
  host.className = `gac-roster-integrity is-${combined}`;
  host.innerHTML = `<header class="gac-roster-truth-head"><div><span>ROSTER TRUTH GATE</span><strong>${escapeHtml(combinedLabel(combined))}</strong><small>Live Comlink provenance · exact player identity · server-cache age · logical roster coverage</small></div><button type="button" data-gac-roster-truth-refresh ${state.loading ? 'disabled' : ''}>${state.loading ? 'CHECKING…' : 'REFRESH TRUTH'}</button></header>
    <div class="gac-roster-truth-grid">${cardHtml('YOUR ROSTER', state.mine?.integrity, state.mine?.body)}${cardHtml('OPPONENT', state.opponent?.integrity, state.opponent?.body)}</div>
    <footer>${combined === 'blocked' ? 'Do not treat roster deltas or counter-fit calculations as authoritative until the blocking roster truth issue is resolved.' : combined === 'warn' ? 'Character matchup work may continue where coverage is known; warnings identify stale, observed, unverified, or partial fields that must not be treated as current truth.' : combined === 'good' ? 'Both roster responses passed the current live-source, identity, freshness, capability, and count-coverage checks.' : 'Load or detect the current opponent to verify both live roster snapshots.'}</footer>`;
  host.querySelector('[data-gac-roster-truth-refresh]')?.addEventListener('click', () => void refresh({ force: true }));
}

async function fetchRosterTruth(code, { force = false } = {}) {
  const pathname = `/api/player/${code}${force ? '?refresh=1' : ''}`;
  const response = await fetch(pathname, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Roster truth request returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return Object.freeze({
    body,
    integrity: rosterIntegrity(body, response.headers, { expectedAllyCode: code }),
  });
}

function errorTruth(code, error) {
  return Object.freeze({
    body: null,
    integrity: Object.freeze({
      status: 'blocked',
      expectedAllyCode: code,
      actualAllyCode: '',
      identityMatches: false,
      source: Object.freeze({ body: 'unavailable', response: 'unavailable', live: false }),
      freshness: Object.freeze({ state: 'unknown', cacheState: 'unavailable', ageSeconds: null, stale: false }),
      counts: Object.freeze({ characters: null, ships: null }),
      expectedCounts: Object.freeze({ characters: null, ships: null, total: null }),
      capabilities: Object.freeze({}),
      coverage: Object.freeze({ characters: 'unknown', ships: 'unknown', profileGp: 'unknown', unitGp: 'unknown', zetas: 'unknown', omicrons: 'unknown' }),
      blocking: Object.freeze([clean(error?.message) || 'Live roster request failed.']),
      warnings: Object.freeze([]),
    }),
  });
}

async function refresh({ force = false } = {}) {
  const mineCode = ownerCode();
  const enemyCode = opponentCode();
  const key = `${mineCode}|${enemyCode}`;
  if (!mineCode || !enemyCode || mineCode === enemyCode) {
    state.key = key;
    state.mine = null;
    state.opponent = null;
    state.checkedAt = 0;
    render();
    publish();
    return;
  }
  if (!force && state.key === key && state.mine && state.opponent && Date.now() - state.checkedAt < 15_000) {
    render();
    return;
  }
  const requestId = ++state.requestId;
  state.key = key;
  state.loading = true;
  render();
  if (force) {
    window.__swgohRosterFetchCache?.clear?.(mineCode);
    window.__swgohRosterFetchCache?.clear?.(enemyCode);
  }
  const [mineResult, opponentResult] = await Promise.allSettled([
    fetchRosterTruth(mineCode, { force }),
    fetchRosterTruth(enemyCode, { force }),
  ]);
  if (requestId !== state.requestId) return;
  state.mine = mineResult.status === 'fulfilled' ? mineResult.value : errorTruth(mineCode, mineResult.reason);
  state.opponent = opponentResult.status === 'fulfilled' ? opponentResult.value : errorTruth(enemyCode, opponentResult.reason);
  state.checkedAt = Date.now();
  state.loading = false;
  render();
  publish();
}

function schedule(delay = 120, options = {}) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(options), Math.max(0, delay));
}

function injectStyle() {
  if (document.querySelector('link[data-gac-roster-integrity-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-roster-integrity.css?v=20260821-b06b';
  link.dataset.gacRosterIntegrityStyle = 'true';
  document.head.appendChild(link);
}

function bind() {
  injectStyle();
  render();
  window.addEventListener('gac-v2-matchup-loaded', () => schedule(80));
  window.addEventListener('gac-current-opponent-manually-confirmed', () => schedule(80, { force: true }));
  window.addEventListener('gac-war-room-updated', () => schedule(160));
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'allyCode' || event.target?.matches?.('[data-gacv2-opponent]')) schedule(80, { force: true });
  }, true);
  const observer = new MutationObserver((mutations) => {
    if (!document.querySelector('[data-gacv2-root]')) return;
    if (mutations.every((mutation) => mutation.target?.closest?.('[data-gac-roster-integrity]'))) return;
    ensureHost();
    schedule(180);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => schedule(250), { once: true });
  schedule(350);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') bind();

export { ageLabel, cardHtml, combinedLabel, countLabel, coverageBadge, fetchRosterTruth, formatAllyCode };
