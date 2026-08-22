import { boardSnapshot, openSquadSlot } from './gac-manual-board-workspace.js';
import { normalizeId, normalizeMembers, rosterIndex } from './gac-counter-matrix-model.js';

const state = {
  loading: false,
  loadedKey: '',
  report: null,
  error: '',
  open: false,
};

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function allyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? code : '';
}
function opponentCode(snapshot = {}) {
  return allyCode(snapshot?.opponentCode || document.querySelector('[data-gac-manual-opponent]')?.value || document.querySelector('[data-gacv2-opponent]')?.value || document.getElementById('gacOpponentCode')?.value);
}
function currentFormat(snapshot = {}) {
  const value = clean(snapshot?.format || snapshot?.rule?.format || '5v5').toLowerCase();
  return value === '3v3' || value === '3' ? '3v3' : '5v5';
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function combinedIndex(snapshot = {}) {
  const index = rosterIndex(snapshot?.opponentRoster || {});
  for (const unit of Array.isArray(snapshot?.catalog?.units) ? snapshot.catalog.units : []) {
    const id = normalizeId(unit);
    if (id && !index.has(id)) index.set(id, unit);
  }
  return index;
}
function unitName(index, id) { return clean(index.get(normalizeId(id))?.name || normalizeId(id) || 'Unknown'); }
function unitImage(index, id) {
  const unit = index.get(normalizeId(id)) || {};
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function portrait(index, id, leader = false) {
  const name = unitName(index, id);
  const image = unitImage(index, id);
  return `<span class="gac-scout-unit ${leader ? 'is-leader' : ''}" title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function zoneLabel(zone) {
  return ({ 'FRONT-TOP':'Front Top', 'FRONT-BOTTOM':'Front Bottom', 'BACK-BOTTOM':'Rear Bottom', 'BACK-TOP':'Fleet Territory' })[clean(zone).toUpperCase()] || clean(zone) || 'Unknown zone';
}

function eligiblePredictions(report, snapshot) {
  const format = currentFormat(snapshot);
  return (Array.isArray(report?.defensePrediction?.predictions) ? report.defensePrediction.predictions : [])
    .filter((row) => clean(row?.format).toLowerCase() === format)
    .filter((row) => normalizeId(row?.leaderBaseId) && normalizeMembers(row?.members).length)
    .slice(0, 18);
}

function occupied(snapshot, zone, slot) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : []).some((row) => clean(row?.zone).toUpperCase() === clean(zone).toUpperCase() && Number(row?.slot) === Number(slot));
}
function capacity(snapshot, zone) {
  return Number(snapshot?.rule?.territories?.find((row) => clean(row?.value).toUpperCase() === clean(zone).toUpperCase())?.capacity || 0);
}
function reviewTarget(prediction, snapshot) {
  const slotRows = Array.isArray(prediction?.slotTendencies) ? prediction.slotTendencies : [];
  for (const tendency of slotRows) {
    const zone = clean(tendency?.zone).toUpperCase();
    const slot = Number(tendency?.slot);
    if (!zone || zone === 'BACK-TOP' || !Number.isInteger(slot) || slot < 0 || slot >= capacity(snapshot, zone)) continue;
    if (!occupied(snapshot, zone, slot)) return Object.freeze({ zone, slot, source: 'verified-slot-tendency', samples: n(tendency?.verifiedBoards) });
  }
  const zoneRows = Array.isArray(prediction?.zoneTendencies) ? prediction.zoneTendencies : [];
  for (const tendency of zoneRows) {
    const zone = clean(tendency?.zone).toUpperCase();
    if (!zone || zone === 'BACK-TOP') continue;
    const max = capacity(snapshot, zone);
    for (let slot = 0; slot < max; slot += 1) {
      if (!occupied(snapshot, zone, slot)) return Object.freeze({ zone, slot, source: 'verified-zone-tendency', samples: n(tendency?.verifiedBoards) });
    }
  }
  return null;
}

function evidenceLabel(prediction = {}) {
  const verified = n(prediction?.verifiedHistoricalBoards);
  const battles = n(prediction?.battleObservedMatchups);
  if (verified >= 2) return `${verified} verified historical boards`;
  if (verified === 1) return '1 verified historical board';
  if (battles) return `${battles} battle-reconstructed boards`;
  return 'Historical tendency';
}

function predictionMarkup(prediction, snapshot, index, rank) {
  const leader = normalizeId(prediction?.leaderBaseId);
  const members = normalizeMembers(prediction?.members);
  const target = reviewTarget(prediction, snapshot);
  const lastSeen = clean(prediction?.lastSeenAt);
  const topZone = Array.isArray(prediction?.zoneTendencies) ? prediction.zoneTendencies[0] : null;
  const dc = prediction?.latestVerifiedDatacron;
  return `<article class="gac-scout-card"><header><div><span>#${rank} HISTORICAL DEFENSE</span><strong>${escapeHtml(unitName(index, leader))}</strong><small>${escapeHtml(evidenceLabel(prediction))}${lastSeen ? ` · last seen ${escapeHtml(new Date(lastSeen).toLocaleDateString())}` : ''}</small></div><b>${escapeHtml(clean(prediction?.evidenceClass || 'historical').replaceAll('-', ' ').toUpperCase())}</b></header><div class="gac-scout-team">${members.map((id) => portrait(index, id, id === leader)).join('')}</div><div class="gac-scout-metrics"><span><b>${n(prediction?.verifiedHistoricalBoards)}</b> verified boards</span><span><b>${n(prediction?.battleObservedMatchups)}</b> reconstructed</span><span><b>${n(prediction?.seasons)}</b> seasons</span><span><b>${n(prediction?.observedByPlayers)}</b> observers</span></div><footer><div><span>${topZone ? `Likely zone: ${escapeHtml(zoneLabel(topZone.zone))}` : 'No verified zone tendency'}</span><small>${dc ? 'Historical Datacron observed · reconfirm current assignment in-game.' : 'No current Datacron inference.'}</small></div>${target ? `<button type="button" data-gac-scout-review data-zone="${escapeAttr(target.zone)}" data-slot="${target.slot}" data-leader="${escapeAttr(leader)}" data-members="${escapeAttr(members.join(','))}">REVIEW IN ${escapeHtml(zoneLabel(target.zone).toUpperCase())} ${target.slot + 1}</button>` : '<button type="button" disabled>NO OPEN VERIFIED SLOT</button>'}</footer></article>`;
}

function rootHost() {
  return document.querySelector('.gac-manual-enemy-board') || null;
}
function ensureRoot() {
  const host = rootHost();
  if (!host) return null;
  let root = document.querySelector('[data-gac-scout-history]');
  if (!root) {
    root = document.createElement('section');
    root.className = 'gac-scout-history';
    root.dataset.gacScoutHistory = 'true';
    host.insertAdjacentElement('afterend', root);
  }
  const matrix = document.querySelector('[data-gac-counter-matrix]');
  if (matrix && root.nextElementSibling !== matrix) matrix.insertAdjacentElement('beforebegin', root);
  return root;
}

function render() {
  const root = ensureRoot();
  if (!root) return;
  const snapshot = boardSnapshot();
  const code = opponentCode(snapshot);
  const predictions = state.report ? eligiblePredictions(state.report, snapshot) : [];
  const index = combinedIndex(snapshot);
  root.innerHTML = `<header><div><span>OPPONENT SCOUTING</span><strong>Historical defense tendencies</strong><small>Use prior evidence to accelerate manual board entry. Historical squads are never treated as current hidden-board truth.</small></div><div>${state.loadedKey ? `<button type="button" data-gac-scout-toggle>${state.open ? 'HIDE HISTORY' : `VIEW HISTORY · ${predictions.length}`}</button>` : ''}<button type="button" data-gac-scout-load ${state.loading || !code ? 'disabled' : ''}>${state.loading ? 'LOADING…' : state.loadedKey ? 'REFRESH CACHED' : 'SCOUT OPPONENT'}</button></div></header>${state.error ? `<div class="gac-scout-error">${escapeHtml(state.error)}</div>` : ''}${!code ? '<div class="gac-scout-empty">Load an opponent Ally Code to scout persisted GAC history.</div>' : ''}${state.open && state.loadedKey ? `<div class="gac-scout-toolbar"><span>${predictions.length} ${escapeHtml(currentFormat(snapshot))} historical defense patterns</span><button type="button" data-gac-scout-import>REFRESH HISTORY SOURCE</button></div><div class="gac-scout-grid">${predictions.length ? predictions.map((row, indexValue) => predictionMarkup(row, snapshot, index, indexValue + 1)).join('') : '<div class="gac-scout-empty">No persisted defense history was found. Refresh History Source to attempt an explicit source import.</div>'}</div>` : ''}`;
}

async function loadScouting({ importHistory = false, force = false } = {}) {
  const snapshot = boardSnapshot();
  const code = opponentCode(snapshot);
  if (!code || state.loading) return;
  state.loading = true;
  state.error = '';
  render();
  try {
    const params = new URLSearchParams({ limit: '2500', import: importHistory ? '1' : '0' });
    if (force) params.set('refresh', '1');
    state.report = await fetchJson(`/api/gac/scouting/${code}?${params.toString()}`);
    state.loadedKey = `${code}|${currentFormat(snapshot)}`;
    state.open = true;
  } catch (error) {
    state.error = clean(error?.message || error || 'Historical scouting is unavailable.');
  } finally {
    state.loading = false;
    render();
  }
}

async function addHistoricalMembersToEditor(leader, members) {
  const ordered = [normalizeId(leader), ...normalizeMembers(members).filter((id) => id !== normalizeId(leader))].filter(Boolean);
  for (const id of ordered) {
    const input = document.querySelector('[data-gac-board-search]');
    if (!input) break;
    input.value = id;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(45);
    const button = document.querySelector(`[data-gac-board-add-unit="${CSS.escape(id)}"]`);
    if (button) button.click();
    await sleep(45);
  }
  const leaderButton = document.querySelector(`[data-gac-board-make-leader="${CSS.escape(normalizeId(leader))}"]`);
  if (leaderButton && !leaderButton.disabled) leaderButton.click();
}

async function reviewSuggestion(button) {
  const zone = clean(button.dataset.zone).toUpperCase();
  const slot = Number(button.dataset.slot);
  const leader = normalizeId(button.dataset.leader);
  const members = normalizeMembers(clean(button.dataset.members).split(','));
  if (!openSquadSlot(zone, slot)) return;
  await sleep(90);
  await addHistoricalMembersToEditor(leader, members);
  document.querySelector('[data-gac-board-editor-host]')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

function installScoutingHistory() {
  if (window.__gacScoutingHistoryInstalled) return;
  window.__gacScoutingHistoryInstalled = true;
  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.('[data-gac-scout-history]')) return;
    if (event.target.closest('[data-gac-scout-load]')) { void loadScouting({ importHistory: false }); return; }
    if (event.target.closest('[data-gac-scout-import]')) { void loadScouting({ importHistory: true, force: true }); return; }
    if (event.target.closest('[data-gac-scout-toggle]')) { state.open = !state.open; render(); return; }
    const review = event.target.closest('[data-gac-scout-review]');
    if (review) void reviewSuggestion(review);
  });
  const tick = () => {
    if (location.hash && location.hash !== '#gac') return;
    const snapshot = boardSnapshot();
    const key = `${opponentCode(snapshot)}|${currentFormat(snapshot)}`;
    if (state.loadedKey && key !== state.loadedKey) {
      state.loadedKey = '';
      state.report = null;
      state.open = false;
      state.error = '';
    }
    render();
  };
  tick();
  document.addEventListener('DOMContentLoaded', tick, { once: true });
  window.addEventListener('hashchange', tick);
  window.addEventListener('gac-visible-board-rendered', tick);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installScoutingHistory();

export { eligiblePredictions, reviewTarget, installScoutingHistory, loadScouting };
