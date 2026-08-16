const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const LS_GEO_FLEET_STRATEGY_SOURCES = Object.freeze([
  { id: "swgoh-wiki-lsgeo", label: "SWGOH Wiki · Geonosis Republic Offensive", kind: "current-reference", url: "https://swgoh.wiki/wiki/Geonosis_Republic_Offensive" },
  { id: "swgohgg-negotiator", label: "SWGOH.GG · Negotiator current ship kit", kind: "current-reference", url: "https://swgoh.gg/units/negotiator/" },
  { id: "swgohgg-anakin-eta", label: "SWGOH.GG · Anakin's Eta-2 Starfighter current ship data", kind: "current-reference", url: "https://swgoh.gg/units/anakin-eta-2-starfighter/" },
  { id: "xaereth-lsgeo-p3", label: "Xaereth Prevails · LS Geo Day 3 Negotiator ships-zone clear", kind: "community-tested", url: "https://swgoh.tv/video/19797-ls-geo-day-3-16-of-17-waves-i-go-rogue-on-kam-mission-march-2020" },
]);

const source = (id) => LS_GEO_FLEET_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

const MISSION_REQUIREMENTS = Object.freeze({
  "p1-fleet": { phase: 1, label: "Galactic Republic Fleet · Phase 1 Combat", required: [] },
  "p2-fleet-cm": { phase: 2, label: "Contested Air Space · Phase 2 Fleet Combat", required: [] },
  "p2-fleet-sm": { phase: 2, label: "Contested Air Space · Phase 2 Galactic Republic Fleet Special", required: [] },
  "p3-fleet-cm": { phase: 3, label: "Contested Air Space · Phase 3 Fleet Combat", required: [] },
  "p3-fleet-sm": { phase: 3, label: "Contested Air Space · Phase 3 Galactic Republic + Anakin Eta-2 Special", required: [{ baseId: "JEDISTARFIGHTERANAKIN", name: "Anakin's Eta-2 Starfighter" }] },
  "p4-fleet-cm": { phase: 4, label: "Separatist Armada · Phase 4 Fleet Combat", required: [] },
  "p4-fleet-sm": { phase: 4, label: "Separatist Armada · Phase 4 Negotiator + Anakin Eta-2 Special", required: [{ baseId: "CAPITALNEGOTIATOR", name: "Negotiator" }, { baseId: "JEDISTARFIGHTERANAKIN", name: "Anakin's Eta-2 Starfighter" }] },
});

function buildFleetStrategy(missionId, config) {
  const exactP3Evidence = missionId === "p3-fleet-cm";
  return Object.freeze({
    id: `${missionId}-lsgeo-fleet-v1`,
    missionId,
    title: config.label,
    status: "current-entry-partial-strategy",
    confidence: exactP3Evidence ? "community-tested-route-partial" : "current-entry-partial",
    lastVerified: "2026-08-16",
    sources: sources(
      "swgoh-wiki-lsgeo",
      "swgohgg-negotiator",
      ...(config.required.some((row) => row.baseId === "JEDISTARFIGHTERANAKIN") ? ["swgohgg-anakin-eta"] : []),
      ...(exactP3Evidence ? ["xaereth-lsgeo-p3"] : []),
    ),
    summary: `Phase ${config.phase} LS Geo fleet guidance. The mission's Light Side/Galactic Republic and named-ship entry gates are enforced by canonical mission data. Negotiator is a current Galactic Republic fleet engine and has direct Phase 3 ships-zone clear evidence, but this pack intentionally does not invent a universal opening lineup, enemy spawn, or reinforcement order for ${config.label}.`,
    keyUnits: [
      ...config.required.map((row) => ({ ...row, importance: "critical", reason: "Canonical mission-entry requirement." })),
      ...(!config.required.some((row) => row.baseId === "CAPITALNEGOTIATOR") ? [{ baseId: "CAPITALNEGOTIATOR", name: "Negotiator", importance: "helpful", reason: "Strong current Galactic Republic capital-ship route and directly tested in the Phase 3 ships zone; not asserted as mandatory where the mission data does not require it." }] : []),
    ],
    keyAbilities: [],
    stages: [
      stage("preflight", "Preflight · legal fleet and opening durability", [
        ...(config.required.length ? [step("required", `Verify the required ${config.required.map((row) => row.name).join(" + ")} entry piece${config.required.length > 1 ? "s" : ""} before ranking the rest of the fleet.`, { priority: "critical" })] : []),
        step("legal-pool", "Build from the mission's legal Light Side/Galactic Republic ship pool and choose an opening three that can survive the first enemy rotation without depending on an immediate rescue reinforcement.", { priority: "critical" }),
        step("protect-engine", "Protect the fleet's primary damage/tempo ship and avoid sacrificing it for low-value early damage.", { priority: "high" }),
      ], { objective: "Reach the first reinforcement cycle with the fleet engine intact." }),
      stage("battle", "Battle · adaptive reinforcement and target control", [
        step("threat", "Identify the enemy ship currently driving the most dangerous damage, control, or reinforcement snowball and focus it when targetability permits.", { priority: "high" }),
        step("reinforcement", "Call the reinforcement that solves the actual board state—tank, cleanse, control or burst—rather than following a fixed bench order that may be stale for the encounter.", { priority: "high" }),
        step("capital", "Use the capital ship's major control/protection ability when it changes survival or target access; do not spend it simply because it is available.", { priority: "high" }),
      ], { objective: "Convert opening stability into a controlled numbers advantage." }),
    ],
    targetPriorities: [{ target: "Current enemy fleet engine / highest-impact damage or control ship", priority: "high", when: "throughout", reason: "Exact enemy/reinforcement ordering is not sufficiently re-verified to justify a fixed universal list." }],
    failureRisks: [
      "Treating Negotiator as mandatory on a node without an explicit Negotiator entry gate would incorrectly block other legal fleets.",
      "A fixed reinforcement order can become wrong after enemy targetability, dodges, assists, or reinforcement changes.",
      "The Phase 3 Negotiator clear proves route viability, not a deterministic script or guaranteed clear rate.",
    ],
    evidenceBoundary: "Canonical LS Geo mission data supplies current entry gates. Negotiator/Anakin current behavior is sourced from SWGOH.GG, and Phase 3 has direct community-tested Negotiator ships-zone evidence. Exact mission-specific opening lineups, enemy spawns, and reinforcement sequences are not sufficiently re-verified for every fleet node, so all LS Geo fleet packs remain partial for now.",
  });
}

export const LS_GEO_FLEET_BATTLE_STRATEGIES = Object.freeze(Object.fromEntries(
  Object.entries(MISSION_REQUIREMENTS).map(([id, config]) => [id, buildFleetStrategy(id, config)]),
));

export function lsGeoFleetBattleStrategyForMission(missionId) {
  return LS_GEO_FLEET_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
