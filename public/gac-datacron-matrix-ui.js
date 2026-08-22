import { boardSnapshot } from './gac-manual-board-workspace.js';
import { datacronEvidenceSignature } from './gac-datacron-evidence-signature.js';
import { summarizeDatacronWarehouseMaturity } from './gac-datacron-evidence-maturity.js';
import { normalizeId, normalizeMembers, rosterIndex, teamSignature } from './gac-counter-matrix-model.js';

const state = { loading:false, open:false, minBattles:3, key:'', data:null, error:'', selected:'' };
const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;
const pct = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';

function currentFormat(snapshot = {}) {
  const raw = clean(snapshot?.rule?.format || snapshot?.format || '5v5').toLowerCase();
  return raw === '3v3' || raw === '3' ? '3v3' : '5v5';
}
function activeDefenses(snapshot = {}) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : [])
    .filter((row) => clean(row?.zone).toUpperCase() !== 'BACK-TOP')
    .filter((row) => normalizeId(row?.leaderBaseId || row?.members?.[0]));
}
function unitIndex(snapshot = {}) {
  const index = rosterIndex(snapshot?.ownerRoster || {});
  for (const roster of [snapshot?.opponentRoster, snapshot?.catalog]) {
    for (const unit of Array.isArray(roster?.units) ? roster.units : []) {
      const baseId = normalizeId(unit);
      if (baseId && !index.has(baseId)) index.set(baseId, unit);
    }
  }
  return index;
}
function unitName(index, baseId) { return clean(index.get(normalizeId(baseId))?.name || normalizeId(baseId) || 'Unknown'); }
function dcState(defense = {}) {
  const explicit = clean(defense?.datacronState).toLowerCase();
  const dc = defense?.datacron || null;
  if (explicit === 'none') return { state:'none', datacron:null };
  if (explicit === 'assigned' || dc?.id || dc?.setId || Array.isArray(dc?.affixes)) return { state:'assigned', datacron:dc };
  return { state:'unknown', datacron:null };
}
function currentOwnedDcSignatures(snapshot = {}) {
  const values = Array.isArray(snapshot?.ownerRoster?.datacrons) ? snapshot.ownerRoster.datacrons : [];
  return new Set(values.map((dc) => datacronEvidenceSignature(dc, 'assigned')).filter(Boolean));
}
function ownsCounter(snapshot, members = []) {
  const own = rosterIndex(snapshot?.ownerRoster || {});
  return normalizeMembers(members).every((baseId) => own.has(baseId));
}
function exactTeamMatch(defense, observation) {
  return teamSignature(defense?.leaderBaseId || defense?.members?.[0], defense?.members) === teamSignature(observation?.enemyLeaderBaseId, observation?.enemyMembers);
}
function rowsForDefense(snapshot, defense, batch = {}) {
  const leader = normalizeId(defense?.leaderBaseId || defense?.members?.[0]);
  const currentDc = dcState(defense);
  const signature = datacronEvidenceSignature(currentDc.datacron, currentDc.state);
  if (currentDc.state === 'unknown') return { signature, state:'unknown', rows:[] };
  const result = (Array.isArray(batch?.results) ? batch.results : []).find((row) => normalizeId(row?.enemyLeaderBaseId) === leader);
  const ownedDc = currentOwnedDcSignatures(snapshot);
  const rows = (Array.isArray(result?.observations) ? result.observations : [])
    .filter((row) => exactTeamMatch(defense,row))
    .filter((row) => clean(row?.defenderDatacronSignature) === signature)
    .filter((row) => n(row?.battles) >= state.minBattles)
    .map((row) => ({ ...row, counterOwned:ownsCounter(snapshot,row?.counterMembers), attackerDcOwned:ownedDc.has(clean(row?.attackerDatacronSignature)) }))
    .sort((a,b) => n(b.battles)-n(a.battles) || n(b.winRate)-n(a.winRate));
  return { signature, state:currentDc.state, rows };
}
async function fetchBatch(snapshot) {
  const defenses = activeDefenses(snapshot);
  if (!defenses.length) return { results:[], warehouseReady:false, count:0 };
  const leaders = [...new Set(defenses.map((row) => normalizeId(row?.leaderBaseId || row?.members?.[0])).filter(Boolean))];
  const params = new URLSearchParams({ format:currentFormat(snapshot), leaders:leaders.join(','), limit:'100' });
  const response = await fetch(`/api/gac/counters/batch?${params.toString()}`, { credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'} });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body?.datacronEvidence || { results:[], warehouseReady:false, count:0 };
}
function color(rate, battles) {
  if (n(battles) < state.minBattles) return 'is-none';
  if (Number(rate) >= .85) return 'is-strong';
  if (Number(rate) >= .65) return 'is-playable';
  if (Number(rate) >= .45) return 'is-risky';
  return 'is-poor';
}
function dcLabel(row = {}) {
  const stateName = clean(row?.attackerDatacronState).toUpperCase();
  const dc = row?.attackerDatacron || {};
  const level = Number.isFinite(Number(dc?.level)) ? `L${Number(dc.level)}` : '';
  const set = clean(dc?.setId || dc?.templateId);
  if (stateName === 'NONE') return 'NO DC';
  if (stateName === 'UNKNOWN') return 'DC UNKNOWN';
  return [level,set].filter(Boolean).join(' · ') || 'DC ROLL';
}
function detailMarkup(snapshot, row, index) {
  if (!row) return '';
  return `<aside class="gac-dc-matrix-detail"><header><div><span>DATACRON VARIANT</span><strong>${escapeHtml(unitName(index,row.counterLeaderBaseId))}</strong><small>${escapeHtml(dcLabel(row))}</small></div><button type="button" data-gac-dcm-close>×</button></header><div class="gac-dcm-detail-stats"><b>${pct(row.winRate)}</b><span>${n(row.wins)}/${n(row.battles)} wins</span><span>${Number.isFinite(Number(row.averageBanners)) ? `${Number(row.averageBanners).toFixed(1)} avg banners` : 'banners unknown'}</span></div><div class="gac-dcm-team">${normalizeMembers(row.counterMembers).map((baseId) => `<span>${escapeHtml(unitName(index,baseId))}</span>`).join('')}</div><footer><span>${row.counterOwned ? '✓ Counter squad owned' : 'Counter squad incomplete'}</span><span>${row.attackerDcOwned ? '✓ Equivalent attacker DC owned now' : 'Equivalent attacker DC not found in current inventory'}</span><span>${n(row.seasons)} seasons · ${(row.evidenceSources || []).map(escapeHtml).join(', ') || 'verified evidence'}</span></footer></aside>`;
}
function ensureRoot() {
  const anchor = document.querySelector('[data-gac-datacron-readiness]') || document.querySelector('[data-gac-counter-matrix]') || document.querySelector('.gac-manual-enemy-board');
  if (!anchor) return null;
  let root = document.querySelector('[data-gac-datacron-matrix]');
  if (!root) {
    root = document.createElement('section');
    root.className = 'gac-dc-matrix';
    root.dataset.gacDatacronMatrix = 'true';
    anchor.insertAdjacentElement('afterend',root);
  }
  return root;
}
function render() {
  const root = ensureRoot();
  if (!root) return;
  const snapshot = boardSnapshot();
  const index = unitIndex(snapshot);
  const defenses = activeDefenses(snapshot);
  const batch = state.data || { results:[], warehouseReady:false, count:0 };
  const maturity = state.data ? summarizeDatacronWarehouseMaturity(batch) : null;
  const cards = defenses.map((defense) => {
    const current = rowsForDefense(snapshot,defense,batch);
    const leader = normalizeId(defense?.leaderBaseId || defense?.members?.[0]);
    const zone = clean(defense?.zone).replaceAll('-',' ');
    if (current.state === 'unknown') return `<article class="gac-dcm-card is-unknown"><header><span>${escapeHtml(zone)} · SLOT ${Number(defense?.slot)+1}</span><strong>${escapeHtml(unitName(index,leader))}</strong></header><p>Confirm the defender Datacron or confirm NONE before Datacron-specific evidence is shown.</p></article>`;
    return `<article class="gac-dcm-card"><header><span>${escapeHtml(zone)} · SLOT ${Number(defense?.slot)+1}</span><strong>${escapeHtml(unitName(index,leader))}</strong><small>${current.state === 'none' ? 'DEFENDER: NO DC' : 'DEFENDER: EXACT DC SIGNATURE'}</small></header><div class="gac-dcm-options">${current.rows.length ? current.rows.slice(0,8).map((row,idx) => `<button type="button" class="${color(row.winRate,row.battles)}" data-gac-dcm-row="${escapeAttr(`${leader}|${defense.slot}|${idx}`)}"><b>${pct(row.winRate)}</b><span>${escapeHtml(unitName(index,row.counterLeaderBaseId))}</span><small>${n(row.battles)} battles · ${escapeHtml(dcLabel(row))}</small><i>${row.counterOwned?'ROSTER ✓':'ROSTER ✕'} · ${row.attackerDcOwned?'DC ✓':'DC ✕'}</i></button>`).join('') : '<p>No Datacron-specific samples meet the current minimum.</p>'}</div></article>`;
  }).join('');
  let selectedRow = null;
  if (state.selected) {
    const [leader,slot,indexRaw] = state.selected.split('|');
    const defense = defenses.find((row) => normalizeId(row?.leaderBaseId || row?.members?.[0])===leader && Number(row?.slot)===Number(slot));
    const current = defense ? rowsForDefense(snapshot,defense,batch) : null;
    selectedRow = current?.rows?.[Number(indexRaw)] || null;
  }
  const maturityNotice = maturity
    ? `<div class="gac-dcm-warning"><strong>${escapeHtml(maturity.label)}</strong> · ${escapeHtml(maturity.detail)} Normal counter evidence remains available independently.</div>`
    : '';
  root.innerHTML = `<header><div><span>DATACRON MATRIX${maturity ? ` · ${escapeHtml(maturity.label)}` : ''}</span><strong>Exact rolled-DC counter evidence</strong><small>Matches the entered defense squad and confirmed defender Datacron signature. Unknown DC state is never treated as none. Sample maturity is based on verified Datacron battle counts.</small></div><div><label>MIN SAMPLES <select data-gac-dcm-min>${[1,3,5,10,25].map((value)=>`<option value="${value}" ${value===state.minBattles?'selected':''}>${value}</option>`).join('')}</select></label><button type="button" data-gac-dcm-load ${state.loading?'disabled':''}>${state.loading?'LOADING…':state.data?'REFRESH':'LOAD DC EVIDENCE'}</button><button type="button" data-gac-dcm-toggle ${!state.data?'disabled':''}>${state.open?'HIDE':'VIEW'}</button></div></header>${state.error?`<div class="gac-dcm-error">${escapeHtml(state.error)}</div>`:''}${maturityNotice}${state.open?`<div class="gac-dcm-grid">${cards || '<div class="gac-dcm-empty">Enter enemy defenses first.</div>'}</div>${detailMarkup(snapshot,selectedRow,index)}`:''}`;
}
async function load(force = false) {
  if (state.loading) return;
  const snapshot = boardSnapshot();
  const key = `${currentFormat(snapshot)}|${activeDefenses(snapshot).map((row)=>`${row.zone}:${row.slot}:${normalizeId(row.leaderBaseId)}:${datacronEvidenceSignature(dcState(row).datacron,dcState(row).state)}`).join(';')}`;
  if (!force && state.data && state.key === key) { state.open = true; render(); return; }
  state.loading = true; state.error=''; state.open=true; render();
  try { state.data = await fetchBatch(snapshot); state.key = key; }
  catch (error) { state.data = null; state.error = clean(error?.message || error || 'Datacron evidence unavailable.'); }
  finally { state.loading=false; render(); }
}
function install() {
  if (window.__gacDatacronMatrixInstalled) return;
  window.__gacDatacronMatrixInstalled = true;
  document.addEventListener('click',(event)=>{
    if (!event.target?.closest?.('[data-gac-datacron-matrix]')) return;
    if (event.target.closest('[data-gac-dcm-load]')) { void load(true); return; }
    if (event.target.closest('[data-gac-dcm-toggle]')) { state.open=!state.open; render(); return; }
    if (event.target.closest('[data-gac-dcm-close]')) { state.selected=''; render(); return; }
    const row = event.target.closest('[data-gac-dcm-row]'); if (row) { state.selected = row.dataset.gacDcmRow || ''; render(); }
  });
  document.addEventListener('change',(event)=>{ if (event.target?.matches?.('[data-gac-dcm-min]')) { state.minBattles=Math.max(1,n(event.target.value)); state.selected=''; render(); } });
  const tick = () => { if (!location.hash || location.hash === '#gac') render(); };
  tick(); document.addEventListener('DOMContentLoaded',tick,{once:true}); window.addEventListener('hashchange',tick); window.addEventListener('gac-visible-board-rendered',tick);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') install();
export { activeDefenses, dcState, exactTeamMatch, install, ownsCounter, rowsForDefense };
