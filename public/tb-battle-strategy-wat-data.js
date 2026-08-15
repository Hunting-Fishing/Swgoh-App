const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const WAT_BATTLE_STRATEGY_SOURCES = Object.freeze([
  {
    id: "swgohtv-wat-darth-kermit",
    label: "SWGOH.TV · Wat Tambor Mission Guide for Low-gear Geos",
    kind: "community-tested",
    url: "https://www.swgoh.tv/video/22358-swgoh-wat-tambor-mission-guide-for-low-gear-geos",
  },
  {
    id: "swgohtv-wat-mikayas",
    label: "SWGOH.TV · Mikayas Wat Tambor Mission Guide",
    kind: "community-tested",
    url: "https://swgoh.tv/video/9429-wat-tambor-mission-guide",
  },
  {
    id: "ea-forum-wat",
    label: "EA Forums · Wat Tambor shard mission strategy discussion",
    kind: "community-tested",
    url: "https://forums.ea.com/discussions/swgoh-strategy-and-tips-en/wat-tambor-shards---minimum-gear/3601405",
  },
  {
    id: "wookieenews-wat",
    label: "WookieeNews · Geonosis Separatist Might Wat strategy",
    kind: "community-reference",
    url: "https://www.wookieenews.com/swgoh-batallas-territoriales-guia-poderio-separatista-en-geonosis",
  },
  {
    id: "swgohgg-gba",
    label: "SWGOH.GG · Geonosian Brood Alpha current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/geonosian-brood-alpha/",
  },
  {
    id: "swgohgg-poggle",
    label: "SWGOH.GG · Poggle the Lesser current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/poggle-the-lesser/",
  },
  {
    id: "swgohgg-soldier",
    label: "SWGOH.GG · Geonosian Soldier current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/geonosian-soldier/",
  },
  {
    id: "swgohgg-spy",
    label: "SWGOH.GG · Geonosian Spy current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/geonosian-spy/",
  },
  {
    id: "swgohgg-sunfac",
    label: "SWGOH.GG · Sun Fac current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/sun-fac/",
  },
]);

export const WAT_BATTLE_STRATEGY = Object.freeze({
  id: "s3-wat-v1",
  missionId: "s3",
  title: "Wat Tambor Shard · Geonosian Special Mission",
  status: "community-tested",
  confidence: "community-validated-partial",
  lastVerified: "2026-08-15",
  sources: WAT_BATTLE_STRATEGY_SOURCES,
  summary: "The defensible community-tested core is control rather than a fixed four-wave script: preserve the Geonosian swarm/Brute engine, use Geonosian Soldier's Tenacity Down to improve Poggle's Ability Block reliability, keep dangerous AoE attackers and Clone Medic controlled, and remove ARC Trooper or Medic quickly when they appear.",
  requiredLeaderBaseId: "GEONOSIANBROODALPHA",
  requiredMechanics: [
    { id: "ability_block", label: "Reliable Ability Block", importance: "critical", evidenceType: "debuff", evidenceKey: "Ability Block" },
    { id: "tenacity_down", label: "Tenacity Down setup", importance: "high", evidenceType: "debuff", evidenceKey: "Tenacity Down" },
  ],
  keyUnits: [
    { baseId: "GEONOSIANBROODALPHA", name: "Geonosian Brood Alpha", importance: "critical", reason: "Leader, Hive Mind and Brute sustain the swarm engine the mission strategy depends on." },
    { baseId: "POGGLETHELESSER", name: "Poggle the Lesser", importance: "critical", reason: "Martial Doom provides the team's repeatable Ability Block control." },
    { baseId: "GEONOSIANSOLDIER", name: "Geonosian Soldier", importance: "critical", reason: "Aggressive Advance supplies Tenacity Down before critical Ability Block attempts." },
    { baseId: "GEONOSIANSPY", name: "Geonosian Spy", importance: "critical", reason: "Silent Strike is the team's high-value single-target damage tool for priority enemies." },
    { baseId: "SUNFAC", name: "Sun Fac", importance: "critical", reason: "Tank/dispel utility helps stabilize the Geo swarm while priority targets are controlled." },
  ],
  keyAbilities: [
    { baseId: "POGGLETHELESSER", abilityName: "Martial Doom", importance: "critical", expected: "Ability Block", reason: "Community guidance repeatedly prioritizes keeping AoE threats and Clone Medic Ability Blocked." },
    { baseId: "GEONOSIANSOLDIER", abilityName: "Aggressive Advance", importance: "critical", expected: "Tenacity Down", reason: "Use before important Poggle Ability Block attempts when practical to improve control reliability." },
    { baseId: "GEONOSIANBROODALPHA", abilityName: "Conscription", importance: "high", expected: "Cleanse, Brute summon and team sustain", reason: "Preserve this recovery/Brute reset tool for moments when the swarm is losing control or protection." },
    { baseId: "GEONOSIANSPY", abilityName: "Silent Strike", importance: "high", expected: "High single-target damage", reason: "Commit Spy's burst into the current priority threat rather than low-value targets." },
    { baseId: "SUNFAC", abilityName: "Browbeat", importance: "helpful", expected: "Enemy buff dispel", reason: "Sun Fac can strip buffs from a controlled priority target while maintaining tank pressure." },
  ],
  stages: [
    stage("wave-scan", "Every wave · Threat scan and control", [
      step("identify-threats", "At the start of each wave, identify ARC Trooper, Clone Medic and other dangerous AoE attackers before spending major damage abilities.", { priority: "critical" }),
      step("tenacity-setup", "When an important control attempt can be set up safely, use Geonosian Soldier's Aggressive Advance for Tenacity Down before Poggle's Ability Block.", { priority: "high", ability: "Aggressive Advance" }),
      step("ability-block", "Use Poggle's Martial Doom to keep the highest-risk AoE attacker or Clone Medic Ability Blocked instead of treating damage alone as sufficient control.", { priority: "critical", ability: "Martial Doom" }),
    ], {
      objective: "Prevent the enemy turn that can break the Geo swarm before committing burst damage.",
      hazards: ["Uncontrolled enemy AoE", "Clone Medic revive cycle", "Ability Block being resisted without setup"],
    }),
    stage("priority-kills", "Priority kill windows", [
      step("arc-priority", "When ARC Trooper is present, treat it as a critical kill/control target; community reports identify its AoE as capable of collapsing the run if allowed through.", { priority: "critical", target: "ARC Trooper" }),
      step("medic-priority", "When Clone Medic is present, keep it Ability Blocked and remove it before it can establish a revive cycle, unless an immediate AoE threat is more dangerous.", { priority: "critical", target: "Clone Medic" }),
      step("aoe-priority", "If multiple threats are present, prioritize the enemy whose next AoE can most directly break the swarm; this is a tactical priority rule, not a fixed enemy-name script for every wave.", { priority: "high" }),
      step("spy-burst", "Use Geonosian Spy's Silent Strike on the current priority threat when a clean burst window is available.", { priority: "high", ability: "Silent Strike" }),
    ], {
      objective: "Remove the enemy most capable of ending the run before shifting to cleanup.",
    }),
    stage("swarm-sustain", "Swarm preservation", [
      step("protect-alpha", "Keep Geonosian Brood Alpha active; Hive Mind and the summoned Brute are the backbone of the team's equalization, assists and protection engine.", { priority: "critical", target: "Geonosian Brood Alpha" }),
      step("conscription", "Use Conscription as a recovery/control reset when debuffs or lost protection threaten the swarm, rather than firing it automatically on cooldown.", { priority: "high", ability: "Conscription" }),
      step("cleanup", "After the medic/AoE threat is controlled or defeated, use the Geo assist engine to clean up lower-priority enemies while preparing Poggle and Soldier for the next wave.", { priority: "high" }),
    ], {
      objective: "Exit each wave with the Geo engine intact and control tools ready for the next threat scan.",
    }),
  ],
  targetPriorities: [
    { target: "ARC Trooper", priority: "critical", when: "when present", reason: "Community reports repeatedly flag ARC's AoE as a run-ending threat if it is not controlled or removed quickly." },
    { target: "Clone Medic", priority: "critical", when: "when present", reason: "Keep the Medic Ability Blocked and remove it to prevent enemy revives." },
    { target: "Dangerous AoE attacker", priority: "high", when: "when ARC/Medic ordering does not dominate", reason: "The strategy's core is preventing the AoE turn that can collapse the Geo swarm." },
  ],
  failureRisks: [
    "Allowing ARC Trooper or another high-impact AoE attacker to take an uncontrolled special can collapse an otherwise legal Geo team.",
    "Leaving Clone Medic uncontrolled can create a revive cycle and erase prior target progress.",
    "Throwing Poggle's Ability Block into high Tenacity without Soldier's Tenacity Down setup can make the control plan less reliable.",
    "Losing Geonosian Brood Alpha/Brute/Hive Mind control early can break the assist and sustain engine before the later waves.",
  ],
  evidenceBoundary: "Current character IDs and ability behavior are current SWGOH.GG facts. Threat priorities and the Tenacity Down → Ability Block control pattern are community-tested Wat mission guidance. Enemy compositions vary by wave, so this pack intentionally does not claim a universal exact four-wave turn script or win probability.",
});

export function watBattleStrategyForMission(missionId) {
  return String(missionId || "") === WAT_BATTLE_STRATEGY.missionId ? WAT_BATTLE_STRATEGY : null;
}
