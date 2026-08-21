const state={scheduled:false};

function adaptManualExecutionControls(root=document){
  let changed=0;
  for(const button of root.querySelectorAll?.('[data-gac-board-workspace] [data-gac-manual-war-action="preflight"]')||[]){
    button.dataset.warAction='attempt';
    delete button.dataset.gacManualWarAction;
    changed+=1;
  }
  for(const button of root.querySelectorAll?.('[data-gac-board-workspace] [data-gac-manual-war-action="result"]')||[]){
    button.dataset.gacDirectResult='true';
    delete button.dataset.gacManualWarAction;
    changed+=1;
  }
  return changed;
}

function run(){state.scheduled=false;adaptManualExecutionControls(document);}
function schedule(){if(state.scheduled)return;state.scheduled=true;queueMicrotask(run);}

function bind(){
  schedule();
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('gac-visible-board-rendered',schedule);
  window.addEventListener('gac-war-room-updated',schedule);
  window.addEventListener('gac-board-evidence-updated',schedule);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
}

if(typeof document!=='undefined')bind();

export { adaptManualExecutionControls };
