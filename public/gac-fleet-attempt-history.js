import { boardSnapshot } from './gac-manual-board-workspace.js';
import { normalizeId } from './gac-fleet-war-room-model.js';

const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;

function unitIndex(snapshot = {}) {
  return new Map((Array.isArray(snapshot?.ownerRoster?.units) ? snapshot.ownerRoster.units : [])
    .map((unit)=>[normalizeId(unit),unit])
    .filter(([id])=>id));
}
function unitName(index,id) {
  const key=normalizeId(id);
  return clean(index.get(key)?.name || key || 'Unknown');
}
function dateLabel(value) {
  const raw=clean(value);
  if(!raw)return 'time not recorded';
  const date=new Date(raw);
  return Number.isNaN(date.getTime())?raw:date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function attemptRows(assignments = []) {
  const rows=[];
  for(const assignment of Array.isArray(assignments)?assignments:[]) {
    const attempts=Array.isArray(assignment?.attemptLog)?assignment.attemptLog:[];
    attempts.forEach((attempt,index)=>{
      const status=clean(attempt?.status).toLowerCase();
      if(!['win','loss'].includes(status))return;
      rows.push(Object.freeze({
        assignmentId:Number(assignment.id),
        attemptIndex:index,
        defenseFleetId:Number(assignment.defenseFleetId),
        defense:assignment.defense || null,
        status,
        banners:attempt?.banners==null?null:Number(attempt.banners),
        at:clean(attempt?.at),
        capitalShipBaseId:normalizeId(attempt?.capitalShipBaseId),
        starters:Object.freeze((Array.isArray(attempt?.starters)?attempt.starters:[]).map(normalizeId).filter(Boolean)),
        reinforcements:Object.freeze((Array.isArray(attempt?.reinforcements)?attempt.reinforcements:[]).map(normalizeId).filter(Boolean)),
      }));
    });
  }
  return Object.freeze(rows.sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.assignmentId-b.assignmentId||a.attemptIndex-b.attemptIndex));
}
function render(detail = window.__gacFleetCanonicalOperations || {}) {
  const host=document.querySelector('[data-gac-fleet-round-operations]');
  if(!host)return;
  host.querySelector('[data-gac-fleet-attempt-history]')?.remove();
  const rows=attemptRows(detail.assignments);
  if(!rows.length)return;
  const snapshot=boardSnapshot();
  const index=unitIndex(snapshot);
  const section=document.createElement('section');
  section.className='gac-fleet-attempt-history';
  section.dataset.gacFleetAttemptHistory='true';
  section.innerHTML=`<header><div><span>VERIFIED ATTEMPT LEDGER</span><strong>${rows.length} completed fleet attempt${rows.length===1?'':'s'}</strong><small>Every recorded Win/Loss remains available for explicit evidence archival. Replanning a lost fleet does not erase the prior attempt.</small></div><b>APPEND-ONLY HISTORY</b></header><div class="gac-fleet-attempt-history-list">${rows.map((row)=>{
    const enemyCapital=unitName(index,row.defense?.capitalShipBaseId);
    const attackCapital=unitName(index,row.capitalShipBaseId);
    const starters=row.starters.map((id)=>unitName(index,id)).join(' · ');
    const reinforcements=row.reinforcements.map((id)=>unitName(index,id)).join(' · ');
    return `<article class="is-${escapeAttr(row.status)}"><div class="gac-fleet-attempt-result"><b>${row.status.toUpperCase()}</b><span>${row.banners==null?'Banners not entered':`${row.banners} banners`}</span><small>${escapeHtml(dateLabel(row.at))}</small></div><div><span>ENEMY</span><strong>${escapeHtml(enemyCapital)}</strong><small>Fleet defense #${row.defenseFleetId}</small></div><div><span>ATTACK FLEET</span><strong>${escapeHtml(attackCapital)}</strong><small>Starters: ${escapeHtml(starters||'—')}${reinforcements?` · Reinforcements: ${escapeHtml(reinforcements)}`:''}</small></div><button type="button" data-gac-fleet-archive="${row.assignmentId}|${row.attemptIndex}">Verify / Archive Evidence</button></article>`;
  }).join('')}</div></section>`;
  host.append(section);
}
function schedule(detail) { requestAnimationFrame(()=>render(detail)); }

if(typeof document!=='undefined') {
  window.addEventListener('gac-fleet-round-state-updated',(event)=>schedule(event.detail));
  window.addEventListener('gac-fleet-evidence-archived',()=>schedule(window.__gacFleetCanonicalOperations));
  document.addEventListener('DOMContentLoaded',()=>schedule(window.__gacFleetCanonicalOperations),{once:true});
}

export { attemptRows, dateLabel };
