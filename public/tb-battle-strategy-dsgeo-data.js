import { WAT_BATTLE_STRATEGY } from "./tb-battle-strategy-wat-data.js";
import { roteJabbaJkckStrategyForMission } from "./tb-battle-strategy-rote-jabba-jkck-data.js";

const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const DS_GEO_STRATEGY_SOURCES = Object.freeze([
  {
    id: "swgohgg-ds-geo",
    label: "SWGOH.GG · Geonosis: Separatist Might",
    kind: "current-reference",
    url: "https://swgoh.gg/territory-battles/t03D/",
  },
  {
    id: "swgohwiki-ds-geo",
    label: "SWGOH Wiki · Geonosis Separatist Might",
    kind: "current-reference",
    url: "https://swgoh.wiki/wiki/Geonosis_Separatist_Might",
  },
  {
    id: "ea-acklay-thread",
    label: "EA Forums · Acklay mission control discussion",
    kind: "community-tested",
    url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/acklay-mission/4327356",
  },
  {
    id: "ea-acklay-guide",
    label: "EA Forums · DS Geo P2 Acklay Special Mission guide",
    kind: "community-tested",
    url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/swgoh---ds-geo-tb-phase-2---special-mission-guide---squash-the-acklay/4466877",
  },
  {
    id: "swgohtv-acklay",
    label: "SWGOH.TV · Acklay Special Mission guide",
    kind: "community-tested",
    url: "https://www.swgoh.tv/video/572-how-to-beat-the-acklay-special-mission-guide-win-with-all-geonosians-alive-galaxy-of-heroes",
  },
  {
    id: "cg-jabba-existing-tb",
    label: "Capital Games · Jabba missions added to Dark Side Hoth and Geonosis",
    kind: "official",
    url: "https://swgoh.gg/news/update-10122022/",
  },
  {
    id: "swgohgg-jabba",
    label: "SWGOH.GG · Jabba the Hutt current unit and Territory Battle missions",
    kind: "current-reference",
    url: "https://swgoh.gg/units/jabba-the-hutt/",
  },
]);

const source = (id) => DS_GEO_STRATEGY_SOURCES.find((row) => row.id === id);

const ACKLAY = Object.freeze({
  id: "s2-acklay-v1",
  missionId: "s2",
  title: "Petranaki Arena · Acklay Special Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: [
    source("swgohgg-ds-geo"),
    source("swgohwiki-ds-geo"),
    source("ea-acklay-thread"),
    source("ea-acklay-guide"),
    source("swgohtv-acklay"),
  ].filter(Boolean),
  summary: "The Phase 2 Petranaki Arena Geonosian special mission is the Acklay encounter. The tested control core is to cancel Acklay's Enrage immediately when the mission action permits it, then prevent Jedi AoE turns with Ability Block or priority kills while preserving the Geonosian Brood Alpha/Hive Mind sustain engine and steadily damaging Acklay.",
  requiredLeaderBaseId: "GEONOSIANBROODALPHA",
  keyUnits: [
    { baseId: "GEONOSIANBROODALPHA", name: "Geonosian Brood Alpha", importance: "critical", reason: "The tested team is built around Hive Mind, health/protection equalization, Brute, and the Geo assist engine." },
    { baseId: "POGGLETHELESSER", name: "Poggle the Lesser", importance: "critical", reason: "Ability Block is the primary control tool against dangerous Jedi AoE attackers." },
    { baseId: "GEONOSIANSOLDIER", name: "Geonosian Soldier", importance: "high", reason: "Tenacity Down improves the reliability of important debuffs before Poggle control attempts." },
    { baseId: "GEONOSIANSPY", name: "Geonosian Spy", importance: "high", reason: "Spy supplies the team's concentrated burst when a safe Acklay or Jedi kill window opens." },
    { baseId: "SUNFAC", name: "Sun Fac", importance: "high", reason: "Tank and dispel utility helps keep the swarm intact through the long encounter." },
  ],
  keyAbilities: [
    { baseId: "POGGLETHELESSER", abilityName: "Martial Doom", importance: "critical", expected: "Ability Block", reason: "Keep the Jedi capable of dangerous AoE specials from taking those turns while Acklay is being managed." },
    { baseId: "GEONOSIANSOLDIER", abilityName: "Aggressive Advance", importance: "high", expected: "Tenacity Down", reason: "Use Tenacity Down setup before important Ability Block attempts when practical." },
    { baseId: "GEONOSIANBROODALPHA", abilityName: "Conscription", importance: "high", expected: "Cleanse, Brute summon and team sustain", reason: "Hold this as a recovery/reset tool when the Geo engine is under pressure instead of spending it without need." },
    { baseId: "GEONOSIANSPY", abilityName: "Silent Strike", importance: "high", expected: "High single-target burst", reason: "Use burst on the current run-ending Jedi threat or Acklay when the board is controlled." },
  ],
  stages: [
    stage("enrage-control", "Opening · cancel Acklay Enrage", [
      step("read-enrage", "Check Acklay's Enrage state before committing normal attacks. Community-tested guidance consistently treats removing/cancelling Enrage as the first mission priority.", { priority: "critical", target: "Acklay" }),
      step("cancel-enrage", "Use the mission-provided Enrage-removal/cancellation action as soon as it is legally available. Do not invent a normal Geo ability as the Enrage remover; it is encounter control.", { priority: "critical", target: "Acklay" }),
      step("stabilize", "After Enrage is under control, preserve Brute/Hive Mind and avoid spending the full burst package until the dangerous Jedi specials are also controlled.", { priority: "high" }),
    ], { objective: "Prevent the Acklay's Enraged damage window from deciding the run before the Geo engine stabilizes." }),
    stage("jedi-control", "Arena adds · suppress AoE threats", [
      step("scan-aoe", "Identify the Jedi reinforcement most capable of a damaging AoE or other run-ending special before selecting the next target.", { priority: "critical" }),
      step("tenacity-down", "When practical, land Geonosian Soldier's Tenacity Down before the important Poggle control attempt.", { priority: "high", ability: "Aggressive Advance" }),
      step("block-or-kill", "Ability Block the dangerous AoE Jedi with Poggle or remove that Jedi outright before returning full attention to Acklay.", { priority: "critical", ability: "Martial Doom" }),
      step("repeat-control", "Re-scan replacement Jedi as they enter. The encounter is a repeated control loop, not a pure Acklay damage race.", { priority: "critical" }),
    ], { objective: "Prevent Jedi AoE turns from deleting multiple Geonosians while the boss fight continues." }),
    stage("acklay-damage", "Damage windows · work Acklay down", [
      step("safe-burst", "When Enrage is cancelled and the active Jedi AoE threat is controlled, commit Spy burst and the Geo assist engine into Acklay.", { priority: "high", target: "Acklay", ability: "Silent Strike" }),
      step("protect-engine", "If protection or debuff pressure threatens the swarm, use Conscription/Brute recovery before forcing another damage window.", { priority: "high", ability: "Conscription" }),
      step("do-not-greed", "If Enrage or an uncontrolled AoE threat returns, leave the damage race and rebuild control first.", { priority: "critical" }),
    ], { objective: "Convert controlled windows into boss damage without sacrificing the Geo swarm." }),
  ],
  targetPriorities: [
    { target: "Acklay Enrage state", priority: "critical", when: "opening and whenever Enrage returns", reason: "Community-tested guidance repeatedly identifies cancelling Enrage as the first survival requirement." },
    { target: "Jedi AoE attacker", priority: "critical", when: "when an AoE special is available or approaching", reason: "Repeated community reports identify uncontrolled Jedi AoE attacks as a principal cause of failed runs." },
    { target: "Acklay", priority: "high", when: "Enrage is cancelled and Jedi specials are controlled", reason: "Use safe windows for concentrated boss damage rather than ignoring the encounter control loop." },
  ],
  failureRisks: [
    "Starting the damage race while Acklay remains Enraged can cause an early wipe.",
    "Ignoring the Jedi adds can allow an AoE attacker to remove multiple Geonosians even when Acklay control is correct.",
    "Spending Poggle control or Spy burst on low-impact targets can leave the next AoE or boss window unmanaged.",
    "This mission contains meaningful RNG; the strategy is a tested control framework, not a guaranteed clear rate.",
  ],
  evidenceBoundary: "The Phase 2 Petranaki Arena Geonosian special mission and reward are current-reference facts. Enrage cancellation plus Jedi AoE suppression is repeatedly community-tested guidance from EA Forum and SWGOH.TV sources. The pack does not claim a guaranteed win percentage, exact enemy spawn order, or a universal turn-by-turn script.",
});

const WAT = Object.freeze({
  ...WAT_BATTLE_STRATEGY,
  id: "s3-wat-v2",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  evidenceBoundary: `${WAT_BATTLE_STRATEGY.evidenceBoundary} The pack is considered strategy-covered because multiple independent tested guides support the control loop; covered does not mean deterministic or guaranteed.`,
});

const jabbaCore = roteJabbaJkckStrategyForMission("corellia-jabba");
const JABBA = Object.freeze({
  ...jabbaCore,
  id: "s5-jabba-dsgeo-v1",
  missionId: "s5",
  title: "Count Dooku's Hangar · Jabba + Hutt Cartel Special Mission",
  status: "verified-core",
  confidence: "official-entry-current-kit-core",
  lastVerified: "2026-08-16",
  sources: [
    source("cg-jabba-existing-tb"),
    source("swgohgg-jabba"),
    ...(Array.isArray(jabbaCore?.sources) ? jabbaCore.sources : []),
  ].filter(Boolean),
  summary: `Capital Games explicitly added a Jabba mission to Dark Side Geonosis and SWGOH.GG currently lists the Phase 4 Count Dooku's Hangar special mission. Use the established Jabba/Hutt Cartel contract-and-ultimate engine while respecting this mission's 7-star, 16,500+ Hutt Cartel entry contract. ${jabbaCore?.summary || ""}`.trim(),
  evidenceBoundary: "Jabba's presence in Dark Side Geonosis and the current Phase 4 special-mission listing are official/current-reference facts. Jabba ability behavior comes from current kit references inherited by the sourced Jabba strategy core. This pack does not claim a mission-specific deterministic enemy sequence or guaranteed clear percentage where no authoritative source establishes one.",
});

export const DS_GEO_BATTLE_STRATEGIES = Object.freeze({
  s2: ACKLAY,
  s3: WAT,
  s5: JABBA,
});

export function dsGeoBattleStrategyForMission(missionId) {
  return DS_GEO_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
