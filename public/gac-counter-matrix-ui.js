import { boardSnapshot } from './gac-manual-board-workspace.js';
import { buildCounterMatrix, normalizeId, normalizeMembers, rosterIndex } from './gac-counter-matrix-model.js';

const state = {
  mounted: false,
  loading: false,
  error: '',
  minimumBattles: 5,
  minimumRelic: 0,
  rosterOnly: true,
  exactDefenseFirst: true,
  attackerQuery: '',
  evidenceKey: '',
  evidence: null,
  ownRoster: null,
  ownRosterCode: '',
  attackPlanKey: '',
  attackPlan: null,
  ownDefenseKey: '',
  ownDefense: null,
  selected: null,
  renderSignature: '',
  timer: null,
};

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const number = new Intl.NumberFormat('en-US');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;

function allyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? code : '';
}
function ownerCode() {
  return allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode || window.__swgohPlayerRosterSnapshot?.allyCode);
}
function opponentCode() {
  return allyCode(
    document.querySelector('[data-gac-manual-opponent]')?.value ||
    document.querySelector('[data-gacv2-opponent]')?.value ||
    document.getElementById('gacOpponentCode')?.value
  );
}
function currentRound() {
  const value = Number(document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}
function currentFormat(snapshot = {}) {
  const raw = clean(snapshot?.rule?.format || document.querySelector('[data-gac-manual-format]')?.value || document.querySelector('[data-gac-board-format]')?.value || '5v5').toLowerCase();
  return raw === '3v3' || raw === '3' ? '3v3' : '5v5';
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: options.cache || 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function activeDefenses(snapshot = {}) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : [])
    .filter((row) => clean(row?.zone).toUpperCase() !== 'BACK-TOP')
    .filter((row) => normalizeId(row?.leaderBaseId || row?.members?.[0]));
}

async function ensureOwnRoster() {
  const code = ownerCode();
  if (!code) return null;
  if (state.ownRoster && state.ownRosterCode === code) return state.ownRoster;
  state.ownRoster = await fetchJson(`/api/player/${code}`).catch(() => null);
  state.ownRosterCode = code;
  return state.ownRoster;
}

async function ensureEvidence(defenses, format, force = false) {
  const leaders = [...new Set(defenses.map((row) => normalizeId(row?.leaderBaseId || row?.members?.[0])).filter(Boolean))].sort();
  const key = `${format}|${leaders.join(',')}`;
  if (!leaders.length) {
    state.evidenceKey = key;
    state.evidence = { results: [] };
    return state.evidence;
  }
  if (!force && state.evidence && state.evidenceKey === key) return state.evidence;
  state.evidence = await fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(format)}&leaders=${encodeURIComponent(leaders.join(','))}&limit=100`);
  state.evidenceKey = key;
  return state.evidence;
}

async function ensureRoundContext(force = false) {
  const mine = ownerCode();
  const round = currentRound();
  if (!mine || !round) {
    state.attackPlan = null;
    state.ownDefense = null;
    return;
  }
  const planKey = `${mine}|${round}`;
  const defenseKey = `${mine}|${round}`;
  if (force || state.attackPlanKey !== planKey) {
    state.attackPlan = await fetchJson(`/api/gac/attack-plan/${mine}?round=${round}`).catch(() => null);
    state.attackPlanKey = planKey;
  }
  if (force || state.ownDefenseKey !== defenseKey) {
    state.ownDefense = await fetchJson(`/api/gac/current-board/${mine}/my-defense?round=${round}`).catch(() => null);
    state.ownDefenseKey = defenseKey;
  }
}

function consumedAndReservedIds() {
  const ids = new Set();
  for (const row of Array.isArray(state.ownDefense?.defenses) ? state.ownDefense.defenses : []) {
    for (const id of normalizeMembers(row?.members)) ids.add(id);
  }
  for (const assignment of Array.isArray(state.attackPlan?.assignments) ? state.attackPlan.assignments : []) {
    const status = clean(assignment?.status).toLowerCase();
    if (['planned', 'attempted'].includes(status)) {
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

function combinedUnitIndex(snapshot = {}, ownRoster = {}) {
  const index = rosterIndex(ownRoster || {});
  const addRows = (rows) => {
    for (const unit of Array.isArray(rows) ? rows : []) {
      const id = normalizeId(unit);
      if (id && !index.has(id)) index.set(id, unit);
    }
  };
  addRows(snapshot?.opponentRoster?.units);
  addRows(snapshot?.catalog?.units);
  return index;
}

function unitName(index, id) {
  const key = normalizeId(id);
  return clean(index.get(key)?.name || key || 'Unknown');
}
function unitImage(index, id) {
  const unit = index.get(normalizeId(id)) || {};
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function unitPortrait(index, id, className = '') {
  const name = unitName(index, id);
  const image = unitImage(index, id);
  return `<span class="gac-matrix-unit ${escapeAttr(className)}" title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function zoneLabel(zone) {
  return ({ 'FRONT-TOP':'Front Top', 'FRONT-BOTTOM':'Front Bottom', 'BACK-BOTTOM':'Rear Bottom', 'BACK-TOP':'Fleet' })[clean(zone).toUpperCase()] || clean(zone) || 'Board';
}
function percent(value) { return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`; }
function banners(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(/\.0$/, '') : '—'; }

function filterColumns(matrix, index) {
  const needle = clean(state.attackerQuery).toLowerCase();
  if (!needle) return matrix.columns;
  return matrix.columns.filter((column) => unitName(index, column.leaderBaseId).toLowerCase().includes(needle) || column.leaderBaseId.toLowerCase().includes(needle));
}

function matrixMarkup(matrix, index) {
  const columns = filterColumns(matrix, index);
  if (!matrix.rows.length) {
    return `<div class="gac-matrix-empty"><strong>Enter visible enemy defenses to build the matrix.</strong><span>Counter evidence is only evaluated against the board you actually entered.</span></div>`;
  }
  if (!columns.length) {
    return `<div class="gac-matrix-empty"><strong>No attacker leaders match this filter.</strong><span>Clear the attacker search or relax roster/relic/sample filters.</span></div>`;
  }
  return `<div class="gac-counter-matrix-scroll"><table class="gac-counter-matrix-table"><thead><tr><th class="gac-matrix-corner"><span>ENEMY DEFENSE</span><small>${matrix.rows.length} current squads</small></th>${columns.map((column) => `<th>${unitPortrait(index, column.leaderBaseId, 'is-column')}<span>${escapeHtml(unitName(index, column.leaderBaseId))}</span><small>${number.format(column.battles)} samples</small></th>`).join('')}</tr></thead><tbody>${matrix.rows.map((row) => `<tr><th>${unitPortrait(index, row.leaderBaseId, 'is-row')}<div><span>${escapeHtml(unitName(index, row.leaderBaseId))}</span><small>${escapeHtml(zoneLabel(row.zone))} · Slot ${row.slot + 1}</small><i class="${row.scope === 'exact-defense' ? 'is-exact' : 'is-aggregate'}">${row.scope === 'exact-defense' ? 'EXACT SQUAD' : 'LEADER AGGREGATE'}</i></div></th>${columns.map((column) => {
    const cell = row.cells.get(column.leaderBaseId);
    const hasData = cell && cell.variants.length;
    return `<td><button type="button" class="gac-matrix-cell is-${escapeAttr(cell?.evidenceClass || 'insufficient')}" ${hasData ? `data-gac-matrix-cell="${escapeAttr(row.key)}|${escapeAttr(column.leaderBaseId)}"` : 'disabled'} title="${hasData ? escapeAttr(`${percent(cell.winRate)} win rate · ${cell.battles} battles · ${banners(cell.averageBanners)} avg banners`) : 'No matching evidence'}"><b>${hasData ? percent(cell.winRate) : '—'}</b><span>${hasData ? number.format(cell.battles) : '0'}</span><small>${hasData && Number.isFinite(Number(cell.averageBanners)) ? `B ${banners(cell.averageBanners)}` : ''}</small></button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function summaryMarkup(matrix) {
  const coverage = matrix.totalRows ? Math.round((matrix.coveredRows / matrix.totalRows) * 100) : 0;
  return `<div class="gac-matrix-summary"><article><b>${matrix.coveredRows}/${matrix.totalRows}</b><span>DEFENSES WITH EVIDENCE</span></article><article><b>${coverage}%</b><span>CURRENT BOARD COVERAGE</span></article><article><b>${matrix.projectedBanners == null ? '—' : banners(matrix.projectedBanners)}</b><span>BEST-EVIDENCE BANNERS*</span></article><small>*Sum of best observed eligible cell averages only when every entered squad has qualifying evidence. It is not a guaranteed score.</small></div>`;
}

function filtersMarkup() {
  return `<div class="gac-matrix-filters"><label><span>Minimum battles</span><input type="number" min="1" max="1000" step="1" value="${state.minimumBattles}" data-gac-matrix-min-battles></label><label><span>Minimum relic</span><select data-gac-matrix-min-relic>${[0,3,5,6,7,8,9].map((value) => `<option value="${value}" ${state.minimumRelic === value ? 'selected' : ''}>${value ? `R${value}+` : 'Any relic'}</option>`).join('')}</select></label><label class="is-toggle"><input type="checkbox" data-gac-matrix-roster-only ${state.rosterOnly ? 'checked' : ''}><span>Only counters I can field now</span></label><label class="is-toggle"><input type="checkbox" data-gac-matrix-exact ${state.exactDefenseFirst ? 'checked' : ''}><span>Prefer exact defense variants</span></label><label class="is-search"><span>Attacker leader</span><input data-gac-matrix-search placeholder="Search leader…" value="${escapeAttr(state.attackerQuery)}"></label><button type="button" data-gac-matrix-refresh>REFRESH EVIDENCE</button></div>`;
}

function variantMarkup(selected, index) {
  if (!selected) return '';
  const { row, columnLeader, cell } = selected;
  return `<aside class="gac-matrix-detail" data-gac-matrix-detail><header><div><span>EXACT VARIANT EVIDENCE</span><strong>${escapeHtml(unitName(index, row.leaderBaseId))} vs ${escapeHtml(unitName(index, columnLeader))}</strong><small>${escapeHtml(zoneLabel(row.zone))} · Slot ${row.slot + 1} · ${row.scope === 'exact-defense' ? 'exact current defense samples' : 'leader-level fallback samples'}</small></div><button type="button" data-gac-matrix-close>×</button></header><div class="gac-matrix-detail-def"><span>ENTERED DEFENSE</span><div>${row.members.map((id) => unitPortrait(index, id, normalizeId(id) === row.leaderBaseId ? 'is-leader' : '')).join('')}</div></div><div class="gac-matrix-variants">${cell.variants.map((variant, variantIndex) => `<article><header><div><b>${percent(variant.winRate)}</b><span>${number.format(variant.wins)}/${number.format(variant.battles)} wins</span></div><div><b>${banners(variant.averageBanners)}</b><span>avg banners</span></div><i>${Math.round(variant.confidence * 100)}% confidence</i></header><div class="gac-matrix-variant-teams"><section><span>DEFENSE VARIANT</span><div>${variant.enemyMembers.map((id) => unitPortrait(index, id, normalizeId(id) === variant.enemyLeaderBaseId ? 'is-leader' : '')).join('')}</div></section><b>VS</b><section><span>COUNTER VARIANT</span><div>${variant.counterMembers.map((id) => unitPortrait(index, id, normalizeId(id) === variant.counterLeaderBaseId ? 'is-leader' : '')).join('')}</div></section></div><footer><span>${variant.availability.available ? '✓ Available in your remaining roster' : `Blocked: ${escapeHtml(variant.availability.reason.replaceAll('-', ' '))}`}</span><small>${escapeHtml((variant.evidenceSources.length ? variant.evidenceSources : [variant.source]).filter(Boolean).join(' + ') || 'historical evidence')}</small></footer></article>`).join('')}</div><footer><small>Observed historical evidence only. Win percentages are not a prediction or guarantee for the current battle.</small></footer></aside>`;
}

function sectionHost() {
  return document.querySelector('.gac-manual-enemy-board') || document.querySelector('[data-gac-full-battlefield]')?.closest?.('section') || null;
}

function ensureRoot() {
  let root = document.querySelector('[data-gac-counter-matrix]');
  const host = sectionHost();
  if (!host) return null;
  if (!root) {
    root = document.createElement('section');
    root.className = 'gac-counter-matrix';
    root.dataset.gacCounterMatrix = 'true';
    host.insertAdjacentElement('afterend', root);
  }
  return root;
}

function contextSignature(snapshot = {}) {
  const defenses = activeDefenses(snapshot);
  return JSON.stringify({
    owner: ownerCode(),
    opponent: opponentCode(),
    round: currentRound(),
    format: currentFormat(snapshot),
    defenses: defenses.map((row) => ({ zone: row.zone, slot: row.slot, leader: normalizeId(row.leaderBaseId || row.members?.[0]), members: normalizeMembers(row.members) })),
    reservedDom: [...document.querySelectorAll('[data-gac-manual-own-toggle][data-gac-defense-state="assigned"],[data-gac-manual-own-toggle][data-gac-defense-state="reserved"]')].map((node) => normalizeId(node.getAttribute('data-gac-manual-own-toggle'))).filter(Boolean).sort(),
    filters: [state.minimumBattles, state.minimumRelic, state.rosterOnly, state.exactDefenseFirst, state.attackerQuery],
  });
}

async function refresh(options = {}) {
  const root = ensureRoot();
  if (!root || state.loading) return;
  const snapshot = boardSnapshot();
  const defenses = activeDefenses(snapshot);
  const format = currentFormat(snapshot);
  const signatureBefore = contextSignature(snapshot);
  if (!options.force && state.renderSignature === signatureBefore && !state.selected) return;
  state.loading = true;
  state.error = '';
  root.classList.add('is-loading');
  try {
    const ownRoster = await ensureOwnRoster();
    await ensureRoundContext(options.force === true);
    const evidence = await ensureEvidence(defenses, format, options.forceEvidence === true);
    const unavailable = consumedAndReservedIds();
    const matrix = buildCounterMatrix({
      defenses,
      batch: evidence,
      ownRoster: ownRoster || {},
      unavailableBaseIds: unavailable,
      minimumBattles: state.minimumBattles,
      minimumRelic: state.minimumRelic,
      rosterOnly: state.rosterOnly,
      exactDefenseFirst: state.exactDefenseFirst,
      maxColumns: 14,
    });
    const index = combinedUnitIndex(snapshot, ownRoster || {});
    const query = clean(state.attackerQuery).toLowerCase();
    const selection = state.selected && matrix.rows.find((row) => row.key === state.selected.rowKey);
    const selectedCell = selection?.cells?.get(state.selected.columnLeader) || null;
    const selected = selection && selectedCell?.variants?.length ? { row: selection, columnLeader: state.selected.columnLeader, cell: selectedCell } : null;
    const html = `<header class="gac-matrix-head"><div><span>COUNTER INTELLIGENCE MATRIX</span><strong>Only counters your remaining roster can actually field</strong><small>Current entered defenses × sourced historical offense evidence. Click any colored cell for exact team variants.</small></div><div class="gac-matrix-legend"><i class="is-elite">90%+</i><i class="is-strong">75–89%</i><i class="is-mixed">55–74%</i><i class="is-poor">&lt;55%</i></div></header>${filtersMarkup()}${summaryMarkup(matrix)}${state.error ? `<div class="gac-matrix-error">${escapeHtml(state.error)}</div>` : ''}${matrixMarkup(matrix, index)}${variantMarkup(selected, index)}`;
    if (root.innerHTML !== html) root.innerHTML = html;
    state.renderSignature = contextSignature(boardSnapshot());
  } catch (error) {
    state.error = clean(error?.message || error || 'Counter evidence unavailable.');
    root.innerHTML = `<header class="gac-matrix-head"><div><span>COUNTER INTELLIGENCE MATRIX</span><strong>Counter evidence temporarily unavailable</strong></div></header><div class="gac-matrix-error">${escapeHtml(state.error)}</div>`;
    state.renderSignature = '';
  } finally {
    state.loading = false;
    root.classList.remove('is-loading');
  }
}

function updateFilter(target) {
  if (target.matches('[data-gac-matrix-min-battles]')) state.minimumBattles = Math.max(1, Math.min(1000, Math.floor(n(target.value) || 5)));
  else if (target.matches('[data-gac-matrix-min-relic]')) state.minimumRelic = Math.max(0, Math.min(9, Math.floor(n(target.value))));
  else if (target.matches('[data-gac-matrix-roster-only]')) state.rosterOnly = target.checked === true;
  else if (target.matches('[data-gac-matrix-exact]')) state.exactDefenseFirst = target.checked === true;
  else if (target.matches('[data-gac-matrix-search]')) state.attackerQuery = target.value;
  else return false;
  state.selected = null;
  state.renderSignature = '';
  return true;
}

function installEvents() {
  document.addEventListener('input', (event) => {
    if (!event.target?.closest?.('[data-gac-counter-matrix]')) return;
    if (updateFilter(event.target)) refresh();
  });
  document.addEventListener('change', (event) => {
    if (!event.target?.closest?.('[data-gac-counter-matrix]')) return;
    if (updateFilter(event.target)) refresh();
  });
  document.addEventListener('click', (event) => {
    const root = event.target?.closest?.('[data-gac-counter-matrix]');
    if (!root) return;
    const refreshButton = event.target.closest('[data-gac-matrix-refresh]');
    if (refreshButton) {
      state.renderSignature = '';
      refresh({ force: true, forceEvidence: true });
      return;
    }
    if (event.target.closest('[data-gac-matrix-close]')) {
      state.selected = null;
      state.renderSignature = '';
      refresh();
      return;
    }
    const cell = event.target.closest('[data-gac-matrix-cell]');
    if (cell) {
      const raw = clean(cell.dataset.gacMatrixCell);
      const parts = raw.split('|');
      const columnLeader = normalizeId(parts.pop());
      const rowKey = parts.join('|');
      state.selected = { rowKey, columnLeader };
      state.renderSignature = '';
      refresh();
    }
  });
}

function installCounterMatrix() {
  if (window.__gacCounterMatrixInstalled) return;
  window.__gacCounterMatrixInstalled = true;
  installEvents();
  const tick = () => {
    if (location.hash && location.hash !== '#gac') return;
    refresh().catch(() => {});
  };
  tick();
  document.addEventListener('DOMContentLoaded', tick, { once: true });
  window.addEventListener('hashchange', tick);
  state.timer = window.setInterval(tick, 2200);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installCounterMatrix();

export { consumedAndReservedIds, installCounterMatrix, refresh };
