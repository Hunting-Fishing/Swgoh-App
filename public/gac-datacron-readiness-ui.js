import { boardSnapshot } from './gac-manual-board-workspace.js';
import { buildCounterMatrix, normalizeId, normalizeMembers, rosterIndex } from './gac-counter-matrix-model.js';
import { bestCoverage, datacronLabel, loadEligibilityContext } from './gac-datacron-eligibility.js';
import { datacronEvidenceSignature } from './gac-datacron-evidence-signature.js';

const state = { loading: false, analyzedKey: '', rows: [], error: '', open: false };
const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;
const number = new Intl.NumberFormat('en-US');

function allyCode(value) { const code = clean(value).replace(/\D/g, '').slice(0, 9); return /^\d{9}$/.test(code) ? code : ''; }
function ownerCode(snapshot = {}) { return allyCode(snapshot?.ownerCode || document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode); }
function currentRound(snapshot = {}) { const value = Number(snapshot?.round || document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value); return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null; }
function currentFormat(snapshot = {}) { const raw = clean(snapshot?.format || snapshot?.rule?.format || '5v5').toLowerCase(); return raw === '3v3' || raw === '3' ? '3v3' : '5v5'; }

async function fetchJson(pathname) {
  const response = await fetch(pathname, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body?.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
  return body;
}

function activeDefenses(snapshot = {}) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : []).filter((row) => clean(row?.zone).toUpperCase() !== 'BACK-TOP' && normalizeId(row?.leaderBaseId || row?.members?.[0]));
}

function roundUnavailable(snapshot, ownDefense, attackPlan) {
  const ids = new Set(normalizeMembers(snapshot?.reservedBaseIds));
  for (const row of Array.isArray(ownDefense?.defenses) ? ownDefense.defenses : []) for (const id of normalizeMembers(row?.members)) ids.add(id);
  for (const assignment of Array.isArray(attackPlan?.assignments) ? attackPlan.assignments : []) {
    if (['planned','attempted'].includes(clean(assignment?.status).toLowerCase())) for (const id of normalizeMembers(assignment?.members || assignment?.attackerMembers)) ids.add(id);
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) for (const id of normalizeMembers(attempt?.members)) ids.add(id);
  }
  document.querySelectorAll('[data-gac-manual-own-toggle][data-gac-defense-state="assigned"],[data-gac-manual-own-toggle][data-gac-defense-state="reserved"]').forEach((node) => {
    const id = normalizeId(node.getAttribute('data-gac-manual-own-toggle')); if (id) ids.add(id);
  });
  return [...ids];
}

function resolveDefenseDatacron(defense = {}, snapshot = {}) {
  const stateName = clean(defense?.datacronState).toLowerCase();
  if (stateName === 'none') return Object.freeze({ state: 'none', datacron: null, source: 'confirmed-none' });
  if (stateName !== 'assigned') return Object.freeze({ state: 'unknown', datacron: null, source: 'not-confirmed' });
  const savedId = clean(defense?.datacron?.id || defense?.datacronId);
  const current = (Array.isArray(snapshot?.opponentRoster?.datacrons) ? snapshot.opponentRoster.datacrons : []).find((row) => clean(row?.id) === savedId) || null;
  return Object.freeze({ state: 'assigned', datacron: current || defense?.datacron || null, source: current ? 'current-opponent-inventory' : 'saved-snapshot' });
}

function unitIndex(snapshot = {}, ownRoster = {}) {
  const index = rosterIndex(ownRoster);
  const add = (rows) => { for (const unit of Array.isArray(rows) ? rows : []) { const id = normalizeId(unit); if (id && !index.has(id)) index.set(id, unit); } };
  add(snapshot?.opponentRoster?.units); add(snapshot?.catalog?.units); return index;
}
function unitName(index, id) { return clean(index.get(normalizeId(id))?.name || normalizeId(id) || 'Unknown'); }
function unitImage(index, id) { const unit = index.get(normalizeId(id)) || {}; return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon); }
function portrait(index, id, leader = false) { const name = unitName(index, id); const image = unitImage(index, id); return `<span class="gac-dc-unit ${leader ? 'is-leader' : ''}" title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`; }
function zoneLabel(zone) { return ({'FRONT-TOP':'Front Top','FRONT-BOTTOM':'Front Bottom','BACK-BOTTOM':'Rear Bottom'})[clean(zone).toUpperCase()] || clean(zone); }

async function analyze() {
  if (state.loading) return;
  const snapshot = boardSnapshot();
  const mine = ownerCode(snapshot);
  const defenses = activeDefenses(snapshot);
  if (!mine || !defenses.length) { state.error = !mine ? 'Load your roster before Datacron analysis.' : 'Enter enemy squad defenses first.'; state.open = true; render(); return; }
  state.loading = true; state.error = ''; state.open = true; render();
  try {
    const format = currentFormat(snapshot);
    const round = currentRound(snapshot);
    const leaders = [...new Set(defenses.map((row) => normalizeId(row?.leaderBaseId || row?.members?.[0])).filter(Boolean))];
    const [ownRoster, evidence, ownDefense, attackPlan, eligibility] = await Promise.all([
      snapshot?.ownerRoster?.player ? Promise.resolve(snapshot.ownerRoster) : fetchJson(`/api/player/${mine}`),
      fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(format)}&leaders=${encodeURIComponent(leaders.join(','))}&limit=100`),
      round ? fetchJson(`/api/gac/current-board/${mine}/my-defense?round=${round}`).catch(() => null) : Promise.resolve(null),
      round ? fetchJson(`/api/gac/attack-plan/${mine}?round=${round}`).catch(() => null) : Promise.resolve(null),
      loadEligibilityContext(),
    ]);
    const unavailable = roundUnavailable(snapshot, ownDefense, attackPlan);
    const matrix = buildCounterMatrix({ defenses, batch: evidence, ownRoster, unavailableBaseIds: unavailable, minimumBattles: 5, rosterOnly: true, exactDefenseFirst: true, maxColumns: 30 });
    const ownIndex = rosterIndex(ownRoster);
    const rowsByKey = new Map(matrix.rows.map((row) => [row.key, row]));
    state.rows = matrix.allocation.assignments.map((assignment) => {
      const row = rowsByKey.get(assignment.rowKey);
      const defense = defenses.find((entry) => `${clean(entry.zone).toUpperCase()}|${Number(entry.slot)}` === assignment.rowKey) || {};
      const squad = assignment.counterMembers.map((id) => ownIndex.get(id)).filter(Boolean);
      const coverage = Array.isArray(ownRoster?.datacrons) && ownRoster.datacrons.length ? bestCoverage(ownRoster.datacrons, squad, eligibility.unitIndex, eligibility.datacronCatalog) : null;
      const defenderDc = resolveDefenseDatacron(defense, snapshot);
      return Object.freeze({
        rowKey: assignment.rowKey,
        zone: row?.zone || defense?.zone,
        slot: row?.slot ?? defense?.slot,
        defenseLeaderBaseId: assignment.defenseLeaderBaseId,
        defenseMembers: Object.freeze(normalizeMembers(defense?.members || row?.members)),
        defenderDatacron: defenderDc,
        defenderSignature: datacronEvidenceSignature(defenderDc.datacron, defenderDc.state),
        counterLeaderBaseId: assignment.counterLeaderBaseId,
        counterMembers: Object.freeze(assignment.counterMembers),
        battles: assignment.battles,
        winRate: assignment.winRate,
        averageBanners: assignment.averageBanners,
        coverage,
      });
    });
    state.analyzedKey = `${mine}|${snapshot?.opponentCode || ''}|${round || 0}|${format}|${defenses.map((row)=>`${row.zone}:${row.slot}:${normalizeId(row.leaderBaseId)}`).join(';')}`;
  } catch (error) {
    state.rows = []; state.error = clean(error?.message || error || 'Datacron readiness could not be analyzed.');
  } finally { state.loading = false; render(); }
}

function dcStatus(row, eligibilityCatalog) {
  const defender = row.defenderDatacron;
  if (defender.state === 'none') return '<b class="is-none">DEFENDER DC: NONE CONFIRMED</b>';
  if (defender.state !== 'assigned') return '<b class="is-unknown">DEFENDER DC: NOT CONFIRMED</b>';
  const level = Number.isFinite(Number(defender.datacron?.level)) ? Number(defender.datacron.level) : Array.isArray(defender.datacron?.affixes) ? defender.datacron.affixes.length : null;
  return `<b class="is-assigned">DEFENDER DC: ASSIGNED${level !== null ? ` L${level}` : ''}</b>`;
}

function rowMarkup(row, index) {
  const coverage = row.coverage;
  const defenderStatus = dcStatus(row);
  const ownedDc = coverage?.datacron ? datacronLabel(coverage.datacron) : '';
  return `<article class="gac-dc-row"><header><div><span>${escapeHtml(zoneLabel(row.zone))} · Slot ${Number(row.slot) + 1}</span><strong>${escapeHtml(unitName(index, row.defenseLeaderBaseId))}</strong></div>${defenderStatus}</header><div class="gac-dc-match"><section><span>DEFENSE</span><div>${row.defenseMembers.map((id) => portrait(index, id, id === row.defenseLeaderBaseId)).join('')}</div></section><b>→</b><section><span>NON-OVERLAPPING COUNTER</span><div>${row.counterMembers.map((id) => portrait(index, id, id === row.counterLeaderBaseId)).join('')}</div></section></div><div class="gac-dc-evidence"><span><b>${Math.round(row.winRate * 100)}%</b> observed</span><span><b>${number.format(row.battles)}</b> battles</span><span><b>${Number.isFinite(Number(row.averageBanners)) ? Number(row.averageBanners).toFixed(1).replace(/\.0$/, '') : '—'}</b> avg banners</span></div><footer>${coverage?.datacron ? `<div><span>BEST OWNED DATACRON</span><strong>${escapeHtml(ownedDc)}</strong><small>${coverage.eligibleMembers}/${coverage.squadSize} squad members benefit · leader ${coverage.leaderEligible === true ? 'eligible' : coverage.leaderEligible === false ? 'not eligible' : 'unknown'}</small></div><i class="${coverage.coverage >= 1 ? 'is-full' : coverage.coverage >= 0.6 ? 'is-partial' : 'is-low'}">${Math.round((coverage.coverage || 0) * 100)}% COVERAGE</i>` : '<div><span>BEST OWNED DATACRON</span><strong>No proven compatible ability Datacron</strong><small>Stat-only or unresolved Datacrons are not presented as proven ability coverage.</small></div>'}</footer></article>`;
}

function ensureRoot() {
  const matrix = document.querySelector('[data-gac-counter-matrix]');
  const host = matrix || document.querySelector('.gac-manual-enemy-board');
  if (!host) return null;
  let root = document.querySelector('[data-gac-datacron-readiness]');
  if (!root) { root = document.createElement('section'); root.className = 'gac-dc-readiness'; root.dataset.gacDatacronReadiness = 'true'; host.insertAdjacentElement('afterend', root); }
  if (matrix && matrix.nextElementSibling !== root) matrix.insertAdjacentElement('afterend', root);
  return root;
}

function render() {
  const root = ensureRoot(); if (!root) return;
  const snapshot = boardSnapshot(); const index = unitIndex(snapshot, snapshot?.ownerRoster || {});
  root.innerHTML = `<header><div><span>DATACRON READINESS</span><strong>Current owned Datacron compatibility</strong><small>Uses your remaining non-overlapping evidence counters. Compatibility is not a historical win-rate uplift claim.</small></div><div><button type="button" data-gac-dc-toggle ${!state.analyzedKey ? 'disabled' : ''}>${state.open ? 'HIDE' : `VIEW · ${state.rows.length}`}</button><button type="button" data-gac-dc-analyze ${state.loading ? 'disabled' : ''}>${state.loading ? 'ANALYZING…' : state.analyzedKey ? 'REANALYZE' : 'ANALYZE OWNED DATACRONS'}</button></div></header>${state.error ? `<div class="gac-dc-error">${escapeHtml(state.error)}</div>` : ''}${state.open && state.analyzedKey ? `<div class="gac-dc-note"><b>${state.rows.length}</b><span>current board counters allocated without reusing attackers</span><small>Defender DC signatures are stored without player-specific instance IDs so equivalent rolls can be aggregated later.</small></div><div class="gac-dc-grid">${state.rows.length ? state.rows.map((row) => rowMarkup(row, index)).join('') : '<div class="gac-dc-empty">No complete non-overlapping evidence allocation was available for the entered board.</div>'}</div>` : ''}`;
}

function installDatacronReadiness() {
  if (window.__gacDatacronReadinessInstalled) return; window.__gacDatacronReadinessInstalled = true;
  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.('[data-gac-datacron-readiness]')) return;
    if (event.target.closest('[data-gac-dc-analyze]')) { void analyze(); return; }
    if (event.target.closest('[data-gac-dc-toggle]')) { state.open = !state.open; render(); }
  });
  const tick = () => { if (location.hash && location.hash !== '#gac') return; render(); };
  tick(); document.addEventListener('DOMContentLoaded', tick, { once: true }); window.addEventListener('hashchange', tick); window.addEventListener('gac-visible-board-rendered', tick);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installDatacronReadiness();
export { analyze, installDatacronReadiness, resolveDefenseDatacron, roundUnavailable };
