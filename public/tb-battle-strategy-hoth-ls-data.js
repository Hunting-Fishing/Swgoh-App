const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const HOTH_LS_STRATEGY_SOURCES = Object.freeze([
  { id: "swgohgg-hoth-ls", label: "SWGOH.GG · Hoth: Rebel Assault current Territory Battle data", kind: "current-reference", url: "https://swgoh.gg/territory-battles/t01D/" },
  { id: "swgohgg-hrs", label: "SWGOH.GG · Hoth Rebel Soldier current unit and TB mission listing", kind: "current-reference", url: "https://swgoh.gg/units/hoth-rebel-soldier/" },
  { id: "swgohgg-rolo", label: "SWGOH.GG · Rebel Officer Leia Organa current kit", kind: "current-reference", url: "https://swgoh.gg/units/rebel-officer-leia-organa/" },
  { id: "swgohgg-cls", label: "SWGOH.GG · Commander Luke Skywalker current kit", kind: "current-reference", url: "https://swgoh.gg/units/commander-luke-skywalker/" },
  { id: "swgohgg-cassian", label: "SWGOH.GG · Cassian Andor current Territory Battle Omicron", kind: "current-reference", url: "https://swgoh.gg/units/cassian-andor/" },
  { id: "cg-cassian-omicron", label: "Capital Games · Cassian Andor Territory Battle Omicron update", kind: "official", url: "https://swgoh.gg/news/update-9212022/" },
  { id: "cg-hoth-hero-platoons", label: "Capital Games · Hoth hero and special-mission platoon protection changes", kind: "official", url: "https://swgoh.gg/news/territory-battle-cadence-and-reward-changes/" },
  { id: "cg-hoth-2017-update", label: "Capital Games · historical Hoth special-mission requirement update", kind: "historical-official", url: "https://swgoh.gg/news/content-update-9202017/" },
]);

const source = (id) => HOTH_LS_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

const FOCUSED_DEFENSE = "Focused Defense: after a Rebel unit uses a Special ability without defeating an enemy, it gains Protection Up (30%) for 2 turns.";

function partialSpecial({ id, title, required = [], sourceIds = [], summary, stages, keyUnits = [], keyAbilities = [], risks = [], boundary }) {
  return Object.freeze({
    id: `${id}-hoth-ls-v1`,
    missionId: id,
    title,
    status: "current-entry-partial-strategy",
    confidence: "current-entry-current-kit-partial",
    lastVerified: "2026-08-16",
    sources: sources("swgohgg-hoth-ls", ...sourceIds),
    summary,
    keyUnits: [
      ...required.map((row) => ({ ...row, importance: "critical", reason: "Canonical current mission-entry requirement." })),
      ...keyUnits,
    ],
    keyAbilities,
    stages,
    targetPriorities: [{ target: "Highest-impact healer / revive / AoE / control enemy", priority: "high", when: "each encounter", reason: "Exact current Hoth enemy sequencing is not sufficiently re-verified; prioritize the action most capable of breaking the selected Rebel engine." }],
    failureRisks: risks,
    evidenceBoundary: boundary,
  });
}

const PHOENIX_P1 = partialSpecial({
  id: "p1-phoenix",
  title: "Rebel Base · Phoenix Special Mission",
  sourceIds: ["cg-hoth-hero-platoons"],
  summary: `The Phase 1 special mission requires Phoenix. ${FOCUSED_DEFENSE} Current Hoth mechanics therefore reward deliberate Special-ability timing and sustain, but this pack does not import the ROTE Lothal enemy script into Hoth.`,
  stages: [
    stage("opening", "Opening · preserve the Phoenix sustain loop", [
      step("legal-phoenix", "Enter with a full legal Phoenix squad; rank Hera/Captain Rex-era Phoenix options by the live roster but do not require Captain Rex where the mission only requires the faction.", { priority: "critical" }),
      step("focused-defense", "When a nonlethal Special advances control or recovery, account for Focused Defense Protection Up instead of treating every Special as a pure damage button.", { priority: "high" }),
      step("control-threat", "Daze, Stun, Ability Block, or remove the enemy whose next AoE/control action most threatens the Phoenix assist/recovery engine.", { priority: "high" }),
    ], { objective: "Use Phoenix control and Hoth Protection Up to survive the enemy rotation." }),
  ],
  risks: ["Importing Lothal/ROTE-specific modifiers or target order into Hoth would be incorrect.", "Captain Rex is a modern Phoenix recommendation, not a hard Hoth mission gate."],
  boundary: "The Phoenix faction gate and Hoth Focused Defense mechanic are current-reference/official facts. Exact current enemy waves and a universal Phoenix composition are not independently re-verified, so this pack remains partial.",
});

function rogueOneStrategy(id, title, phase) {
  return partialSpecial({
    id,
    title,
    sourceIds: ["swgohgg-cassian", "cg-cassian-omicron"],
    summary: `This Phase ${phase} Hoth mission uses a Rogue One entry pool. Cassian Andor's current Territory Battle Omicron is explicitly customized for Rebel Assault: with an all-Rogue-One squad he takes a bonus turn, disguises as Snowtrooper Ops (Elite), and gains additional debuff/assist tempo. The Omicron is a strong optional route, not a mission-entry requirement. ${FOCUSED_DEFENSE}`,
    keyUnits: [
      { baseId: "CASSIANANDOR", name: "Cassian Andor", importance: "high", reason: "Current TB Omicron has Rebel Assault-specific behavior and materially upgrades an all-Rogue-One squad." },
      { baseId: "K2SO", name: "K-2SO", importance: "helpful", reason: "Cassian's current TB Omicron calls K-2SO to assist whenever Cassian uses an ability; not a hard mission requirement." },
    ],
    keyAbilities: [
      { baseId: "CASSIANANDOR", abilityName: "Groundwork", importance: "helpful", requiresOmicron: true, expected: "In Rebel Assault, bonus-turn Snowtrooper Ops disguise plus debuff/Turn Meter/K-2SO assist engine", reason: "Treat this as an optional Territory Battle enhancement. The roster must not be blocked if the Omicron is absent." },
    ],
    stages: [
      stage("preflight", "Preflight · choose the Rogue One engine", [
        step("all-rogue-one", "If using Cassian's TB Omicron route, keep all five allies Rogue One so the Rebel Assault transformation condition is satisfied.", { priority: "high", ability: "Groundwork" }),
        step("omicron-optional", "If Cassian's Omicron is absent, keep the mission legal and use the strongest available Rogue One shell; do not label the Omicron as mandatory readiness.", { priority: "critical" }),
      ], { objective: "Build a legal Rogue One squad while correctly recognizing the optional Cassian Rebel Assault upgrade." }),
      stage("battle", "Battle · debuff/control and Hoth sustain", [
        step("cassian-control", "With the Omicron active, use Cassian's bonus-turn/disguise control and repeated debuffs to suppress the highest-impact enemy while K-2SO assists.", { priority: "high", ability: "Groundwork" }),
        step("focused-defense", "Use nonlethal Rebel Specials deliberately when the Protection Up from Focused Defense improves survival or sets up the next control window.", { priority: "high" }),
        step("focus", "Concentrate damage on the controlled priority enemy instead of spreading pressure across several targets.", { priority: "high" }),
      ], { objective: "Convert Rogue One control and Hoth sustain into a stable encounter." }),
    ],
    risks: ["Cassian's Territory Battle Omicron is optional; making it a readiness blocker would be wrong.", "A historical Rogue One unit list must not be used to exclude newer units that currently satisfy the game category."],
    boundary: "The Rogue One mission gate is canonical mission data. Cassian's Rebel Assault transformation, bonus turn, debuffs and K-2SO assist behavior are current SWGOH.GG/CG facts. Exact current enemy wave order and optimal Rogue One five are not sufficiently re-verified, so the pack remains partial.",
  });
}

const ROGUE_P2 = rogueOneStrategy("p2-overlook-rogue", "Forward Stronghold · Rogue One Special Mission", 2);
const ROGUE_P6 = rogueOneStrategy("p6-flank-rogue", "Imperial Flank · Rogue One Combat Mission", 6);

const ROLO_SHARD_P3 = partialSpecial({
  id: "p3-rolo-sm",
  title: "Power Generator · ROLO Shard Special Mission",
  required: [{ baseId: "HOTHREBELSOLDIER", name: "Hoth Rebel Soldier" }],
  sourceIds: ["swgohgg-hrs", "cg-hoth-hero-platoons", "cg-hoth-2017-update"],
  summary: `Current SWGOH.GG mission data lists Hoth Rebel Soldier in the Phase 3 ROLO-shard mission and the app preserves that current gate. Launch-era documentation also referenced Captain Han Solo, but current unit mission data no longer supports treating Captain Han as a mandatory gate. ${FOCUSED_DEFENSE}`,
  keyUnits: [
    { baseId: "HOTHREBELSOLDIER", name: "Hoth Rebel Soldier", importance: "critical", reason: "Current SWGOH.GG explicitly lists HRS in the Phase 3 Power Generator ROLO-shard mission." },
    { baseId: "CAPTAINHANSOLO", name: "Captain Han Solo", importance: "helpful", reason: "Historically used/required in launch-era versions, but intentionally not treated as a current hard gate." },
  ],
  stages: [
    stage("preflight", "Preflight · protect the current mandatory Hoth hero", [
      step("hrs", "Verify Hoth Rebel Soldier clears the current 5-star mission gate and keep enough Rebel support/tanking around him to survive the multi-wave encounter.", { priority: "critical" }),
      step("captain-han-boundary", "Captain Han Solo may be used as a Hoth-hero recovery option if owned, but do not block mission readiness on him based on launch-era rules.", { priority: "info" }),
      step("focused-defense", "Use nonlethal Specials to trigger Focused Defense Protection Up when the team needs a sustain window before committing the next kill.", { priority: "high" }),
    ], { objective: "Preserve the current legal mission core without resurrecting obsolete entry requirements." }),
  ],
  risks: ["Treating historical Captain Han Solo requirements as current would incorrectly block players.", "The exact current wave target order is not sufficiently re-tested."],
  boundary: "Hoth Rebel Soldier's current Phase 3 special-mission listing and ROLO shard reward are current-reference facts. Historical CG documents are retained only to explain older Captain Han references; they are not promoted over current mission data. Battle sequencing remains partial.",
});

function roloGetStrategy(id, title, phase, reward) {
  return partialSpecial({
    id,
    title,
    required: [{ baseId: "HOTHLEIA", name: "Rebel Officer Leia Organa" }],
    sourceIds: ["swgohgg-rolo", "cg-hoth-2017-update"],
    summary: `The current canonical mission gate requires Rebel Officer Leia Organa for this Phase ${phase} ${reward} special mission. ROLO's current Rebel Barrage can strike up to ten times, inflicting Ability Block on enemies hit more than once, while her basic can inflict Buff Immunity and gains extra Turn Meter against Empire. Her Territory Battle Omicron leader is a powerful optional Hoth tool, not a mission-entry requirement.`,
    keyUnits: [
      { baseId: "HOTHLEIA", name: "Rebel Officer Leia Organa", importance: "critical", reason: "Current mission-mandatory Hoth hero." },
      { baseId: "CAPTAINHANSOLO", name: "Captain Han Solo", importance: "helpful", reason: "Launch-era Hoth special-mission partner; retained as historical/team advice only, not a current hard gate." },
    ],
    keyAbilities: [
      { baseId: "HOTHLEIA", abilityName: "Rebel Barrage", importance: "high", expected: "Multi-hit random damage; repeated hits Ability Block and cannot be countered", reason: "Use when its multi-hit/control value matters instead of spending it into an already-solved board." },
      { baseId: "HOTHLEIA", abilityName: "Battlefront Command", importance: "helpful", requiresOmicron: true, expected: "Territory Battles: Rebel Speed, encounter recovery, critical-hit Turn Meter and defeat-based Offense transfer", reason: "Optional TB enhancement; never a readiness prerequisite." },
    ],
    stages: [
      stage("opening", "Opening · establish Rebel control and sustain", [
        step("rolo-safe", "Keep ROLO protected and use Buff Immunity/Turn Meter pressure against an Empire target that can taunt, heal, or control the team.", { priority: "high" }),
        step("barrage", "Use Rebel Barrage when repeated hits can control or remove a priority enemy; preserve it if the current board is already stable.", { priority: "high", ability: "Rebel Barrage" }),
        step("focused-defense", "Account for Focused Defense after nonlethal Specials so Protection Up becomes part of the sustain plan rather than an incidental bonus.", { priority: "high" }),
        step("omicron", "If Battlefront Command's TB Omicron is installed and ROLO is leading, exploit the current Speed/recovery/Turn Meter engine; otherwise do not treat that leader route as required.", { priority: "info", ability: "Battlefront Command" }),
      ], { objective: "Use ROLO's current Hoth tools without turning optional Omicron or historical Captain Han rules into hard gates." }),
    ],
    risks: ["Captain Han Solo appears in historical Hoth requirements but is not asserted as a current hard gate here.", "ROLO's TB Omicron is optional and must not alter mission legality.", "Exact current encounter target order remains under verification."],
    boundary: "ROLO's current kit and current canonical mission requirement are current-reference facts. Historical Captain Han requirement data is preserved only as context. The optional ROLO Territory Battle Omicron is current kit data. Exact wave-by-wave sequencing remains partial.",
  });
}

const ROLO_P4 = roloGetStrategy("p4-rolo-sm", "Forward Trenches · ROLO Special Mission", 4, "20 Mk I GET");
const ROLO_P6 = roloGetStrategy("p6-rolo-sm", "Imperial Landing · ROLO Special Mission", 6, "30 Mk I GET");

const CLS_P5 = partialSpecial({
  id: "p5-cls-sm",
  title: "Forward Trenches · Commander Luke Skywalker Special Mission",
  required: [{ baseId: "COMMANDERLUKESKYWALKER", name: "Commander Luke Skywalker" }],
  sourceIds: ["swgohgg-cls"],
  summary: `The Phase 5 special mission requires Commander Luke Skywalker. CLS's current kit supplies Turn Meter removal, Buff Immunity, self-cleanse/recovery, Taunt ignore through Call to Action, counter-based Rebel leadership, and debuff-driven Turn Meter through It Binds All Things. ${FOCUSED_DEFENSE} The app can therefore give a strong current CLS control framework while keeping the exact Hoth wave script partial.`,
  keyUnits: [{ baseId: "COMMANDERLUKESKYWALKER", name: "Commander Luke Skywalker", importance: "critical", reason: "Canonical Phase 5 special-mission requirement and the team's primary control/tempo unit." }],
  keyAbilities: [
    { baseId: "COMMANDERLUKESKYWALKER", abilityName: "Use the Force", importance: "high", expected: "Remove 100% Turn Meter and inflict Buff Immunity at max level", reason: "Use on the enemy whose next turn most threatens the Rebel shell." },
    { baseId: "COMMANDERLUKESKYWALKER", abilityName: "Call to Action", importance: "high", expected: "Cleanse, full Turn Meter, Health/Protection recovery and optional Taunt ignore", reason: "Use as a control/recovery reset rather than a rote cooldown press." },
    { baseId: "COMMANDERLUKESKYWALKER", abilityName: "It Binds All Things", importance: "high", requiresZeta: true, expected: "Debuffs feed CLS and Rebel Turn Meter; resisted effects recover CLS", reason: "Supports the current debuff/tempo engine in longer Hoth waves." },
  ],
  stages: [
    stage("control", "Opening · deny the highest-impact Imperial turn", [
      step("tm-control", "Use CLS Turn Meter removal/Buff Immunity against the enemy whose next special, taunt, heal or AoE most threatens the team.", { priority: "critical", ability: "Use the Force" }),
      step("cta", "Use Call to Action when CLS needs cleanse/recovery, immediate Turn Meter, or Taunt ignore to reach the priority target.", { priority: "high", ability: "Call to Action" }),
      step("focused-defense", "When another Rebel uses a nonlethal Special, include Focused Defense's Protection Up in the sustain calculation before forcing the next kill.", { priority: "high" }),
    ], { objective: "Use current CLS control mechanics to prevent the enemy's most dangerous action." }),
    stage("tempo", "Midfight · debuff and counter tempo", [
      step("debuff", "Keep debuffs on meaningful enemies so It Binds All Things feeds Rebel Turn Meter rather than spreading low-value effects randomly.", { priority: "high", ability: "It Binds All Things" }),
      step("counter", "Use the Rebel counter engine to add damage without consuming turns, then focus active turns on the current support/control priority.", { priority: "high" }),
    ], { objective: "Convert CLS control into repeatable Rebel tempo across the mission." }),
  ],
  risks: ["A modern CLS roster may trivialize old Hoth difficulty, but that does not justify inventing a current fixed enemy spawn/kill order.", "It Binds All Things zeta improves the tempo framework but mission legality depends on CLS, not the zeta."],
  boundary: "CLS's current ability behavior and the Phase 5 mandatory-unit gate are current-reference/canonical facts. The control framework is kit-grounded, but exact current Hoth enemy sequencing is not independently re-verified, so the pack remains partial.",
});

export const HOTH_LS_BATTLE_STRATEGIES = Object.freeze({
  "p1-phoenix": PHOENIX_P1,
  "p2-overlook-rogue": ROGUE_P2,
  "p3-rolo-sm": ROLO_SHARD_P3,
  "p4-rolo-sm": ROLO_P4,
  "p5-cls-sm": CLS_P5,
  "p6-flank-rogue": ROGUE_P6,
  "p6-rolo-sm": ROLO_P6,
});

export function hothLsBattleStrategyForMission(missionId) {
  return HOTH_LS_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
