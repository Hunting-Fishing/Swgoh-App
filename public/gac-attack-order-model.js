import { TERRITORIES } from './gac-league-board-rules.js';

const clean=(value)=>String(value??'').trim();
const zoneKey=(value)=>clean(value).toUpperCase();
const statusKey=(value)=>clean(value).toLowerCase();
const asArray=(value)=>Array.isArray(value)?value:[];

function assignmentIndex(assignments=[]){return new Map(asArray(assignments).map((row)=>[Number(row?.defenseId),row]).filter(([id])=>Number.isInteger(id)&&id>0));}
function planIndex(openPlan=[]){return new Map(asArray(openPlan).map((row)=>[Number(row?.defenseId),row]).filter(([id])=>Number.isInteger(id)&&id>0));}
function territoryMeta(zone){return TERRITORIES.find((row)=>row.value===zoneKey(zone))||null;}

function territoryStates(defenses=[],assignments=[]){
  const byAssignment=assignmentIndex(assignments);
  const zones=new Map(TERRITORIES.map((territory)=>[territory.value,{zone:territory.value,label:territory.label,kind:territory.kind,unlockFrom:territory.unlockFrom||'',unlocks:territory.unlocks||'',total:0,wins:0,open:0}]));
  for(const defense of asArray(defenses)){
    const zone=zoneKey(defense?.zone);const current=zones.get(zone);if(!current)continue;
    current.total+=1;
    const status=statusKey(byAssignment.get(Number(defense?.id))?.status);
    if(status==='win')current.wins+=1;else current.open+=1;
  }
  for(const current of zones.values()){
    if(!current.unlockFrom)current.unlocked=true;
    else{
      const front=zones.get(current.unlockFrom);
      current.unlocked=Boolean(front&&front.total>0&&front.wins===front.total);
    }
    current.cleared=current.total>0&&current.wins===current.total;
  }
  return Object.freeze(Object.fromEntries([...zones.entries()].map(([key,value])=>[key,Object.freeze({...value})])));
}

function downstreamValue(zone,states){
  const meta=territoryMeta(zone);if(!meta?.unlocks)return 0;
  const downstream=states?.[meta.unlocks];
  return Math.max(0,Number(downstream?.open||downstream?.total||0));
}

function operationalScore({defense,assignment,plan,states}){
  const zone=zoneKey(defense?.zone);const territory=states?.[zone];if(!territory?.unlocked)return -100000;
  const status=statusKey(assignment?.status);if(status==='win')return -100000;
  let score=0;
  if(status==='attempted')score+=9000;
  else if(status==='planned')score+=5000;
  else if(status==='loss')score+=4200;
  else if(status==='abandoned'&&asArray(assignment?.attemptLog).some((row)=>statusKey(row?.status)==='loss'))score+=4100;
  else score+=2500;

  const meta=territoryMeta(zone);
  if(meta?.unlocks){
    const downstream=downstreamValue(zone,states);
    score+=1200+downstream*180;
    if(Number(territory.open)===1)score+=1500;
  }

  if(clean(assignment?.planKind).toLowerCase()==='cleanup')score+=500;
  if(status==='loss')score+=350;
  if(plan?.recommendation?.squad?.length)score+=250;
  if(plan?.source==='historical-counter-evidence')score+=120;
  const allocation=Number(plan?.allocationScore);if(Number.isFinite(allocation))score+=Math.max(-200,Math.min(300,allocation/20));
  const alternatives=Number(plan?.alternativesRemaining);if(Number.isFinite(alternatives)&&alternatives<=1)score+=90;
  score-=Math.max(0,Number(defense?.slot)||0)*2;
  return score;
}

function reasonFor({defense,assignment,plan,states}){
  const zone=zoneKey(defense?.zone);const territory=states?.[zone]||{};const status=statusKey(assignment?.status);const meta=territoryMeta(zone);
  if(!territory.unlocked)return `${meta?.label||zone} is locked until ${meta?.unlockFrom||'its front territory'} is cleared.`;
  if(status==='attempted')return 'An attempt is already in progress here; resolve its result before spending another attack.';
  if(status==='loss'||(status==='abandoned'&&asArray(assignment?.attemptLog).some((row)=>statusKey(row?.status)==='loss')))return 'A failed attempt exists here; use confirmed-survivor cleanup intelligence before moving on.';
  if(meta?.unlocks&&Number(territory.open)===1)return `Clearing this last ${meta.label} defense unlocks ${territoryMeta(meta.unlocks)?.label||meta.unlocks}.`;
  if(meta?.unlocks)return `Progress here advances the lane toward unlocking ${territoryMeta(meta.unlocks)?.label||meta.unlocks}.`;
  if(status==='planned')return 'Counter is already locked and reserved, so this attack is execution-ready once the checklist passes.';
  if(plan?.recommendation?.squad?.length)return 'A legal non-overlapping counter is available from the current whole-board plan.';
  return 'Accessible defense, but no current legal counter is locked.';
}

function attackOrder({defenses=[],assignments=[],openPlan=[]}={}){
  const states=territoryStates(defenses,assignments);const byAssignment=assignmentIndex(assignments);const byPlan=planIndex(openPlan);
  const blocked=[];const candidates=[];
  for(const defense of asArray(defenses)){
    const defenseId=Number(defense?.id);if(!Number.isInteger(defenseId)||defenseId<=0)continue;
    const assignment=byAssignment.get(defenseId)||null;const status=statusKey(assignment?.status);if(status==='win')continue;
    const plan=byPlan.get(defenseId)||null;const zone=zoneKey(defense?.zone);const unlocked=Boolean(states?.[zone]?.unlocked);
    const entry=Object.freeze({defenseId,zone,slot:Number.isInteger(Number(defense?.slot))?Number(defense.slot):null,status:status||'unplanned',planKind:clean(assignment?.planKind).toLowerCase()||'standard',score:operationalScore({defense,assignment,plan,states}),reason:reasonFor({defense,assignment,plan,states}),hasCounter:Boolean(plan?.recommendation?.squad?.length),assignmentId:Number(assignment?.id)||null,unlocked});
    if(unlocked)candidates.push(entry);else blocked.push(entry);
  }
  candidates.sort((a,b)=>b.score-a.score||a.zone.localeCompare(b.zone)||(a.slot??999)-(b.slot??999)||a.defenseId-b.defenseId);
  blocked.sort((a,b)=>a.zone.localeCompare(b.zone)||(a.slot??999)-(b.slot??999));
  return Object.freeze({states,ordered:Object.freeze(candidates),blocked:Object.freeze(blocked),next:candidates[0]||null});
}

export { attackOrder, assignmentIndex, downstreamValue, operationalScore, planIndex, reasonFor, territoryStates };
