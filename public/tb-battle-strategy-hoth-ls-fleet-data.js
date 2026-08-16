const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const HOTH_LS_FLEET_STRATEGY_SOURCES = Object.freeze([
  { id: "swgohgg-hoth-ls", label: "SWGOH.GG · Hoth: Rebel Assault current Territory Battle data", kind: "current-reference", url: "https://swgoh.gg/territory-battles/t01D/" },
  { id: "swgohgg-home-one", label: "SWGOH.GG · Home One current ship data", kind: "current-reference", url: "https://swgoh.gg/units/home-one/" },
  { id: "swgohgg-profundity", label: "SWGOH.GG · Profundity current ship data", kind: "current-reference", url: "https://swgoh.gg/units/profundity/" },
]);

const source = (id) => HOTH_LS_FLEET_STRATEGY_SOURCES.find((row) => row.id === id);

const DEFINITIONS = Object.freeze({
  "p3-fleet": { phase: 3, title: "Contested Airspace · Phase 3 Fleet Combat Mission" },
  "p4-fleet": { phase: 4, title: "Forward Airspace · Phase 4 Fleet Combat Mission" },
  "p5-fleet": { phase: 5, title: "Contested Airspace · Phase 5 Fleet Combat Mission" },
  "p6-fleet": { phase: 6, title: "Rear Airspace · Phase 6 Fleet Combat Mission" },
});

function build(missionId, config) {
  return Object.freeze({
    id: `${missionId}-hoth-ls-fleet-v1`,
    missionId,
    title: config.title,
    status: "current-entry-partial-strategy",
    confidence: "current-entry-current-modifier-partial",
    lastVerified: "2026-08-16",
    sources: [source("swgohgg-hoth-ls"), source("swgohgg-home-one"), source("swgohgg-profundity")].filter(Boolean),
    summary: `Hoth Rebel Assault Phase ${config.phase} fleet coverage. The current Territory Battle supplies the platoon-unlocked Ion Cannon Blast strategic ability: it Stuns the selected enemy, higher levels add Turn Meter removal, and Level 3 no longer starts on cooldown. Because guild platoon completion can change the available level, the app treats Ion Cannon as a conditional control resource rather than assuming one fixed opening.`,
    keyUnits: [
      { baseId: "CAPITALMONCALAMARICRUISER", name: "Home One", importance: "helpful", reason: "Canonical Hoth planning route from the app's mission recommendations; current base ID is verified and it is not a hard mission-entry requirement." },
      { baseId: "CAPITALPROFUNDITY", name: "Profundity", importance: "helpful", reason: "Modern Light Side Rebel fleet option when owned; not a historical Hoth mission requirement." },
    ],
    keyAbilities: [],
    stages: [
      stage("preflight", "Preflight · legal Light Side fleet and platoon state", [
        step("legal", `Confirm the Phase ${config.phase} Light Side ship star gate and select the strongest legal starting fleet rather than forcing Home One or Profundity where neither is a hard entry requirement.`, { priority: "critical" }),
        step("ion-level", "Check the guild's current Ion Cannon Blast level before battle. Do not plan immediate Stun/Turn Meter control if the strategic ability is still locked or begins on cooldown at the current platoon tier.", { priority: "critical" }),
        step("opening-three", "Choose a starting three that can survive until the first reinforcement/control window even if Ion Cannon is unavailable on turn one.", { priority: "high" }),
      ], { objective: "Enter with a fleet plan that matches both the roster and the guild's current strategic-ability state." }),
      stage("control", "Battle · use Ion Cannon and reinforcements to break the enemy engine", [
        step("ion-target", "When Ion Cannon Blast is available, spend it on the enemy ship whose next turn, taunt, reinforcement acceleration or damage cycle most threatens the fleet—not automatically on the lowest-Health target.", { priority: "high", ability: "Ion Cannon Blast" }),
        step("tm-value", "At Ion Cannon levels that remove Turn Meter, prefer a target where the Turn Meter denial materially delays a dangerous action.", { priority: "high", ability: "Ion Cannon Blast" }),
        step("reinforcement", "Call the reinforcement that solves the current board state—tank, cleanse, target access, control or burst—rather than following an unsourced fixed bench order.", { priority: "high" }),
      ], { objective: "Convert guild strategic control and reinforcement tempo into a stable numbers advantage." }),
      stage("close", "Closeout · protect the winning fleet", [
        step("focus", "Once ahead, focus the remaining enemy damage/control engine and avoid spreading attacks across low-impact ships.", { priority: "high" }),
        step("preserve", "Do not burn the next Ion Cannon or capital-ship control ability on cleanup if preserving it is safer for a subsequent encounter state.", { priority: "high" }),
      ], { objective: "Finish without giving the enemy fleet a recovery or reinforcement comeback window." }),
    ],
    targetPriorities: [{ target: "Current enemy fleet engine / highest-impact damage or control ship", priority: "high", when: "throughout", reason: "Use Ion Cannon and normal fleet control against the enemy action most likely to destabilize the current board." }],
    failureRisks: [
      "Assuming Ion Cannon Blast has the same cooldown/Turn Meter effect for every guild ignores platoon-level differences.",
      "Treating Home One or Profundity as mandatory would incorrectly block other legal Light Side fleets.",
      "Exact current enemy fleet spawns and reinforcement order are not sufficiently re-verified, so this pack remains partial.",
    ],
    evidenceBoundary: "The Hoth Rebel Assault fleet entry baseline and Ion Cannon Blast strategic-ability behavior are current SWGOH.GG Territory Battle facts. Home One and Profundity base IDs/current ship records are verified. Capital-ship selection, enemy spawn and exact reinforcement order remain roster/board dependent; no guaranteed clear percentage or universal fleet script is claimed.",
  });
}

export const HOTH_LS_FLEET_BATTLE_STRATEGIES = Object.freeze(Object.fromEntries(
  Object.entries(DEFINITIONS).map(([id, config]) => [id, build(id, config)]),
));

export function hothLsFleetBattleStrategyForMission(missionId) {
  return HOTH_LS_FLEET_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
