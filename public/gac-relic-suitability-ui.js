import { boardSnapshot } from './gac-manual-board-workspace.js';
import { normalizeId, normalizeMembers, rosterIndex } from './gac-counter-matrix-model.js';
import { buildBoardOptimization } from './gac-board-optimization-model.js';
import { formatRelicDelta, relicSuitabilityForAllocation } from './gac-relic-suitability-model.js';

const state = { loading:false, error:'', rows:[], open:false, analyzedKey:'' };
const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;
const number = new Intl.NumberFormat('en-US');

function allyCode(value) { const code=clean(value).replace(/\D/g,'').slice(0,9); return /^\d{9}$/.test(code)?code:''; }
function ownerCode(snapshot={}) { return allyCode(snapshot?.ownerCode || document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode); }
function round(snapshot={}) { const value=Number(snapshot?.round || document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value); return Number.isInteger(value)&&value>=1&&value<=3?value:null; }
function format(snapshot={}) { const raw=clean(snapshot?.format || snapshot?.rule?.format || '5v5').toLowerCase(); return raw==='3v3'||raw==='3'?'3v3':'5v5'; }
function defenses(snapshot={}) { return (Array.isArray(snapshot?.defenses)?snapshot.defenses:[]).filter((row)=>clean(row?.zone).toUpperCase()!=='BACK-TOP'&&normalizeId(row?.leaderBaseId||row?.members?.[0])); }
async function fetchJson(pathname) { const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}}); const body=await response.json().catch(()=>({})); if(!response.ok){const error=new Error(body?.error||`HTTP ${response.status}`);error.status=response.status;throw error;} return body; }

function unavailable(snapshot, ownDefense, attackPlan) {
  const ids=new Set(normalizeMembers(snapshot?.reservedBaseIds));
  for(const row of Array.isArray(ownDefense?.defenses)?ownDefense.defenses:[]) for(const id of normalizeMembers(row?.members)) ids.add(id);
  for(const assignment of Array.isArray(attackPlan?.assignments)?attackPlan.assignments:[]){
    if(['planned','attempted'].includes(clean(assignment?.status).toLowerCase())) for(const id of normalizeMembers(assignment?.members||assignment?.attackerMembers)) ids.add(id);
    for(const attempt of Array.isArray(assignment?.attemptLog)?assignment.attemptLog:[]) for(const id of normalizeMembers(attempt?.members)) ids.add(id);
  }
  return [...ids];
}

function combinedIndex(snapshot={}, ownRoster={}) {
  const index=rosterIndex(ownRoster);
  for(const rows of [snapshot?.opponentRoster?.units,snapshot?.catalog?.units]) for(const unit of Array.isArray(rows)?rows:[]){ const id=normalizeId(unit); if(id&&!index.has(id)) index.set(id,unit); }
  return index;
}
function name(index,id){ return clean(index.get(normalizeId(id))?.name||normalizeId(id)||'Unknown'); }
function image(index,id){ const unit=index.get(normalizeId(id))||{}; return clean(unit.image||unit.imageUrl||unit.portrait||unit.portraitUrl||unit.thumbnail||unit.icon); }
function portrait(index,id){ const unitName=name(index,id); const src=image(index,id); return `<span class="gac-relic-unit" title="${escapeAttr(unitName)}">${src?`<img src="${escapeAttr(src)}" alt="" loading="lazy">`:`<b>${escapeHtml(unitName.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(unitName)}</small></span>`; }
function pct(value){ return Number.isFinite(Number(value))?`${Math.round(Number(value)*100)}%`:'—'; }
function relic(value){ return Number.isFinite(Number(value))?`R${Number(value).toFixed(1).replace(/\.0$/,'')}`:'—'; }

async function analyze(){
  if(state.loading)return;
  const snapshot=boardSnapshot(); const mine=ownerCode(snapshot); const currentRound=round(snapshot); const currentDefenses=defenses(snapshot);
  if(!mine){state.error='Load your roster before relic analysis.';state.open=true;render();return;}
  if(!currentDefenses.length){state.error='Enter enemy squad defenses before relic analysis.';state.open=true;render();return;}
  state.loading=true;state.error='';state.open=true;render();
  try{
    const currentFormat=format(snapshot); const leaders=[...new Set(currentDefenses.map((row)=>normalizeId(row?.leaderBaseId||row?.members?.[0])).filter(Boolean))];
    const [ownRoster,batch,ownDefense,attackPlan]=await Promise.all([
      snapshot?.ownerRoster?.units?.length?Promise.resolve(snapshot.ownerRoster):fetchJson(`/api/player/${mine}`),
      fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(currentFormat)}&leaders=${encodeURIComponent(leaders.join(','))}&limit=100`),
      currentRound?fetchJson(`/api/gac/current-board/${mine}/my-defense?round=${currentRound}`).catch(()=>null):Promise.resolve(null),
      currentRound?fetchJson(`/api/gac/attack-plan/${mine}?round=${currentRound}`).catch(()=>({assignments:[]})):Promise.resolve({assignments:[]}),
    ]);
    const optimization=buildBoardOptimization({defenses:currentDefenses,batch,ownRoster,unavailableBaseIds:unavailable(snapshot,ownDefense,attackPlan),attackPlan,minimumBattles:5,minimumRelic:0,exactDefenseFirst:true});
    const index=combinedIndex(snapshot,ownRoster);
    state.rows=relicSuitabilityForAllocation(optimization.allocation.assignments,currentDefenses,ownRoster,snapshot?.opponentRoster||{}).map((row)=>Object.freeze({...row,defenseName:name(index,row.defenseLeaderBaseId),counterName:name(index,row.counterLeaderBaseId),index}));
    state.analyzedKey=`${mine}|${snapshot?.opponentCode||''}|${currentRound||0}|${currentFormat}|${currentDefenses.map((row)=>`${row.zone}:${row.slot}:${normalizeId(row.leaderBaseId)}`).join(';')}`;
  }catch(error){state.rows=[];state.error=clean(error?.message||error||'Relic suitability could not be analyzed.');}
  finally{state.loading=false;render();}
}

function rowMarkup(row){
  const band=clean(row.band)||'unknown'; const index=row.index||new Map();
  const historical = row.historicalRelicEvidenceAvailable
    ? `<span><b>${formatRelicDelta(row.historicalAverageRelicDelta)}</b> historical RΔ</span><span><b>${number.format(row.historicalRelicSamples)}</b> relic samples</span>`
    : '<span><b>—</b> historical RΔ</span><span><b>0</b> relic samples</span>';
  return `<article class="gac-relic-row is-${escapeAttr(band)}"><header><div>${portrait(index,row.defenseLeaderBaseId)}<span><b>${escapeHtml(row.defenseName)}</b><small>entered defense</small></span></div><strong>NOW RΔ ${formatRelicDelta(row.relicDelta)}</strong><div>${portrait(index,row.counterLeaderBaseId)}<span><b>${escapeHtml(row.counterName)}</b><small>proposed counter</small></span></div></header><div class="gac-relic-metrics"><span><b>${relic(row.defenderAverageRelic)}</b> defense avg</span><span><b>${relic(row.attackerAverageRelic)}</b> counter avg</span><span><b>${pct(row.winRate)}</b> historical win</span><span><b>${number.format(row.battles||0)}</b> battles</span>${historical}</div><footer><i>${escapeHtml(band.replaceAll('-',' ').toUpperCase())}</i><small>NOW RΔ compares the loaded rosters. HIST RΔ uses only verified battles with complete relic snapshots; its sample count can be smaller than the win-rate sample.</small></footer></article>`;
}

function ensureRoot(){
  const optimizer=document.querySelector('[data-gac-board-optimization]'); const matrix=document.querySelector('[data-gac-counter-matrix]'); const host=optimizer||matrix||document.querySelector('.gac-manual-enemy-board'); if(!host)return null;
  let root=document.querySelector('[data-gac-relic-suitability]'); if(!root){root=document.createElement('section');root.className='gac-relic-suitability';root.dataset.gacRelicSuitability='true';host.insertAdjacentElement('afterend',root);} if(optimizer&&optimizer.nextElementSibling!==root)optimizer.insertAdjacentElement('afterend',root); return root;
}
function render(){
  const root=ensureRoot();if(!root)return;
  const historicalSamples=state.rows.reduce((sum,row)=>sum+(row.historicalRelicSamples||0),0);
  root.innerHTML=`<header><div><span>RELIC SUITABILITY</span><strong>Current roster fit + verified historical relic context</strong><small>NOW RΔ compares the rosters loaded right now. HIST RΔ appears only where verified battle snapshots exist.</small></div><div>${state.analyzedKey?`<button type="button" data-gac-relic-toggle>${state.open?'HIDE':'VIEW · '+state.rows.length}</button>`:''}<button type="button" data-gac-relic-analyze ${state.loading?'disabled':''}>${state.loading?'ANALYZING…':state.analyzedKey?'REANALYZE':'ANALYZE RELIC FIT'}</button></div></header>${state.error?`<div class="gac-relic-error">${escapeHtml(state.error)}</div>`:''}${state.open&&state.analyzedKey?`<div class="gac-relic-note">${historicalSamples ? `${number.format(historicalSamples)} verified relic snapshots contribute to HIST RΔ across these proposed counters.` : 'Historical relic samples have not accumulated for these exact counters yet. Current RΔ remains available without inventing sample gear.'}</div><div class="gac-relic-grid">${state.rows.length?state.rows.map(rowMarkup).join(''):'<div class="gac-relic-empty">No complete non-overlapping counter allocation is currently available.</div>'}</div>`:''}`;
}
function installRelicSuitability(){
  if(window.__gacRelicSuitabilityInstalled)return;window.__gacRelicSuitabilityInstalled=true;
  document.addEventListener('click',(event)=>{if(!event.target?.closest?.('[data-gac-relic-suitability]'))return;if(event.target.closest('[data-gac-relic-analyze]')){void analyze();return;}if(event.target.closest('[data-gac-relic-toggle]')){state.open=!state.open;render();}});
  const tick=()=>{if(location.hash&&location.hash!=='#gac')return;render();};tick();document.addEventListener('DOMContentLoaded',tick,{once:true});window.addEventListener('hashchange',tick);window.addEventListener('gac-visible-board-rendered',tick);
}
if(typeof window!=='undefined'&&typeof document!=='undefined')installRelicSuitability();
export { analyze, installRelicSuitability, unavailable };
