import { gacEvidenceWarehouseService } from './gac-evidence-warehouse-service.mjs';
import { GAC_V1_RELEASE_STATUS } from './gac-v1-release-status.mjs';
import { LiveRosterCache } from './live-roster-cache.mjs';

const PUBLIC_LIMIT_MAX = 250;
const FRESH_MS = 30_000;
const STALE_MS = 180_000;
const MAX_ENTRIES = 256;

function clean(value){return String(value??'').trim();}
function positiveLimit(value,fallback=100,max=PUBLIC_LIMIT_MAX){const parsed=Math.floor(Number(value));return Number.isFinite(parsed)&&parsed>0?Math.min(max,parsed):fallback;}
function normalizeFormat(value){const format=clean(value).toLowerCase();return ['3v3','5v5'].includes(format)?format:'';}
function normalizeBattleType(value){const type=clean(value).toLowerCase();return ['character','fleet'].includes(type)?type:'';}
function normalizeLeader(value){return clean(value).split(':')[0].toUpperCase().replace(/[^A-Z0-9_:-]/g,'').slice(0,100);}
function normalizeToken(value,max=80){return clean(value).toLowerCase().replace(/[^a-z0-9._:-]/g,'').slice(0,max);}
function warehouseInput(url){
  return Object.freeze({
    format:normalizeFormat(url.searchParams.get('format')),
    battleType:normalizeBattleType(url.searchParams.get('battleType')),
    enemyLeaderBaseId:normalizeLeader(url.searchParams.get('enemyLeader')),
    sourceFamily:normalizeToken(url.searchParams.get('sourceFamily')),
    evidenceKind:normalizeToken(url.searchParams.get('evidenceKind')),
    limit:positiveLimit(url.searchParams.get('limit')),
  });
}
function warehouseCacheKey(input={}){
  return [input.format||'*',input.battleType||'*',input.enemyLeaderBaseId||'*',input.sourceFamily||'*',input.evidenceKind||'*',String(input.limit||100)].join('|');
}
function statusFor(error){const status=Number(error?.status);return Number.isInteger(status)&&status>=400&&status<=599?status:503;}

export function createGacEvidenceWarehouseApi(options={}){
  const writeJson=options.writeJson;
  const warehouse=options.warehouse||gacEvidenceWarehouseService;
  const cache=options.cache||new LiveRosterCache({freshMs:FRESH_MS,staleMs:STALE_MS,maxEntries:MAX_ENTRIES,now:options.now});
  if(typeof writeJson!=='function')throw new TypeError('writeJson is required');
  if(typeof warehouse?.getEvidence!=='function')throw new TypeError('warehouse.getEvidence is required');

  return Object.freeze({
    cache,
    async handle(request,response,url){
      if(request.method!=='GET')return false;
      if(url.pathname==='/api/gac/release-status'){
        writeJson(response,200,GAC_V1_RELEASE_STATUS,{
          'Cache-Control':'public, max-age=60, stale-while-revalidate=300',
          'X-GAC-Source':'gac-v1-release-contract',
        });
        return true;
      }
      if(url.pathname!=='/api/gac/evidence/warehouse')return false;
      const input=warehouseInput(url);
      const key=warehouseCacheKey(input);
      try{
        const cached=await cache.getOrLoad(key,()=>warehouse.getEvidence(input),{staleWhileRevalidate:true});
        writeJson(response,200,cached.value,{
          'Cache-Control':'public, max-age=20, stale-while-revalidate=120',
          'X-GAC-Source':'normalized-gac-evidence-warehouse',
          'X-GAC-Cache':cached.cache,
          Age:String(Math.max(0,Math.floor((cached.ageMs||0)/1000))),
        });
      }catch(error){
        writeJson(response,statusFor(error),{error:error?.message||'The normalized GAC evidence warehouse is unavailable.'},{
          'Cache-Control':'no-store',
          'X-GAC-Source':'normalized-gac-evidence-warehouse',
        });
      }
      return true;
    },
  });
}

export {
  FRESH_MS,
  MAX_ENTRIES,
  PUBLIC_LIMIT_MAX,
  STALE_MS,
  normalizeBattleType,
  normalizeFormat,
  normalizeLeader,
  positiveLimit,
  warehouseCacheKey,
  warehouseInput,
};
