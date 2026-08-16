import { roteJabbaJkckStrategyForMission } from "./tb-battle-strategy-rote-jabba-jkck-data.js";

const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const HOTH_DS_STRATEGY_SOURCES = Object.freeze([
  { id: "swgoh-wiki-hoth-ds", label: "SWGOH Wiki · Hoth Imperial Retaliation", kind: "current-reference", url: "https://swgoh.wiki/wiki/Hoth_Imperial_Retaliation" },
  { id: "swgohgg-veers", label: "SWGOH.GG · General Veers current kit", kind: "current-reference", url: "https://swgoh.gg/units/general-veers/" },
  { id: "swgohgg-piett", label: "SWGOH.GG · Admiral Piett current kit", kind: "current-reference", url: "https://swgoh.gg/units/admiral-piett/" },
  { id: "swgohgg-starck", label: "SWGOH.GG · Colonel Starck current kit", kind: "current-reference", url: "https://swgoh.gg/units/colonel-starck/" },
  { id: "swgohgg-ipd", label: "SWGOH.GG · Imperial Probe Droid current kit", kind: "current-reference", url: "https://swgoh.gg/units/imperial-probe-droid/" },
  { id: "stillplays-ipd-p3", label: "Still Plays · Hoth DS IPD shard mission with Piett Troopers", kind: "community-tested", url: "https://swgoh.tv/video/26797-lvt-ds-hoth-ipd-special-mission-easy-low-lvl-gear-imperial-probe-droid-swgoh-guide" },
  { id: "bitdynasty-hoth-p6", label: "BitDynasty · Hoth DS Phase 6 Special Mission", kind: "community-tested", url: "https://swgoh.tv/video/11657-beat-phase-6-special-mission-in-dark-side-territory-battles-swgoh" },
  { id: "cg-jabba-hoth", label: "Capital Games · Jabba battles added to Hoth and Geonosis", kind: "official", url: "https://swgoh.gg/news/update-10122022/" },
  { id: "swgohgg-jabba", label: "SWGOH.GG · Jabba the Hutt current kit", kind: "current-reference", url: "https://swgoh.gg/units/jabba-the-hutt/" },
]);

const source = (id) => HOTH_DS_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

const IPD_P3 = Object.freeze({
  id: "p3-ipd-sm-v1",
  missionId: "p3-ipd-sm",
  title: "Outer Pass · Imperial Probe Droid Shard Special Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-hoth-ds", "swgohgg-veers", "swgohgg-piett", "swgohgg-starck", "stillplays-ipd-p3"),
  summary: "The modern low-investment route uses Veers-led Imperial Troopers with Piett and the mission-mandatory Starck. The tested guide explicitly notes that Piett trivializes the older mission approach. Build the first defeat, then keep the Imperial Trooper turn-meter train moving: Veers rewards enemy defeats with 50% Turn Meter and Protection recovery, while Piett's Emperor's Trap stacks Offense/Potency during uninterrupted Empire turns and out-of-turn attacks.",
  requiredLeaderBaseId: "VEERS",
  keyUnits: [
    { baseId: "VEERS", name: "General Veers", importance: "critical", reason: "Mission-mandatory member and the Trooper defeat/Turn Meter engine." },
    { baseId: "COLONELSTARCK", name: "Colonel Starck", importance: "critical", reason: "Mission-mandatory member; supplies debuffs, enemy Turn Meter pressure and Imperial Trooper support." },
    { baseId: "ADMIRALPIETT", name: "Admiral Piett", importance: "high", reason: "The newer tested guide specifically uses Piett to make the IPD shard mission substantially easier." },
    { baseId: "RANGETROOPER", name: "Range Trooper", importance: "helpful", reason: "Tested support slot for assist/Protection sustain in the newer Trooper route." },
    { baseId: "STORMTROOPER", name: "Stormtrooper", importance: "helpful", reason: "Tested tank slot in the low-gear mission guide; not a hard mission gate." },
  ],
  keyAbilities: [
    { baseId: "VEERS", abilityName: "Aggressive Tactician", importance: "critical", minimumTier: 8, requiresZeta: true, expected: "On enemy defeat, Imperial Troopers gain 50% Turn Meter, Offense Up and Protection recovery", reason: "The mission snowballs once the first enemy defeat starts the Trooper turn train." },
    { baseId: "ADMIRALPIETT", abilityName: "The Emperor's Trap", importance: "high", minimumTier: 8, requiresZeta: true, expected: "Stacking Offense and Potency while Empire turns/out-of-turn attacks continue before an enemy turn", reason: "Keep the Trooper chain uninterrupted so the damage engine compounds." },
  ],
  stages: [
    stage("first-kill", "Opening · manufacture the first defeat", [
      step("identify-soft-target", "Focus the enemy that can be removed fastest without exposing the Trooper core; the first defeat is more valuable than spreading early damage.", { priority: "critical" }),
      step("piett-engine", "Use Piett's Trooper support to accelerate the team and build Emperor's Trap stacks while denying the enemy a turn where practical.", { priority: "high", ability: "The Emperor's Trap" }),
      step("secure-defeat", "Commit the team to the first clean enemy defeat so Veers's Aggressive Tactician can trigger the 50% Turn Meter/Protection snowball.", { priority: "critical", ability: "Aggressive Tactician" }),
    ], { objective: "Start the Imperial Trooper turn-meter train before the Rebel wave establishes control." }),
    stage("train", "Snowball · keep the enemy from taking turns", [
      step("chain-kills", "After the first defeat, move immediately to the next finishable high-impact enemy and keep the defeat/Turn Meter chain alive.", { priority: "critical" }),
      step("starck-control", "Use Starck's debuffs/Turn Meter pressure on the enemy most likely to break the chain if it takes a turn.", { priority: "high", target: "Highest-impact enemy" }),
      step("do-not-split", "Avoid spreading damage across several healthy targets while the Trooper engine is active; convert each Turn Meter spike into the next defeat.", { priority: "high" }),
    ], { objective: "Turn one enemy defeat into a sustained Imperial Trooper action loop." }),
    stage("transition", "Wave transition · preserve the train", [
      step("cooldowns", "If the final enemy is controlled, finish with lower-value actions so Piett/Veers/Starck tools enter the next wave available.", { priority: "high" }),
      step("repeat", "On each new wave, re-identify the easiest useful first kill rather than forcing a stale name order.", { priority: "high" }),
    ], { objective: "Carry the Trooper tempo engine across the mission's waves." }),
  ],
  targetPriorities: [{ target: "Fastest useful first kill / enemy capable of breaking the Trooper train", priority: "critical", when: "each wave", reason: "Veers's defeat-triggered Turn Meter makes kill sequencing more important than a fixed historical target list." }],
  failureRisks: [
    "Failing to secure the first kill can leave low-investment Troopers exposed to the full enemy rotation.",
    "Allowing an enemy turn while Emperor's Trap is building resets the stack window and can break the snowball.",
    "Stormtrooper and Range Trooper are tested route choices, not mission-mandatory units.",
  ],
  evidenceBoundary: "Veers/Piett/Starck current ability behavior is current-reference data. The exact Phase 3 IPD shard mission has a newer community-tested Piett/Veers/Starck Trooper guide that explicitly replaces older strategies. The pack does not claim a fixed spawn order or guaranteed win percentage.",
});

const jabbaCore = roteJabbaJkckStrategyForMission("corellia-jabba");
const JABBA_P4 = Object.freeze({
  ...jabbaCore,
  id: "p4-jabba-sm-v1",
  missionId: "p4-jabba-sm",
  title: "Rear Trenches · Jabba the Hutt Special Mission",
  status: "verified-core",
  confidence: "official-entry-current-kit-core",
  lastVerified: "2026-08-16",
  sources: [source("cg-jabba-hoth"), source("swgohgg-jabba"), ...(Array.isArray(jabbaCore?.sources) ? jabbaCore.sources : [])].filter(Boolean),
  summary: `Capital Games explicitly added a Jabba-required battle to Dark Side Hoth. Use the established Jabba contract, Hutt Cartel sustain and Ultimate engine while respecting the Phase 4 Hoth Dark Side entry baseline. ${jabbaCore?.summary || ""}`.trim(),
  evidenceBoundary: "Jabba's Hoth battle is an official/current mission fact and Jabba's current kit is sourced from SWGOH.GG. The inherited Jabba execution engine is source-scoped; this pack does not invent a Hoth-specific enemy spawn, fixed companion restriction, or guaranteed clear percentage where the source does not establish one.",
});

const IPD_P6 = Object.freeze({
  id: "p6-ipd-sm-v1",
  missionId: "p6-ipd-sm",
  title: "Rebel Base South Entrance · Veers + Imperial Probe Droid Special Mission",
  status: "community-tested",
  confidence: "community-validated-current-kit-refresh",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-hoth-ds", "swgohgg-veers", "swgohgg-starck", "swgohgg-ipd", "bitdynasty-hoth-p6"),
  summary: "The exact Phase 6 special mission has a tested Veers, Shoretrooper, Starck, Death Trooper and Imperial Probe Droid clear. Use Veers's defeat-triggered Trooper Turn Meter to keep control, preserve IPD's Detect mass-dispel/Target Lock utility, and treat Self-Destruct as a tactical finisher. If the current Territory Battle Omicron is installed, IPD revives after Self-Destruct and adds a large Empire Offense stack; the strategy treats that as an enhancement, not a required gate.",
  requiredLeaderBaseId: "VEERS",
  keyUnits: [
    { baseId: "VEERS", name: "General Veers", importance: "critical", reason: "Mission-mandatory leader and Imperial Trooper Turn Meter engine." },
    { baseId: "IMPERIALPROBEDROID", name: "Imperial Probe Droid", importance: "critical", reason: "Mission-mandatory unit with mass dispel/Target Lock and optional Territory Battle Omicron Self-Destruct loop." },
    { baseId: "COLONELSTARCK", name: "Colonel Starck", importance: "high", reason: "Part of the exact tested Phase 6 clear and provides debuff/Turn Meter control." },
    { baseId: "DEATHTROOPER", name: "Death Trooper", importance: "helpful", reason: "Part of the tested Phase 6 route; current mission gate does not make it mandatory." },
    { baseId: "SHORETROOPER", name: "Shoretrooper", importance: "helpful", reason: "Tested tank in the exact mission route; not a hard mission gate." },
  ],
  keyAbilities: [
    { baseId: "VEERS", abilityName: "Aggressive Tactician", importance: "critical", minimumTier: 8, requiresZeta: true, expected: "Enemy defeats trigger Imperial Trooper Turn Meter and Protection recovery", reason: "Use each defeat to carry the Trooper action loop into the next target." },
    { baseId: "IMPERIALPROBEDROID", abilityName: "Detect", importance: "high", expected: "Dispel all enemy buffs and apply Target Lock/Turn Meter pressure", reason: "Use when enemy buffs or targetability materially obstruct the kill sequence." },
    { baseId: "IMPERIALPROBEDROID", abilityName: "Self-Destruct", importance: "helpful", expected: "Massive target damage; with the TB Omicron IPD revives and boosts Empire Offense", reason: "Treat as a tactical finisher/tempo tool. The Omicron interaction is optional and must not be assumed installed." },
  ],
  stages: [
    stage("control", "Opening · stabilize the tested Trooper/IPD shell", [
      step("buff-control", "If enemy buffs/taunts prevent access to the priority target, use IPD Detect to clear them before spending the team's damage window.", { priority: "high", ability: "Detect" }),
      step("first-kill", "Focus the most accessible high-impact Rebel and secure the first defeat so Veers can start the Imperial Trooper Turn Meter train.", { priority: "critical", ability: "Aggressive Tactician" }),
      step("protect-ipd", "Keep IPD alive until Detect or Self-Destruct changes the board; do not sacrifice it automatically just because Self-Destruct is available.", { priority: "high", target: "Imperial Probe Droid" }),
    ], { objective: "Establish the Trooper kill chain while preserving IPD utility." }),
    stage("ipd-window", "IPD window · dispel, Target Lock, or tactical Self-Destruct", [
      step("detect-value", "Use Detect when its mass dispel/Target Lock effect opens the next kill or prevents enemy buff snowball.", { priority: "high", ability: "Detect" }),
      step("self-destruct", "Use Self-Destruct when deleting the current priority target or the Omicron revive/Offense payoff is worth more than keeping IPD active for another utility cycle.", { priority: "high", ability: "Self-Destruct" }),
      step("omicron-boundary", "If Imperial Logistics is at the Territory Battle Omicron tier, account for the guaranteed IPD revive after Self-Destruct and the stacking Empire Offense gain; otherwise plan Self-Destruct as a real sacrifice.", { priority: "info", ability: "Imperial Logistics" }),
    ], { objective: "Use IPD's current kit for a decisive board swing without assuming the optional Omicron." }),
    stage("close", "Closeout · maintain Veers defeat tempo", [
      step("chain", "Convert each defeat into the next target before the Rebels regain control of the turn order.", { priority: "critical" }),
      step("preserve-tools", "When the board is safe, preserve Detect/control cooldowns for the next wave rather than overkilling the final enemy.", { priority: "high" }),
    ], { objective: "Finish the special mission without surrendering the Trooper tempo advantage." }),
  ],
  targetPriorities: [{ target: "Accessible high-impact Rebel / enemy blocking the Trooper kill chain", priority: "critical", when: "each wave", reason: "The tested exact composition uses Veers tempo; current target choice should maximize the next reliable defeat rather than follow one stale list." }],
  failureRisks: [
    "Using Self-Destruct as an automatic first action can remove IPD utility and, without the TB Omicron, permanently sacrifice the required unit.",
    "Allowing the enemy to break the Veers defeat chain can turn the mission back into a normal speed contest.",
    "The exact tested 2019 composition predates IPD's current TB Omicron, so the pack refreshes kit behavior without pretending the Omicron is mandatory.",
  ],
  evidenceBoundary: "The Phase 6 Veers/Shore/Starck/Death/IPD mission composition has direct community-tested evidence. Veers and current IPD ability/Omicron behavior are current SWGOH.GG facts. The Omicron is optional, exact enemy spawn order remains adaptive, and no guaranteed clear percentage is claimed.",
});

export const HOTH_DS_BATTLE_STRATEGIES = Object.freeze({
  "p3-ipd-sm": IPD_P3,
  "p4-jabba-sm": JABBA_P4,
  "p6-ipd-sm": IPD_P6,
});

export function hothDsBattleStrategyForMission(missionId) {
  return HOTH_DS_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
