import { bestCoverage, datacronLabel, loadEligibilityContext } from './gac-datacron-eligibility.js';

const state={
  key:'',
  roster:null,
  assignments:[],
  eligibility:null,
  loading:null,
  timer:null,
  errors:new Map(),
  busy:new Set(),
};

const clean=(value)=>String(value??'').trim();
const allyCode=(value)=>clean(value).replace(/\D/g,'').slice(0,9);
const normalizeId=(value)=>clean(value).split(':')[0].toUpperCase();
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity(){
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode||window.__swgohPlayerRosterSnapshot?.allyCode);
  const opponent=allyCode(document.querySelector('[data-gacv2-opponent]')?.value||document.getElementById('gacOpponentCode')?.value);
  const round=Number(document.querySelector('[data-gacv2-round]')?.value||document.getElementById('gacBracketRound')?.value);
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,key:`${mine}|${opponent}|${round}`});
}

async function fetchJson(pathname,options={}){
  const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body?.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
  return body;
}

function rosterIndex(roster={}){
  return new Map((Array.isArray(roster?.units)?roster.units:[]).map((unit)=>[normalizeId(unit?.baseId),unit]).filter(([id])=>id));
}
function assignmentIndex(assignments=[]){
  return new Map((Array.isArray(assignments)?assignments:[]).map((row)=>[Number(row?.defenseId),row]).filter(([id])=>Number.isInteger(id)&&id>0));
}
function squadIds(card){
  return [...(card?.querySelectorAll?.('.gac-manual-war-counter:not(.is-locked):not(.is-cleared) [data-inspect-base-id]')||[])]
    .map((node)=>normalizeId(node.dataset.inspectBaseId)).filter(Boolean);
}
function coverageForMembers(roster,memberIds,eligibility){
  if(!roster||!eligibility||!Array.isArray(roster?.datacrons)||!memberIds?.length)return null;
  const units=rosterIndex(roster);
  const squad=memberIds.map((id)=>units.get(normalizeId(id))).filter(Boolean);
  if(squad.length!==memberIds.length)return null;
  return bestCoverage(roster.datacrons,squad,eligibility.unitIndex,eligibility.datacronCatalog);
}
function coverageSummary(coverage){
  if(!coverage?.datacron)return Object.freeze({id:'',label:'NO DATACRON RECOMMENDED',detail:'No fully-resolved ability-affix coverage beat the no-Datacron fallback.'});
  const id=clean(coverage.datacron.id);
  const label=state.eligibility?datacronLabel(coverage.datacron,state.eligibility.datacronCatalog):`Datacron ${id.slice(-8)}`;
  const detail=`${Number(coverage.eligibleMembers||0)}/${Number(coverage.squadSize||0)} squad members covered · ${Number(coverage.eligibleAbilityHits||0)} eligible ability hits${coverage.leaderEligible===true?' · leader covered':''}`;
  return Object.freeze({id,label,detail});
}

function adaptLockControls(root=document){
  let changed=0;
  for(const button of root.querySelectorAll?.('[data-gac-board-workspace] [data-gac-manual-war-action="lock"]')||[]){
    button.dataset.gacManualDcLock='true';
    delete button.dataset.gacManualWarAction;
    changed+=1;
  }
  return changed;
}

function datacronPanel(card,assignment){
  const defenseId=Number(card?.dataset?.defenseId);
  const error=clean(state.errors.get(defenseId));
  const status=clean(assignment?.status).toLowerCase();
  if(assignment&&['planned','attempted'].includes(status)){
    const locked=assignment?.datacron||null;
    if(!locked?.id)return `<section class="gac-manual-dc is-locked-none" data-gac-manual-dc><span>ATTACKER DATACRON</span><strong>LOCKED · NONE</strong><small>This attack is intentionally reserved without a Datacron.</small></section>`;
    const summary=coverageSummary({datacron:locked,eligibleMembers:0,squadSize:0,eligibleAbilityHits:0,leaderEligible:null});
    return `<section class="gac-manual-dc is-locked" data-gac-manual-dc><span>ATTACKER DATACRON · LOCKED</span><strong>${escapeHtml(summary.label)}</strong><small>ID …${escapeHtml(clean(locked.id).slice(-8))} · Level ${Number(locked.level||0)}</small></section>`;
  }
  const members=squadIds(card);
  if(!members.length)return '';
  const coverage=coverageForMembers(state.roster,members,state.eligibility);
  const summary=coverageSummary(coverage);
  return `<section class="gac-manual-dc ${summary.id?'is-recommended':'is-none'}" data-gac-manual-dc data-recommended-datacron-id="${escapeHtml(summary.id)}"><span>ATTACKER DATACRON · AUTO MATCH</span><strong>${escapeHtml(summary.label)}</strong><small>${escapeHtml(summary.detail)}</small>${summary.id?`<em>Lock Counter will reserve this exact live Datacron · …${escapeHtml(summary.id.slice(-8))}</em>`:`<em>Lock Counter will reserve the squad with no Datacron.</em>`}${error?`<div>${escapeHtml(error)}</div>`:''}</section>`;
}

function decorate(){
  adaptLockControls(document);
  const assignments=assignmentIndex(state.assignments);
  for(const card of document.querySelectorAll('[data-gac-board-workspace] .gac-visible-defense[data-defense-id]')){
    card.querySelector('[data-gac-manual-dc]')?.remove();
    const defenseId=Number(card.dataset.defenseId);
    const panel=datacronPanel(card,assignments.get(defenseId)||null);
    if(!panel)continue;
    const war=card.querySelector('[data-gac-manual-war-panel]');
    const footer=war?.querySelector(':scope > footer');
    if(footer)footer.insertAdjacentHTML('beforebegin',panel);
    else if(war)war.insertAdjacentHTML('beforeend',panel);
  }
}

async function load(force=false){
  const current=identity();if(!current)return;
  if(!force&&state.key===current.key&&state.roster&&state.eligibility){decorate();return;}
  if(state.loading)return state.loading;
  state.loading=(async()=>{
    try{
      const [roster,warRoom,eligibility]=await Promise.all([
        fetchJson(`/api/player/${current.mine}${force?'?refresh=1':''}`),
        fetchJson(`/api/gac/attack-plan/${current.mine}?round=${current.round}`),
        loadEligibilityContext().catch(()=>null),
      ]);
      state.key=current.key;
      state.roster=roster;
      state.assignments=Array.isArray(warRoom?.assignments)?warRoom.assignments:[];
      state.eligibility=eligibility;
      decorate();
    }catch(error){console.warn('GAC manual Datacron lock unavailable',error);}
    finally{state.loading=null;}
  })();
  return state.loading;
}

async function lockWithDatacron(card){
  const current=identity();
  const defenseId=Number(card?.dataset?.defenseId);
  if(!current||!Number.isInteger(defenseId)||defenseId<=0||state.busy.has(defenseId))return;
  state.busy.add(defenseId);state.errors.delete(defenseId);
  try{
    await load(true);
    const members=squadIds(card);
    const leaderBaseId=members[0]||'';
    if(!members.length||!leaderBaseId)throw new Error('The authoritative counter squad is not available to lock. Recalculate the War Room first.');
    const coverage=coverageForMembers(state.roster,members,state.eligibility);
    const datacronId=clean(coverage?.datacron?.id);
    const button=card.querySelector('[data-gac-manual-dc-lock]');
    if(button){button.disabled=true;button.textContent=datacronId?'LOCKING SQUAD + DATACRON…':'LOCKING SQUAD…';}
    await fetchJson(`/api/gac/attack-plan/${current.mine}`,{method:'POST',body:JSON.stringify({round:current.round,defenseId,leaderBaseId,members,datacronId})});
    window.dispatchEvent(new CustomEvent('gac-war-room-updated',{detail:{action:'manual-board-datacron-counter-locked',defenseId,datacronId:datacronId||null}}));
    await load(true);
  }catch(error){state.errors.set(defenseId,clean(error?.message||error));decorate();}
  finally{state.busy.delete(defenseId);const button=card.querySelector('[data-gac-manual-dc-lock]');if(button)button.disabled=false;}
}

function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}
function injectStyle(){if(document.querySelector('link[data-gac-manual-dc-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-manual-datacron-lock.css?v=20260821-dclock1';link.dataset.gacManualDcStyle='true';document.head.appendChild(link);}

function bind(){
  injectStyle();
  document.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-gac-board-workspace] [data-gac-manual-dc-lock]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const card=button.closest('.gac-visible-defense[data-defense-id]');if(card)void lockWithDatacron(card);
  },true);
  document.addEventListener('change',(event)=>{if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode],[data-gac-board-format]'))schedule(100,true);},true);
  window.addEventListener('gac-visible-board-rendered',()=>schedule(60,true));
  window.addEventListener('gac-war-room-updated',()=>schedule(80,true));
  window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));
  const observer=new MutationObserver(()=>{if(adaptLockControls(document))schedule(0,false);});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>schedule(180,true),{once:true});
  schedule(320,true);
}

if(typeof document!=='undefined')bind();

export { adaptLockControls, coverageForMembers, coverageSummary, identity, lockWithDatacron, squadIds };
