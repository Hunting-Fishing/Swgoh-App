export const TB_SOURCES = Object.freeze({
  swgohgg: {
    id: "swgohgg",
    label: "SWGOH.GG Territory Battles",
    kind: "current-reference",
  },
  swgohWiki: {
    id: "swgoh-wiki",
    label: "SWGOH Wiki Territory Battle zone tables",
    kind: "reference",
  },
  eaForums: {
    id: "ea-forums",
    label: "EA / Capital Games Territory Battle posts",
    kind: "official",
  },
  genskaarGeo: {
    id: "genskaar-geo",
    label: "Genskaar Interactive Geonosis TB",
    kind: "community-reference",
    license: "MIT",
  },
  genskaarRote: {
    id: "genskaar-rote",
    label: "Genskaar Interactive ROTE TB",
    kind: "community-reference",
  },
  swgohRote: {
    id: "swgohrote",
    label: "SWGOH RoTE Auto Guide",
    kind: "community-reference",
  },
});

export const TERRITORY_BATTLES = Object.freeze([
  {
    id: "hoth-rebel",
    gameId: "t01D",
    name: "Hoth: Rebel Assault",
    shortName: "Hoth LS",
    family: "Hoth",
    alignment: "Light",
    phases: 6,
    phaseHours: 24,
    exclusiveReward: "Rebel Officer Leia Organa shards",
    mapStatus: "live",
    recommendationStatus: "planning",
    sourceIds: ["swgohgg", "swgoh-wiki"],
    theme: "hoth-light",
  },
  {
    id: "hoth-imperial",
    gameId: "t02D",
    name: "Hoth: Imperial Retaliation",
    shortName: "Hoth DS",
    family: "Hoth",
    alignment: "Dark",
    phases: 6,
    phaseHours: 24,
    exclusiveReward: "Imperial Probe Droid shards",
    mapStatus: "live",
    recommendationStatus: "planning",
    sourceIds: ["swgohgg", "swgoh-wiki", "ea-forums"],
    theme: "hoth-dark",
  },
  {
    id: "geo-separatist",
    gameId: "t03D",
    name: "Geonosis: Separatist Might",
    shortName: "Geo DS",
    family: "Geonosis",
    alignment: "Dark",
    phases: 4,
    phaseHours: 36,
    requiredGuildGp: 80000000,
    recommendedGuildGp: 140000000,
    exclusiveReward: "Wat Tambor shards",
    mapStatus: "live",
    recommendationStatus: "community-reference",
    sourceIds: ["swgohgg", "swgoh-wiki", "genskaar-geo"],
    theme: "geo-dark",
  },
  {
    id: "geo-republic",
    gameId: "t04D",
    name: "Geonosis: Republic Offensive",
    shortName: "Geo LS",
    family: "Geonosis",
    alignment: "Light",
    phases: 4,
    phaseHours: 36,
    requiredGuildGp: 100000000,
    recommendedGuildGp: 150000000,
    exclusiveReward: "Ki-Adi-Mundi shards",
    mapStatus: "live",
    recommendationStatus: "community-reference",
    sourceIds: ["swgohgg", "swgoh-wiki", "genskaar-geo"],
    theme: "geo-light",
  },
  {
    id: "rote",
    gameId: "t05D",
    name: "Rise of the Empire",
    shortName: "ROTE",
    family: "Galactic",
    alignment: "Mixed",
    phases: 6,
    phaseHours: 24,
    requiredGuildGp: 200000000,
    recommendedGuildGp: 250000000,
    exclusiveReward: "Third Sister shards",
    mapStatus: "live",
    recommendationStatus: "building",
    sourceIds: ["swgohgg", "ea-forums", "genskaar-rote", "swgohrote"],
    theme: "rote",
  },
]);

export const TB_BY_ID = new Map(TERRITORY_BATTLES.map((tb) => [tb.id, tb]));

export function territoryBattleById(id) {
  return TB_BY_ID.get(String(id || "")) || TERRITORY_BATTLES[TERRITORY_BATTLES.length - 1];
}

export function phaseScaffold(tb) {
  const battle = typeof tb === "string" ? territoryBattleById(tb) : tb;
  return Array.from({ length: Number(battle?.phases || 0) }, (_, index) => ({
    id: `${battle.id}-p${index + 1}`,
    phase: index + 1,
    label: `Phase ${index + 1}`,
    verifiedTerritories: [],
    missionCount: null,
    status: battle.mapStatus === "live" ? "live" : "verification",
  }));
}

export function sourceLabels(tb) {
  return (tb?.sourceIds || []).map((id) => Object.values(TB_SOURCES).find((source) => source.id === id)?.label || id);
}
