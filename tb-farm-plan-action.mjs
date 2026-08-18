import { buildGuildRoteMissionCoverage } from './public/guild-rote-mission-coverage-model.js';
import { buildGuildTbFarmingGuide, filterGuildTbFarmingRows } from './public/guild-tb-farming-guide-model.js';
import { JOURNEY_PRESETS } from './public/farm-presets.js';

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);

function actionError(message, status = 503, code = 'TB_FARM_PLAN_UNAVAILABLE') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function mapConcurrent(values, concurrency, mapper) {
  const source = asArray(values);
  const results = new Array(source.length);
  let cursor = 0;
  async function worker() {
    while (cursor < source.length) {
      const index = cursor++;
      results[index] = await mapper(source[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, source.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function normalizeRosterUnit(unit = {}) {
  return Object.freeze({
    ...unit,
    categories: Object.freeze(asArray(unit.categories).length ? asArray(unit.categories) : asArray(unit.tags)),
    factions: Object.freeze(asArray(unit.factions)),
  });
}

export async function buildCanonicalGuildTbSnapshot(canonical, allyCodeInput, options = {}) {
  if (!canonical?.getGuildRosterByPlayer || !canonical?.getPlayerRoster || !canonical?.getGameUnitCatalog) {
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

  const failures = [];
  const hydratedMembers = await mapConcurrent(members, finite(options.concurrency, 6), async (member) => {
    const code = digits(member?.allyCode);
    if (code.length !== 9) {
      failures.push(text(member?.name || member?.id || 'Unknown member'));
      return { ...member, rosterAvailable: false, units: [] };
    }
    try {
      const roster = await canonical.getPlayerRoster(code);
      return Object.freeze({
        ...member,
        rosterAvailable: true,
        units: Object.freeze([...asArray(roster?.units), ...asArray(roster?.ships)].map(normalizeRosterUnit)),
      });
    } catch {
      failures.push(text(member?.name || code));
      return { ...member, rosterAvailable: false, units: [] };
    }
  });
  if (failures.length) {
    throw actionError(`Guild roster hydration failed for ${failures.length} current member(s); refusing to calculate an incomplete Guild-impact farm plan.`, 503, 'GUILD_MEMBER_ROSTER_HYDRATION_FAILED');
  }

  const catalog = await canonical.getGameUnitCatalog();
  if (!asArray(catalog).length) throw actionError('Canonical game unit definitions are unavailable.', 503, 'GAME_CATALOG_UNAVAILABLE');

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
