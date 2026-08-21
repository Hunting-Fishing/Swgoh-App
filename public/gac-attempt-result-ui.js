import './gac-cleanup-intelligence-ui.js';
import { latestPostAttempt, resultDraft, resultTruthLabel } from './gac-attempt-result-model.js';

const state = {
  key:'',
  assignments:[],
  defenses:[],
  opponentRoster:null,
  drafts:new Map(),
  errors:new Map(),
  busy:new Set(),
  requestId:0,
  timer:null,
};

const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g,'').slice(0,9);
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity() {
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode);
  const opponent=allyCode(document.getElementById('gacOpponentCode')?.value||document.querySelector('[data-gacv2-opponent]')?.value);
  const round=Number(document.getElementById('gacBracketRound')?.value||document.querySelector('[data-gacv2-round]')?.value);
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,key:`${mine}|${opponent}|${round}`});
}

async function fetchJson(pathname,options={}) {
  const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body?.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
  return body;
}

function assignmentForDefense(defenseId){return state.assignments.find((row)=>Number(row?.defenseId)===Number(defenseId))||null;}
function defenseForId(defenseId){return state.defenses.find((row)=>Number(row?.id)===Number(defenseId))||null;}
function resultDefenseMembers(assignment={},defense={}){
  if(clean(assignment?.planKind).toLowerCase()==='cleanup')return (Array.isArray(assignment?.cleanup?.survivorBaseIds)?assignment.cleanup.survivorBaseIds:[]).map(normalizeId).filter(Boolean);
  return (Array.isArray(defense?.members)?defense.members:[]).map(normalizeId).filter(Boolean);
}
function unitIndex(){return new Map((Array.isArray(state.opponentRoster?.units)?state.opponentRoster.units:[]).map((unit)=>[normalizeId(unit?.baseId),unit]).filter(([id])=>id));}
function unitLabel(id){const unit=unitIndex().get(normalizeId(id));return clean(unit?.name)||normalizeId(id)||'Unknown defender';}
function unitImage(id){const unit=unitIndex().get(normalizeId(id));return clean(unit?.image||unit?.imageUrl||unit?.portrait||unit?.portraitUrl);}
function portraitChoice(id,checked=false){const name=unitLabel(id),image=unitImage(id);return `<label class="gac-result-survivor"><input type="checkbox" data-gac-result-survivor="${escapeHtml(normalizeId(id))}" ${checked?'checked':''}><span>${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:`<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<strong>${escapeHtml(name)}</strong></span></label>`;}

function initialDraft(assignment,status){
  const id=Number(assignment?.id);
  const existing=state.drafts.get(id);
  if(existing&&existing.status===status)return existing;
  const draft={status,banners:'',lossState:'unknown',survivors:new Set()};
  state.drafts.set(id,draft);
  return draft;
}

function historyHtml(assignment){
  const post=latestPostAttempt(assignment);
  if(!post)return '';
  const label=resultTruthLabel(post);
  const banners=post.banners==null?'BANNERS NOT CONFIRMED':`${post.banners} BANNERS`;
  const survivors=post.defenseState==='survivors-confirmed'
    ? `<div class="gac-result-history-survivors">${post.survivorBaseIds.map((id)=>`<span>${escapeHtml(unitLabel(id))}</span>`).join('')}</div>`:'';
  return `<section class="gac-result-history is-${escapeHtml(label.code)}" data-gac-result-history><header><span>ATTEMPT RESULT TRUTH</span><strong>${escapeHtml(label.title)}</strong><b>${escapeHtml(banners)}</b></header><p>${escapeHtml(label.detail)}</p>${survivors}<small>TM / HEALTH / PROTECTION: NOT CAPTURED · no post-battle percentages are inferred.</small></section>`;
}

function resultEditorHtml(assignment,defense,draft){
  const id=Number(assignment?.id);const error=clean(state.errors.get(id));const busy=state.busy.has(id);const availableDefenders=resultDefenseMembers(assignment,defense);
  const model=resultDraft(draft.status,{banners:draft.banners,lossState:draft.lossState,survivorBaseIds:[...draft.survivors],defenseMembers:availableDefenders});
  const isLoss=draft.status==='loss';
  const survivorMode=isLoss&&draft.lossState==='survivors-confirmed';
  const cleanup=clean(assignment?.planKind).toLowerCase()==='cleanup';
  return `<section class="gac-result-capture is-${escapeHtml(draft.status)}" data-gac-result-capture="${id}">
    <header><div><span>ATTEMPT RESULT · B09${cleanup?' · CLEANUP':''}</span><strong>${draft.status==='win'?'CAPTURE WIN RESULT':'CAPTURE LOSS RESULT'}</strong><small>Record only what you confirmed from the game.</small></div><button type="button" data-gac-result-close>Close</button></header>
    <div class="gac-result-outcome"><strong>${draft.status.toUpperCase()}</strong><span>${draft.status==='win'?'Defense will be recorded as cleared.':'Choose whether you inspected the surviving defense.'}</span></div>
    <label class="gac-result-banners"><span>BANNERS</span><input type="number" min="0" step="1" inputmode="numeric" data-gac-result-banners value="${escapeHtml(draft.banners)}" placeholder="Leave blank if not checked"><small>Blank stays unknown; it is never converted to 0.</small></label>
    ${isLoss?`<div class="gac-result-loss-state"><span>POST-ATTEMPT DEFENSE STATE</span><label><input type="radio" name="gac-result-loss-${id}" value="unknown" data-gac-result-loss-state ${draft.lossState!=='survivors-confirmed'?'checked':''}><b>Survivor state not checked</b><small>Store the loss only. Defender state remains unknown.</small></label><label><input type="radio" name="gac-result-loss-${id}" value="survivors-confirmed" data-gac-result-loss-state ${survivorMode?'checked':''}><b>Confirm survivors from game</b><small>${cleanup?'Select only defenders that were alive at the start of this cleanup and are still visible now.':'Select only defenders you can still see after the failed attempt.'}</small></label></div>`:''}
    ${survivorMode?`<div class="gac-result-survivors"><span>CONFIRMED SURVIVING DEFENDERS</span><div>${availableDefenders.map((id)=>portraitChoice(id,draft.survivors.has(normalizeId(id)))).join('')}</div></div>`:''}
    <div class="gac-result-unknown-boundary"><strong>NOT CAPTURED</strong><span>Turn Meter, Health, Protection, cooldowns, and other hidden/post-battle percentages remain UNKNOWN. B09 does not estimate them.</span></div>
    ${error||!model.valid?`<div class="gac-result-error"><strong>RESULT NOT READY</strong><span>${escapeHtml(error||model.error)}</span></div>`:''}
    <footer><button type="button" data-gac-result-submit ${model.valid&&!busy?'':'disabled'}>${busy?'SAVING…':draft.status==='win'?'SAVE CONFIRMED WIN':'SAVE CONFIRMED LOSS'}</button></footer>
  </section>`;
}

function renderCard(card){
  card.querySelectorAll('[data-gac-result-capture],[data-gac-result-history]').forEach((node)=>node.remove());
  const defenseId=Number(card?.dataset?.defenseId);const assignment=assignmentForDefense(defenseId);if(!assignment)return;
  const defense=defenseForId(defenseId)||assignment?.defense||null;
  const war=card.querySelector('.gac-war-room')||card;
  const history=historyHtml(assignment);if(history)war.insertAdjacentHTML('afterend',history);
  const draft=state.drafts.get(Number(assignment.id));if(!draft||clean(assignment.status).toLowerCase()!=='attempted')return;
  const anchor=card.querySelector('[data-gac-result-history]')||war;anchor.insertAdjacentHTML('afterend',resultEditorHtml(assignment,defense,draft));
}
function renderAll(){for(const card of document.querySelectorAll('#gacBoardPlannerGrid .gac-saved-board-card'))renderCard(card);}

async function load(force=false){
  const current=identity();if(!current)return;
  if(!force&&state.key===current.key&&state.assignments.length){renderAll();return;}
  const requestId=++state.requestId;
  try{
    const [warRoom,board,opponentRoster]=await Promise.all([
      fetchJson(`/api/gac/attack-plan/${current.mine}?round=${current.round}`),
      fetchJson(`/api/gac/current-board/${current.mine}/defense?round=${current.round}`),
      fetchJson(`/api/player/${current.opponent}`).catch(()=>null),
    ]);
    if(requestId!==state.requestId)return;
    if(allyCode(board?.opponent?.allyCode)!==current.opponent)throw new Error('Verified board opponent does not match selected opponent.');
    if(state.key!==current.key){state.drafts.clear();state.errors.clear();state.busy.clear();}
    state.key=current.key;state.assignments=Array.isArray(warRoom?.assignments)?warRoom.assignments:[];state.defenses=Array.isArray(board?.defenses)?board.defenses:[];state.opponentRoster=opponentRoster;
    for(const [id] of state.drafts){const assignment=state.assignments.find((row)=>Number(row?.id)===Number(id));if(!assignment||clean(assignment.status).toLowerCase()!=='attempted')state.drafts.delete(id);}
    renderAll();
  }catch(error){if(requestId===state.requestId)console.warn('GAC B09 result capture unavailable',error);}
}

async function submitResult(card){
  const current=identity();const defenseId=Number(card?.dataset?.defenseId);const assignment=assignmentForDefense(defenseId);if(!current||!assignment?.id||clean(assignment.status).toLowerCase()!=='attempted')return;
  const id=Number(assignment.id);if(state.busy.has(id))return;
  const defense=defenseForId(defenseId)||assignment?.defense||{};const draft=state.drafts.get(id);if(!draft)return;const availableDefenders=resultDefenseMembers(assignment,defense);
  const model=resultDraft(draft.status,{banners:draft.banners,lossState:draft.lossState,survivorBaseIds:[...draft.survivors],defenseMembers:availableDefenders});
  if(!model.valid){state.errors.set(id,model.error);renderCard(card);return;}
  state.busy.add(id);state.errors.delete(id);renderCard(card);
  try{
    await fetchJson(`/api/gac/attack-plan/${current.mine}`,{method:'PATCH',body:JSON.stringify({id,status:model.status,banners:model.banners,round:current.round,postAttempt:model.postAttempt})});
    state.drafts.delete(id);window.dispatchEvent(new CustomEvent('gac-war-room-updated',{detail:{action:'attempt-result-recorded',assignmentId:id,defenseId,status:model.status}}));await load(true);
  }catch(error){state.errors.set(id,clean(error?.message||error));}
  finally{state.busy.delete(id);renderAll();}
}

function openResult(card,status){
  const assignment=assignmentForDefense(Number(card?.dataset?.defenseId));if(!assignment?.id||clean(assignment.status).toLowerCase()!=='attempted'){void load(true);return;}
  initialDraft(assignment,status);state.errors.delete(Number(assignment.id));renderCard(card);
  card.querySelector('[data-gac-result-capture]')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function closeResult(card){const assignment=assignmentForDefense(Number(card?.dataset?.defenseId));if(assignment?.id){state.drafts.delete(Number(assignment.id));state.errors.delete(Number(assignment.id));}renderCard(card);}

function injectStyle(){if(document.querySelector('link[data-gac-result-capture-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-attempt-result-ui.css?v=20260821-b09a';link.dataset.gacResultCaptureStyle='true';document.head.appendChild(link);}
function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}

function bind(){
  injectStyle();
  document.addEventListener('click',(event)=>{
    const legacy=event.target.closest?.('#gacBoardPlannerGrid [data-war-action="win"],#gacBoardPlannerGrid [data-war-action="loss"]');
    if(legacy){event.preventDefault();event.stopImmediatePropagation();const card=legacy.closest('.gac-saved-board-card');if(card)openResult(card,clean(legacy.dataset.warAction).toLowerCase());return;}
    const close=event.target.closest?.('[data-gac-result-close]');if(close){const card=close.closest('.gac-saved-board-card');if(card)closeResult(card);return;}
    const submit=event.target.closest?.('[data-gac-result-submit]');if(submit){const card=submit.closest('.gac-saved-board-card');if(card)void submitResult(card);return;}
  },true);
  document.addEventListener('input',(event)=>{
    const panel=event.target?.closest?.('[data-gac-result-capture]');if(!panel)return;const id=Number(panel.dataset.gacResultCapture);const draft=state.drafts.get(id);if(!draft)return;
    if(event.target.matches('[data-gac-result-banners]')){draft.banners=event.target.value;return;}
    if(event.target.matches('[data-gac-result-survivor]')){const baseId=normalizeId(event.target.dataset.gacResultSurvivor);if(event.target.checked)draft.survivors.add(baseId);else draft.survivors.delete(baseId);const card=panel.closest('.gac-saved-board-card');if(card)renderCard(card);}
  },true);
  document.addEventListener('change',(event)=>{
    const loss=event.target?.closest?.('[data-gac-result-loss-state]');if(loss){const panel=loss.closest('[data-gac-result-capture]');const id=Number(panel?.dataset?.gacResultCapture);const draft=state.drafts.get(id);if(draft){draft.lossState=loss.value==='survivors-confirmed'?'survivors-confirmed':'unknown';if(draft.lossState==='unknown')draft.survivors.clear();const card=panel.closest('.gac-saved-board-card');if(card)renderCard(card);}return;}
    if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode]'))schedule(120,true);
  },true);
  window.addEventListener('gac-saved-board-rendered',()=>schedule(60,true));window.addEventListener('gac-war-room-updated',()=>schedule(90,true));window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));document.addEventListener('DOMContentLoaded',()=>schedule(200,true),{once:true});schedule(400,true);
}
if(typeof document!=='undefined')bind();

export { identity, openResult, renderAll, resultDefenseMembers, submitResult };