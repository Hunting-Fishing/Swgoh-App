import { rankRosterFitSquads } from './gac-counter-engine.js';
import { consumedAndReservedIds, normalizeId, uniqueIds } from './gac-cleanup-intelligence-model.js';

const clean=(value)=>String(value??'').trim();
const asArray=(value)=>Array.isArray(value)?value:[];

function rosterIndex(roster={}){
  return new Map(asArray(roster?.units).filter((unit)=>clean(unit?.unitType).toLowerCase()!=='ship').map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));
}
function cleanupResidualTruth(assignment={},defense={},opponentRoster={}){
  if(clean(assignment?.planKind).toLowerCase()!=='cleanup')return Object.freeze({ready:false,code:'not-cleanup-plan',survivorBaseIds:Object.freeze([]),survivorUnits:Object.freeze([]),attemptIndex:null});
  const survivors=uniqueIds(assignment?.cleanup?.survivorBaseIds);
  const defenseIds=uniqueIds(defense?.members||assignment?.defense?.members);
  if(!survivors.length)return Object.freeze({ready:false,code:'cleanup-survivors-missing',survivorBaseIds:Object.freeze([]),survivorUnits:Object.freeze([]),attemptIndex:null});
  const invalid=survivors.filter((id)=>!defenseIds.includes(id));
  if(invalid.length)return Object.freeze({ready:false,code:'cleanup-survivor-mismatch',survivorBaseIds:Object.freeze(survivors),survivorUnits:Object.freeze([]),attemptIndex:assignment?.cleanup?.attemptIndex??null});
  const index=rosterIndex(opponentRoster);const unresolved=survivors.filter((id)=>!index.has(id));
  if(unresolved.length)return Object.freeze({ready:false,code:'cleanup-survivor-unresolved',survivorBaseIds:Object.freeze(survivors),survivorUnits:Object.freeze([]),attemptIndex:assignment?.cleanup?.attemptIndex??null});
  return Object.freeze({ready:true,code:'cleanup-survivors-confirmed',survivorBaseIds:Object.freeze(survivors),survivorUnits:Object.freeze(survivors.map((id)=>index.get(id))),attemptIndex:Number.isInteger(Number(assignment?.cleanup?.attemptIndex))?Number(assignment.cleanup.attemptIndex):null});
}
function currentAttackUnits(assignment={},ownerRoster={}){
  const index=rosterIndex(ownerRoster);const ids=uniqueIds(assignment?.members);const unresolved=ids.filter((id)=>!index.has(id));
  return Object.freeze({ids:Object.freeze(ids),units:Object.freeze(ids.map((id)=>index.get(id)).filter(Boolean)),unresolved:Object.freeze(unresolved)});
}
function assignmentsAfterRelease(assignments=[],currentAssignmentId=null){
  return asArray(assignments).map((row)=>Number(row?.id)===Number(currentAssignmentId)?{...row,status:'abandoned',members:[]}:row);
}
function recoveryAlternatives({ownerRoster={},survivorUnits=[],assignments=[],ownDefenses=[],currentAssignmentId=null,size=5,limit=3,currentMembers=[]}={}){
  const releasedAssignments=assignmentsAfterRelease(assignments,currentAssignmentId);
  const excluded=consumedAndReservedIds(releasedAssignments,ownDefenses);
  const requestedSize=Number(size)===3?3:5;const currentKey=uniqueIds(currentMembers).slice().sort().join('|');
  return Object.freeze(rankRosterFitSquads(ownerRoster,survivorUnits,{size:requestedSize,excludeBaseIds:excluded})
    .filter((candidate)=>asArray(candidate?.squad).length===requestedSize)
    .filter((candidate)=>candidate.squad.every((unit)=>!excluded.includes(normalizeId(unit))))
    .filter((candidate)=>candidate.squad.map((unit)=>normalizeId(unit)).sort().join('|')!==currentKey)
    .slice(0,Math.max(0,Math.min(5,Number(limit)||3)))
    .map((candidate,index)=>Object.freeze({...candidate,recoveryRank:index+1,source:'cleanup-recovery-roster-fit',prediction:false,postBattleTelemetryKnown:false})));
}
function cleanupAttackBrief({assignment={},defense={},ownerRoster={},opponentRoster={},assignments=[],ownDefenses=[],size=5,strategyMatch=null}={}){
  const residual=cleanupResidualTruth(assignment,defense,opponentRoster);
  if(!residual.ready)return Object.freeze({ready:false,code:residual.code,residual,attack:null,alternatives:Object.freeze([]),execution:Object.freeze({available:false,label:'NO SOURCED CLEANUP SEQUENCE',reason:'Residual cleanup identity is not fully verified.'})});
  const attack=currentAttackUnits(assignment,ownerRoster);
  const expected=Number(size)===3?3:5;
  const attackReady=attack.ids.length===expected&&!attack.unresolved.length&&attack.ids.includes(normalizeId(assignment?.leaderBaseId));
  const alternatives=recoveryAlternatives({ownerRoster,survivorUnits:residual.survivorUnits,assignments,ownDefenses,currentAssignmentId:assignment?.id,size:expected,limit:3,currentMembers:attack.ids});
  const sourced=Boolean(strategyMatch?.matched&&strategyMatch?.guidance);
  return Object.freeze({
    ready:attackReady,
    code:attackReady?'cleanup-brief-ready':'cleanup-attacker-unresolved',
    residual,
    attack,
    telemetry:Object.freeze({tm:'unknown',health:'unknown',protection:'unknown',cooldowns:'unknown'}),
    resource:Object.freeze({protectedIds:Object.freeze(consumedAndReservedIds(assignments,ownDefenses)),currentReservedIds:attack.ids}),
    alternatives,
    execution:Object.freeze(sourced?{available:true,label:'EXACT SOURCED CLEANUP EXECUTION',guidance:strategyMatch.guidance,record:strategyMatch.record}:{available:false,label:'NO SOURCED CLEANUP SEQUENCE',reason:'No approved exact-composition strategy record matches this residual defense, attacker composition, and Datacron scope. Use the roster-fit recommendation only as a resource plan.'}),
    source:sourced?'approved-exact-strategy':'cleanup-roster-fit-heuristic',
    prediction:false,
  });
}

export { assignmentsAfterRelease, cleanupAttackBrief, cleanupResidualTruth, currentAttackUnits, recoveryAlternatives, rosterIndex };
