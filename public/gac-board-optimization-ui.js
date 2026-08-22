import { boardSnapshot } from './gac-manual-board-workspace.js';
import { normalizeId, normalizeMembers, rosterIndex } from './gac-counter-matrix-model.js';
import { buildBoardOptimization, priorityRows } from './gac-board-optimization-model.js';

const state = {
  loading: false,
  error: '',
  analyzedKey: '',
  optimization: null,
  unitIndex: new Map(),
  minimumBattles: 5,
  minimumRelic: 0,
  open: false,
};

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;
const number = new Intl.NumberFormat('en-US');

function allyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? code : '';
}
function ownerCode(snapshot = {}) {
  return allyCode(snapshot?.ownerCode || document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode || window.__swgohPlayerRosterSnapshot?.allyCode);
}
function currentRound(snapshot = {}) {
  const value = Number(snapshot?.round || document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}
function currentFormat(snapshot = {}) {
  const raw = clean(snapshot?.format || snapshot?.rule?.format || document.querySelector('[data-gac-manual-format]')?.value || '5v5').toLowerCase();
  return raw === '3v3' || raw === '3' ? '3v3' : '5v5';
}
function activeDefenses(snapshot = {}) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : [])
    .filter((row) => clean(row?.zone).toUpperCase() !== 'BACK-TOP')
    .filter((row) => normalizeId(row?.leaderBaseId || row?.members?.[0]));
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { cache:'no-store', credentials:'same-origin', headers:{ Accept:'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function unavailableIds(snapshot, ownDefense, attackPlan) {
  const ids = new Set(normalizeMembers(snapshot?.reservedBaseIds));
  for (const row of Array.isArray(ownDefense?.defenses) ? ownDefense.defenses : []) {
    for (const id of normalizeMembers(row?.members)) ids.add(id);
  }
  for (const assignment of Array.isArray(attackPlan?.assignments) ? attackPlan.assignments : []) {
    const status = clean(assignment?.status).toLowerCase();
    if (['planned','attempted'].includes(status)) {
      for (const id of normalizeMembers(assignment?.members || assignment?.attackerMembers)) ids.add(id);
    }
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of normalizeMembers(attempt?.members)) ids.add(id);
    }
  }
  document.querySelectorAll('[data-gac-manual-own-toggle][data-gac-defense-state="assigned"],[data-gac-manual-own-toggle][data-gac-defense-state="reserved"]').forEach((node) => {
    const id = normalizeId(node.getAttribute('data-gac-manual-own-toggle'));
    if (id) ids.add(id);
  });
  return [...ids];
}

function combinedIndex(snapshot = {}, ownRoster = {}) {
  const index = rosterIndex(ownRoster || {});
  const add = (rows) => {
    for (const unit of Array.isArray(rows) ? rows : []) {
      const id = normalizeId(unit);
      if (id && !index.has(id)) index.set(id, unit);
    }
  };
  add(snapshot?.opponentRoster?.units);
  add(snapshot?.catalog?.units);
  return index;
}
function unitName(id) {
  const key = normalizeId(id);
  return clean(state.unitIndex.get(key)?.name || key || 'Unknown');
}
function unitImage(id) {
  const unit = state.unitIndex.get(normalizeId(id)) || {};
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function portrait(id, className = '') {
  const name = unitName(id);
  const image = unitImage(id);
  return `<span class="gac-opt-unit ${escapeAttr(className)}" title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function zoneLabel(zone) {
  return ({ 'FRONT-TOP':'Front Top', 'FRONT-BOTTOM':'Front Bottom', 'BACK-BOTTOM':'Rear Bottom' })[clean(zone).toUpperCase()] || clean(zone) || 'Board';
}
function pct(value) { return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—'; }
function banners(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(/\.0$/, '') : '—'; }

async function analyze() {
  if (state.loading) return;
  const snapshot = boardSnapshot();
  const mine = ownerCode(snapshot);
  const round = currentRound(snapshot);
  const defenses = activeDefenses(snapshot);
  if (!mine) { state.error = 'Load your verified roster before board optimization.'; state.open = true; render(); return; }
  if (!defenses.length) { state.error = 'Enter the visible enemy squad defenses before optimizing the round.'; state.open = true; render(); return; }
  state.loading = true;
  state.error = '';
  state.open = true;
  render();
  try {
    const format = currentFormat(snapshot);
    const leaders = [...new Set(defenses.map((row) => normalizeId(row?.leaderBaseId || row?.members?.[0])).filter(Boolean))];
    const [ownRoster, batch, ownDefense, attackPlan] = await Promise.all([
      snapshot?.ownerRoster?.units?.length ? Promise.resolve(snapshot.ownerRoster) : fetchJson(`/api/player/${mine}`),
      fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(format)}&leaders=${encodeURIComponent(leaders.join(','))}&limit=100`),
      round ? fetchJson(`/api/gac/current-board/${mine}/my-defense?round=${round}`).catch(() => null) : Promise.resolve(null),
      round ? fetchJson(`/api/gac/attack-plan/${mine}?round=${round}`).catch(() => ({ assignments:[] })) : Promise.resolve({ assignments:[] }),
    ]);
    state.unitIndex = combinedIndex(snapshot, ownRoster);
    state.optimization = buildBoardOptimization({
      defenses,
      batch,
      ownRoster,
      unavailableBaseIds: unavailableIds(snapshot, ownDefense, attackPlan),
      attackPlan,
      minimumBattles: state.minimumBattles,
      minimumRelic: state.minimumRelic,
      exactDefenseFirst: true,
    });
    state.analyzedKey = `${mine}|${snapshot?.opponentCode || ''}|${round || 0}|${format}|${defenses.map((row)=>`${row.zone}:${row.slot}:${normalizeId(row.leaderBaseId)}`).join(';')}|${state.minimumBattles}|${state.minimumRelic}`;
  } catch (error) {
    state.optimization = null;
    state.error = clean(error?.message || error || 'Whole-board optimization failed.');
  } finally {
    state.loading = false;
    render();
  }
}

function summaryMarkup(opt) {
  const plan = opt.plan || {};
  const s = opt.scarcity || {};
  return `<div class="gac-opt-summary">
    <article><b>${opt.coveredDefenses}/${opt.totalDefenses}</b><span>BOARD COVERAGE</span><small>${pct(opt.coverageRate)} non-overlap allocation</small></article>
    <article><b>${banners(opt.projectedBanners)}</b><span>PROJECTED BANNERS*</span><small>${opt.projectedBanners == null ? 'Incomplete evidence allocation' : `${opt.projectedUniqueAttackers} unique attackers`}</small></article>
    <article><b>${pct(opt.projectedBattleWeightedWinRate)}</b><span>EVIDENCE-WEIGHTED WIN</span><small>${opt.exactEvidenceRows}/${opt.totalDefenses} exact squad rows</small></article>
    <article class="${s.uncovered ? 'is-alert' : s.critical ? 'is-warn' : ''}"><b>${s.uncovered || 0}/${s.critical || 0}</b><span>UNCOVERED / ONE-COUNTER</span><small>${s.scarce || 0} more scarce rows</small></article>
    <article><b>${plan.statuses?.planned || 0}</b><span>LOCKED PLANS</span><small>${plan.statuses?.attempted || 0} attempted · ${plan.statuses?.win || 0} wins</small></article>
    <article><b>${plan.recordedBannerSamples ? number.format(plan.recordedBanners) : '—'}</b><span>RECORDED BANNERS</span><small>${plan.recordedBannerSamples || 0} recorded results</small></article>
  </div>`;
}

function rowMarkup(row) {
  const proposed = row.proposedCounter;
  const existing = row.existingPlan;
  return `<article class="gac-opt-priority is-${escapeAttr(row.scarcity)}">
    <header><div>${portrait(row.leaderBaseId, 'is-defense')}<span><b>${escapeHtml(unitName(row.leaderBaseId))}</b><small>${escapeHtml(zoneLabel(row.zone))} · Slot ${Number(row.slot) + 1}</small></span></div><i>${escapeHtml(row.scarcity.toUpperCase())}</i></header>
    <div class="gac-opt-metrics"><span><b>${row.counterSquads}</b> qualifying counters</span><span><b>${row.bestWinRate == null ? '—' : pct(row.bestWinRate)}</b> best observed</span><span><b>${row.bestBattles || 0}</b> best sample</span></div>
    <footer>${existing ? `<div><span>SERVER PLAN</span><strong>${escapeHtml(unitName(existing.leaderBaseId))}</strong><small>${escapeHtml(existing.status.toUpperCase())}${existing.datacronId ? ' · Datacron locked' : ''}</small></div>` : proposed ? `<div><span>PROPOSED NON-OVERLAP COUNTER</span><strong>${escapeHtml(unitName(proposed.counterLeaderBaseId))}</strong><small>${pct(proposed.winRate)} · ${number.format(proposed.battles)} battles · B ${banners(proposed.averageBanners)}</small></div>` : '<div><span>PROPOSED COUNTER</span><strong>No qualifying unique counter</strong><small>Relax filters, confirm roster state, or inspect the matrix.</small></div>'}<button type="button" data-gac-opt-open-matrix>VIEW MATRIX</button></footer>
  </article>`;
}

function ensureRoot() {
  const matrix = document.querySelector('[data-gac-counter-matrix]');
  const host = matrix || document.querySelector('.gac-manual-enemy-board');
  if (!host) return null;
  let root = document.querySelector('[data-gac-board-optimization]');
  if (!root) {
    root = document.createElement('section');
    root.className = 'gac-board-optimization';
    root.dataset.gacBoardOptimization = 'true';
    host.insertAdjacentElement('afterend', root);
  }
  if (matrix && matrix.nextElementSibling !== root) matrix.insertAdjacentElement('afterend', root);
  return root;
}

function render() {
  const root = ensureRoot();
  if (!root) return;
  const opt = state.optimization;
  const rows = opt ? priorityRows(opt).slice(0, 10) : [];
  root.innerHTML = `<header><div><span>WHOLE-BOARD OPTIMIZER</span><strong>Coverage, scarcity and banner plan</strong><small>On-demand analysis only. Uses the visible board, your remaining roster and persisted counter evidence; it does not predict hidden defenses.</small></div><div>${state.analyzedKey ? `<button type="button" data-gac-opt-toggle>${state.open ? 'HIDE' : 'VIEW RESULTS'}</button>` : ''}<button type="button" data-gac-opt-analyze ${state.loading ? 'disabled' : ''}>${state.loading ? 'ANALYZING…' : state.analyzedKey ? 'REANALYZE BOARD' : 'ANALYZE BOARD'}</button></div></header>
    <div class="gac-opt-controls"><label><span>Minimum battles</span><input type="number" min="1" max="1000" value="${state.minimumBattles}" data-gac-opt-min-battles></label><label><span>Minimum relic</span><select data-gac-opt-min-relic>${[0,3,5,6,7,8,9].map((value)=>`<option value="${value}" ${state.minimumRelic===value?'selected':''}>${value ? `R${value}+` : 'Any relic'}</option>`).join('')}</select></label><small>Scarcity is based on distinct currently-fieldable counter squads meeting these thresholds.</small></div>
    ${state.error ? `<div class="gac-opt-error">${escapeHtml(state.error)}</div>` : ''}
    ${state.open && opt ? `${summaryMarkup(opt)}<div class="gac-opt-note">* Projected banners are evidence summaries, not guaranteed scores. Current server Attack Plan remains authoritative for locked squads, attempts and consumed units.</div><div class="gac-opt-priority-grid">${rows.map(rowMarkup).join('')}</div>` : ''}`;
}

function installBoardOptimization() {
  if (window.__gacBoardOptimizationInstalled) return;
  window.__gacBoardOptimizationInstalled = true;
  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.('[data-gac-board-optimization]')) return;
    if (event.target.closest('[data-gac-opt-analyze]')) { void analyze(); return; }
    if (event.target.closest('[data-gac-opt-toggle]')) { state.open = !state.open; render(); return; }
    if (event.target.closest('[data-gac-opt-open-matrix]')) {
      const matrix = document.querySelector('[data-gac-counter-matrix]');
      matrix?.scrollIntoView?.({ behavior:'smooth', block:'start' });
    }
  });
  document.addEventListener('change', (event) => {
    if (!event.target?.closest?.('[data-gac-board-optimization]')) return;
    if (event.target.matches('[data-gac-opt-min-battles]')) state.minimumBattles = Math.max(1, Math.min(1000, Math.floor(n(event.target.value) || 5)));
    if (event.target.matches('[data-gac-opt-min-relic]')) state.minimumRelic = Math.max(0, Math.floor(n(event.target.value)));
  });
  const tick = () => { if (location.hash && location.hash !== '#gac') return; render(); };
  tick();
  document.addEventListener('DOMContentLoaded', tick, { once:true });
  window.addEventListener('hashchange', tick);
  window.addEventListener('gac-visible-board-rendered', tick);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installBoardOptimization();
export { analyze, installBoardOptimization, unavailableIds };
