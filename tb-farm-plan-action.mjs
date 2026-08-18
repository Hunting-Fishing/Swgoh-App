import { buildGuildRoteMissionCoverage } from './public/guild-rote-mission-coverage-model.js';
import { buildGuildTbFarmingGuide, filterGuildTbFarmingRows } from './public/guild-tb-farming-guide-model.js';
import { JOURNEY_PRESETS } from './public/farm-presets.js';

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function actionError(message, status = 503, code = 'TB_FARM_PLAN_UNAVAILABLE') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizedOwnedUnit(row = {}, catalog = {}) {
  const metadata = object(row.metadata);
  const unitType = String(row.combat_type ?? catalog.combatType ?? catalog.unitType ?? '').toLowerCase() === '2' || String(catalog.unitType || '').toLowerCase() === 'ship' ? 'Ship' : 'Character';
  return Object.freeze({
    baseId: text(row.base_id || catalog.baseId),
    name: text(row.unit_name || catalog.name || row.base_id),
    unitType,
    combatType: unitType === 'Ship' ? 2 : 1,
    alignment: text(catalog.alignment || 'Unknown'),
    factions: Object.freeze(asArray(catalog.factions)),
    categories: Object.freeze(asArray(catalog.categories)),
    image: text(catalog.image),
    stars: finite(row.rarity),
    level: finite(row.level),
    gear: finite(row.gear_level),
    relic: finite(row.relic_tier),
    power: finite(row.galactic_power),
    speed: finite(metadata.speed),
    zetas: finite(row.zeta_count),
    omicrons: finite(row.omicron_count),
  });
}

export async function buildCanonicalGuildTbSnapshot(canonical, allyCodeInput) {
  if (!canonical?.getGuildRosterByPlayer || !canonical?.getGameUnitCatalog || !canonical?._selectPaged) {
    throw actionError('Canonical Guild roster capabilities are unavailable for TB Farm Plan.', 503, 'CANONICAL_TB_CAPABILITY_MISSING');
  }
  const allyCode = digits(allyCodeInput);
  if (allyCode.length !== 9) throw actionError('A verified 9-digit Ally Code is required.', 400, 'INVALID_ALLY_CODE');

  const guild = await canonical.getGuildRosterByPlayer(allyCode);
  if (!guild?.hydration?.complete) {
    throw actionError('The current Guild baseline is not fully hydrated. Refresh Guild data before building a Guild-impact TB Farm Plan.', 409, 'GUILD_ROSTER_NOT_FULLY_HYDRATED');
  }
  const members = asArray(guild.members);
  if (!members.some((member) => digits(member?.allyCode) === allyCode)) {
    throw actionError('The verified player is not in the current canonical Guild roster.', 409, 'VERIFIED_PLAYER_NOT_IN_GUILD');
  }
  const memberIds = members.map((member) => text(member?.persistentId)).filter(Boolean);
  if (memberIds.length !== members.length || !memberIds.length) {
    throw actionError('One or more current Guild members are missing canonical persistent identity.', 503, 'GUILD_MEMBER_IDENTITY_INCOMPLETE');
  }

  const [catalog, unitRows] = await Promise.all([
    canonical.getGameUnitCatalog(),
    canonical._selectPaged('player_units_current', {
      select: 'player_id,base_id,unit_name,combat_type,rarity,level,gear_level,relic_tier,galactic_power,zeta_count,omicron_count,last_synced_at,metadata',
      player_id: `in.(${memberIds.join(',')})`,
      order: 'player_id.asc,galactic_power.desc,base_id.asc',
    }, { maxRows: 25_000 }),
  ]);
  if (!asArray(catalog).length) throw actionError('Canonical game unit definitions are unavailable.', 503, 'GAME_CATALOG_UNAVAILABLE');

  const catalogById = new Map(asArray(catalog).map((unit) => [text(unit?.baseId), unit]).filter(([id]) => id));
  const rowsByPlayer = new Map(memberIds.map((id) => [id, []]));
  for (const row of asArray(unitRows)) {
    const playerId = text(row?.player_id);
    if (rowsByPlayer.has(playerId)) rowsByPlayer.get(playerId).push(row);
  }

  const hydratedMembers = members.map((member) => {
    const playerId = text(member.persistentId);
    const rows = rowsByPlayer.get(playerId) || [];
    const expectedOwnedUnits = finite(member.characterCount) + finite(member.shipCount);
    if (expectedOwnedUnits > 0 && rows.length !== expectedOwnedUnits) {
      throw actionError(`Canonical Guild member ${text(member.name) || digits(member.allyCode)} expected ${expectedOwnedUnits} owned units but loaded ${rows.length}; refusing incomplete Guild-impact planning.`, 503, 'GUILD_MEMBER_ROSTER_INCOMPLETE');
    }
    const units = rows.map((row) => normalizedOwnedUnit(row, catalogById.get(text(row.base_id)) || {}));
    return Object.freeze({ ...member, rosterAvailable: true, units: Object.freeze(units) });
  });

  return Object.freeze({
    guildSnapshot: Object.freeze({ ...guild, members: Object.freeze(hydratedMembers) }),
    catalog: Object.freeze(asArray(catalog)),
  });
}

function compactMission(row = {}) {
  return Object.freeze({
    key: text(row.key),
    phase: text(row.phase),
    planetId: text(row.planetId),
    planetName: text(row.planetName),
    name: text(row.mission?.name || row.key),
  });
}

function compactJourney(entry = {}) {
  return Object.freeze({
    eventId: text(entry.eventId),
    eventName: text(entry.eventName),
    shortName: text(entry.shortName),
    category: text(entry.category),
    targetBaseId: text(entry.targetBaseId),
    status: text(entry.status),
    requirementLabel: text(entry.requirementLabel),
  });
}

function compactRecommendation(row, rank) {
  return Object.freeze({
    rank,
    baseId: text(row.baseId),
    unitName: text(row.unitName),
    currentLabel: text(row.currentLabel),
    tbTargetLabel: text(row.tbTargetLabel),
    gapLabel: text(row.gapLabel),
    classification: text(row.classification),
    tb: Object.freeze({
      missionImpact: finite(row.missionImpact),
      mandatoryImpact: finite(row.mandatoryImpact),
      poolImpact: finite(row.poolImpact),
      missions: Object.freeze(asArray(row.missionRefs).map(compactMission)),
    }),
    journey: Object.freeze({
      directCount: finite(row.directCount),
      partialCount: finite(row.partialCount),
      alreadyCount: finite(row.alreadyCount),
      activeOverlapCount: finite(row.activeJourneyOverlaps),
      targets: Object.freeze(asArray(row.journeyOverlaps).map(compactJourney)),
    }),
  });
}

export function buildPersonalTbFarmPlan(guildSnapshot, catalog, allyCodeInput, options = {}) {
  const allyCode = digits(allyCodeInput);
  const member = asArray(guildSnapshot?.members).find((row) => digits(row?.allyCode) === allyCode);
  if (!member) throw actionError('The verified player is not present in the hydrated Guild roster.', 409, 'VERIFIED_PLAYER_NOT_IN_GUILD');

  const coverage = buildGuildRoteMissionCoverage(guildSnapshot, catalog, { redundancyTarget: 2 });
  const guide = buildGuildTbFarmingGuide(coverage, JOURNEY_PRESETS);
  const mode = ['guild-impact', 'journey-overlap', 'closest-upgrade'].includes(text(options.priorityMode)) ? text(options.priorityMode) : 'guild-impact';
  const sort = mode === 'journey-overlap' ? 'journey-overlap' : mode === 'closest-upgrade' ? 'gap' : 'tb-impact';
  const allRows = filterGuildTbFarmingRows(guide.rows, { member: text(member.id || member.playerId || member.allyCode || member.name), sort });
  const maxRecommendations = Math.max(5, Math.min(25, Math.trunc(finite(options.maxRecommendations, 12))));
  const recommendations = allRows.slice(0, maxRecommendations).map((row, index) => compactRecommendation(row, index + 1));
  const doubleUse = allRows.filter((row) => row.activeJourneyOverlaps > 0);

  return Object.freeze({
    action: 'tb-farm-plan',
    version: 'v1',
    sourceDataAt: text(guildSnapshot?.fetchedAt),
    player: Object.freeze({
      allyCode,
      name: text(member.name),
      playerId: text(member.playerId || member.id),
      galacticPower: finite(member.galacticPower),
    }),
    guild: Object.freeze({
      id: text(guildSnapshot?.guild?.id),
      name: text(guildSnapshot?.guild?.name),
      memberCount: finite(guildSnapshot?.guild?.memberCount, asArray(guildSnapshot?.members).length),
    }),
    input: Object.freeze({ priorityMode: mode, maxRecommendations }),
    summary: Object.freeze({
      personalFarmRows: allRows.length,
      recommendationsReturned: recommendations.length,
      doubleUseRows: doubleUse.length,
      directDoubleUseRows: allRows.filter((row) => row.directCount > 0).length,
      partialDoubleUseRows: allRows.filter((row) => row.partialCount > 0).length,
      multiUnlockRows: allRows.filter((row) => row.classification === 'multi-unlock').length,
      tbOnlyRows: allRows.filter((row) => row.activeJourneyOverlaps === 0).length,
      journeyTargetsAdvanced: new Set(doubleUse.flatMap((row) => asArray(row.journeyOverlaps).filter((entry) => ['direct','partial'].includes(entry.status)).map((entry) => entry.eventId))).size,
      exactGuildCoveragePercent: finite(coverage?.summary?.exactCoveragePercent),
      redundancyCoveragePercent: finite(coverage?.summary?.redundancyCoveragePercent),
      priorityMode: mode,
    }),
    recommendations: Object.freeze(recommendations),
    evidence: Object.freeze({
      tb: 'Verified ROTE mission-entry evidence from the canonical Guild roster.',
      journey: 'Journey overlap is a prerequisite relationship from the versioned Journey preset graph; it is not an unlock guarantee.',
      ranking: 'Ranking uses visible TB impact, Journey overlap, or upgrade-gap ordering. No opaque universal farm score is used.',
    }),
  });
}

export async function executePersonalTbFarmPlan(canonical, allyCodeInput, input = {}) {
  const { guildSnapshot, catalog } = await buildCanonicalGuildTbSnapshot(canonical, allyCodeInput);
  return buildPersonalTbFarmPlan(guildSnapshot, catalog, allyCodeInput, input);
}
