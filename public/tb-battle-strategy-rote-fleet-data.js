const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_FLEET_STRATEGY_SOURCES = Object.freeze([
  {
    id: "cg-rote-details",
    label: "Capital Games · Rise of the Empire details and space modifiers",
    kind: "official",
    url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373",
  },
  {
    id: "cg-zeffo",
    label: "Capital Games · Zeffo Bonus Zone information",
    kind: "official",
    url: "https://swgoh.gg/news/title-update-6282023/",
  },
  {
    id: "cg-mandalore",
    label: "Capital Games · Mandalore Bonus Zone information",
    kind: "official",
    url: "https://swgoh.gg/news/mandalore-bonus-zone-information/",
  },
  {
    id: "swgohgg-negotiator",
    label: "SWGOH.GG · Negotiator current ship data",
    kind: "current-reference",
    url: "https://swgoh.gg/units/negotiator/",
  },
  {
    id: "swgohgg-gauntlet",
    label: "SWGOH.GG · Gauntlet Starfighter current ship data",
    kind: "current-reference",
    url: "https://swgoh.gg/units/gauntlet-starfighter/",
  },
  {
    id: "xaereth-rote-p4-2026",
    label: "Xaereth Prevails · 2026 Phase 4 ROTE fleet testing",
    kind: "community-tested",
    url: "https://swgoh.tv/video/48709-phase-4-rote-lots-of-full-auto-teams-w-timestamps-galaxyofheroes-swgoh",
  },
]);

const sources = (...ids) => ROTE_FLEET_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

const SPACE_MODIFIERS = Object.freeze({
  "mustafar-fleet": {
    name: "Molten Planet",
    rule: "Whenever a ship uses an ability, it is inflicted with Burning for 1 turn; the application cannot be evaded or resisted.",
    response: "Plan around unavoidable Burning instead of spending actions trying to prevent the environmental application. Favor fleets with recovery, durability, or fast battle closure.",
  },
  "corellia-fleet": {
    name: "Corellian Engineering",
    rule: "Each side summons a random Corellian Engineering Cargo Ship; at the start of its turn the Cargo Ship gains Protection Over Time for 1 turn.",
    response: "Do not let the summoned Cargo Ship distract from the enemy fleet's real control/damage engine. Re-evaluate target priority only when the summon materially changes survivability or targetability.",
  },
  "coruscant-fleet": {
    name: "This Is Where the Fun Begins",
    rule: "At battle start a random ship is Marked until it receives damage; while a ship is Marked, the other ships gain Taunt for the rest of the encounter.",
    response: "Read the opening Mark before committing attacks. Use the forced target window to establish your fleet engine, then reassess permanent Taunts and reinforcement timing.",
  },
  "bracca-fleet": {
    name: "Orbital Scrapyard",
    rule: "The first time a non-summoned ship reaches 1% Health it fully recovers and gains Decommissioned; a Decommissioned ship is destroyed at the start of its next turn and its allies gain stacking Max Health, Max Protection, and Offense.",
    response: "Treat the first apparent defeat as a delayed death, not a kill. Avoid feeding several enemy Decommissioned triggers at once unless you can immediately control the resulting ally stat ramp.",
  },
  "geonosis-fleet": {
    name: "3720 to 1",
    rule: "Whenever a ship is inflicted with Target Lock it also gains Foresight and Stealth for 2 turns, and those buffs cannot be dispelled.",
    response: "Target Lock can temporarily protect its target instead of exposing it. Sequence unavoidable/AOE attacks and avoid relying on ordinary dispels to remove the granted Foresight or Stealth.",
  },
  "felucia-fleet": {
    name: "Nysillin Trade",
    rule: "Ships gain Protection Over Time at the start of their turns; while it is active they gain Defense and Buff Immunity immunity, and when it expires they gain Offense Up. Recovery effects are increased.",
    response: "Expect longer sustain windows. Focus damage rather than spreading pressure, and time burst/control around Protection Over Time expiration when possible.",
  },
  "tatooine-fleet": {
    name: "Binary System",
    rule: "The first time a non-Capital Ship uses a Special ability each turn it gains unavoidable Ability Block for 1 turn and takes a bonus turn.",
    response: "Use the bonus turn deliberately: a Special often converts immediately into a Basic because of Ability Block. Do not plan a two-Special sequence from the same ship without accounting for this modifier.",
  },
  "kashyyyk-fleet": {
    name: "Blockade",
    rule: "At the start of the encounter, Call Reinforcement cooldown is increased by 1 on all Capital Ships.",
    response: "Build an opening three-ship lineup that can survive and function for an extra cycle before the first reinforcement. Do not base the opener on an immediate reinforcement rescue.",
  },
  "lothal-fleet": {
    name: "Probe Droids",
    rule: "Whenever a ship has 4 or more buffs it is inflicted with Breach and Expose for 1 turn, which cannot be resisted.",
    response: "Large buff stacks carry a defensive cost. Track the four-buff threshold before mass-buffing and use cleanse/recovery windows when Breach and Expose are triggered.",
  },
  "kessel-fleet": {
    name: "Akkadese Maelstrom",
    rule: "Special abilities add stacking Confuse. At 1 stack the ship cannot gain buffs; at 2 it cannot counter, assist, or gain bonus Turn Meter; at 3 its Basic increases its cooldowns. Ships receive Recompute to clear Confuse.",
    response: "Do not spam Specials blindly. Use Recompute before Confuse disables the fleet mechanic you need, especially assist/TM engines or before a 3-stack Basic would push cooldowns backward.",
  },
  "vandor-fleet": {
    name: "Cloud Riders",
    rule: "All ships gain 100% counter chance; whenever a ship uses a Special ability, a random enemy gains 15% Turn Meter.",
    response: "Every Special has a tempo cost and attacks can provoke counters. Prefer Specials that create decisive control/survival value and avoid low-value multi-target pressure that exposes fragile ships to extra counters.",
  },
  "death-star-fleet": {
    name: "Enemy Fighters Coming Your Way",
    rule: "Call Reinforcement cooldown is reduced by 1 on both Capital Ships.",
    response: "Expect reinforcement tempo earlier than normal on both sides. Keep a response available for the enemy reinforcement and exploit your own accelerated reinforcement cycle.",
  },
  "hoth-fleet": {
    name: "Asteroid Belt",
    rule: "At the end of every other turn all units are inflicted with Damage Over Time until defeated, and the effect cannot be resisted.",
    response: "The fight has an escalating attrition clock. Favor recovery and decisive target focus; avoid extending the battle for low-value setup once the Damage Over Time pressure is accumulating.",
  },
  "scarif-fleet": {
    name: "All Wings Report In",
    rule: "At battle start and whenever a Capital Ship uses Call Reinforcement, reduce that ability's cooldown by 2.",
    response: "Reinforcement cycling is substantially faster. Build the reinforcement bench as part of the primary battle plan rather than as emergency-only units.",
  },
});

const DEFINITIONS = Object.freeze([
  ["mustafar-fleet", "Mustafar · Fleet Mission", [], ["cg-rote-details"]],
  ["corellia-fleet", "Corellia · Lando's Millennium Falcon Fleet Mission", ["Lando's Millennium Falcon"], ["cg-rote-details"]],
  ["coruscant-fleet", "Coruscant · Outrider Fleet Mission", ["Outrider"], ["cg-rote-details"]],
  ["geonosis-fleet", "Geonosis · Fleet Mission", [], ["cg-rote-details"]],
  ["felucia-fleet", "Felucia · Fleet Mission", [], ["cg-rote-details"]],
  ["bracca-fleet", "Bracca · Fleet Mission", [], ["cg-rote-details"]],
  ["tatooine-fleet", "Tatooine · Executor Fleet Mission", ["Executor"], ["cg-rote-details"]],
  ["kashyyyk-fleet", "Kashyyyk · Profundity Fleet Mission", ["Profundity"], ["cg-rote-details"]],
  ["zeffo-fleet", "Zeffo · Negotiator Fleet Mission", ["Negotiator"], ["cg-zeffo", "swgohgg-negotiator"]],
  ["kessel-fleet", "Kessel · Ghost Fleet Mission", ["Ghost"], ["cg-rote-details", "xaereth-rote-p4-2026"]],
  ["lothal-fleet", "Lothal · Fleet Mission", [], ["cg-rote-details", "xaereth-rote-p4-2026"]],
  ["mandalore-fleet", "Mandalore · Gauntlet Starfighter Fleet Mission", ["Gauntlet Starfighter"], ["cg-mandalore", "swgohgg-gauntlet", "xaereth-rote-p4-2026"]],
  ["vandor-fleet", "Vandor · Fleet Mission", [], ["cg-rote-details"]],
  ["kafrene-fleet", "Ring of Kafrene · Fleet Mission", [], ["cg-rote-details"]],
  ["death-star-fleet", "Death Star · Imperial TIE Fighter Fleet Mission", ["Imperial TIE Fighter"], ["cg-rote-details"]],
  ["hoth-fleet", "Hoth · Fleet Mission", [], ["cg-rote-details"]],
  ["scarif-fleet", "Scarif · Profundity Fleet Mission", ["Profundity"], ["cg-rote-details"]],
]);

function requiredShipRows(names) {
  return names.map((name) => ({
    name,
    importance: "critical",
    reason: "This ship is an official mission-entry requirement; roster legality is enforced by the canonical mission record.",
  }));
}

function genericStages(missionId, requiredShips) {
  const modifier = SPACE_MODIFIERS[missionId];
  const openingSteps = [];
  if (requiredShips.length) {
    openingSteps.push(step("entry-core", `Build the legal fleet around the required ${requiredShips.join(" + ")} entry piece${requiredShips.length > 1 ? "s" : ""}; do not treat a community-tested alternative as permission to omit an official requirement.`, { priority: "critical" }));
  }
  if (modifier) {
    openingSteps.push(step("modifier-read", `Account for ${modifier.name}: ${modifier.response}`, { priority: "critical" }));
  } else {
    openingSteps.push(step("entry-and-board", "Confirm the mission-entry fleet and read the opening enemy lineup before committing a reinforcement or ultimate plan; no additional space-modifier rotation is claimed for this pack.", { priority: "high" }));
  }

  return [
    stage("opening", "Opening · establish fleet control", openingSteps, {
      objective: modifier ? `Play the opening around ${modifier.name} without breaking the fleet's core engine.` : "Establish the fleet engine while preserving flexible responses.",
    }),
    stage("reinforcements", "Midfight · manage reinforcement tempo", [
      step("reinforcement-value", "Call the reinforcement that solves the current board state—cleanse, tanking, control, burst, or engine acceleration—rather than following a fixed bench order when the enemy board has changed.", { priority: "high" }),
      step("capital-cycle", "Track both Capital Ship cooldown cycles and preserve your decisive fleet ability for the window where it changes targetability, removes a key ship, or prevents an enemy snowball.", { priority: "high" }),
    ], { objective: "Convert reinforcement and Capital Ship tempo into a stable numbers advantage." }),
    stage("closeout", "Closeout · protect the winning board", [
      step("focus-threat", "Finish the highest-impact enemy damage/control ship before low-value cleanup; do not spread damage unless the fleet mechanic specifically rewards it.", { priority: "high" }),
      step("avoid-throw", "Once ahead, avoid unnecessary Special/reinforcement actions that trigger the planet modifier or enemy counters without improving the board.", { priority: "high" }),
    ], { objective: "Close without giving the mission modifier a free comeback window." }),
  ];
}

function buildStrategy([missionId, title, requiredShips, sourceIds]) {
  const modifier = SPACE_MODIFIERS[missionId] || null;
  const communityEvidence = sourceIds.some((id) => ROTE_FLEET_STRATEGY_SOURCES.find((source) => source.id === id)?.kind === "community-tested");
  return Object.freeze({
    id: `${missionId}-v1`,
    missionId,
    title,
    status: "verified-core",
    confidence: communityEvidence ? "official-entry-modifier-community-battle-reference" : "official-entry-modifier-core",
    lastVerified: "2026-08-16",
    sources: sources(...sourceIds),
    summary: modifier
      ? `${modifier.name}: ${modifier.rule} The strategy treats that official space modifier as the primary environmental constraint while keeping target and reinforcement sequencing adaptive to the actual enemy board.`
      : "This fleet mission pack preserves the official entry contract and uses adaptive fleet fundamentals. It deliberately does not invent a planet-specific modifier or deterministic kill order where the authoritative source does not establish one.",
    keyUnits: requiredShipRows(requiredShips),
    keyAbilities: [],
    stages: genericStages(missionId, requiredShips),
    targetPriorities: [
      { target: "Current enemy fleet engine / highest-impact damage or control ship", priority: "high", when: "throughout", reason: "Enemy lineups and reinforcement states can change; prioritize the ship most capable of snowballing or preventing your fleet engine." },
    ],
    failureRisks: [
      ...(modifier ? [`Ignoring ${modifier.name} can invalidate normal fleet sequencing: ${modifier.rule}`] : []),
      "Treating a community-tested fleet as the only legal fleet can be misleading; official mission-entry requirements remain authoritative.",
      "A fixed reinforcement or kill order can become wrong after an enemy reinforcement, dodge, assist, or targetability change, so this pack keeps those decisions adaptive unless independently verified.",
    ],
    evidenceBoundary: communityEvidence
      ? "Mission entry and planet/bonus-zone requirements are official/current-reference facts. The cited fleet choice is community-tested evidence of viability, not a guaranteed clear rate. Enemy-specific target and reinforcement sequencing remains adaptive unless directly sourced."
      : "Mission entry and encoded space-modifier mechanics are official/current-reference facts. This pack does not claim a guaranteed fleet composition, deterministic enemy spawn, win percentage, or fixed reinforcement order without independently verified battle evidence.",
  });
}

export const ROTE_FLEET_BATTLE_STRATEGIES = Object.freeze(Object.fromEntries(
  DEFINITIONS.map((definition) => [definition[0], buildStrategy(definition)]),
));

export function roteFleetBattleStrategyForMission(missionId) {
  return ROTE_FLEET_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
