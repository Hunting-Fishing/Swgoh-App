const state={frontDefenses:[],attackAssignments:[],key:'',timer:null,requestId:0};
const clean=(value)=>String(value??'').trim();
const allyCode=(value)=>clean(value).replace(/\D/g,'').slice(0,9);
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity(){
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode||window.__swgohPlayerRosterSnapshot?.allyCode);
  const opponent=allyCode(document.querySelector('[data-gacv2-opponent]')?.value||document.getElementById('gacOpponentCode')?.value);
  const round=Number(document.querySelector('[data-gacv2-round]')?.value||document.getElementById('gacBracketRound')?.value);
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,key:`${mine}|${opponent}|${round}`});
}
async function fetchJson(pathname){const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error||`HTTP ${response.status}`);return body;}
function operations(){return window.__gacFleetCanonicalOperations||{};}
function fleetAssignments(){return Array.isArray(operations()?.assignments)?operations().assignments:[];}
function enemyFleets(){return Array.isArray(operations()?.enemyFleets)?operations().enemyFleets:[];}
function assignmentFor(fleetId){return fleetAssignments().find((row)=>Number(row?.defenseFleetId)===Number(fleetId))||null;}
function attackAssignmentFor(defenseId){return state.attackAssignments.find((row)=>Number(row?.defenseId)===Number(defenseId))||null;}
function frontTopState(){
  const rows=state.frontDefenses.filter((row)=>clean(row?.zone).toUpperCase()==='FRONT-TOP');
  const wins=rows.filter((row)=>clean(attackAssignmentFor(row.id)?.status).toLowerCase()==='win').length;
  return Object.freeze({total:rows.length,wins,unlocked:rows.length>0&&wins===rows.length});
}
function statusLabel(status){const value=clean(status).toLowerCase();if(value==='planned')return'LOCKED';if(value==='attempted')return'ATTEMPT IN PROGRESS';if(value==='win')return'CLEARED';if(value==='loss')return'LOSS · CLEANUP REQUIRED';if(value==='abandoned')return'RELEASED';return'UNPLANNED';}
function hasCanonicalLock(fleet){return Boolean(document.querySelector(`[data-gac-fleet-round-operations] [data-gac-fleet-lock="${Number(fleet.id)}|${Number(fleet.slot)}"]`));}
function controlsHtml(fleet,assignment){
  const status=clean(assignment?.status).toLowerCase();
  if(!assignment||status==='abandoned'){
    return hasCanonicalLock(fleet)?`<button type="button" data-gac-fleet-lock="${Number(fleet.id)}|${Number(fleet.slot)}">CONFIRM ROLES & LOCK</button>`:`<button type="button" data-gac-manual-fleet-planner-focus>OPEN FLEET PLANNER</button>`;
  }
  if(status==='planned')return `<button type="button" data-gac-fleet-status="${Number(assignment.id)}|attempted">START FLEET ATTEMPT</button><button type="button" class="is-muted" data-gac-fleet-status="${Number(assignment.id)}|abandoned">RELEASE COUNTER</button>`;
  if(status==='attempted')return `<label>Banners <input type="number" min="0" step="1" data-gac-fleet-banners="${Number(assignment.id)}" placeholder="optional"></label><button type="button" class="is-win" data-gac-fleet-result="${Number(assignment.id)}|win">RECORD WIN</button><button type="button" class="is-loss" data-gac-fleet-result="${Number(assignment.id)}|loss">RECORD LOSS</button>`;
  if(status==='loss')return `<button type="button" data-gac-manual-fleet-cleanup-focus>OPEN FLEET CLEANUP CONTROL</button>`;
  if(status==='win')return `<span class="gac-manual-fleet-cleared">✓ CLEARED${assignment?.banners==null?'':` · ${Number(assignment.banners)} BANNERS`}</span>`;
  return `<button type="button" data-gac-manual-fleet-planner-focus>OPEN FLEET PLANNER</button>`;
}
function fleetRowHtml(fleet){
  const assignment=assignmentFor(fleet.id);const status=clean(assignment?.status).toLowerCase();const cap=clean(fleet?.capitalShipBaseId)||'Enemy capital ship';
  return `<article class="gac-manual-fleet-row is-${escapeHtml(status||'open')}"><div><span>FLEET ${Number(fleet.slot)+1}</span><strong>${escapeHtml(cap)}</strong><small>Canonical defense #${Number(fleet.id)} · ${escapeHtml(statusLabel(status))}</small></div><div class="gac-manual-fleet-actions">${controlsHtml(fleet,assignment)}</div></article>`;
}
function render(){
  const host=document.querySelector('[data-gac-board-workspace] .gac-visible-board');if(!host)return;
  host.querySelector('[data-gac-manual-fleet-panel]')?.remove();
  const front=frontTopState();const fleets=enemyFleets();const assignments=fleetAssignments();
  const panel=document.createElement('section');panel.className=`gac-manual-fleet-panel ${front.unlocked?'is-unlocked':'is-locked'}`;panel.dataset.gacManualFleetPanel='true';
  panel.innerHTML=`<header><div><span>FLEET TERRITORY · CANONICAL OPERATIONS</span><strong>${front.unlocked?'FLEET LANE UNLOCKED':'FLEET LANE LOCKED'}</strong><small>${front.unlocked?`${fleets.length} verified enemy fleet${fleets.length===1?'':'s'} · ${assignments.filter((row)=>clean(row?.status).toLowerCase()==='win').length} cleared`:`Front Top ${front.wins}/${front.total} cleared. Clear every Front Top defense before fleet attacks are available.`}</small></div><b>${front.unlocked?'BOARD v2 LINKED':'FRONT TOP REQUIRED'}</b></header>${front.unlocked?fleets.length?`<div class="gac-manual-fleet-list">${fleets.map(fleetRowHtml).join('')}</div><footer>Fleet role identity, historical evidence, reservations, attempts, and cleanup remain canonical in the existing Fleet War Room services. These controls operate on the same records.</footer>`:`<div class="gac-manual-fleet-empty"><strong>NO VERIFIED ENEMY FLEETS ENTERED</strong><span>Use the canonical Fleet Territory editor to enter the fleet you actually see.</span><button type="button" data-gac-manual-fleet-planner-focus>OPEN FLEET TERRITORY</button></div>`:''}`;
  const route=host.querySelector('[data-gac-attack-order]');if(route)route.insertAdjacentElement('afterend',panel);else{const summary=host.querySelector('[data-gac-manual-war-summary]');if(summary)summary.insertAdjacentElement('afterend',panel);else host.prepend(panel);}
}
async function load(force=false){
  const ctx=identity();if(!ctx)return;
  if(!force&&state.key===ctx.key&&state.frontDefenses.length){render();return;}
  const requestId=++state.requestId;
  try{
    const [board,plan]=await Promise.all([fetchJson(`/api/gac/current-board/${ctx.mine}/defense?round=${ctx.round}`),fetchJson(`/api/gac/attack-plan/${ctx.mine}?round=${ctx.round}`)]);
    if(requestId!==state.requestId)return;if(allyCode(board?.opponent?.allyCode)!==ctx.opponent)return;
    state.key=ctx.key;state.frontDefenses=Array.isArray(board?.defenses)?board.defenses:[];state.attackAssignments=Array.isArray(plan?.assignments)?plan.assignments:[];render();
  }catch(error){if(requestId===state.requestId)console.warn('GAC manual fleet parity unavailable',error);}
}
function focusFleet(selector='[data-gac-fleet-round-operations]'){const node=document.querySelector(selector)||document.querySelector('[data-gac-board-v2]');node?.scrollIntoView?.({behavior:'smooth',block:'start'});}
function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}
function injectStyle(){if(document.querySelector('link[data-gac-manual-fleet-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-fleet-manual-parity.css?v=20260822-fleet1';link.dataset.gacManualFleetStyle='true';document.head.appendChild(link);}
function bind(){
  injectStyle();
  document.addEventListener('click',(event)=>{
    const planner=event.target.closest?.('[data-gac-manual-fleet-planner-focus]');if(planner){focusFleet();return;}
    const cleanup=event.target.closest?.('[data-gac-manual-fleet-cleanup-focus]');if(cleanup){focusFleet('[data-gac-fleet-cleanup-control]');return;}
    const lock=event.target.closest?.('[data-gac-manual-fleet-panel] [data-gac-fleet-lock]');if(lock)setTimeout(()=>focusFleet('.gac-fleet-role-editor'),0);
  },true);
  window.addEventListener('gac-fleet-round-state-updated',()=>{render();});window.addEventListener('gac-war-room-updated',()=>schedule(70,true));window.addEventListener('gac-visible-board-rendered',()=>schedule(70,true));window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));document.addEventListener('change',(event)=>{if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode],[data-gac-board-format]'))schedule(120,true);},true);document.addEventListener('DOMContentLoaded',()=>schedule(260,true),{once:true});schedule(500,true);
}
if(typeof document!=='undefined')bind();

export { assignmentFor, frontTopState, identity, render, statusLabel };
