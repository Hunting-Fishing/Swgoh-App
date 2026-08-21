import { readFile } from 'node:fs/promises';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { validateRecord } from './public/gac-strategy-record-model.js';
import {
  matchesWarehouseFilters,
  normalizeBattleObservation,
  normalizeCounterAggregate,
  normalizeStrategyRecord,
  recordTimestamp,
  warehouseSummary,
} from './gac-evidence-warehouse-model.mjs';

function clean(value){return String(value??'').trim();}
function asArray(value){return Array.isArray(value)?value:[];}
function boundedLimit(value,fallback=250,max=1000){const parsed=Math.floor(Number(value));return Number.isFinite(parsed)&&parsed>0?Math.min(max,parsed):fallback;}
function validFormat(value){const format=clean(value).toLowerCase();return ['3v3','5v5'].includes(format)?format:'';}
function validBattleType(value){const type=clean(value).toLowerCase();return ['character','fleet'].includes(type)?type:'';}
function normalizeLeader(value){return clean(value).split(':')[0].toUpperCase().replace(/[^A-Z0-9_:-]/g,'').slice(0,100);}
async function defaultStrategyLoader(){
  const raw=await readFile(new URL('./public/data/gac-strategy-records.json',import.meta.url),'utf8');
  const body=JSON.parse(raw);return asArray(body?.records);
}
function validatedStrategies(values=[]){return asArray(values).map((row)=>validateRecord(row)).filter((result)=>result.valid&&result.record?.status==='active').map((result)=>result.record);}
function queryFor(table,{format='',enemyLeaderBaseId='',rowLimit=1000}={}){
  const query={limit:rowLimit};if(format)query.format=`eq.${format}`;
  if(enemyLeaderBaseId)query[table==='gac_battles'?'defender_leader_base_id':'enemy_leader_base_id']=`eq.${enemyLeaderBaseId}`;
  if(table==='gac_battles'){
    query.select='format,season_id,attacker_leader_base_id,attacker_members,defender_leader_base_id,defender_members,battle_outcome,source,source_ref,source_updated_at,imported_at,metadata';
    query.order='source_updated_at.desc.nullslast,imported_at.desc.nullslast';
  }else{
    query.select='format,enemy_leader_base_id,enemy_members,counter_leader_base_id,counter_members,battles,wins,holds,draws,average_banners,league,season_id,source,source_ref,source_updated_at,confidence,observed_at';
    query.order='source_updated_at.desc.nullslast,observed_at.desc.nullslast';
  }
  return query;
}

export function createGacEvidenceWarehouseService(options={}){
  const store=options.store||supabaseCoreStore;const strategyLoader=options.strategyLoader||defaultStrategyLoader;
  async function getEvidence(input={}){
    const limit=boundedLimit(input.limit);const format=validFormat(input.format);const battleType=validBattleType(input.battleType);const enemyLeaderBaseId=normalizeLeader(input.enemyLeaderBaseId);const sourceFamily=clean(input.sourceFamily).toLowerCase();const evidenceKind=clean(input.evidenceKind).toLowerCase();
    const rowLimit=Math.min(5000,Math.max(500,limit*4));
    const [counterRows,battleRows,strategyRows]=await Promise.all([
      battleType==='fleet'?Promise.resolve([]):store.select('gac_counter_observations',queryFor('gac_counter_observations',{format,enemyLeaderBaseId,rowLimit})).catch(()=>[]),
      store.select('gac_battles',queryFor('gac_battles',{format,enemyLeaderBaseId,rowLimit})).catch(()=>[]),
      Promise.resolve().then(()=>strategyLoader()).catch(()=>[]),
    ]);
    const records=[
      ...asArray(counterRows).map(normalizeCounterAggregate).filter(Boolean),
      ...asArray(battleRows).map(normalizeBattleObservation).filter(Boolean),
      ...validatedStrategies(strategyRows).map(normalizeStrategyRecord).filter(Boolean),
    ].filter((row)=>matchesWarehouseFilters(row,{format,battleType,enemyLeaderBaseId,sourceFamily,evidenceKind}))
      .sort((a,b)=>(Date.parse(recordTimestamp(b))||0)-(Date.parse(recordTimestamp(a))||0)||a.evidenceKey.localeCompare(b.evidenceKey))
      .slice(0,limit);
    return Object.freeze({
      source:'normalized-gac-evidence-warehouse',
      filters:Object.freeze({format:format||null,battleType:battleType||null,enemyLeaderBaseId:enemyLeaderBaseId||null,sourceFamily:sourceFamily||null,evidenceKind:evidenceKind||null,limit}),
      records:Object.freeze(records),summary:warehouseSummary(records),
      truthBoundaries:Object.freeze({
        legacyDatacronAbsenceMeansNone:false,
        legacyDatacronScope:'not-recorded',
        fleetDatacronsApplicable:false,
        tacticalGuidanceIncluded:false,
        observedRateIsPrediction:false,
        internalUserIdentifiersExposed:false,
      }),
    });
  }
  return Object.freeze({getEvidence});
}

export const gacEvidenceWarehouseService=createGacEvidenceWarehouseService();
export { boundedLimit, defaultStrategyLoader, normalizeLeader, queryFor, validBattleType, validFormat, validatedStrategies };
