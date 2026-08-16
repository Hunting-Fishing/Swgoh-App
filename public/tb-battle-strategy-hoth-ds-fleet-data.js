const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const HOTH_DS_FLEET_STRATEGY_SOURCES = Object.freeze([
  { id: "swgoh-wiki-hoth-ds", label: "SWGOH Wiki · Hoth Imperial Retaliation", kind: "current-reference", url: "https://swgoh.wiki/wiki/Hoth_Imperial_Retaliation" },
  { id: "swgohgg-chimaera", label: "SWGOH.GG · Chimaera current ship data", kind: "current-reference", url: "https://swgoh.gg/units/chimaera/" },
  { id: "swgohgg-executor", label: "SWGOH.GG · Executor current ship data", kind: "current-reference", url: "https://swgoh.gg/units/executor/" },
]);

const source = (id) => HOTH_DS_FLEET_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

const DEFINITIONS = Object.freeze({
  "p3-fleet": { phase: 3, title: "Imperial Fleet Staging Area · Fleet Combat Mission", required: [] },
  "p4-fleet-cm": { phase: 4, title: "Contested Airspace · Fleet Combat Mission", required: [] },
  "p4-fleet-sm": { phase: 4, title: "Contested Airspace · Chimaera Fleet Special Mission", required: [{ baseId: "CAPITALCHIMAERA", name: "Chimaera" }] },
  "p5-fleet": { phase: 5, title: "Forward Airspace · Fleet Combat Mission", required: [] },
  "p6-fleet": { phase: 6, title: "Rear Airspace · Fleet Combat Mission", required: [] },
});

function build(missionId, config) {
  return Object.freeze({
    id: `${missionId}-hoth-ds-fleet-v1`,
    missionId,
    title: config.title,
    status: "current-entry-partial-strategy",
    confidence: "current-entry-partial",
    lastVerified: "2026-08-16",
    sources: sources("swgoh-wiki-hoth-ds", "swgohgg-chimaera", "swgohgg-executor"),
    summary: `Hoth DS Phase ${config.phase} fleet coverage. The canonical star/alignment gate${config.required.length ? ` and required ${config.required.map((row) => row.name).join(" + ")} entry piece` : ""} are enforced, while the player's strongest legal Dark Side fleet is ranked separately. Chimaera and Executor are current planning routes, not universal mandatory fleets outside explicit entry gates.`,
    keyUnits: [
      ...config.required.map((row) => ({ ...row, importance: "critical", reason: "Canonical Hoth DS fleet special-mission entry requirement." })),
      ...(!config.required.some((row) => row.baseId === "CAPITALCHIMAERA") ? [{ baseId: "CAPITALCHIMAERA", name: "Chimaera", importance: "helpful", reason: "Current planning route; not a hard gate on generic fleet missions." }] : []),
      { baseId: "CAPITALEXECUTOR", name: "Executor", importance: "helpful", reason: "Modern high-power Dark Side fleet option; not asserted as historically required for Hoth." },
    ],
    keyAbilities: [],
    stages: [
      stage("preflight", "Preflight · legal fleet and opening stability", [
        ...(config.required.length ? [step("required", `Verify ${config.required.map((row) => row.name).join(" + ")} is present and clears the mission star gate.`, { priority: "critical" })] : []),
        step("starting-line", "Use the strongest legal Dark Side starting three that can survive the opening without relying on an immediate reinforcement rescue.", { priority: "critical" }),
        step("bench", "Build the reinforcement bench around the missing board functions: tanking, cleanse, control, burst or target access.", { priority: "high" }),
      ], { objective: "Reach the reinforcement cycle with the primary fleet engine intact." }),
      stage("battle", "Battle · adaptive fleet control", [
        step("threat", "Focus the current enemy damage/control engine when targetability permits rather than following an unsourced fixed historical kill order.", { priority: "high" }),
        step("reinforcement", "Call the reinforcement that solves the actual board state, not a universal fixed bench sequence.", { priority: "high" }),
        step("capital", "Preserve the decisive capital-ship ability for a board-changing control, survival or elimination window.", { priority: "high" }),
      ], { objective: "Convert fleet stability into a controlled numbers advantage." }),
    ],
    targetPriorities: [{ target: "Current enemy fleet engine / highest-impact damage or control ship", priority: "high", when: "throughout", reason: "Exact current mission-specific fleet spawns and reinforcement order remain under verification." }],
    failureRisks: [
      "Treating Executor or Chimaera as mandatory on generic Hoth fleet nodes would overstate the entry contract.",
      "A fixed reinforcement order can become wrong after targetability, dodge or enemy reinforcement changes.",
      "This pack remains partial until exact current Hoth fleet battle sequencing is re-verified.",
    ],
    evidenceBoundary: "Hoth DS star/alignment and Chimaera special-mission entry gates are canonical mission-data facts. Current Chimaera/Executor data informs planning, but exact mission-specific enemy spawns, opening lineups and reinforcement order are not sufficiently re-verified, so the fleet packs remain partial.",
  });
}

export const HOTH_DS_FLEET_BATTLE_STRATEGIES = Object.freeze(Object.fromEntries(
  Object.entries(DEFINITIONS).map(([id, config]) => [id, build(id, config)]),
));

export function hothDsFleetBattleStrategyForMission(missionId) {
  return HOTH_DS_FLEET_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
