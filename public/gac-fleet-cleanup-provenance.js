const clean=(value)=>String(value??'').trim();

function cleanupAssignments(){
  const rows=Array.isArray(window.__gacFleetCanonicalOperations?.assignments)
    ? window.__gacFleetCanonicalOperations.assignments
    : [];
  return rows.filter((row)=>clean(row?.sourceRef).includes('gac-command-center-fleet-cleanup-lock'));
}

function defenseIdFromRow(row){
  const text=clean(row?.textContent);
  const match=text.match(/Canonical defense\s+#(\d+)/i);
  return match?Number(match[1]):null;
}

function decorate(){
  const root=document.querySelector('[data-gac-fleet-round-operations]');
  if(!root)return;
  const byDefense=new Map(cleanupAssignments().map((assignment)=>[Number(assignment.defenseFleetId),assignment]));
  for(const row of root.querySelectorAll('.gac-fleet-canonical-plan-row')){
    const defenseId=defenseIdFromRow(row);
    const assignment=byDefense.get(defenseId);
    row.classList.toggle('is-cleanup-plan',Boolean(assignment));
    const marker=row.querySelector('[data-gac-cleanup-plan-marker]');
    if(!assignment){marker?.remove();continue;}
    const counterLabel=row.querySelector('.gac-fleet-plan-counter span');
    if(counterLabel)counterLabel.textContent='CLEANUP COUNTER · FULL-FLEET REFERENCE';
    const counterDetail=row.querySelector('.gac-fleet-plan-counter small');
    if(counterDetail && !counterDetail.dataset.cleanupTruth){
      counterDetail.dataset.cleanupTruth='true';
      counterDetail.insertAdjacentHTML('afterend','<small data-gac-cleanup-plan-marker class="gac-cleanup-plan-marker">Post-loss observation gated this replan. Historical evidence describes the original/full enemy fleet, not the residual state; no residual win probability is claimed.</small>');
    }else if(!row.querySelector('[data-gac-cleanup-plan-marker]')){
      row.querySelector('.gac-fleet-plan-counter')?.insertAdjacentHTML('beforeend','<small data-gac-cleanup-plan-marker class="gac-cleanup-plan-marker">Post-loss observation gated this replan. Historical evidence describes the original/full enemy fleet, not the residual state; no residual win probability is claimed.</small>');
    }
  }
}

function injectStyle(){
  if(document.querySelector('link[data-gac-fleet-cleanup-provenance-style]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/gac-fleet-cleanup-provenance.css?v=20260821-cleanup1';
  link.dataset.gacFleetCleanupProvenanceStyle='true';
  document.head.appendChild(link);
}
function schedule(){requestAnimationFrame(decorate);}

if(typeof document!=='undefined'){
  injectStyle();
  window.addEventListener('gac-fleet-round-state-updated',schedule);
  window.addEventListener('gac-fleet-canonical-updated',schedule);
  window.addEventListener('gac-fleet-plan-updated',schedule);
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
}

export { cleanupAssignments, defenseIdFromRow };
