import { buildOpenWarRoomPlan } from './gac-round-war-room.js';
import { attackOrder } from './gac-attack-order-model.js';

const state={key:'',defenses:[],assignments:[],openPlan:[],mineRoster:null,opponentRoster:null,ownDefenses:[],requestId:0,timer:null};
const clean=(value)=>String(value??'').trim();
const allyCode=(value)=>clean(value).replace(/\D/g,'').slice(0,9);
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity(){
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode||window.__swgohPlayerRosterSnapshot?.allyCode);
  const opponent=allyCode(document.querySelector('[data-gacv2-opponent]')?.value||document.getElementById('gacOpponentCode')?.value);
  const round=Number(document.querySelector('[data-gacv2-round]')?.value||document.getElementById('gacBracketRound')?.value);
  const size=Number(document.querySelector('[data-gac-board-format]')?.value||document.querySelector('[data-gacv2-mode]')?.value||document.getElementById('gacMode')?.value)===3?3:5;
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,size,key:`${mine}|${opponent}|${round}|${size}`});
}

async function fetchJson(pathname){const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error||`HTTP ${response.status}`);return body;}

function actionLabel(entry){const status=clean(entry?.status).toLowerCase();if(status==='attempted')return 'RESOLVE ATTEMPT';if(status==='loss'||entry?.planKind==='cleanup')return 'CLEANUP PRIORITY';if(status==='planned')return 'EXECUTE LOCKED ATTACK';return entry?.hasCounter?'PLAN THIS ATTACK':'REVIEW THIS DEFENSE';}
function territoryHtml(states={}){const order=['FRONT-TOP','BACK-TOP','FRONT-BOTTOM','BACK-BOTTOM'];return order.map((zone)=>{const row=states?.[zone]||{};const locked=!row.unlocked;return `<span class="${locked?'is-locked':row.cleared?'is-cleared':'is-open'}"><b>${escapeHtml(row.label||zone)}</b><small>${Number(row.wins||0)}/${Number(row.total||0)} cleared${locked?' · LOCKED':''}</small></span>`;}).join('');}
function listHtml(order){return order.slice(0,6).map((entry,index)=>`<button type="button" data-gac-attack-order-focus="${entry.defenseId}" class="${index===0?'is-next':''}"><b>${index===0?'NEXT':`#${index+1}`}</b><span>${escapeHtml(entry.zone)}${entry.slot==null?'':` · SLOT ${entry.slot+1}`}<small>${escapeHtml(entry.reason)}</small></span><strong>${escapeHtml(actionLabel(entry))}</strong></button>`).join('');}

function render(){
  const host=document.querySelector('[data-gac-board-workspace] .gac-visible-board');if(!host)return;
  host.querySelector('[data-gac-attack-order]')?.remove();
  for(const card of document.querySelectorAll('[data-gac-board-workspace] .gac-visible-defense'))card.classList.remove('gac-attack-order-next');
  const result=attackOrder({defenses:state.defenses,assignments:state.assignments,openPlan:state.openPlan});
  const next=result.next;
  if(next){document.querySelector(`[data-gac-board-workspace] .gac-visible-defense[data-defense-id="${next.defenseId}"]`)?.classList.add('gac-attack-order-next');}
  const panel=document.createElement('section');panel.className='gac-attack-order';panel.dataset.gacAttackOrder='true';
  panel.innerHTML=`<header><div><span>TACTICAL ROUTE · BOARD ORDER</span><strong>${next?escapeHtml(actionLabel(next)):'ROUND ROUTE COMPLETE'}</strong><small>${next?escapeHtml(next.reason):'No accessible uncleared verified defenses remain in the current board state.'}</small></div><b>${result.ordered.length} ACCESSIBLE · ${result.blocked.length} LOCKED</b></header><div class="gac-attack-order-territories">${territoryHtml(result.states)}</div>${result.ordered.length?`<div class="gac-attack-order-list">${listHtml(result.ordered)}</div>`:''}<footer>Operational priority only — not a fabricated win probability. Zone unlocks, current plan state, cleanup state, and whole-board resource reservations drive this order.</footer>`;
  const summary=host.querySelector('[data-gac-manual-war-summary]');if(summary)summary.insertAdjacentElement('afterend',panel);else host.prepend(panel);
}

async function load(force=false){
  const ctx=identity();if(!ctx)return;
  if(!force&&state.key===ctx.key&&state.defenses.length&&state.mineRoster){render();return;}
  const requestId=++state.requestId;
  try{
    const [warRoom,mineRoster,opponentRoster,board,ownBoard]=await Promise.all([fetchJson(`/api/gac/attack-plan/${ctx.mine}?round=${ctx.round}`),fetchJson(`/api/player/${ctx.mine}`),fetchJson(`/api/player/${ctx.opponent}`),fetchJson(`/api/gac/current-board/${ctx.mine}/defense?round=${ctx.round}`),fetchJson(`/api/gac/current-board/${ctx.mine}/my-defense?round=${ctx.round}`)]);
    if(requestId!==state.requestId)return;
    if(allyCode(board?.opponent?.allyCode)!==ctx.opponent)throw new Error('Verified board opponent does not match selected opponent.');
    const defenses=Array.isArray(board?.defenses)?board.defenses:[];const assignments=Array.isArray(warRoom?.assignments)?warRoom.assignments:[];const ownDefenses=Array.isArray(ownBoard?.defenses)?ownBoard.defenses:[];
    let openPlan=[];
    try{const squadDefenses=defenses.filter((row)=>clean(row?.zone).toUpperCase()!=='BACK-TOP');const open=buildOpenWarRoomPlan(mineRoster,opponentRoster,squadDefenses,ownDefenses,assignments,{size:ctx.size});openPlan=Array.isArray(open?.assignments)?open.assignments:[];}catch{openPlan=[];}
    state.key=ctx.key;state.defenses=defenses;state.assignments=assignments;state.openPlan=openPlan;state.mineRoster=mineRoster;state.opponentRoster=opponentRoster;state.ownDefenses=ownDefenses;render();
  }catch(error){if(requestId===state.requestId)console.warn('GAC attack-order optimizer unavailable',error);}
}

function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}
function injectStyle(){if(document.querySelector('link[data-gac-attack-order-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-attack-order-ui.css?v=20260822-order1';link.dataset.gacAttackOrderStyle='true';document.head.appendChild(link);}
function bind(){injectStyle();document.addEventListener('click',(event)=>{const button=event.target.closest?.('[data-gac-attack-order-focus]');if(!button)return;const id=Number(button.dataset.gacAttackOrderFocus);const card=document.querySelector(`[data-gac-board-workspace] .gac-visible-defense[data-defense-id="${id}"]`);card?.scrollIntoView?.({behavior:'smooth',block:'center'});card?.classList.add('gac-attack-order-pulse');setTimeout(()=>card?.classList.remove('gac-attack-order-pulse'),1200);},true);document.addEventListener('change',(event)=>{if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode],[data-gac-board-format]'))schedule(120,true);},true);window.addEventListener('gac-visible-board-rendered',()=>schedule(60,true));window.addEventListener('gac-war-room-updated',()=>schedule(80,true));window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));document.addEventListener('DOMContentLoaded',()=>schedule(240,true),{once:true});schedule(450,true);}
if(typeof document!=='undefined')bind();

export { actionLabel, identity, render };
