import { ORDER66_RAID, order66EligibilityEvidence, unitMeetsRaidBand } from './guild-raid-order66-rules.js';

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalize = (value) => text(value).toLowerCase().replace(/[‘’“”"']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export const ORDER66_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'none', label: 'Base', requirement: '5★', multiplier: 1, maxScore: 300_000 }),
  Object.freeze({ id: 'g12', label: 'Difficulty 1', requirement: 'G12', multiplier: 1.5, maxScore: 450_000 }),
  Object.freeze({ id: 'r1', label: 'Difficulty 2', requirement: 'R1', multiplier: 2, maxScore: 600_000 }),
  Object.freeze({ id: 'r3', label: 'Difficulty 3', requirement: 'R3', multiplier: 3, maxScore: 900_000 }),
  Object.freeze({ id: 'r5', label: 'Difficulty 4', requirement: 'R5', multiplier: 4, maxScore: 1_200_000 }),
  Object.freeze({ id: 'r7', label: 'Difficulty 5', requirement: 'R7', multiplier: 6, maxScore: 1_800_000 }),
  Object.freeze({ id: 'r8', label: 'Difficulty 6', requirement: 'R8', multiplier: 9, maxScore: 2_700_000 }),
  Object.freeze({ id: 'r9', label: 'Difficulty 7', requirement: 'R9', multiplier: 12, maxScore: 3_600_000 }),
]);

const difficultyById = new Map(ORDER66_DIFFICULTIES.map((row, index) => [row.id, { ...row, index }]));

const ROUTES = Object.freeze([
  Object.freeze({
    id: 'tarkin-scorch', name: 'Tarkin + Scorch', confidence: 0.98, maxBand: 'r9', source: 'community-max-guide',
    units: Object.freeze([
      Object.freeze(['Grand Moff Tarkin']),
      Object.freeze(['RC-1262 Scorch', 'RC-1262 “Scorch”', 'RC-1262 "Scorch"', 'Scorch']),
    ]),
    note: 'High-end undersized route documented in Order 66 max-score community guides.',
  }),
  Object.freeze({
    id: 'mace-depa-guard', name: 'Mace + Depa + Jedi Temple Guard', confidence: 0.98, maxBand: 'r9', source: 'community-max-guide',
    units: Object.freeze([
      Object.freeze(['Jedi Master Mace Windu']), Object.freeze(['Depa Bilaba', 'Depa Billaba']), Object.freeze(['Jedi Temple Guard']),
    ]),
    note: 'Jedi Vanguard undersized core documented at the top difficulty in community max-score guides.',
  }),
  Object.freeze({
    id: 'dark-clone-trio', name: 'CX-2 + DCT + Appo', confidence: 0.98, maxBand: 'r9', source: 'community-max-guide',
    units: Object.freeze([
      Object.freeze(['CX-2']), Object.freeze(['Disguised Clone Trooper']), Object.freeze(['CC-1119 Appo', 'CC-1119 “Appo”', 'CC-1119 "Appo"', 'Appo']),
    ]),
    note: 'Dark Side Clone Trooper trio documented at the top difficulty in community max-score guides.',
  }),
  Object.freeze({
    id: 'kelleran-jocasta-core', name: 'Kelleran + Jocasta + Plo + Barriss', confidence: 0.96, maxBand: 'r8', source: 'community-max-guide',
    units: Object.freeze([
      Object.freeze(['Kelleran Beq']), Object.freeze(['Jocasta Nu']), Object.freeze(['Plo Koon']), Object.freeze(['Barriss Offee']),
    ]),
    note: 'Four-character Jedi Vanguard route documented through the R8 difficulty in community guides.',
  }),
  Object.freeze({
    id: 'bad-batch-mercenary', name: 'Bad Batch Mercenary', confidence: 0.95, maxBand: 'r8', source: 'community-guide',
    units: Object.freeze([
      Object.freeze(['Omega Fugitive', 'Omega (Fugitive)']), Object.freeze(['Batcher']), Object.freeze(['Hunter Mercenary', 'Hunter (Mercenary)']),
      Object.freeze(['Wrecker Mercenary', 'Wrecker (Mercenary)']), Object.freeze(['Crosshair Scarred', 'Crosshair (Scarred)']),
    ]),
    note: 'Full Bad Batch route; high-difficulty community guides document this family at R5-R8 depending roster/mods.',
  }),
  Object.freeze({
    id: 'hondo-solo', name: 'Hondo Solo', confidence: 0.90, maxBand: 'none', source: 'community-guide',
    units: Object.freeze([Object.freeze(['Hondo Ohnaka'])]),
    note: 'Conservative 300K solo route documented in community guides; higher damage is not assumed here.',
  }),
  Object.freeze({
    id: 'nest-solo', name: 'Enfys Nest Solo', confidence: 0.88, maxBand: 'none', source: 'community-guide',
    units: Object.freeze([Object.freeze(['Enfys Nest'])]),
    note: 'Conservative base-difficulty solo route documented in community guides.',
  }),
  Object.freeze({
    id: 'tarkin-solo', name: 'Tarkin Solo', confidence: 0.88, maxBand: 'none', source: 'community-guide',
    units: Object.freeze([Object.freeze(['Grand Moff Tarkin'])]),
    note: 'Conservative 300K solo route; the stronger Tarkin + Scorch route is preferred when available.',
  }),
]);

function progressionRank(unit = {}) {
  return finite(unit.relic) * 1_000_000 + finite(unit.gear) * 100_000 + finite(unit.stars) * 10_000 + finite(unit.power);
}

function progressionLabel(unit = {}) {
  if (finite(unit.relic) > 0) return `R${finite(unit.relic)}`;
  if (finite(unit.gear) > 0) return `G${finite(unit.gear)}`;
  return `${finite(unit.stars)}★`;
}

function highestDifficultyForUnit(unit = {}) {
  for (let index = ORDER66_DIFFICULTIES.length - 1; index >= 0; index -= 1) {
    const difficulty = ORDER66_DIFFICULTIES[index];
    const band = ORDER66_RAID.progressionBands.find((row) => row.id === difficulty.id);
    if (band && unitMeetsRaidBand(unit, band)) return { ...difficulty, index };
  }
  return { ...ORDER66_DIFFICULTIES[0], index: 0 };
}

function routeDifficulty(units, maxBand) {
  const rosterIndex = Math.min(...units.map((unit) => highestDifficultyForUnit(unit).index));
  const routeCap = difficultyById.get(maxBand)?.index ?? ORDER66_DIFFICULTIES.length - 1;
  return ORDER66_DIFFICULTIES[Math.min(rosterIndex, routeCap)];
}

function unitIndex(units = []) {
  const index = new Map();
  for (const unit of units) {
    const keys = new Set([normalize(unit.name), normalize(unit.baseId)]);
    for (const key of keys) if (key && !index.has(key)) index.set(key, unit);
  }
  return index;
}

function resolveAlias(index, aliases = []) {
  for (const alias of aliases) {
    const key = normalize(alias);
    if (index.has(key)) return index.get(key);
  }
  return null;
}

function candidateRoutes(eligibleUnits = []) {
  const index = unitIndex(eligibleUnits);
  return ROUTES.map((route) => {
    const units = route.units.map((aliases) => resolveAlias(index, aliases));
    if (units.some((unit) => !unit)) return null;
    const difficulty = routeDifficulty(units, route.maxBand);
    return Object.freeze({
      id: route.id,
      name: route.name,
      confidence: route.confidence,
      source: route.source,
      note: route.note,
      difficulty: Object.freeze({ ...difficulty }),
      maxScoreCeiling: difficulty.maxScore,
      units: Object.freeze(units.map((unit) => Object.freeze({
        baseId: text(unit.baseId), name: text(unit.name || unit.baseId), progression: progressionLabel(unit),
        relic: finite(unit.relic), gear: finite(unit.gear), stars: finite(unit.stars), power: finite(unit.power),
      }))),
      unitKeys: Object.freeze(units.map((unit) => text(unit.baseId || unit.name))),
      optimizationValue: Math.round(difficulty.maxScore * route.confidence),
    });
  }).filter(Boolean);
}

function bestRouteSet(candidates, maxAttempts = 5) {
  let best = { value: -1, ceiling: -1, routes: [] };
  function visit(index, chosen, used, value, ceiling) {
    if (chosen.length > maxAttempts) return;
    if (index >= candidates.length) {
      if (value > best.value || (value === best.value && ceiling > best.ceiling)) best = { value, ceiling, routes: chosen.slice() };
      return;
    }
    visit(index + 1, chosen, used, value, ceiling);
    const candidate = candidates[index];
    if (candidate.unitKeys.some((key) => used.has(key))) return;
    const nextUsed = new Set(used);
    candidate.unitKeys.forEach((key) => nextUsed.add(key));
    chosen.push(candidate);
    visit(index + 1, chosen, nextUsed, value + candidate.optimizationValue, ceiling + candidate.maxScoreCeiling);
    chosen.pop();
  }
  visit(0, [], new Set(), 0, 0);
  return Object.freeze(best.routes.sort((a, b) => b.maxScoreCeiling - a.maxScoreCeiling || b.confidence - a.confidence));
}

function fallbackAttempts(eligibleUnits, usedKeys, count) {
  if (count <= 0) return [];
  const leftovers = eligibleUnits.filter((unit) => !usedKeys.has(text(unit.baseId || unit.name)))
    .sort((a, b) => progressionRank(b) - progressionRank(a));
  const groups = new Map();
  for (const unit of leftovers) {
    const evidence = order66EligibilityEvidence(unit);
    const group = text(evidence.group || 'Other Eligible');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(unit);
  }
  const attempts = [];
  while (attempts.length < count) {
    const availableGroups = [...groups.entries()].filter(([, units]) => units.length);
    if (!availableGroups.length) break;
    availableGroups.sort((a, b) => progressionRank(b[1][0]) - progressionRank(a[1][0]) || b[1].length - a[1].length);
    const [group, units] = availableGroups[0];
    const picked = units.splice(0, Math.min(5, units.length));
    if (!picked.length) break;
    const difficulty = routeDifficulty(picked, 'r9');
    attempts.push(Object.freeze({
      id: `roster-fallback-${attempts.length + 1}`,
      name: `${group} roster fallback`,
      confidence: 0,
      source: 'roster-only-fallback',
      note: 'Eligible non-overlapping roster package only. Strategy and max-score viability are not validated, so this ceiling is not included in the recommended score ceiling.',
      difficulty: Object.freeze({ ...difficulty }),
      maxScoreCeiling: difficulty.maxScore,
      units: Object.freeze(picked.map((unit) => Object.freeze({
        baseId: text(unit.baseId), name: text(unit.name || unit.baseId), progression: progressionLabel(unit),
        relic: finite(unit.relic), gear: finite(unit.gear), stars: finite(unit.stars), power: finite(unit.power),
      }))),
    }));
  }
  return attempts;
}

export function buildOrder66RaidMax(roster = {}, options = {}) {
  const maxAttempts = Math.max(1, Math.min(5, Math.trunc(finite(options.maxAttempts, 5))));
  const owned = asArray(roster.units)
    .filter((unit) => finite(unit.stars) >= 5)
    .filter((unit) => order66EligibilityEvidence(unit).allowed);
  const candidates = candidateRoutes(owned);
  const recommended = bestRouteSet(candidates, maxAttempts);
  const used = new Set(recommended.flatMap((route) => route.unitKeys));
  const fallbacks = fallbackAttempts(owned, used, maxAttempts - recommended.length);
  const attempts = [...recommended, ...fallbacks].slice(0, maxAttempts).map((route, index) => Object.freeze({ ...route, attempt: index + 1, unitKeys: undefined, optimizationValue: undefined }));
  const recommendedCeiling = recommended.reduce((sum, route) => sum + route.maxScoreCeiling, 0);
  const eligibilityCeiling = attempts.reduce((sum, route) => sum + route.maxScoreCeiling, 0);
  const usedBaseIds = new Set(attempts.flatMap((route) => route.units.map((unit) => unit.baseId)));
  const unused = owned.filter((unit) => !usedBaseIds.has(text(unit.baseId))).sort((a, b) => progressionRank(b) - progressionRank(a));

  return Object.freeze({
    action: 'raid-max',
    version: 'order66-v1',
    raid: Object.freeze({ id: ORDER66_RAID.id, name: ORDER66_RAID.name, attemptsAllowed: 5, rosterRefresh: 'never' }),
    player: Object.freeze({
      allyCode: text(roster?.player?.allyCode), name: text(roster?.player?.name), galacticPower: finite(roster?.player?.galacticPower),
      rosterSyncedAt: text(roster?.fetchedAt || roster?.player?.updatedAt),
    }),
    summary: Object.freeze({
      eligibleOwned: owned.length,
      validatedRoutes: recommended.length,
      fallbackRoutes: fallbacks.length,
      attemptsBuilt: attempts.length,
      recommendedMaxScoreCeiling: recommendedCeiling,
      allEligibilityCeiling: eligibilityCeiling,
      scoreSemantics: 'difficulty-ceiling-not-damage-prediction',
    }),
    attempts: Object.freeze(attempts),
    unusedEligible: Object.freeze(unused.slice(0, 30).map((unit) => Object.freeze({
      baseId: text(unit.baseId), name: text(unit.name || unit.baseId), progression: progressionLabel(unit), power: finite(unit.power),
    }))),
    evidence: Object.freeze({
      official: 'Capital Games Order 66 raid rules + SWGOH.GG difficulty requirements/scoring',
      community: 'Published Order 66 max-score team guides; only high-level composition evidence is encoded',
      disclaimer: 'A difficulty ceiling means the roster meets the listed entry requirement for this route. It is not a guaranteed score; mods, turn order, strategy, RNG, and future game changes can alter results.',
    }),
  });
}
