const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const MANDALORE_BATTLE_STRATEGY_SOURCES = Object.freeze([
  {
    id: "cg-mandalore-zone",
    label: "Capital Games · Mandalore Bonus Zone Information",
    kind: "official",
    url: "https://forums.ea.com/blog/swgoh-game-info-hub-en/mandalore-bonus-zone-information-originally-posted-apr-25-2024/4948594",
  },
  {
    id: "cg-bkm-kit",
    label: "Capital Games · Bo-Katan (Mand'alor) Kit Reveal",
    kind: "official",
    url: "https://swgoh.gg/news/kit-reveal-bo-katan-mandalor/",
  },
  {
    id: "swgohgg-bkm",
    label: "SWGOH.GG · Bo-Katan (Mand'alor) current kit and TB missions",
    kind: "current-reference",
    url: "https://swgoh.gg/units/bo-katan-mandalor/",
  },
  {
    id: "swgohgg-bam",
    label: "SWGOH.GG · The Mandalorian (Beskar Armor) current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/the-mandalorian-beskar-armor/",
  },
  {
    id: "swgohgg-ig12",
    label: "SWGOH.GG · IG-12 & Grogu current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/ig-12-grogu/",
  },
  {
    id: "bitdynasty-mandalore-p4",
    label: "BitDynasty · Mandalore Bonus Planet Phase 4 mission reference",
    kind: "community-tested",
    url: "https://www.swgoh.tv/video/41634-mandalore-bonus-planet-mix-s4-bkm-dtmg-jmk-levi-executrix-gauntlet-rote-tb-swgoh",
  },
]);

export const MANDALORE_BKM_STRATEGY = Object.freeze({
  id: "mandalore-bkm-v1",
  missionId: "mandalore-bkm",
  title: "Mandalore · Bo-Katan (Mand'alor) R9 Combat Mission",
  status: "verified-core",
  confidence: "official-kit-core-community-battle-reference",
  lastVerified: "2026-08-15",
  sources: MANDALORE_BATTLE_STRATEGY_SOURCES,
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
    {
      fasterBaseId: "THEMANDALORIANBESKARARMOR",
      slowerBaseId: "MANDALORBOKATAN",
      label: "Beskar Mando faster than Bo-Katan",
      importance: "high",
      reason: "Capital Games' kit strategy tip says to mod Bo-Katan (Mand'alor) slower than The Mandalorian (Beskar Armor) for maximum damage.",
    },
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

export function mandaloreBattleStrategyForMission(missionId) {
  return String(missionId || "") === MANDALORE_BKM_STRATEGY.missionId ? MANDALORE_BKM_STRATEGY : null;
}
