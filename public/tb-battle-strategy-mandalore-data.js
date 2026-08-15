const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const MANDALORE_BATTLE_STRATEGY_SOURCES = Object.freeze([
  { id: "cg-mandalore-zone", label: "Capital Games · Mandalore Bonus Zone Information", kind: "official", url: "https://forums.ea.com/blog/swgoh-game-info-hub-en/mandalore-bonus-zone-information-originally-posted-apr-25-2024/4948594" },
  { id: "cg-bkm-kit", label: "Capital Games · Bo-Katan (Mand'alor) Kit Reveal", kind: "official", url: "https://swgoh.gg/news/kit-reveal-bo-katan-mandalor/" },
  { id: "swgohgg-bkm", label: "SWGOH.GG · Bo-Katan (Mand'alor) current kit and TB missions", kind: "current-reference", url: "https://swgoh.gg/units/bo-katan-mandalor/" },
  { id: "swgohgg-bam", label: "SWGOH.GG · The Mandalorian (Beskar Armor) current kit", kind: "current-reference", url: "https://swgoh.gg/units/the-mandalorian-beskar-armor/" },
  { id: "swgohgg-ig12", label: "SWGOH.GG · IG-12 & Grogu current kit", kind: "current-reference", url: "https://swgoh.gg/units/ig-12-grogu/" },
  { id: "bitdynasty-mandalore-p4", label: "BitDynasty · Mandalore Bonus Planet Phase 4 mission reference", kind: "community-tested", url: "https://www.swgoh.tv/video/41634-mandalore-bonus-planet-mix-s4-bkm-dtmg-jmk-levi-executrix-gauntlet-rote-tb-swgoh" },
  { id: "starwars-fans-mandalore-unlock", label: "StarWars-Fans · Tatooine Krayt Dragon Mandalore unlock walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/05/swgoh-rote-territory-battle-unlocking-mandalore-special-mission-walkthrough-tips/" },
]);

const sourceIds = (...ids) => MANDALORE_BATTLE_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

export const MANDALORE_BKM_STRATEGY = Object.freeze({
  id: "mandalore-bkm-v1",
  missionId: "mandalore-bkm",
  title: "Mandalore · Bo-Katan (Mand'alor) R9 Combat Mission",
  status: "verified-core",
  confidence: "official-kit-core-community-battle-reference",
  lastVerified: "2026-08-15",
  sources: MANDALORE_BATTLE_STRATEGY_SOURCES.filter((source) => source.id !== "starwars-fans-mandalore-unlock"),
  summary: "Build the squad around Bo-Katan (Mand'alor)'s Light Side Mandalorian engine: Beskar Mando should act before Bo-Katan for the official maximum-damage sequencing tip, Armor Shred opens the tank/True-damage loop, Reinforcements Have Arrived cleanses the team and calls double assists, and Ancestral Resolve should be accumulated rather than treated as a generic damage buff.",
  requiredLeaderBaseId: "MANDALORBOKATAN",
  requiredMechanics: [
    { id: "armor_shred", label: "Armor Shred access", importance: "high", evidenceType: "debuff", evidenceKey: "Armor Shred" },
    { id: "assist", label: "Assist engine", importance: "high", evidenceType: "mechanic", evidenceKey: "assist" },
    { id: "cleanse", label: "Ally cleanse", importance: "high", evidenceType: "mechanic", evidenceKey: "dispel_ally" },
    { id: "stun", label: "Stun control", importance: "helpful", evidenceType: "debuff", evidenceKey: "Stun" },
  ],
  keyUnits: [
    { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", importance: "critical", reason: "Mission-required R9 leader and the Ancestral Resolve / True-damage engine." },
    { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", importance: "high", reason: "CG explicitly recommends Bo-Katan be slower than Beskar Mando for maximum damage sequencing." },
    { baseId: "PAZVIZSLA", name: "Paz Vizsla", importance: "helpful", reason: "Light Side Mandalorian tank whose Heat/Overheat kit supplies protection, control and True-damage pressure." },
    { baseId: "IG12", name: "IG-12 & Grogu", importance: "helpful", reason: "Provides healing, targeted cleanse, Ability Block and Light Side Mandalorian assists." },
  ],
  keyAbilities: [
    { baseId: "MANDALORBOKATAN", abilityName: "Darksaber Flourish", importance: "critical", expected: "Armor Shred and Stun", reason: "Armor Shred persists for the encounter and feeds Bo-Katan's leader/tank pressure while the Stun supplies control." },
    { baseId: "MANDALORBOKATAN", abilityName: "Reinforcements Have Arrived", importance: "critical", expected: "Cleanse allies, double assist and Ancestral Resolve", reason: "This is the main team reset and Ancestral Resolve acceleration button." },
    { baseId: "MANDALORBOKATAN", abilityName: "Way of the Mandalore", importance: "critical", expected: "Light Side Mandalorian leader engine", reason: "The mission plan depends on the non-GAC Light Side Mandalorian bonuses and Ancestral Resolve generation." },
  ],
  speedOrders: [
    { fasterBaseId: "THEMANDALORIANBESKARARMOR", slowerBaseId: "MANDALORBOKATAN", label: "Beskar Mando faster than Bo-Katan", importance: "high", reason: "Capital Games' kit strategy tip says to mod Bo-Katan (Mand'alor) slower than The Mandalorian (Beskar Armor) for maximum damage." },
  ],
  stages: [
    stage("setup", "Opening · establish the Mandalorian engine", [
      step("preserve-order", "Let Beskar Mando act before Bo-Katan when your mods permit the official recommended speed order.", { priority: "high" }),
      step("apply-armor-shred", "Use Darksaber Flourish on the priority enemy to establish persistent Armor Shred and a Stun window.", { priority: "critical", ability: "Darksaber Flourish" }),
      step("build-ancestral", "Accumulate Ancestral Resolve through the kit's True-damage, dispel and resist triggers instead of spending turns as if the squad were a generic Mandalorian team.", { priority: "high" }),
    ], { objective: "Establish Armor Shred and begin the Ancestral Resolve loop without breaking the intended speed order." }),
    stage("pressure", "Pressure · cleanse, assist and convert stacks", [
      step("reinforcements", "Use Reinforcements Have Arrived when the team benefits from the full cleanse plus double-assist sequence; it also adds Ancestral Resolve stacks to Light Side Mandalorians.", { priority: "critical", ability: "Reinforcements Have Arrived" }),
      step("true-damage", "Lean into True-damage and repeated assists as Ancestral Resolve grows; Bo-Katan's kit specifically amplifies her Ancestral Resolve True damage.", { priority: "high" }),
      step("protect-support", "If IG-12 & Grogu is in the squad, preserve its heal/cleanse and Ability Block utility for dangerous enemy turns rather than spending every cooldown immediately.", { priority: "helpful" }),
    ], { objective: "Convert the team's kit interactions into controlled True-damage pressure while preserving sustain." }),
  ],
  targetPriorities: [],
  failureRisks: [
    "Running Bo-Katan faster than Beskar Mando contradicts CG's published maximum-damage sequencing tip and should be treated as a mod-order advisory.",
    "Using non-Light-Side Mandalorian companions weakens major portions of Bo-Katan's non-GAC leader/unique engine even if the mission entry screen permits the unit.",
    "The exact encounter target/kill order is not yet encoded because the available official sources define the kit and mission gates more strongly than a deterministic battle rotation.",
  ],
  evidenceBoundary: "The R9 Bo-Katan Mand'alor mission requirement, Bo-Katan kit mechanics and Beskar-Mando-before-Bo speed guidance are official/current-reference facts. The phase-4 mission usage is community-tested. Exact enemy target order is intentionally not claimed until a sufficiently detailed encounter source is normalized.",
});

export const TATOOINE_MANDALORE_UNLOCK_STRATEGY = Object.freeze({
  id: "tatooine-mandalore-unlock-v1",
  missionId: "tatooine-mandalore-unlock",
  title: "Tatooine · Krayt Dragon Special Mission · Unlock Mandalore",
  status: "community-tested",
  confidence: "official-entry-community-battle-reference",
  lastVerified: "2026-08-15",
  sources: sourceIds("cg-mandalore-zone", "swgohgg-bkm", "swgohgg-bam", "swgohgg-ig12", "starwars-fans-mandalore-unlock"),
  summary: "This is a three-character Krayt Dragon special: Bo-Katan (Mand'alor) R7, Beskar Mando R7 and one additional R7 Mandalorian. IG-12 & Grogu is a community-tested third because its heal/cleanse/assist package complements BKM's Armor Shred and team-reset tools.",
  requiredLeaderBaseId: "MANDALORBOKATAN",
  requiredMechanics: [
    { id: "armor_shred", label: "Armor Shred access", importance: "critical", evidenceType: "debuff", evidenceKey: "Armor Shred" },
    { id: "cleanse", label: "Ally cleanse", importance: "high", evidenceType: "mechanic", evidenceKey: "dispel_ally" },
    { id: "assist", label: "Assist access", importance: "high", evidenceType: "mechanic", evidenceKey: "assist" },
    { id: "heal", label: "Sustain / healing", importance: "helpful", evidenceType: "mechanic", evidenceKey: "heal" },
  ],
  keyUnits: [
    { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", importance: "critical", reason: "Officially mandatory at R7 and the strategy's Armor Shred / cleanse / assist engine." },
    { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", importance: "critical", reason: "Officially mandatory at R7." },
    { baseId: "IG12", name: "IG-12 & Grogu", importance: "helpful", reason: "Community-tested third Mandalorian; any R7 Mandalorian is legal, so IG-12 is a recommendation rather than a hard gate." },
  ],
  keyAbilities: [
    { baseId: "MANDALORBOKATAN", abilityName: "Darksaber Flourish", importance: "critical", expected: "Armor Shred", reason: "Community walkthroughs repeatedly use Armor Shred to accelerate the Krayt Dragon damage window." },
    { baseId: "MANDALORBOKATAN", abilityName: "Reinforcements Have Arrived", importance: "high", expected: "Cleanse and assist swarm", reason: "Used after the Dragon's debuff pressure to reset the team and convert the turn into coordinated damage." },
  ],
  stages: [
    stage("opening", "Opening · establish Krayt pressure", [
      step("ig12-call", "With IG-12 as the third, use its ally-call support to bring Bo-Katan into the opening damage sequence when the board state allows it.", { priority: "helpful", confidence: "community-tested" }),
      step("bam-pressure", "Use Beskar Mando for safe early pressure while preserving his defensive utility for the Dragon's heavier turns.", { priority: "high", confidence: "community-tested" }),
      step("armor-shred", "Apply Armor Shred with Bo-Katan's Darksaber Flourish early; repeat it later if the fight extends.", { priority: "critical", ability: "Darksaber Flourish" }),
    ], { objective: "Get persistent Armor Shred onto the Krayt Dragon while keeping the three-unit squad healthy." }),
    stage("swallow", "Krayt swallow · recover the captured ally", [
      step("ballista", "If the Krayt Dragon swallows an ally, use the mission's Fire Ballista recovery mechanic rather than continuing a normal damage rotation.", { priority: "critical", confidence: "community-tested-event-mechanic" }),
      step("stabilize", "After the swallowed ally is recovered, stabilize Health/Protection before committing another major damage window when needed.", { priority: "high" }),
    ], { objective: "Restore the full three-character team before resuming the damage cycle." }),
    stage("finish", "Finish · cleanse, swarm and sustain", [
      step("cleanse-swarm", "Use Reinforcements Have Arrived when the Krayt's debuffs are suppressing the team; the cleanse plus assist sequence is both recovery and damage.", { priority: "critical", ability: "Reinforcements Have Arrived" }),
      step("support-heal", "Use BAM/IG-12 defensive and healing tools to keep the lowest-health ally alive through the Dragon's return damage.", { priority: "high" }),
      step("second-shred", "If the Dragon survives the first burst, reapply another Armor Shred window and finish through assists/True damage rather than racing without sustain.", { priority: "high" }),
    ], { objective: "Maintain the squad through the Dragon's burst turns while converting cleanses and assists into the final damage cycle." }),
  ],
  targetPriorities: [
    { target: "Krayt Dragon", priority: "critical", when: "throughout", reason: "The encounter is a 3-vs-1 boss fight; the tactical decision is ability timing rather than target selection." },
  ],
  failureRisks: [
    "Treating the mission as a five-character Mandalorian battle is incorrect; the official requirement is BKM + Beskar Mando + one additional Mandalorian.",
    "Ignoring the Fire Ballista recovery step after a swallowed ally can collapse the three-character run.",
    "The IG-12 third slot is community-tested, not mandatory. The app must keep other R7 Mandalorians legally available.",
    "Community reports use relics above the R7 minimum for comfort; the app does not convert that anecdotal investment into a mandatory relic gate.",
  ],
  evidenceBoundary: "The three-unit R7 entry rule and 25-clear guild unlock are official. The IG-12 recommendation and step sequencing are community-tested walkthrough guidance. Relic levels above R7, exact mod thresholds and a guaranteed win rate are intentionally not asserted here.",
});

const STRATEGIES = Object.freeze({
  [MANDALORE_BKM_STRATEGY.missionId]: MANDALORE_BKM_STRATEGY,
  [TATOOINE_MANDALORE_UNLOCK_STRATEGY.missionId]: TATOOINE_MANDALORE_UNLOCK_STRATEGY,
});

export function mandaloreBattleStrategyForMission(missionId) {
  return STRATEGIES[String(missionId || "")] || null;
}
