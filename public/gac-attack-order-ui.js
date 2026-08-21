import { buildOpenWarRoomPlan } from './gac-round-war-room.js';
import { attackOrder } from './gac-attack-order-model.js';

const FLEET_ID_OFFSET=1000000000;
const state={key:'',defenses:[],assignments:[],openPlan:[],mineRoster:null,opponentRoster:null,ownDefenses:[],requestId:0,timer:null};
const clean=(value)=>String(value??'').trim();
const allyCode=(value)=>clean(value).replace(/\D/g,'').slice(0,9);
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fleetRouteId=(value)=>FLEET_ID_OFFSET+Math.max(0,Number(value)||0);
const isFleetRouteId=(value)=>Number(value)>=FLEET_ID_OFFSET;

function identity(){
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode||window.__swgohPlayerRosterSnapshot?.allyCode);
  const opponent=allyCode(document.querySelector('[data-gacv2-opponent]')?.value||document.getElementById('gacOpponentCode')?.value);
  const round=Number(document.querySelector('[data-gacv2-round]')?.value||document.getElementById('gacBracketRound')?.value);
  const size=Number(document.querySelector('[data-gac-board-format]')?.value||document.querySelector('[data-gacv2-mode]')?.value||document.getElementById('gacMode')?.value)===3?3:5;
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,size,key:`${mine}|${opponent}|${round}|${size}`});
}

async function fetchJson(pathname){const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error||`HTTP ${response.status}`);return body;}
function fleetRouteRows(fleetBoard={},fleetPlan={}){
  const fleets=Array.isArray(fleetBoard?.fleets)?fleetBoard.fleets:[];const plans=Array.isArray(fleetPlan?.assignments)?fleetPlan.assignments:[];
  const defenses=fleets.filter((row)=>row?.complete!==false&&Number(row?.id)>0).map((row)=>({id:fleetRouteId(row.id),zone:'BACK-TOP',slot:Number(row?.slot),fleetDefenseId:Number(row.id),kind:'fleet'}));
  const assignments=plans.filter((row)=>Number(row?.defenseFleetId)>0).map((row)=>({...row,id:fleetRouteId(row?.id||row?.defenseFleetId),defenseId:fleetRouteId(row.defenseFleetId),planKind:'fleet'}));
  return Object.freeze({defenses:Object.freeze(defenses),assignments:Object.freeze(assignments)});
}
function actionLabel(entry){const status=clean(entry?.status).toLowerCase();const fleet=entry?.zone==='BACK-TOP';if(status==='attempted')return fleet?'RESOLVE FLEET ATTEMPT':'RESOLVE ATTEMPT';if(status==='loss'||entry?.planKind==='cleanup')return fleet?'FLEET CLEANUP PRIORITY':'CLEANUP PRIORITY';if(status==='planned')return fleet?'EXECUTE FLEET ATTACK':'EXECUTE LOCKED ATTACK';if(fleet)return'OPEN FLEET PLANNER';return entry?.hasCounter?'PLAN THIS ATTACK':'REVIEW THIS DEFENSE';}
function territoryHtml(states={}){const order=['FRONT-TOP','BACK-TOP','FRONT-BOTTOM','BACK-BOTTOM'];return order.map((zone)=>{const row=states?.[zone]||{};const locked=!row.unlocked;return `<span class="${locked?'is-locked':row.cleared?'is-cleared':'is-open'}"><b>${escapeHtml(row.label||zone)}</b><small>${Number(row.wins||0)}/${Number(row.total||0)} cleared${locked?' · LOCKED':''}</small></span>`;}).join('');}
function listHtml(order){return order.slice(0,6).map((entry,index)=>`<button type="button" data-gac-attack-order-focus="${entry.defenseId}" data-gac-attack-order-zone="${escapeHtml(entry.zone)}" class="${index===0?'is-next':''}"><b>${index===0?'NEXT':`#${index+1}`}</b><span>${escapeHtml(entry.zone)}${entry.slot==null?'':` · SLOT ${entry.slot+1}`}<small>${escapeHtml(entry.reason)}</small></span><strong>${escapeHtml(actionLabel(entry))}</strong></button>`).join('');}

function render(){
  const host=document.querySelector('[data-gac-board-workspace] .gac-visible-board');if(!host)return;
  host.querySelector('[data-gac-attack-order]')?.remove();
  for(const card of document.querySelectorAll('[data-gac-board-workspace] .gac-visible-defense'))card.classList.remove('gac-attack-order-next');
  document.querySelector('[data-gac-manual-fleet-panel]')?.classList.remove('gac-attack-order-next');
  const result=attackOrder({defenses:state.defenses,assignments:state.assignments,openPlan:state.openPlan});const next=result.next;
  if(next){if(isFleetRouteId(next.defenseId))document.querySelector('[data-gac-manual-fleet-panel]')?.classList.add('gac-attack-order-next');else document.querySelector(`[data-gac-board-workspace] .gac-visible-defense[data-defense-id="${next.defenseId}"]`)?.classList.add('gac-attack-order-next');}
  const panel=document.createElement('section');panel.className='gac-attack-order';panel.dataset.gacAttackOrder='true';
  panel.innerHTML=`<header><div><span>TACTICAL ROUTE · BOARD ORDER</span><strong>${next?escapeHtml(actionLabel(next)):'ROUND ROUTE COMPLETE'}</strong><small>${next?escapeHtml(next.reason):'No accessible uncleared verified defenses remain in the current board state.'}</small></div><b>${result.ordered.length} ACCESSIBLE · ${result.blocked.length} LOCKED</b></header><div class="gac-attack-order-territories">${territoryHtml(result.states)}</div>${result.ordered.length?`<div class="gac-attack-order-list">${listHtml(result.ordered)}</div>`:''}<footer>Operational priority only — not a fabricated win probability. Zone unlocks, squad and fleet plan state, cleanup state, and round-wide resource reservations drive this order.</footer>`;
  const summary=host.querySelector('[data-gac-manual-war-summary]');if(summary)summary.insertAdjacentElement('afterend',panel);else host.prepend(panel);
}

async function load(force=false){
  const ctx=identity();if(!ctx)return;if(!force&&state.key===ctx.key&&state.defenses.length&&state.mineRoster){render();return;}
  const requestId=++state.requestId;
  try{
    const [warRoom,mineRoster,opponentRoster,board,ownBoard,fleetBoard,fleetPlan]=await Promise.all([
      fetchJson(`/api/gac/attack-plan/${ctx.mine}?round=${ctx.round}`),fetchJson(`/api/player/${ctx.mine}`),fetchJson(`/api/player/${ctx.opponent}`),fetchJson(`/api/gac/current-board/${ctx.mine}/defense?round=${ctx.round}`),fetchJson(`/api/gac/current-board/${ctx.mine}/my-defense?round=${ctx.round}`),fetchJson(`/api/gac/current-fleet-board/${ctx.mine}/defense?round=${ctx.round}`).catch(()=>({fleets:[]})),fetchJson(`/api/gac/fleet-attack-plan/${ctx.mine}?round=${ctx.round}`).catch(()=>({assignments:[]})),
    ]);
    if(requestId!==state.requestId)return;if(allyCode(board?.opponent?.allyCode)!==ctx.opponent)throw new Error('Verified board opponent does not match selected opponent.');
    const squadDefenses=Array.isArray(board?.defenses)?board.defenses:[];const squadAssignments=Array.isArray(warRoom?.assignments)?warRoom.assignments:[];const ownDefenses=Array.isArray(ownBoard?.defenses)?ownBoard.defenses:[];const fleetRows=fleetRouteRows(fleetBoard,fleetPlan);
    let openPlan=[];try{const open=buildOpenWarRoomPlan(mineRoster,opponentRoster,squadDefenses.filter((row)=>clean(row?.zone).toUpperCase()!=='BACK-TOP'),ownDefenses,squadAssignments,{size:ctx.size});openPlan=Array.isArray(open?.assignments)?open.assignments:[];}catch{openPlan=[];}
    state.key=ctx.key;state.defenses=[...squadDefenses,...fleetRows.defenses];state.assignments=[...squadAssignments,...fleetRows.assignments];state.openPlan=openPlan;state.mineRoster=mineRoster;state.opponentRoster=opponentRoster;state.ownDefenses=ownDefenses;render();
  }catch(error){if(requestId===state.requestId)console.warn('GAC attack-order optimizer unavailable',error);}
}

function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}
function injectStyle(){if(document.querySelector('link[data-gac-attack-order-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-attack-order-ui.css?v=20260822-order2';link.dataset.gacAttackOrderStyle='true';document.head.appendChild(link);}
function bind(){injectStyle();document.addEventListener('click',(event)=>{const button=event.target.closest?.('[data-gac-attack-order-focus]');if(!button)return;const id=Number(button.dataset.gacAttackOrderFocus);if(isFleetRouteId(id)||clean(button.dataset.gacAttackOrderZone)==='BACK-TOP'){const fleet=document.querySelector('[data-gac-manual-fleet-panel]')||document.querySelector('[data-gac-fleet-round-operations]');fleet?.scrollIntoView?.({behavior:'smooth',block:'center'});fleet?.classList.add('gac-attack-order-pulse');setTimeout(()=>fleet?.classList.remove('gac-attack-order-pulse'),1200);return;}const card=document.querySelector(`[data-gac-board-workspace] .gac-visible-defense[data-defense-id="${id}"]`);card?.scrollIntoView?.({behavior:'smooth',block:'center'});card?.classList.add('gac-attack-order-pulse');setTimeout(()=>card?.classList.remove('gac-attack-order-pulse'),1200);},true);document.addEventListener('change',(event)=>{if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode],[data-gac-board-format]'))schedule(120,true);},true);window.addEventListener('gac-visible-board-rendered',()=>schedule(60,true));window.addEventListener('gac-war-room-updated',()=>schedule(80,true));window.addEventListener('gac-fleet-round-state-updated',()=>schedule(70,true));window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));document.addEventListener('DOMContentLoaded',()=>schedule(240,true),{once:true});schedule(450,true);}
if(typeof document!=='undefined')bind();

export { actionLabel, fleetRouteId, fleetRouteRows, identity, isFleetRouteId, render };
