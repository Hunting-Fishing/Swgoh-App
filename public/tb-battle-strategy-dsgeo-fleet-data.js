const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const DS_GEO_FLEET_STRATEGY_SOURCES = Object.freeze([
  { id: "swgohgg-ds-geo", label: "SWGOH.GG · Geonosis: Separatist Might", kind: "current-reference", url: "https://swgoh.gg/territory-battles/t03D/" },
  { id: "cg-p2-ship-requirements-2021", label: "Capital Games · DS Geo Phase 2 ship requirement update", kind: "official", url: "https://swgoh.gg/news/content-update-11032021/" },
  { id: "cg-dsgeo-platoons", label: "Capital Games · DS Geo phase star requirements", kind: "official", url: "https://swgoh.gg/news/geonosian-territory-battle-platoons-dark-side/" },
  { id: "bitdynasty-p4-full", label: "BitDynasty · Phase 4 DS Geo fleet/full-clear testing", kind: "community-tested", url: "https://swgoh.tv/video/22816-phase-4-special-combat-missions-full-clear-ds-geo-tb-swgoh" },
  { id: "hynesy-p4-ht", label: "Hynesy · Phase 4 ship CM Hound's Tooth guide", kind: "community-tested", url: "https://swgoh.tv/video/8544-swgoh-ds-geo-tb-phase-4-ship-cm-guide-with-ht" },
  { id: "bitdynasty-p4-chimaera", label: "BitDynasty · Phase 4 Chimaera/Hound's Tooth fleet clear", kind: "community-tested", url: "https://swgoh.tv/video/12101-the-easy-way-to-win-fleet-combat-missions-phase-4-geo-ds-tb-swgoh" },
]);

const source = (id) => DS_GEO_FLEET_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

function partialFleet(missionId, title, phase, notes = []) {
  return Object.freeze({
    id: `${missionId}-dsgeo-fleet-v1`,
    missionId,
    title,
    status: "current-entry-partial-strategy",
    confidence: "current-entry-community-reference-partial",
    lastVerified: "2026-08-16",
    sources: sources("swgohgg-ds-geo", "cg-p2-ship-requirements-2021", "cg-dsgeo-platoons"),
    summary: `Phase ${phase} DS Geo fleet guidance. Entry/star rules are current, while exact current enemy/reinforcement sequencing is not sufficiently re-tested for this node. The app therefore evaluates legal Dark Side fleet depth and preserves adaptive reinforcement logic instead of presenting an obsolete capital-ship requirement or fixed kill order.`,
    keyUnits: [],
    keyAbilities: [],
    stages: [
      stage("preflight", "Preflight · legal Dark Side fleet", [
        step("entry", `Confirm the Phase ${phase} ship star gate and use the strongest legal Dark Side fleet available.`, { priority: "critical" }),
        ...(phase === 2 ? [step("p2-rule", "Do not enforce the historical Chimaera/Executrix-specific Phase 2 requirement; Capital Games removed most Phase 2 ship restrictions in 2021 and left Dark Side as the mission requirement.", { priority: "critical" })] : []),
        step("starting-three", "Choose a starting three that can survive the opening without relying on an immediate reinforcement rescue; preserve the bench for control, cleanse, tanking or burst as the actual enemy board demands.", { priority: "high" }),
      ], { objective: "Enter with a legal fleet and enough opening stability to reach the reinforcement cycle." }),
      stage("adaptive", "Battle · adaptive target and reinforcement control", [
        step("engine", "Prioritize the enemy ship that drives the current damage/control engine rather than a fixed historical name order.", { priority: "high" }),
        step("reinforcement", "Call the reinforcement that solves the current board state—tank, cleanse, control or burst—rather than following a universal bench order.", { priority: "high" }),
        ...notes.map((instruction, index) => step(`note-${index + 1}`, instruction, { priority: "info" })),
      ], { objective: "Preserve fleet control while exact node-specific enemy sequencing remains under verification." }),
    ],
    targetPriorities: [{ target: "Current enemy fleet engine / highest-impact control or damage ship", priority: "high", when: "throughout", reason: "Exact current node-specific spawn and reinforcement order remains under verification." }],
    failureRisks: [
      "Reintroducing pre-2021 Phase 2 capital-ship requirements would incorrectly block legal fleets.",
      "A fixed reinforcement order can become wrong after dodges, targetability changes or enemy reinforcements.",
      "This pack is intentionally partial until node-specific current battle evidence is re-verified.",
    ],
    evidenceBoundary: "Current DS Geo event/star requirements and the 2021 Phase 2 Dark Side ship-rule update are official/current-reference facts. Exact current enemy fleets, kill order and reinforcement sequencing are not sufficiently re-verified for this node, so the pack remains partial and does not surface as VERIFIED STRATEGY AVAILABLE.",
  });
}

const P4_FLEET = Object.freeze({
  id: "c18-dsgeo-fleet-v1",
  missionId: "c18",
  title: "Republic Fleet · Phase 4 Fleet Combat Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgohgg-ds-geo", "cg-dsgeo-platoons", "bitdynasty-p4-full", "hynesy-p4-ht", "bitdynasty-p4-chimaera"),
  summary: "Phase 4 has repeated community-tested clears built around a durable Hound's Tooth opener, including Chimaera and Finalizer approaches. Hound's Tooth is treated as a tested survival anchor rather than a mission-mandatory ship. Preserve the tank through the opening, use the capital-ship/reinforcement cycle to remove the enemy fleet engine, and adapt the exact bench order to the board.",
  keyUnits: [
    { baseId: "HOUNDSTOOTH", name: "Hound's Tooth", importance: "high", reason: "Repeated Phase 4 mission guides use Hound's Tooth as the opening durability anchor; it is a tested recommendation, not a hard entry requirement." },
    { baseId: "CAPITALCHIMAERA", name: "Chimaera", importance: "helpful", reason: "One repeatedly documented Phase 4 clear route." },
    { baseId: "CAPITALFINALIZER", name: "Finalizer", importance: "helpful", reason: "BitDynasty documents a Phase 4 full-clear run using Finalizer." },
  ],
  keyAbilities: [],
  stages: [
    stage("opening", "Opening · stabilize behind Hound's Tooth", [
      step("ht-anchor", "If using the tested Hound's Tooth route, preserve Hound's Tooth as the opening tank and avoid exposing fragile damage ships before the fleet engine is established.", { priority: "critical", target: "Hound's Tooth" }),
      step("read-board", "Identify the enemy ship creating the largest immediate control/damage threat before committing the first major special or reinforcement.", { priority: "critical" }),
      step("capital-plan", "Use the chosen capital ship's control/tempo plan—Chimaera, Finalizer or another legal current fleet—without pretending one capital ship is mission-mandatory.", { priority: "high" }),
    ], { objective: "Survive the opening and establish a controllable reinforcement cycle." }),
    stage("reinforcement", "Midfight · reinforcement and threat removal", [
      step("solve-board", "Call the reinforcement that solves the current failure mode: extra tanking, cleanse, control or burst.", { priority: "high" }),
      step("focus-engine", "Concentrate damage on the enemy fleet engine/highest-impact attacker once targetability permits; do not spread pressure across protected low-value ships.", { priority: "high" }),
      step("close", "Once ahead, protect the tank/damage core and avoid unnecessary actions that give the enemy another recovery or reinforcement window.", { priority: "high" }),
    ], { objective: "Turn opening durability into a stable numbers and tempo advantage." }),
  ],
  targetPriorities: [{ target: "Enemy fleet engine / highest-impact attacker", priority: "critical", when: "after opening targetability is established", reason: "The tested fleets rely on surviving long enough to remove the enemy ship that can snowball the encounter." }],
  failureRisks: [
    "Treating Hound's Tooth as a mandatory entry ship would be incorrect; it is a tested recommendation.",
    "Letting the opening tank collapse before the first useful reinforcement can expose the entire fleet.",
    "A single fixed reinforcement order is not guaranteed across enemy variants and RNG.",
  ],
  evidenceBoundary: "Phase 4's 7-star ship baseline is official/current-reference. Hound's Tooth/Chimaera and Finalizer approaches are community-tested mission clears. The pack does not claim those are the only legal fleets, a deterministic enemy spawn, or a guaranteed win percentage.",
});

export const DS_GEO_FLEET_BATTLE_STRATEGIES = Object.freeze({
  c5: partialFleet("c5", "Core Ship Yards · Phase 2 Fleet Combat Mission 1", 2),
  c6: partialFleet("c6", "Core Ship Yards · Phase 2 Fleet Combat Mission 2", 2),
  c12: partialFleet("c12", "Contested Air Space · Phase 3 Fleet Combat Mission 1", 3),
  c13: partialFleet("c13", "Contested Air Space · Phase 3 Fleet Combat Mission 2", 3, ["Community planning favors Separatist/Geonosian ship engines here, but no additional named-ship entry gate is asserted by this pack."]),
  c18: P4_FLEET,
});

export function dsGeoFleetBattleStrategyForMission(missionId) {
  return DS_GEO_FLEET_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
