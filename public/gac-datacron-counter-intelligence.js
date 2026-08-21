import { rankRosterFitSquads, speedProfile } from './gac-counter-engine.js';
import { mechanicsLabels } from './gac-datacron-mechanics.js';
import { tacticalRiskGates } from './gac-datacron-risk-gates.js';

const clean=(value)=>String(value??'').trim();
const asArray=(value)=>Array.isArray(value)?value:[];
const normalizeId=(value)=>clean(value?.baseId||value).split(':')[0].toUpperCase();
const uniqueIds=(values=[])=>[...new Set(asArray(values).map(normalizeId).filter(Boolean))];

const ANSWER_PATTERNS=Object.freeze({
  revive:Object.freeze([/can(?:not|'t) be revived/i,/prevent\w* revive/i,/defeated enemies? can(?:not|'t) revive/i,/revive prevention/i]),
  sustain:Object.freeze([/healing immunity/i,/shock/i,/reduce[^.]{0,40}max health/i,/health recovery[^.]{0,30}reduc/i,/buff immunity/i]),
  control:Object.freeze([/dispel all debuffs/i,/cleanse/i,/tenacity up/i,/immune to stun/i,/immune to fear/i,/reduce[^.]{0,30}cooldown/i,/reset[^.]{0,30}cooldown/i]),
  'debuff-resilience':Object.freeze([/can(?:not|'t) be resisted/i,/cannot be resisted/i,/unresist/i,/buff immunity/i,/dispel[^.]{0,30}buff/i]),
  'damage-pressure':Object.freeze([/damage immunity/i,/critical hit immunity/i,/defense up/i,/protection up/i,/reduce[^.]{0,30}damage/i]),
  'opening-tempo':Object.freeze([/bonus turn/i,/gain[^.]{0,30}turn meter/i,/start of battle/i]),
});
const HARD_GATES=new Set(['opening-tempo']);

function abilityText(unit={}){
  const rows=[unit?.name,unit?.description,unit?.abilityDescription,unit?.abilityText];
  for(const ability of asArray(unit?.abilities))rows.push(ability?.name,ability?.description,ability?.text,ability?.abilityName,ability?.abilityDescription);
  return rows.map(clean).filter(Boolean).join(' | ');
}
function unitAnswerEvidence(unit={},gateId=''){
  const text=abilityText(unit);const patterns=ANSWER_PATTERNS[gateId]||[];
  if(!text||!patterns.length)return [];
  return patterns.filter((pattern)=>pattern.test(text)).map((pattern)=>pattern.source);
}
function defenderMechanicProfile(defense={}){
  const state=clean(defense?.datacronState).toLowerCase();
  const datacron=defense?.datacron&&typeof defense.datacron==='object'?defense.datacron:null;
  if(state==='none')return Object.freeze({selected:false,known:true,state:'none',mechanics:Object.freeze([]),gates:Object.freeze([]),datacronId:''});
  if(state!=='assigned'&&!datacron)return Object.freeze({selected:false,known:false,state:'unknown',mechanics:Object.freeze([]),gates:Object.freeze([]),datacronId:''});
  const mechanics=datacron?mechanicsLabels(datacron,12):[];
  return Object.freeze({selected:true,known:Boolean(datacron&&mechanics.length),state:'assigned',mechanics:Object.freeze(mechanics),gates:tacticalRiskGates(mechanics),datacronId:clean(datacron?.id||defense?.datacronId)});
}
function assessCounterMechanicFit(candidate={},profile={},enemyUnits=[]){
  const squad=asArray(candidate?.squad);const gates=asArray(profile?.gates);
  if(profile?.selected!==true||!gates.length)return Object.freeze({active:false,known:profile?.known===true,answered:Object.freeze([]),unresolved:Object.freeze([]),hardBlockers:Object.freeze([]),gateCount:0,label:profile?.selected===true?'Assigned Datacron mechanics unresolved':'No mechanic-aware adjustment'});
  const speed=candidate?.speedProfile||speedProfile(squad,enemyUnits);
  const answered=[];const unresolved=[];const hardBlockers=[];
  for(const gate of gates){
    const evidence=[];
    for(const unit of squad){const hits=unitAnswerEvidence(unit,gate.id);if(hits.length)evidence.push(`${normalizeId(unit)}:${hits[0]}`);}
    if(gate.id==='opening-tempo'&&speed?.known===true&&speed.fastestEdge>=0&&speed.leaderEdge>=0)evidence.push(`speed:${speed.fastestEdge}/${speed.leaderEdge}`);
    if(evidence.length){answered.push(Object.freeze({id:gate.id,label:gate.label,evidence:Object.freeze(evidence)}));continue;}
    const row=Object.freeze({id:gate.id,label:gate.label,evidence:Object.freeze([])});unresolved.push(row);
    if(HARD_GATES.has(gate.id)&&speed?.known===true&&Number(speed.risk)>=18)hardBlockers.push(row);
  }
  return Object.freeze({active:true,known:true,answered:Object.freeze(answered),unresolved:Object.freeze(unresolved),hardBlockers:Object.freeze(hardBlockers),gateCount:gates.length,label:hardBlockers.length?'Severe verified Datacron gate risk':unresolved.length?'Datacron gates partially unresolved':'Verified Datacron gates answered'});
}
function fitTuple(fit={}){return [Number(fit?.hardBlockers?.length||0),Number(fit?.unresolved?.length||0),-Number(fit?.answered?.length||0)];}
function compareFit(left={},right={}){const a=fitTuple(left),b=fitTuple(right);for(let i=0;i<a.length;i+=1){if(a[i]!==b[i])return a[i]-b[i];}return 0;}
function strictlyBetterFit(candidateFit={},currentFit={}){return compareFit(candidateFit,currentFit)<0;}
function candidateKey(candidate={}){return uniqueIds(asArray(candidate?.squad)).sort().join('|');}
function defenseUnits(defense={},opponentRoster={}){const index=new Map(asArray(opponentRoster?.units).filter((unit)=>clean(unit?.unitType).toLowerCase()!=='ship').map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));const ids=uniqueIds(defense?.members);const units=ids.map((id)=>index.get(id)).filter(Boolean);const leader=normalizeId(defense?.leaderBaseId||ids[0]);const lead=units.find((unit)=>normalizeId(unit)===leader);return lead?[lead,...units.filter((unit)=>normalizeId(unit)!==leader)]:units;}
function mechanicAwareAlternative({ownRoster={},opponentRoster={},defense={},currentMembers=[],otherAllocatedIds=[],roundExcludedIds=[],size=5,reserveBaseIds=[]}={}){
  const profile=defenderMechanicProfile(defense);const enemies=defenseUnits(defense,opponentRoster);
  if(!profile.selected||!profile.gates.length||!enemies.length)return Object.freeze({active:false,profile,current:null,alternative:null,reason:profile.selected?'Verified mechanic labels are unavailable for this assigned Datacron.':'No enemy Datacron is assigned.'});
  const ownerIndex=new Map(asArray(ownRoster?.units).map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));const currentSquad=uniqueIds(currentMembers).map((id)=>ownerIndex.get(id)).filter(Boolean);
  const currentCandidate={squad:currentSquad,speedProfile:speedProfile(currentSquad,enemies)};const currentFit=assessCounterMechanicFit(currentCandidate,profile,enemies);
  const excluded=[...new Set([...uniqueIds(otherAllocatedIds),...uniqueIds(roundExcludedIds)])];
  const candidates=rankRosterFitSquads(ownRoster,enemies,{size:Number(size)===3?3:5,excludeBaseIds:excluded,reserveBaseIds});
  const currentKey=uniqueIds(currentMembers).sort().join('|');
  const ranked=candidates.map((candidate)=>Object.freeze({...candidate,datacronCounterFit:assessCounterMechanicFit(candidate,profile,enemies)}))
    .filter((candidate)=>candidateKey(candidate)!==currentKey)
    .sort((a,b)=>compareFit(a.datacronCounterFit,b.datacronCounterFit)||Number(b.score||0)-Number(a.score||0));
  const alternative=ranked.find((candidate)=>strictlyBetterFit(candidate.datacronCounterFit,currentFit))||null;
  return Object.freeze({active:true,profile,current:Object.freeze({...currentCandidate,datacronCounterFit:currentFit}),alternative,reason:alternative?'A legal non-overlapping candidate resolves strictly more verified Datacron gates than the current heuristic recommendation.':'No legal non-overlapping candidate resolves more verified Datacron gates than the current recommendation.'});
}

export { ANSWER_PATTERNS, HARD_GATES, abilityText, assessCounterMechanicFit, candidateKey, compareFit, defenderMechanicProfile, defenseUnits, fitTuple, mechanicAwareAlternative, normalizeId, strictlyBetterFit, unitAnswerEvidence, uniqueIds };
