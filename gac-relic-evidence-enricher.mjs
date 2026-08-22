import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeBaseId(value) { return clean(value?.baseId || value).split(":")[0].toUpperCase(); }
function normalizeMembers(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }

function rosterRows(roster = {}) {
  return [
    ...asArray(roster?.units),
    ...asArray(roster?.characters),
    ...asArray(roster?.roster),
    ...asArray(roster?.player?.units),
  ];
}

function unitInvestment(unit = {}) {
  const gear = Math.max(0, Math.floor(finite(unit?.gear ?? unit?.gearLevel ?? unit?.gear_level, 0)));
  const rawRelic = finite(unit?.relic ?? unit?.relicTier ?? unit?.relicLevel ?? unit?.relic_tier, null);
  const relic = rawRelic === null ? (gear >= 13 ? 0 : -1) : Math.max(-1, Math.floor(rawRelic));
  const effectiveRelic = gear >= 13 || relic >= 0 ? Math.max(0, relic) : 0;
  return Object.freeze({ gear, relic, effectiveRelic });
}

function teamRelicSnapshot(members = [], roster = {}) {
  const ids = normalizeMembers(members);
  const index = new Map(rosterRows(roster).map((unit) => [normalizeBaseId(unit), unit]).filter(([id]) => Boolean(id)));
  const rows = ids.map((baseId) => {
    const unit = index.get(baseId);
    return unit ? Object.freeze({ baseId, ...unitInvestment(unit) }) : Object.freeze({ baseId, gear:null, relic:null, effectiveRelic:null });
  });
  const complete = rows.length === ids.length && rows.every((row) => Number.isFinite(Number(row.effectiveRelic)));
  const averageRelic = complete && rows.length ? rows.reduce((sum, row) => sum + Number(row.effectiveRelic), 0) / rows.length : null;
  return Object.freeze({ complete, members:Object.freeze(rows), averageRelic });
}

function historicalRelicContext(battle = {}, ownerRosterSnapshot = null, opponentRosterSnapshot = null) {
  const attacker = teamRelicSnapshot(battle?.attacker_members, ownerRosterSnapshot || {});
  const defender = teamRelicSnapshot(battle?.defender_members, opponentRosterSnapshot || {});
  const relicDelta = attacker.averageRelic === null || defender.averageRelic === null ? null : attacker.averageRelic - defender.averageRelic;
  return Object.freeze({
    version:"gac-relic-context-v1",
    attacker,
    defender,
    relicDelta,
    complete:attacker.complete && defender.complete && relicDelta !== null,
  });
}

export function createGacRelicEvidenceEnricher(options = {}) {
  const store = options.store || supabaseCoreStore;

  async function enrichBattle(input = {}) {
    const battleKey = clean(input?.battleKey || input?.battle?.battleKey);
    if (!battleKey) return Object.freeze({ enriched:false, reason:"missing-battle-key" });
    const rows = asArray(await store.select("gac_battles", {
      select:"id,battle_key,attacker_members,defender_members,metadata",
      battle_key:`eq.${battleKey}`,
      limit:1,
    }));
    const battle = rows[0] || null;
    if (!battle?.id) return Object.freeze({ enriched:false, reason:"battle-not-found" });
    const relicContext = historicalRelicContext(battle, input?.ownerRosterSnapshot, input?.opponentRosterSnapshot);
    const metadata = {
      ...(battle?.metadata && typeof battle.metadata === "object" ? battle.metadata : {}),
      historicalRelicContext:relicContext,
      historicalRelicDelta:relicContext.relicDelta,
      historicalRelicSnapshotComplete:relicContext.complete,
    };
    await store.update("gac_battles", { id:`eq.${battle.id}` }, { metadata }, { returning:false });

    try {
      const dcRows = asArray(await store.select("gac_datacron_battle_evidence", {
        select:"id,metadata",
        battle_key:`eq.${battleKey}`,
        limit:1,
      }));
      if (dcRows[0]?.id) {
        await store.update("gac_datacron_battle_evidence", { id:`eq.${dcRows[0].id}` }, {
          metadata:{ ...(dcRows[0]?.metadata && typeof dcRows[0].metadata === "object" ? dcRows[0].metadata : {}), historicalRelicContext:relicContext, historicalRelicDelta:relicContext.relicDelta, historicalRelicSnapshotComplete:relicContext.complete },
        }, { returning:false });
      }
    } catch (error) {
      if (!/gac_datacron_battle_evidence|relation|schema cache|does not exist/i.test(clean(error?.message))) throw error;
    }

    return Object.freeze({ enriched:true, battleKey, complete:relicContext.complete, relicDelta:relicContext.relicDelta, relicContext });
  }

  return Object.freeze({ enrichBattle });
}

export const gacRelicEvidenceEnricher = createGacRelicEvidenceEnricher();
export { historicalRelicContext, normalizeMembers, rosterRows, teamRelicSnapshot, unitInvestment };
