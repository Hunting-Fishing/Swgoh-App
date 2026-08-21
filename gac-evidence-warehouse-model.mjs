import crypto from 'node:crypto';

function clean(value){return String(value??'').trim();}
function asArray(value){return Array.isArray(value)?value:[];}
function finite(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function nullableFinite(value){if(value===null||value===undefined||value==='')return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
function normalizeBaseId(value){const id=clean(value).split(':')[0].toUpperCase();return /^[A-Z0-9_:-]{1,100}$/.test(id)?id:'';}
function normalizeMembers(values){return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))].sort();}
function stableKey(parts=[]){return crypto.createHash('sha256').update(parts.map(clean).join('|')).digest('hex');}
function latestTimestamp(...values){return values.map(clean).filter(Boolean).sort((a,b)=>(Date.parse(b)||0)-(Date.parse(a)||0))[0]||'';}
function sourceFamily(sourceInput=''){
  const source=clean(sourceInput).toLowerCase();
  if(source==='verified-owner-war-room'||source.startsWith('verified-owner'))return 'verified-owner';
  if(source.includes('c3po')||source.includes('c-3po'))return 'c3po';
  if(source.includes('swgoh.gg')||source.includes('swgohgg'))return 'swgoh.gg';
  if(source.includes('ahnal')||source.includes('xaereth')||source.includes('scribe')||source.includes('bit dynasty')||source.includes('swgoh.tv'))return 'approved-creator';
  if(source)return 'other-public-or-imported';
  return 'unknown-source';
}
function unknownDatacronScope(){return Object.freeze({applicable:true,known:false,presence:'not-recorded',instanceId:'',setIds:Object.freeze([]),mechanicIds:Object.freeze([]),required:null});}
function fleetDatacronScope(){return Object.freeze({applicable:false,known:true,presence:'not-applicable',instanceId:'',setIds:Object.freeze([]),mechanicIds:Object.freeze([]),required:false});}
function battleDatacronScope(instanceId,battleType='character'){
  if(battleType==='fleet')return fleetDatacronScope();
  const id=clean(instanceId);
  return id?Object.freeze({applicable:true,known:true,presence:'assigned',instanceId:id,setIds:Object.freeze([]),mechanicIds:Object.freeze([]),required:true}):unknownDatacronScope();
}
function constraintDatacronScope(value={}){
  const presence=clean(value?.presence).toLowerCase()||'any';
  const setIds=Object.freeze([...new Set(asArray(value?.setIds).map(clean).filter(Boolean))].sort());
  const mechanicIds=Object.freeze([...new Set(asArray(value?.mechanicIds).map(clean).filter(Boolean))].sort());
  return Object.freeze({applicable:true,known:true,presence,instanceId:'',setIds,mechanicIds,required:value?.required===true});
}
function roleScope(battleType,row={}){
  if(battleType!=='fleet')return Object.freeze({known:true,scope:'squad-member-set'});
  const attackerStarters=normalizeMembers(row?.metadata?.attackerStarters||row?.metadata?.attackerStartingShips);
  const defenderStarters=normalizeMembers(row?.metadata?.defenderStarters||row?.metadata?.defenderStartingShips);
  const known=attackerStarters.length>0||defenderStarters.length>0;
  return Object.freeze({known,scope:known?'user-confirmed-fleet-roles':'capital-plus-member-set; starter/reinforcement roles not recorded'});
}
function baseRecord({evidenceKind,battleType='character',format='',enemyLeader='',enemyMembers=[],counterLeader='',counterMembers=[],seasonId='',provenance={},datacron={},era={},outcome={},role={}}={}){
  const normalizedEnemy=normalizeMembers(enemyMembers);const normalizedCounter=normalizeMembers(counterMembers);
  const kind=clean(evidenceKind);const type=clean(battleType).toLowerCase()==='fleet'?'fleet':'character';const normalizedFormat=clean(format).toLowerCase();
  const key=stableKey([kind,type,normalizedFormat,normalizeBaseId(enemyLeader),normalizedEnemy.join(','),normalizeBaseId(counterLeader),normalizedCounter.join(','),clean(provenance?.sourceRef),clean(provenance?.observedAt||provenance?.sourceUpdatedAt),clean(seasonId)]);
  return Object.freeze({
    evidenceKey:key,evidenceKind:kind,battleType:type,format:normalizedFormat,
    enemy:Object.freeze({leaderBaseId:normalizeBaseId(enemyLeader),members:Object.freeze(normalizedEnemy)}),
    counter:Object.freeze({leaderBaseId:normalizeBaseId(counterLeader),members:Object.freeze(normalizedCounter)}),
    role:Object.freeze(role),outcome:Object.freeze(outcome),datacron:Object.freeze(datacron),era:Object.freeze({seasonId:clean(seasonId)||null,...era}),
    provenance:Object.freeze(provenance),prediction:false,
  });
}
function normalizeCounterAggregate(row={}){
  const battles=Math.max(0,finite(row.battles));if(!battles)return null;
  const source=clean(row.source||'historical-evidence');
  return baseRecord({evidenceKind:'counter-aggregate',battleType:'character',format:row.format,enemyLeader:row.enemy_leader_base_id,enemyMembers:row.enemy_members,counterLeader:row.counter_leader_base_id,counterMembers:row.counter_members,seasonId:row.season_id,
    outcome:{mode:'aggregate',battles,wins:Math.max(0,Math.min(battles,finite(row.wins))),holds:Math.max(0,Math.min(battles,finite(row.holds))),draws:Math.max(0,Math.min(battles,finite(row.draws))),averageBanners:nullableFinite(row.average_banners)},
    datacron:{attacker:unknownDatacronScope(),defender:unknownDatacronScope()},role:{known:true,scope:'squad-member-set'},
    era:{seasonIds:Object.freeze(asArray(row.season_ids).map(clean).filter(Boolean)),gameDataVersion:null,validFrom:null,validUntil:null,datacronEra:'not-recorded'},
    provenance:{sourceFamily:sourceFamily(source),sourceName:source,sourceRef:clean(row.source_ref),sourceUpdatedAt:clean(row.source_updated_at)||null,observedAt:clean(row.observed_at)||null,capturedAt:null,confidence:Math.max(0,Math.min(1,finite(row.confidence,1)))}});
}
function battleTypeFromRow(row={}){const declared=clean(row?.metadata?.battleType).toLowerCase();if(declared==='fleet'||declared==='character')return declared;const a=normalizeBaseId(row.attacker_leader_base_id),d=normalizeBaseId(row.defender_leader_base_id);return a.startsWith('CAPITAL')&&d.startsWith('CAPITAL')?'fleet':'character';}
function normalizeBattleObservation(row={}){
  const type=battleTypeFromRow(row);const outcome=clean(row.battle_outcome).toLowerCase();if(!['win','loss','draw'].includes(outcome))return null;
  const source=clean(row.source);const metadata=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
  return baseRecord({evidenceKind:'battle-observation',battleType:type,format:row.format,enemyLeader:row.defender_leader_base_id,enemyMembers:row.defender_members,counterLeader:row.attacker_leader_base_id,counterMembers:row.attacker_members,seasonId:row.season_id,
    outcome:{mode:'single-battle',result:outcome,banners:nullableFinite(metadata.banners)},
    datacron:{attacker:battleDatacronScope(metadata.attackerDatacronId,type),defender:battleDatacronScope(metadata.defenderDatacronId,type)},role:roleScope(type,row),
    era:{seasonIds:Object.freeze(clean(row.season_id)?[clean(row.season_id)]:[]),gameDataVersion:null,validFrom:null,validUntil:null,datacronEra:type==='fleet'?'not-applicable':(metadata.attackerDatacronId||metadata.defenderDatacronId?'instance-recorded':'not-recorded')},
    provenance:{sourceFamily:sourceFamily(source),sourceName:source||'battle-history',sourceRef:clean(row.source_ref),sourceUpdatedAt:clean(row.source_updated_at)||null,observedAt:clean(row.imported_at||row.source_updated_at)||null,capturedAt:clean(row.imported_at)||null,confidence:sourceFamily(source)==='verified-owner'?1:null}});
}
function normalizeStrategyRecord(record={}){
  if(clean(record?.status).toLowerCase()!=='active')return null;
  const sourceName=clean(record?.provenance?.sourceName||record?.provenance?.sourceType||'approved-strategy');
  return baseRecord({evidenceKind:'tactical-strategy',battleType:'character',format:record.format,enemyLeader:record?.defender?.leaderBaseId||record?.defender?.members?.[0],enemyMembers:record?.defender?.members,counterLeader:record?.attacker?.leaderBaseId||record?.attacker?.members?.[0],counterMembers:record?.attacker?.members,
    outcome:{mode:'strategy-record',battles:null,wins:null,holds:null,draws:null,averageBanners:null},datacron:{attacker:constraintDatacronScope(record.attackerDatacron),defender:constraintDatacronScope(record.defenderDatacron)},role:{known:true,scope:'exact-squad-composition'},
    era:{seasonIds:Object.freeze([]),gameDataVersion:clean(record?.validity?.gameDataVersion)||null,validFrom:clean(record?.validity?.validFrom)||null,validUntil:clean(record?.validity?.validUntil)||null,datacronEra:'explicit-strategy-constraints'},
    provenance:{sourceFamily:sourceFamily(`${record?.provenance?.sourceType||''} ${sourceName}`),sourceName,sourceRef:clean(record?.provenance?.sourceRef),sourceUpdatedAt:clean(record?.provenance?.sourceUpdatedAt)||null,observedAt:null,capturedAt:clean(record?.provenance?.capturedAt)||null,publishedAt:clean(record?.provenance?.sourcePublishedAt)||null,author:clean(record?.provenance?.author)||null,confidence:null}});
}
function recordTimestamp(record={}){return latestTimestamp(record?.provenance?.sourceUpdatedAt,record?.provenance?.observedAt,record?.provenance?.capturedAt,record?.provenance?.publishedAt);}
function matchesWarehouseFilters(record={},filters={}){
  const format=clean(filters.format).toLowerCase();if(format&&record.format!==format)return false;
  const type=clean(filters.battleType).toLowerCase();if(type&&record.battleType!==type)return false;
  const leader=normalizeBaseId(filters.enemyLeaderBaseId);if(leader&&record.enemy.leaderBaseId!==leader)return false;
  const family=clean(filters.sourceFamily).toLowerCase();if(family&&clean(record?.provenance?.sourceFamily).toLowerCase()!==family)return false;
  const kind=clean(filters.evidenceKind).toLowerCase();if(kind&&clean(record.evidenceKind).toLowerCase()!==kind)return false;
  return true;
}
function warehouseSummary(records=[]){
  const byKind={},bySourceFamily={},byBattleType={};for(const row of asArray(records)){byKind[row.evidenceKind]=(byKind[row.evidenceKind]||0)+1;const family=row?.provenance?.sourceFamily||'unknown-source';bySourceFamily[family]=(bySourceFamily[family]||0)+1;byBattleType[row.battleType]=(byBattleType[row.battleType]||0)+1;}
  return Object.freeze({count:records.length,byKind:Object.freeze(byKind),bySourceFamily:Object.freeze(bySourceFamily),byBattleType:Object.freeze(byBattleType)});
}

export { baseRecord, battleDatacronScope, battleTypeFromRow, constraintDatacronScope, fleetDatacronScope, latestTimestamp, matchesWarehouseFilters, normalizeBaseId, normalizeBattleObservation, normalizeCounterAggregate, normalizeMembers, normalizeStrategyRecord, recordTimestamp, sourceFamily, stableKey, unknownDatacronScope, warehouseSummary };
