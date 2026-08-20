import { hybridBoardPlan } from './gac-hybrid-board-plan.js';
import { boardRule, divisionFromRoster, LEAGUES, leagueFromRoster } from './gac-league-board-rules.js';
import { ZONES, zoneLabel } from './gac-board-position.js';

const state = {
  ownerRoster: null,
  opponentRoster: null,
  catalog: null,
  serverDefenses: [],
  drafts: [],
  leagueOverride: localStorage.getItem('swgoh:gac-board:league-override') || '',
  editor: null,
  plan: null,
  planMode: 'none',
  busy: false,
  requestId: 0,
  timer: null,
};

const number = new Intl.NumberFormat('en-US');
const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;

function ownerCode() {
  return allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode || window.__swgohPlayerRosterSnapshot?.allyCode);
}
function opponentCode() {
  return allyCode(document.querySelector('[data-gacv2-opponent]')?.value || document.getElementById('gacOpponentCode')?.value);
}
function currentRound() {
  const round = Number(document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function squadSize() {
  return Number(document.querySelector('[data-gac-board-format]')?.value || document.querySelector('[data-gacv2-mode]')?.value) === 3 ? 3 : 5;
}
function currentFormat() { return squadSize() === 3 ? '3v3' : '5v5'; }
function selectedLeague() { return state.leagueOverride || leagueFromRoster(state.ownerRoster) || 'Carbonite'; }
function currentRule() { return boardRule(selectedLeague(), currentFormat()); }

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: options.cache || 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function characters(body = {}) {
  return (Array.isArray(body?.units) ? body.units : []).filter((unit) => String(unit?.unitType || '').toLowerCase() !== 'ship');
}
function unitImage(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function portrait(unit = {}, compact = false) {
  const name = clean(unit.name || unit.baseId || 'Unknown');
  const baseId = normalizeId(unit.baseId);
  const image = unitImage(unit);
  return `<span class="gac-board-unit ${compact ? 'is-compact' : ''}" ${baseId ? `data-inspect-base-id="${escapeAttr(baseId)}"` : ''} title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}

function draftKey(code = opponentCode()) {
  return `swgoh:gac-visible-board:v1:${ownerCode() || 'anonymous'}:${code || 'manual'}:${currentRound() || 0}:${currentFormat()}`;
}
function readDrafts(code = opponentCode()) {
  try {
    const rows = JSON.parse(localStorage.getItem(draftKey(code)) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function writeDrafts() { localStorage.setItem(draftKey(), JSON.stringify(state.drafts)); }
function migrateAnonymousOpponentDrafts() {
  const code = opponentCode();
  if (!code || readDrafts(code).length) return;
  const manual = readDrafts('');
  if (!manual.length) return;
  state.drafts = manual.map((row) => ({...row, opponentAllyCode:code}));
  writeDrafts();
  localStorage.removeItem(draftKey(''));
}

function boardKey(defense = {}) {
  return `${clean(defense.zone).toUpperCase()}|${Number.isInteger(Number(defense.slot)) ? Number(defense.slot) : ''}`;
}
function mergedDefenses() {
  const index = new Map();
  for (const row of state.drafts) index.set(boardKey(row), {...row, storage:'draft'});
  for (const row of state.serverDefenses) index.set(boardKey(row), {...row, storage:'server'});
  return [...index.values()].sort((a,b) => clean(a.zone).localeCompare(clean(b.zone)) || n(a.slot)-n(b.slot));
}
function zoneDefenses(zone) { return mergedDefenses().filter((row) => clean(row.zone).toUpperCase() === zone); }
function nextSlot(zone) {
  const used = new Set(zoneDefenses(zone).map((row) => Number(row.slot)).filter((value) => Number.isInteger(value) && value >= 0));
  for (let slot = 0; slot < 100; slot += 1) if (!used.has(slot)) return slot;
  return 0;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  state.catalog = await fetchJson('/data/catalog.json?manual-gac-board=1',{cache:'force-cache'}).catch(()=>({units:[]}));
  return state.catalog;
}
async function loadOwnerRoster(force = false) {
  const owner = ownerCode();
  if (!/^\d{9}$/.test(owner)) return null;
  if (!force && allyCode(state.ownerRoster?.player?.allyCode) === owner) return state.ownerRoster;
  try { state.ownerRoster = await fetchJson(`/api/player/${owner}`); } catch {}
  return state.ownerRoster;
}
async function loadOpponentRoster(force = false) {
  const code = opponentCode();
  if (!/^\d{9}$/.test(code)) { state.opponentRoster = null; return null; }
  if (!force && allyCode(state.opponentRoster?.player?.allyCode) === code) return state.opponentRoster;
  try { state.opponentRoster = await fetchJson(`/api/player/${code}`); }
  catch { state.opponentRoster = null; }
  return state.opponentRoster;
}
async function loadServerDefenses() {
  const owner = ownerCode();
  const opponent = opponentCode();
  const round = currentRound();
  if (!/^\d{9}$/.test(owner) || !/^\d{9}$/.test(opponent) || !round) { state.serverDefenses=[]; return; }
  try {
    const body = await fetchJson(`/api/gac/current-board/${owner}/defense?round=${round}`);
    state.serverDefenses = allyCode(body?.opponent?.allyCode) === opponent && Array.isArray(body?.defenses) ? body.defenses : [];
    const serverKeys = new Set(state.serverDefenses.map(boardKey));
    if (serverKeys.size) {
      state.drafts = state.drafts.filter((row)=>!serverKeys.has(boardKey(row)));
      writeDrafts();
    }
  } catch { state.serverDefenses=[]; }
}

function lookupIndex() {
  const source = characters(state.opponentRoster).length ? characters(state.opponentRoster) : characters({units:state.catalog?.units || []});
  return new Map(source.map((unit)=>[normalizeId(unit.baseId),unit]).filter(([id])=>Boolean(id)));
}
function resolveUnits(defense = {}) {
  const index = lookupIndex();
  return (Array.isArray(defense.members) ? defense.members : []).map((id)=>index.get(normalizeId(id)) || {baseId:normalizeId(id),name:normalizeId(id),unitType:'Character'});
}
function fallbackOpponent(defenses = []) {
  const index = lookupIndex();
  const ids = [...new Set(defenses.flatMap((row)=>Array.isArray(row.members)?row.members:[]).map(normalizeId).filter(Boolean))];
  return {source:'static-catalog-identity-only',player:{allyCode:opponentCode(),name:'Manual visible board'},units:ids.map((id)=>index.get(id)||{baseId:id,name:id,unitType:'Character'})};
}
async function ownDefenseReserve() {
  const owner = ownerCode();
  const round = currentRound();
  if (!/^\d{9}$/.test(owner) || !round) return [];
  try {
    const body = await fetchJson(`/api/gac/current-board/${owner}/my-defense?round=${round}`);
    return [...new Set((Array.isArray(body?.defenses)?body.defenses:[]).flatMap((row)=>Array.isArray(row.members)?row.members:[]).map(normalizeId).filter(Boolean))];
  } catch { return []; }
}
function batchEvidenceMap(body = {}) {
  return new Map((Array.isArray(body?.results)?body.results:[]).map((row)=>[normalizeId(row?.enemyLeaderBaseId),row]).filter(([id])=>Boolean(id)));
}
async function loadEvidence(defenses) {
  const leaders=[...new Set(defenses.map((row)=>normalizeId(row.leaderBaseId||row.members?.[0])).filter(Boolean))];
  if(!leaders.length)return new Map();
  try{return batchEvidenceMap(await fetchJson(`/api/gac/counters/batch?format=${currentFormat()}&leaders=${encodeURIComponent(leaders.join(','))}&limit=60`));}
  catch{return new Map();}
}
async function buildPlan() {
  const defenses=mergedDefenses().filter((row)=>Array.isArray(row.members)&&row.members.length===squadSize());
  if(!state.ownerRoster||!defenses.length){state.plan=null;state.planMode='none';return;}
  const evidence=await loadEvidence(defenses);
  const excludeBaseIds=await ownDefenseReserve();
  const opponent=state.opponentRoster||fallbackOpponent(defenses);
  const entries=defenses.map((defense,index)=>({defenseId:Number.isInteger(Number(defense.id))&&Number(defense.id)>0?Number(defense.id):900000+index,defense}));
  state.plan=hybridBoardPlan(state.ownerRoster,opponent,entries,evidence,{size:squadSize(),excludeBaseIds});
  state.planMode=state.opponentRoster?'full-roster':'identity-only';
}
function assignmentFor(defense){
  const defenses=mergedDefenses().filter((row)=>Array.isArray(row.members)&&row.members.length===squadSize());
  const index=defenses.findIndex((row)=>boardKey(row)===boardKey(defense));
  return index<0?null:state.plan?.assignments?.find((row)=>Number(row.sourceIndex)===index)||state.plan?.assignments?.[index]||null;
}
function counterHtml(defense){
  const assignment=assignmentFor(defense);const recommendation=assignment?.recommendation;
  if(!recommendation?.squad?.length)return `<div class="gac-board-smart-counter is-empty"><strong>SMART COUNTER</strong><span>No non-overlapping squad allocated yet.</span></div>`;
  const evidence=assignment.source==='historical-counter-evidence';
  const label=evidence?'HISTORICAL EVIDENCE':state.planMode==='identity-only'?'IDENTITY-ONLY HEURISTIC':'ROSTER-FIT HEURISTIC';
  const sample=evidence&&n(recommendation.battles)>0?` · ${number.format(n(recommendation.wins))}/${number.format(n(recommendation.battles))} observed wins`:'';
  return `<div class="gac-board-smart-counter ${evidence?'is-evidence':''}"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(assignment.allocationReason||recommendation.confidence||'Board-wide allocation')}${escapeHtml(sample)}</span></div><div>${recommendation.squad.map((unit)=>portrait(unit,true)).join('')}</div></div>`;
}

function editorUnits(){
  const roster=characters(state.opponentRoster);
  return (roster.length?roster:characters({units:state.catalog?.units||[]})).slice().sort((a,b)=>roster.length?n(b.power)-n(a.power)||clean(a.name).localeCompare(clean(b.name)):clean(a.name).localeCompare(clean(b.name)));
}
function editorUnit(id){return lookupIndex().get(normalizeId(id))||{baseId:normalizeId(id),name:normalizeId(id)};}
function selectedSlot(unit,index){
  if(!unit)return `<div class="gac-board-picked-slot is-empty"><span>${index===0?'LEADER':'UNIT '+(index+1)}</span><b>+</b></div>`;
  const id=normalizeId(unit.baseId);const leader=id===normalizeId(state.editor.leaderBaseId);
  return `<div class="gac-board-picked-slot ${leader?'is-leader':''}"><span>${leader?'LEADER':'UNIT '+(index+1)}</span>${portrait(unit,true)}<div><button type="button" data-gac-board-make-leader="${escapeAttr(id)}" ${leader?'disabled':''}>Leader</button><button type="button" data-gac-board-remove-unit="${escapeAttr(id)}">×</button></div></div>`;
}
function editorHtml(){
  if(!state.editor)return `<div class="gac-board-editor-placeholder"><strong>Choose a territory position</strong><span>Click “Enter Defense” where the squad appears in your game.</span></div>`;
  const size=squadSize();const selected=state.editor.members.map(editorUnit);const query=clean(state.editor.query).toLowerCase();
  const results=editorUnits().filter((unit)=>!state.editor.members.includes(normalizeId(unit.baseId))&&(!query||clean(unit.name).toLowerCase().includes(query)||normalizeId(unit.baseId).toLowerCase().includes(query))).slice(0,64);
  return `<section class="gac-board-editor"><header><div><span>VISIBLE ENEMY LINEUP</span><strong>${escapeHtml(zoneLabel(state.editor.zone))} · Slot ${Number(state.editor.slot)+1}</strong><small>Select ${size} characters exactly as they appear in-game.</small></div><button type="button" data-gac-board-close>Close</button></header><div class="gac-board-picked">${Array.from({length:size},(_,index)=>selectedSlot(selected[index],index)).join('')}</div><div class="gac-board-search"><input data-gac-board-search placeholder="Search ${state.opponentRoster?'opponent roster':'all characters'}…" value="${escapeAttr(state.editor.query||'')}"><b>${state.editor.members.length}/${size}</b></div><div class="gac-board-unit-results">${results.map((unit)=>`<button type="button" data-gac-board-add-unit="${escapeAttr(unit.baseId)}">${portrait(unit,true)}<span><strong>${escapeHtml(unit.name)}</strong><small>${state.opponentRoster?`R${n(unit.relic)} · ${number.format(n(unit.power))} GP · ${number.format(n(unit.speed))} spd`:'Static game catalog fallback'}</small></span></button>`).join('')||'<div class="gac-board-no-results">No matching characters.</div>'}</div><footer><label>Datacron<select data-gac-board-dc><option value="unknown" ${state.editor.datacronState==='unknown'?'selected':''}>Not confirmed</option><option value="none" ${state.editor.datacronState==='none'?'selected':''}>Confirmed none</option></select></label><button type="button" data-gac-board-save ${state.editor.members.length===size&&state.editor.members.includes(state.editor.leaderBaseId)?'':'disabled'}>${state.busy?'Saving…':'Save Defense'}</button></footer><p>Verified opponent + round → canonical current-board save. Otherwise this remains a local manual observation and still feeds the smart planner.</p></section>`;
}

function defenseCard(defense){
  const units=resolveUnits(defense);const verified=defense.storage==='server';
  return `<article class="gac-visible-defense"><header><div><span>SLOT ${Number(defense.slot)+1}</span><strong>${escapeHtml(units[0]?.name||defense.leaderBaseId||'Defense')}</strong></div><b class="${verified?'is-verified':''}">${verified?'VERIFIED SAVED':'LOCAL DRAFT'}</b></header><div class="gac-visible-defense-units">${units.map((unit)=>portrait(unit,true)).join('')}</div>${counterHtml(defense)}<footer><button type="button" data-gac-board-edit="${escapeAttr(boardKey(defense))}">Edit</button><button type="button" data-gac-board-delete="${escapeAttr(boardKey(defense))}">Delete</button></footer></article>`;
}
function zoneCard(zone){
  const defenses=zoneDefenses(zone.value);
  return `<section class="gac-visible-zone"><header><div><span>${escapeHtml(zone.label.toUpperCase())}</span><strong>${defenses.length} squad${defenses.length===1?'':'s'} entered</strong></div><button type="button" data-gac-board-add-zone="${escapeAttr(zone.value)}">+ Enter Defense</button></header><div>${defenses.map(defenseCard).join('')||'<div class="gac-visible-zone-empty">Nothing entered here yet.</div>'}</div></section>`;
}
function sourceLabel(){
  if(state.opponentRoster)return 'PUBLIC OPPONENT ROSTER + MANUAL BOARD';
  if(opponentCode())return 'STATIC CATALOG FALLBACK · OPPONENT ROSTER UNAVAILABLE';
  return 'STATIC CATALOG FALLBACK · OPPONENT ALLY CODE OPTIONAL';
}
function render(){
  const host=document.querySelector('[data-gac-board-workspace]');if(!host)return;
  const rule=currentRule();const observed=mergedDefenses().length;const division=divisionFromRoster(state.ownerRoster);const detected=leagueFromRoster(state.ownerRoster);
  host.innerHTML=`<section class="gac-visible-board"><div class="gac-visible-board-head"><div><span>MANUAL CURRENT-BOARD INPUT</span><strong>Enter the opponent lineup you actually see</strong><p>Pick a territory, enter that squad, and Command Center allocates non-overlapping counters from your roster.</p></div><aside><b>${escapeHtml(sourceLabel())}</b><small>${state.opponentRoster?'Exact opponent relic, speed and progression can be compared.':'Counter evidence can still use lineup identity; opponent stat deltas stay unknown.'}</small></aside></div><div class="gac-board-config"><label>League<select data-gac-board-league><option value="" ${!state.leagueOverride?'selected':''}>Auto${detected?` · ${escapeHtml(detected)}`:''}</option>${LEAGUES.map((league)=>`<option value="${league}" ${state.leagueOverride===league?'selected':''}>${league}</option>`).join('')}</select></label><label>Format<select data-gac-board-format><option value="5" ${squadSize()===5?'selected':''}>5v5</option><option value="3" ${squadSize()===3?'selected':''}>3v3</option></select></label><div><span>EXPECTED SQUADS</span><strong>${rule.squadTeams}</strong><small>${observed} entered</small></div><div><span>EXPECTED FLEETS</span><strong>${rule.fleetTeams}</strong><small>Fleet editor separate</small></div><div><span>GAC LEVEL</span><strong>${escapeHtml(rule.league)}${division?` ${division}`:''}</strong><small>${state.leagueOverride?'Manual override':'Auto from your profile'}</small></div><button type="button" data-gac-board-sync>${state.busy?'Working…':'Confirm Opponent + Sync'}</button></div><div class="gac-board-progress"><i style="--gac-board-progress:${Math.min(100,rule.squadTeams?observed/rule.squadTeams*100:0)}%"></i><b>${observed}/${rule.squadTeams} squad defenses observed</b><small>Enter only revealed territories now; add the back wall after you unlock it.</small></div><div class="gac-visible-zones">${ZONES.map(zoneCard).join('')}</div><div data-gac-board-editor-host>${editorHtml()}</div></section>`;
}

function ensureQuickSandbox(panel, boardHost){
  let details=panel.querySelector(':scope > [data-gac-board-quick-sandbox]');
  if(details)return details;
  details=document.createElement('details');details.dataset.gacBoardQuickSandbox='true';details.className='gac-board-quick-sandbox';details.innerHTML='<summary>Quick single-squad sandbox</summary><div data-gac-board-legacy-host></div>';
  const legacyHost=details.querySelector('[data-gac-board-legacy-host]');
  const existing=[...panel.children].filter((node)=>node!==boardHost&&node!==details);
  for(const node of existing)legacyHost.appendChild(node);
  panel.appendChild(details);
  return details;
}
function mount(){
  const panel=document.querySelector('[data-gacv2-panel="board"]');if(!panel)return false;
  let host=panel.querySelector(':scope > [data-gac-board-workspace]');
  if(!host){host=document.createElement('div');host.dataset.gacBoardWorkspace='true';panel.prepend(host);}
  ensureQuickSandbox(panel,host);render();return true;
}

function startEditor(zone,defense=null){
  state.editor={zone,slot:defense?.slot==null?nextSlot(zone):Number(defense.slot),members:Array.isArray(defense?.members)?defense.members.map(normalizeId).filter(Boolean):[],leaderBaseId:normalizeId(defense?.leaderBaseId),datacronState:clean(defense?.datacronState).toLowerCase()==='none'?'none':'unknown',query:''};
  if(!state.editor.leaderBaseId&&state.editor.members.length)state.editor.leaderBaseId=state.editor.members[0];render();document.querySelector('[data-gac-board-editor-host]')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function addUnit(id){if(!state.editor||state.editor.members.length>=squadSize())return;id=normalizeId(id);if(!id||state.editor.members.includes(id))return;state.editor.members.push(id);if(!state.editor.leaderBaseId)state.editor.leaderBaseId=id;state.editor.query='';render();}
function removeUnit(id){if(!state.editor)return;id=normalizeId(id);state.editor.members=state.editor.members.filter((value)=>value!==id);if(state.editor.leaderBaseId===id)state.editor.leaderBaseId=state.editor.members[0]||'';render();}
function makeLeader(id){if(!state.editor)return;id=normalizeId(id);if(state.editor.members.includes(id))state.editor.leaderBaseId=id;render();}
function editorDefense(){return state.editor?{id:`local:${state.editor.zone}:${state.editor.slot}`,leaderBaseId:state.editor.leaderBaseId,members:[...state.editor.members],zone:state.editor.zone,slot:Number(state.editor.slot),datacron:null,datacronState:state.editor.datacronState||'unknown',source:'user-entered-manual-board',observedAt:new Date().toISOString(),opponentAllyCode:opponentCode()}:null;}
function saveDraft(defense){const key=boardKey(defense);state.drafts=state.drafts.filter((row)=>boardKey(row)!==key);state.drafts.push(defense);writeDrafts();}
async function persistDefense(defense){
  const owner=ownerCode(),opponent=opponentCode(),round=currentRound();if(!/^\d{9}$/.test(owner)||!/^\d{9}$/.test(opponent)||!round)return null;
  return fetchJson(`/api/gac/current-board/${owner}/defense`,{method:'POST',body:JSON.stringify({opponentAllyCode:opponent,round,size:squadSize(),leaderBaseId:defense.leaderBaseId,members:defense.members,datacronId:'',datacronState:defense.datacronState||'unknown',zone:defense.zone,slot:defense.slot,sourceRef:'gac-visible-board-workspace'})});
}
async function saveEditor(){
  if(!state.editor||state.editor.members.length!==squadSize()||!state.editor.members.includes(state.editor.leaderBaseId))return;
  const defense=editorDefense();state.busy=true;render();let persisted=false;
  try{const result=await persistDefense(defense);if(result?.saved){persisted=true;state.drafts=state.drafts.filter((row)=>boardKey(row)!==boardKey(defense));writeDrafts();await loadServerDefenses();window.dispatchEvent(new CustomEvent('gac-board-evidence-updated',{detail:{owner:'opponent',action:'saved',round:currentRound()}}));}}
  catch(error){if(![401,409].includes(Number(error?.status)))console.warn('Manual GAC board save failed',error);}
  if(!persisted)saveDraft(defense);state.editor=null;state.busy=false;await buildPlan();render();
}
async function deleteDefense(key){
  const defense=mergedDefenses().find((row)=>boardKey(row)===key);if(!defense)return;
  if(defense.storage==='server'&&Number.isInteger(Number(defense.id))&&currentRound()){
    try{await fetchJson(`/api/gac/current-board/${ownerCode()}/defense`,{method:'DELETE',body:JSON.stringify({id:Number(defense.id),round:currentRound()})});await loadServerDefenses();window.dispatchEvent(new CustomEvent('gac-board-evidence-updated',{detail:{owner:'opponent',action:'deleted',round:currentRound()}}));}
    catch(error){console.warn('Saved GAC board delete failed',error);return;}
  }else{state.drafts=state.drafts.filter((row)=>boardKey(row)!==key);writeDrafts();}
  await buildPlan();render();
}
async function confirmAndSync(){
  const owner=ownerCode(),opponent=opponentCode(),round=currentRound();
  if(!/^\d{9}$/.test(owner)||!/^\d{9}$/.test(opponent)||!round){const status=document.querySelector('[data-gacv2-status]');if(status)status.innerHTML='<strong>Manual board is active locally</strong><span>Enter opponent Ally Code and choose the current round to sync it.</span>';return;}
  state.busy=true;render();
  try{
    await fetchJson(`/api/gac/current-opponent/${owner}/confirm`,{method:'POST',body:JSON.stringify({opponentAllyCode:opponent,round})});
    for(const defense of [...state.drafts]){try{const result=await persistDefense(defense);if(result?.saved)state.drafts=state.drafts.filter((row)=>boardKey(row)!==boardKey(defense));}catch(error){console.warn('GAC board draft sync skipped',boardKey(defense),error);}}
    writeDrafts();await Promise.all([loadOpponentRoster(true),loadServerDefenses()]);window.dispatchEvent(new CustomEvent('gac-current-opponent-manually-confirmed',{detail:{ownerAllyCode:owner,opponentAllyCode:opponent,round}}));window.dispatchEvent(new CustomEvent('gac-board-evidence-updated',{detail:{owner:'opponent',action:'updated',round}}));
  }catch(error){console.warn('GAC opponent confirmation/sync failed',error);}
  finally{state.busy=false;await buildPlan();render();}
}

async function refresh(force=false){
  const requestId=++state.requestId;await loadCatalog();await Promise.all([loadOwnerRoster(force),loadOpponentRoster(force)]);if(requestId!==state.requestId)return;migrateAnonymousOpponentDrafts();state.drafts=readDrafts();await loadServerDefenses();if(requestId!==state.requestId)return;await buildPlan();render();
}
function schedule(delay=120,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>{if(mount())void refresh(force);},Math.max(0,delay));}
function bind(){
  if(document.documentElement.dataset.gacVisibleBoardBound==='true')return;document.documentElement.dataset.gacVisibleBoardBound='true';
  document.addEventListener('click',(event)=>{
    const addZone=event.target.closest?.('[data-gac-board-add-zone]');if(addZone){startEditor(addZone.dataset.gacBoardAddZone);return;}
    const add=event.target.closest?.('[data-gac-board-add-unit]');if(add){addUnit(add.dataset.gacBoardAddUnit);return;}
    const remove=event.target.closest?.('[data-gac-board-remove-unit]');if(remove){removeUnit(remove.dataset.gacBoardRemoveUnit);return;}
    const leader=event.target.closest?.('[data-gac-board-make-leader]');if(leader){makeLeader(leader.dataset.gacBoardMakeLeader);return;}
    const edit=event.target.closest?.('[data-gac-board-edit]');if(edit){const defense=mergedDefenses().find((row)=>boardKey(row)===edit.dataset.gacBoardEdit);if(defense)startEditor(defense.zone,defense);return;}
    const del=event.target.closest?.('[data-gac-board-delete]');if(del){void deleteDefense(del.dataset.gacBoardDelete);return;}
    if(event.target.closest?.('[data-gac-board-close]')){state.editor=null;render();return;}
    if(event.target.closest?.('[data-gac-board-save]')){void saveEditor();return;}
    if(event.target.closest?.('[data-gac-board-sync]')){void confirmAndSync();return;}
  },true);
  document.addEventListener('input',(event)=>{
    if(event.target?.matches?.('[data-gac-board-search]')&&state.editor){state.editor.query=event.target.value;const cursor=event.target.selectionStart;render();const input=document.querySelector('[data-gac-board-search]');input?.focus();if(Number.isInteger(cursor))input?.setSelectionRange?.(cursor,cursor);}
  },true);
  document.addEventListener('change',(event)=>{
    if(event.target?.matches?.('[data-gac-board-league]')){state.leagueOverride=clean(event.target.value);if(state.leagueOverride)localStorage.setItem('swgoh:gac-board:league-override',state.leagueOverride);else localStorage.removeItem('swgoh:gac-board:league-override');render();return;}
    if(event.target?.matches?.('[data-gac-board-format]')){const mode=document.querySelector('[data-gacv2-mode]');if(mode){mode.value=Number(event.target.value)===3?'3':'5';mode.dispatchEvent(new Event('change',{bubbles:true}));}state.editor=null;schedule(60,false);return;}
    if(event.target?.matches?.('[data-gac-board-dc]')&&state.editor){state.editor.datacronState=event.target.value==='none'?'none':'unknown';return;}
    if(event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode]')||event.target?.id==='allyCode')schedule(160,true);
  },true);
  window.addEventListener('gac-v2-matchup-loaded',()=>schedule(80,true));
  window.addEventListener('gac-current-opponent-manually-confirmed',()=>schedule(100,true));
  window.addEventListener('gac-board-evidence-updated',()=>schedule(110,true));
}
function injectStyle(){if(document.querySelector('link[data-gac-visible-board-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-manual-board-workspace.css?v=20260821-b07';link.dataset.gacVisibleBoardStyle='true';document.head.appendChild(link);}

if(typeof document!=='undefined'){
  injectStyle();bind();schedule(220,true);document.addEventListener('DOMContentLoaded',()=>schedule(100,true),{once:true});window.addEventListener('hashchange',()=>schedule(140,true));new MutationObserver(()=>{if(!document.querySelector('[data-gac-board-workspace]'))schedule(60,false);}).observe(document.documentElement,{childList:true,subtree:true});
}

export { boardKey, currentRule, mergedDefenses, nextSlot, selectedLeague };
