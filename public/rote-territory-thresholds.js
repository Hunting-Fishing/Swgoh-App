export const ROTE_THRESHOLD_REFERENCE = Object.freeze({
  dataset: 'rote-territory-star-thresholds',
  version: '2026-08-19',
  sourceKind: 'community-reference',
  sourceName: 'SWGoH Wiki — Rise of the Empire / Zone Information',
  sourceUrl: 'https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information',
  corroboration: Object.freeze([
    Object.freeze({
      scope: 'zeffo',
      sourceName: 'SWGOH.GG — Title Update 6/28/2023',
      sourceUrl: 'https://swgoh.gg/news/title-update-6282023/',
      note: 'Official update repost confirming Zeffo reward thresholds for the first two reward tiers.',
    }),
  ]),
  evidenceBoundary: 'Static reference thresholds used for deterministic route math. They are not live Territory Battle event state and must never overwrite officer/canonical current TP.',
});

const entries = [
  ['mustafar', 'Mustafar', 'P1', 116_406_250, 186_250_000, 248_333_333],
  ['corellia', 'Corellia', 'P1', 111_718_750, 178_750_000, 238_333_333],
  ['coruscant', 'Coruscant', 'P1', 116_406_250, 186_250_000, 248_333_333],
  ['geonosis', 'Geonosis', 'P2', 148_125_000, 237_000_000, 316_000_000],
  ['felucia', 'Felucia', 'P2', 148_125_000, 237_000_000, 316_000_000],
  ['bracca', 'Bracca', 'P2', 142_265_625, 227_625_000, 303_500_000],
  ['dathomir', 'Dathomir', 'P3', 158_960_938, 254_337_500, 339_116_667],
  ['tatooine', 'Tatooine', 'P3', 190_953_125, 305_525_000, 407_366_667],
  ['kashyyyk', 'Kashyyyk', 'P3', 190_953_125, 305_525_000, 407_366_667],
  ['zeffo', 'Zeffo', 'P3', 143_589_583, 229_743_333, 287_179_167],
  ['haven', 'Haven Medical Station', 'P4', 235_143_105, 400_243_583, 500_304_479],
  ['kessel', 'Kessel', 'P4', 235_143_105, 400_243_583, 500_304_479],
  ['lothal', 'Lothal', 'P4', 246_742_558, 419_987_333, 524_984_167],
  ['mandalore', 'Mandalore', 'P4', 197_748_650, 316_397_840, 396_497_300],
  ['malachor', 'Malachor', 'P5', 341_250_768, 620_455_942, 729_948_167],
  ['vandor', 'Vandor', 'P5', 341_250_768, 620_455_942, 729_948_167],
  ['kafrene', 'Ring of Kafrene', 'P5', 341_250_768, 620_455_942, 729_948_167],
  ['death-star', 'Death Star', 'P6', 582_632_425, 1_059_331_682, 1_246_272_567],
  ['hoth', 'Hoth', 'P6', 582_632_425, 1_059_331_682, 1_246_272_567],
  ['scarif', 'Scarif', 'P6', 555_710_999, 1_010_383_635, 1_188_686_629],
];

export const ROTE_TERRITORY_THRESHOLDS = Object.freeze(entries.map(([planetId, name, playablePhase, oneStar, twoStar, threeStar]) => Object.freeze({
  planetId,
  name,
  playablePhase,
  starThresholds: Object.freeze([oneStar, twoStar, threeStar]),
  sourceKind: ROTE_THRESHOLD_REFERENCE.sourceKind,
  referenceVersion: ROTE_THRESHOLD_REFERENCE.version,
})));

const byId = new Map(ROTE_TERRITORY_THRESHOLDS.map((entry) => [entry.planetId, entry]));

export function roteTerritoryThresholdById(planetId) {
  return byId.get(String(planetId || '').trim().toLowerCase()) || null;
}

export function roteStarThresholdsByPlanetId(planetId) {
  return roteTerritoryThresholdById(planetId)?.starThresholds || null;
}

export function roteThresholdForStars(planetId, stars) {
  const thresholds = roteStarThresholdsByPlanetId(planetId);
  const target = Math.trunc(Number(stars));
  if (!thresholds || !Number.isInteger(target) || target < 1 || target > 3) return null;
  return thresholds[target - 1];
}

export function rotePreloadCapBeforeStar(planetId, starToAvoid) {
  const threshold = roteThresholdForStars(planetId, starToAvoid);
  return Number.isFinite(threshold) ? threshold - 1 : null;
}

export function withRoteStarThresholds(zone = {}) {
  const planetId = String(zone.planetId ?? zone.planet_id ?? '').trim().toLowerCase();
  const reference = roteTerritoryThresholdById(planetId);
  if (!reference) return Object.freeze({ ...zone });
  return Object.freeze({
    ...zone,
    starThresholds: reference.starThresholds,
    starThresholdSource: Object.freeze({
      kind: reference.sourceKind,
      dataset: ROTE_THRESHOLD_REFERENCE.dataset,
      version: reference.referenceVersion,
      url: ROTE_THRESHOLD_REFERENCE.sourceUrl,
    }),
  });
}

export function withRoteStarThresholdCatalog(zones = []) {
  return Object.freeze((Array.isArray(zones) ? zones : []).map(withRoteStarThresholds));
}
