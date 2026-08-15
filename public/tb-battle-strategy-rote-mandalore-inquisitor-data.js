const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_MANDALORE_INQUISITOR_SOURCES = Object.freeze([
  {
    id: "cg-mandalore-zone",
    label: "Capital Games · Mandalore Bonus Zone requirements",
    kind: "official",
    url: "https://swgoh.gg/news/mandalore-bonus-zone-information/",
  },
  {
    id: "cg-rote-details",
    label: "Capital Games · Rise of the Empire mission modifiers",
    kind: "official",
    url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373",
  },
  {
    id: "swgohgg-bkm",
    label: "SWGOH.GG · Bo-Katan (Mand'alor) current kit and mission requirements",
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
    id: "swgohgg-paz",
    label: "SWGOH.GG · Paz Vizsla current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/paz-vizsla/",
  },
  {
    id: "swgohgg-dtmg",
    label: "SWGOH.GG · Dark Trooper Moff Gideon current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/dark-trooper-moff-gideon/",
  },
  {
    id: "swgohgg-reva",
    label: "SWGOH.GG · Third Sister current kit and Haven mission requirement",
    kind: "current-reference",
    url: "https://swgoh.gg/units/third-sister/",
  },
  {
    id: "starwarsfans-mandalore-unlock",
    label: "StarWars-fans · Tatooine Mandalore unlock walkthrough",
    kind: "community-tested",
    url: "https://starwars-fans.com/2024/05/swgoh-rote-territory-battle-unlocking-mandalore-special-mission-walkthrough-tips/",
  },
  {
    id: "starwarsfans-dtmg",
    label: "StarWars-fans · Mandalore DTMG combat walkthrough",
    kind: "community-tested",
    url: "https://starwars-fans.com/2024/07/swgoh-rote-territory-battle-mandalore-dtmg-combat-mission-walkthrough-tips/",
  },
  {
    id: "starwarsfans-remnant",
    label: "StarWars-fans · Imperial Remnant DTMG composition cross-check",
    kind: "community-tested",
    url: "https://starwars-fans.com/2024/07/swgoh-best-mods-for-the-imperial-remnant-faction/",
  },
  {
    id: "bitdynasty-mandalore",
    label: "BitDynasty · Mandalore BKM/DTMG ROTE testing",
    kind: "community-tested",
    url: "https://www.swgoh.tv/video/41634-mandalore-bonus-planet-mix-s4-bkm-dtmg-jmk-levi-executrix-gauntlet-rote-tb-swgoh",
  },
  {
    id: "xaereth-p4-2026",
    label: "Xaereth Prevails · 2026 ROTE Phase 4 testing",
    kind: "community-tested",
    url: "https://swgoh.tv/video/48709-phase-4-rote-lots-of-full-auto-teams-w-timestamps-galaxyofheroes-swgoh",
  },
]);

const sources = (...ids) => ROTE_MANDALORE_INQUISITOR_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_MANDALORE_INQUISITOR_STRATEGIES = Object.freeze({
  "tatooine-mandalore-unlock": Object.freeze({
    id: "tatooine-mandalore-unlock-v1",
    missionId: "tatooine-mandalore-unlock",
    title: "Tatooine · Mandalore Unlock · Krayt Dragon",
    status: "community-tested",
    confidence: "community-validated",
    lastVerified: "2026-08-15",
    sources: sources("cg-mandalore-zone", "swgohgg-bkm", "swgohgg-bam", "starwarsfans-mandalore-unlock"),
    summary: "Use the required Bo-Katan (Mand'alor) + Beskar Mando core with a durable third R7+ Mandalorian. The tested Krayt plan is to stack Armor Shred with Darksaber Flourish, use the granted Fire Ballista when the Krayt swallows a Mandalorian, and preserve BKM's team cleanse/swarm plus Beskar Mando/IG-12 recovery for the heavy debuff and damage cycles.",
    requiredLeaderBaseId: "MANDALORBOKATAN",
    keyUnits: [
      { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", importance: "critical", reason: "Officially required at R7+ and the Armor Shred/cleanse/True-damage engine for the Krayt fight." },
      { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", importance: "critical", reason: "Officially required at R7+; supplies damage and defensive utility in the tested three-unit clear." },
      { baseId: "IG12", name: "IG-12 & Grogu", importance: "high", reason: "Community-tested third Mandalorian with assist and recovery utility; another legal R7+ Mandalorian can satisfy entry." },
    ],
    keyAbilities: [
      { baseId: "MANDALORBOKATAN", abilityName: "Darksaber Flourish", importance: "high", expected: "Armor Shred, True damage and Stun", reason: "Armor Shred is the repeatable damage-amplification setup used in the tested Krayt clear." },
      { baseId: "MANDALORBOKATAN", abilityName: "Reinforcements Have Arrived", importance: "high", expected: "Light Side Mandalorian debuff cleanse, assists and Ancestral Resolve", reason: "Preserve it for a useful cleanse/swarm window instead of spending it into low-value timing." },
    ],
    stages: [
      stage("opening-shred", "Opening · Establish Armor Shred", [
        step("call-bkm", "If the third Mandalorian can call an ally to assist, favor Bo-Katan early when it advances the damage cycle without sacrificing recovery.", { priority: "helpful" }),
        step("apply-shred", "Use Darksaber Flourish to apply Armor Shred and begin the permanent defense-reduction stack on the Krayt Dragon.", { priority: "critical", ability: "Darksaber Flourish", target: "Krayt Dragon" }),
        step("basic-pressure", "Use efficient basics/assists between major cooldowns so the team does not waste cleanse or recovery before the Krayt's heavy response.", { priority: "high" }),
      ], { objective: "Get Armor Shred established while keeping defensive cooldowns available.", hazards: ["Early cooldown waste", "Krayt swallow cycle"] }),
      stage("swallow-response", "Swallow cycle · Free the captured Mandalorian", [
        step("ballista", "When the Krayt swallows a Mandalorian and the granted Fire Ballista is available, use the mission mechanic to free the captured ally before continuing normal damage sequencing.", { priority: "critical", ability: "Fire Ballista" }),
        step("cleanse-swarm", "After the Krayt's debuff pressure lands, use Reinforcements Have Arrived when its team-wide cleanse and assist wave produce real survival and damage value.", { priority: "high", ability: "Reinforcements Have Arrived" }),
        step("recover", "Use Beskar Mando/third-Mandalorian recovery or protection tools to stabilize the lowest ally before another heavy Krayt hit.", { priority: "high" }),
      ], { objective: "Answer the mission-specific swallow mechanic without losing the three-unit core." }),
      stage("finish", "Closeout · Reapply Shred and finish", [
        step("second-shred", "Reapply Darksaber Flourish when available; the tested clear uses repeated Armor Shred to accelerate the final health segment.", { priority: "high", ability: "Darksaber Flourish", target: "Krayt Dragon" }),
        step("assist-finish", "Convert assist calls and True-damage windows into the finish while keeping enough recovery to survive one more Krayt action if needed.", { priority: "high" }),
      ], { objective: "Finish through stacked Armor Shred rather than gambling the run on an unsupported burst." }),
    ],
    targetPriorities: [
      { target: "Krayt Dragon", priority: "critical", when: "all normal attacks", reason: "The encounter is a three-versus-one boss mission; damage setup revolves around permanent Armor Shred and assist/True-damage windows." },
    ],
    failureRisks: [
      "Entering without both official required units or without a third R7+ Mandalorian fails the mission entry requirement.",
      "Ignoring the Fire Ballista/swallow response can leave a required unit unavailable while the boss continues its damage cycle.",
      "Spending the BKM cleanse/swarm before the dangerous debuff window can remove a major recovery/control option.",
    ],
    evidenceBoundary: "Entry requirements are official/current-reference facts. The Krayt sequencing, IG-12 recommendation and specific Armor Shred/recovery timing are community-tested guidance. No guaranteed clear rate is claimed.",
  }),

  "mandalore-bkm": Object.freeze({
    id: "mandalore-bkm-v1",
    missionId: "mandalore-bkm",
    title: "Mandalore · Bo-Katan (Mand'alor) Combat Mission",
    status: "community-tested",
    confidence: "community-validated-partial",
    lastVerified: "2026-08-15",
    sources: sources("cg-mandalore-zone", "swgohgg-bkm", "swgohgg-paz", "bitdynasty-mandalore"),
    summary: "Treat the R9 Bo-Katan mission as a Light Side Mandalorian ramp fight: create Armor Shred, generate Ancestral Resolve by True damage/dispels/resists, use Reinforcements Have Arrived as both cleanse and assist burst, and exploit Paz Vizsla's Territory Battle durability when he is available. Exact enemy target order remains adaptive until a stable spawn set is independently documented.",
    requiredLeaderBaseId: "MANDALORBOKATAN",
    keyUnits: [
      { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", importance: "critical", reason: "Officially required at R9 for this Mandalore combat mission and the strategy's leader/ramp engine." },
      { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", importance: "high", reason: "Core Light Side Mandalorian damage/utility partner; also part of the guild's Mandalore unlock investment path." },
      { baseId: "PAZVIZSLA", name: "Paz Vizsla", importance: "high", reason: "His current kit has explicit Territory Battle Defense/Health/Protection and encounter-start Resilient Defense bonuses." },
      { baseId: "IG12", name: "IG-12 & Grogu", importance: "helpful", reason: "Light Side Mandalorian support/recovery and assist utility." },
      { baseId: "ARMORER", name: "The Armorer", importance: "helpful", reason: "Light Side Mandalorian support that can exploit Armor Shred to build Beskar Ingots." },
    ],
    keyAbilities: [
      { baseId: "MANDALORBOKATAN", abilityName: "Darksaber Flourish", importance: "high", expected: "Armor Shred, True damage and Stun", reason: "Creates the permanent Shred target and itself generates True-damage-based Ancestral Resolve progress." },
      { baseId: "MANDALORBOKATAN", abilityName: "Reinforcements Have Arrived", importance: "high", expected: "Cleanse, double assists and Ancestral Resolve", reason: "The current max non-GAC text dispels all Light Side Mandalorian debuffs, calls them to assist twice, and grants Ancestral Resolve." },
    ],
    stages: [
      stage("ramp", "Encounter opening · Build the Mandalore engine", [
        step("shred-priority", "Apply Darksaber Flourish to the enemy whose removal most reduces incoming pressure; Armor Shred then also enables BKM leader tank-Taunt interactions on subsequent attacks.", { priority: "critical", ability: "Darksaber Flourish" }),
        step("resolve-engine", "Favor useful True damage, debuff dispels and resisted debuffs because each advances Ancestral Resolve under BKM lead while still serving the immediate board state.", { priority: "high" }),
        step("paz-tb", "If Paz is present, use his Territory Battle durability and Resilient Defense as the front-line buffer rather than forcing BKM to absorb avoidable pressure.", { priority: "high" }),
      ], { objective: "Establish Armor Shred and begin Ancestral Resolve scaling without losing a support Mandalorian." }),
      stage("cleanse-burst", "Midfight · Cleanse into assist burst", [
        step("hold-cleanse", "Hold Reinforcements Have Arrived until there are meaningful dispellable debuffs or a priority target is ready for the double-assist burst.", { priority: "high", ability: "Reinforcements Have Arrived" }),
        step("convert-resolve", "Once Ancestral Resolve has accumulated, prioritize True-damage actions and assist windows that convert those stacks into additional unavoidable damage.", { priority: "high" }),
        step("protect-core", "Preserve BKM and the active tank/support core; do not trade them for low-value cleanup when another cleanse/assist cycle is close.", { priority: "high" }),
      ], { objective: "Convert the faction ramp into a controlled kill without giving up the survival shell." }),
      stage("transition", "Wave transition · Carry resources", [
        step("carry-cooldowns", "When the current wave is controlled, finish it with lower-value actions if practical so Darksaber Flourish and the cleanse/swarm are available early in the next encounter.", { priority: "high" }),
        step("repeat", "Re-establish Armor Shred on the next wave's most dangerous enemy, rebuild Ancestral Resolve and repeat the cleanse/burst cycle.", { priority: "high" }),
      ], { objective: "Avoid entering a fresh R9 encounter with every major Mandalorian cooldown exhausted." }),
    ],
    targetPriorities: [
      { target: "Highest immediate controller / damage threat", priority: "critical", when: "each encounter", reason: "A stable universal enemy spawn/turn order is not independently verified; target priority should follow the live encounter rather than fabricated scripting." },
      { target: "Armor Shred target", priority: "high", when: "after Darksaber Flourish", reason: "Follow-up attacks exploit reduced defenses and BKM's Shred-linked leader interactions." },
    ],
    failureRisks: [
      "Using a non-Light-Side-Mandalorian shell can disable important BKM unique effects that explicitly require all allies to have been Light Side Mandalorian at battle start.",
      "Spending Reinforcements Have Arrived before a meaningful cleanse/burst window wastes one of the team's best recovery and ramp actions.",
      "Treating a community video as proof of a universal enemy sequence would overstate the evidence; the pack intentionally stays target-adaptive.",
    ],
    evidenceBoundary: "BKM's R9 mission requirement and current kit interactions are official/current-reference facts. Mandalore viability is community-tested, but exact enemy sequencing is intentionally adaptive because a stable encounter spawn order was not independently verified from primary data.",
  }),

  "mandalore-dtmg": Object.freeze({
    id: "mandalore-dtmg-v1",
    missionId: "mandalore-dtmg",
    title: "Mandalore · Dark Trooper Moff Gideon Combat Mission",
    status: "community-tested",
    confidence: "community-validated",
    lastVerified: "2026-08-15",
    sources: sources("cg-mandalore-zone", "swgohgg-dtmg", "starwarsfans-dtmg", "starwarsfans-remnant", "xaereth-p4-2026"),
    summary: "Use DTMG lead with a full Imperial Remnant shell so Shadow Contingency's full-team effects stay active. Build Insight, use Daze/Offense Down/Stagger to turn Force Lance into Stuns, preserve Unwavering Presence as the taunt/recovery/revive reset, remove Canderous/Maul pressure in Wave 1, then focus Bo-Katan (Mand'alor) and Paz Vizsla in Wave 2 while leaving IG-12 & Grogu late.",
    requiredLeaderBaseId: "MOFFGIDEONS3",
    keyUnits: [
      { baseId: "MOFFGIDEONS3", name: "Dark Trooper Moff Gideon", importance: "critical", reason: "Officially required at R8+; DTMG lead activates the Imperial Remnant sustain/ramp and full-health/full-protection revive branch." },
      { baseId: "MOFFGIDEON", name: "Moff Gideon", importance: "high", reason: "Community-tested Remnant partner with Turn Meter control and Daze access." },
      { baseId: "SCOUTTROOPER", name: "Scout Trooper", importance: "high", reason: "Community-tested support whose debuff-dispel utility is specifically valuable in the mission." },
      { baseId: "DEATHTROOPER", name: "Death Trooper", importance: "high", reason: "Cross-checked community composition; supplies Daze and post-kill Deathmark pressure." },
      { baseId: "STORMTROOPER", name: "Stormtrooper", importance: "high", reason: "Secondary taunt helps keep repeated enemy pressure off DTMG." },
    ],
    keyAbilities: [
      { baseId: "MOFFGIDEONS3", abilityName: "Force Lance", importance: "high", expected: "Insight; Stun if target has Daze, Offense Down or Stagger", reason: "Turn existing debuff setup into Stun while building Insight." },
      { baseId: "MOFFGIDEONS3", abilityName: "Unwavering Presence", importance: "high", expected: "Taunt, self recovery, assist and leader-slot Imperial Remnant revive", reason: "Primary survival reset; with DTMG leading, defeated Imperial Remnant allies revive at full Health/Protection and gain Stealth." },
    ],
    stages: [
      stage("wave1-survive", "Wave 1 · Survive Maul pressure", [
        step("protect-dtmg", "Keep DTMG durable and avoid exposing him to an unchecked Maul multi-attack sequence; combine DTMG and Stormtrooper taunt windows rather than overlapping them wastefully.", { priority: "critical" }),
        step("canderous", "Remove Canderous Ordo's offense early when targetability allows; community testing identifies his sustained damage as an early pressure source.", { priority: "high", target: "Canderous Ordo" }),
        step("debuff-stun", "Apply Daze, Offense Down or Stagger before Force Lance when practical so DTMG converts the setup into a Stun while gaining Insight.", { priority: "high", ability: "Force Lance" }),
        step("save-reset", "Keep Scout Trooper's debuff removal and Unwavering Presence available for actual danger windows instead of using both as routine opening actions.", { priority: "high" }),
      ], { objective: "Stabilize the first Mandalorian wave without losing DTMG or exhausting both survival resets.", hazards: ["Maul repeated attacks", "Canderous sustained offense", "DTMG dying before Insight/revive tempo develops"] }),
      stage("wave1-kills", "Wave 1 · Convert first kill", [
        step("maul", "After the board is stable, prioritize Maul as an early major-threat removal when targetability opens.", { priority: "critical", target: "Maul" }),
        step("deathmark", "If Death Trooper is in the chosen Remnant shell, preserve Terminate/Deathmark timing for after a first enemy defeat so the next high-health threat can be accelerated.", { priority: "high", target: "post-first-kill threat" }),
        step("jango-late", "Community testing commonly leaves Jango Fett later in the wave and uses a later Deathmark window to prevent the fight from extending around his revive behavior.", { priority: "helpful", target: "Jango Fett" }),
      ], { objective: "Turn the first enemy defeat into control over the remaining high-pressure units." }),
      stage("wave2-bkm", "Wave 2 · Break the Light Side Mandalorians", [
        step("bkm-first", "Focus Bo-Katan (Mand'alor) immediately when Paz's protection/targeting permits it; community testing identifies BKM as the preferred Wave 2 first kill.", { priority: "critical", target: "Bo-Katan (Mand'alor)" }),
        step("paz-next", "After BKM is removed, make Paz Vizsla the next major durability target; use the available post-kill pressure/Deathmark window when the selected composition supports it.", { priority: "high", target: "Paz Vizsla" }),
        step("ig12-late", "Leave IG-12 & Grogu until late rather than spending the early damage cycle on the support unit while more dangerous Mandalorians remain.", { priority: "high", target: "IG-12 & Grogu" }),
        step("revive-reset", "If an Imperial Remnant ally falls and DTMG remains leader/alive, use Unwavering Presence when the full-health/full-protection revive materially resets the fight.", { priority: "critical", ability: "Unwavering Presence" }),
      ], { objective: "Remove BKM/Paz pressure while preserving DTMG's revive engine for the closeout." }),
    ],
    targetPriorities: [
      { target: "Canderous Ordo", priority: "high", when: "Wave 1 opening when targetable", reason: "Community-tested walkthrough prioritizes removing his offense early." },
      { target: "Maul", priority: "critical", when: "Wave 1 after stabilization", reason: "Repeated attacks can collapse DTMG if left unchecked." },
      { target: "Bo-Katan (Mand'alor)", priority: "critical", when: "Wave 2", reason: "Preferred first Wave 2 focus in the tested Mandalore strategy." },
      { target: "Paz Vizsla", priority: "high", when: "Wave 2 after BKM", reason: "Large durability/taunt pressure makes him the next major obstacle." },
      { target: "IG-12 & Grogu", priority: "helpful", when: "late Wave 2", reason: "Community guidance leaves this support unit until late while higher-impact Mandalorians are removed." },
    ],
    failureRisks: [
      "Breaking the all-Imperial-Remnant starting composition disables the strongest branch of Shadow Contingency's team engine.",
      "Letting DTMG die before he can leverage Insight and Unwavering Presence removes the composition's primary survival/reset mechanism.",
      "The original walkthrough's opening team list says Dark Trooper while its tactical text repeatedly references Death Trooper; a separate faction guide from the same publisher confirms Death Trooper in the intended five-unit DTMG shell. This pack uses the cross-checked Death Trooper version.",
    ],
    evidenceBoundary: "DTMG's R8 mission requirement and kit mechanics are current-reference facts. Enemy priorities and the Imperial Remnant composition are community-tested. A source-text Dark Trooper/Death Trooper inconsistency is explicitly resolved by cross-check rather than hidden; no guaranteed clear percentage is used.",
  }),

  "haven-reva": Object.freeze({
    id: "haven-reva-v1",
    missionId: "haven-reva",
    title: "Haven · Third Sister Inquisitorius Special Mission",
    status: "community-tested",
    confidence: "verified-mechanic-community-sequencing",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-reva", "xaereth-p4-2026"),
    summary: "This is the Third Sister-led Haven variant. Brain Worm Outbreak is the governing mechanic: every character starts with Brain Worms, each Special ability spreads another stack to its target, and each stack costs 5% Health at the start of the afflicted character's turn while ignoring Protection. Use Brain Freeze proactively to clear dangerous stacks from a key ally, accepting its unavoidable Stun, while Reva's lead starts enemy Purge pressure immediately.",
    requiredLeaderBaseId: "THIRDSISTER",
    keyUnits: [
      { baseId: "THIRDSISTER", name: "Third Sister", importance: "critical", reason: "Officially required at R8+ for the Haven Inquisitorius special mission; this pack specifically evaluates the Reva-led variant." },
      { baseId: "GRANDINQUISITOR", name: "Grand Inquisitor", importance: "high", reason: "High-value Inquisitor partner that exploits the Purge state Reva establishes immediately." },
      { baseId: "FIFTHBROTHER", name: "Fifth Brother", importance: "helpful", reason: "Inquisitor control/dispels remain useful, subject to Operations availability." },
      { baseId: "SEVENTHSISTER", name: "Seventh Sister", importance: "helpful", reason: "Inquisitor sustain/control option for the attrition-heavy Brain Worm environment." },
      { baseId: "MARROK", name: "Marrok", importance: "helpful", reason: "Modern Inquisitorius option; treated as roster-dependent rather than a mission hard requirement." },
    ],
    stages: [
      stage("worm-accounting", "Opening · Account for Brain Worms", [
        step("start-one", "Assume every character begins with one unavoidable, non-dispellable Brain Worm stack and the granted Brain Freeze ability; normal allied dispels do not remove Brain Worms.", { priority: "critical" }),
        step("special-cost", "Before using a Special, account for the fact that the acting character's Brain Worm effect will add a stack to the target. Do not spam Specials without considering who is accumulating start-of-turn Health loss.", { priority: "critical" }),
        step("purge-open", "Under Third Sister lead, exploit the five starting Purge stacks on enemies to accelerate Inquisitor critical pressure and Purge-dependent ability effects.", { priority: "high" }),
      ], { objective: "Treat Brain Worm stacks as a resource/attrition clock, not as a normal dispellable debuff.", hazards: ["5% Health loss per Brain Worm stack at start of turn", "Protection does not absorb Brain Worm damage"] }),
      stage("brain-freeze", "Attrition control · Use Brain Freeze deliberately", [
        step("clear-danger", "Use Brain Freeze on a key ally before its Brain Worm stack count becomes a lethal or destabilizing start-of-turn tax.", { priority: "critical", ability: "Brain Freeze" }),
        step("accept-stun", "Brain Freeze's Stun cannot be prevented; choose the ally and timing where losing that immediate action is safer than carrying the accumulated Health drain.", { priority: "critical" }),
        step("dont-normal-dispel", "Do not spend ordinary cleanse abilities specifically to remove Brain Worms; the official modifier makes them immune to allied dispels.", { priority: "critical" }),
      ], { objective: "Trade a controlled unavoidable Stun for removal of dangerous Health-drain stacks." }),
      stage("closeout", "Closeout · Purge control with managed worm load", [
        step("focus-threat", "Use Purge-dependent control/damage on the highest current enemy threat while keeping the next Brain Freeze recipient in mind.", { priority: "high" }),
        step("preserve-reva", "Keep Third Sister alive and functional; her R8 requirement and leader engine are central to this variant, while her own revive mechanics provide additional resilience if triggered.", { priority: "high" }),
        step("carry-health", "Prefer a controlled finish over unnecessary Specials when the enemy is nearly defeated; every extra Special can create another Brain Worm stack and more future Health loss.", { priority: "high" }),
      ], { objective: "Finish with the Purge engine intact without allowing the environmental Health tax to become the real enemy." }),
    ],
    targetPriorities: [
      { target: "Current highest-impact enemy controller / damage source", priority: "critical", when: "throughout", reason: "The official mission-defining information is the Brain Worm modifier; a universal enemy spawn sequence is not asserted without stable primary encounter data." },
      { target: "Ally with dangerous Brain Worm stacks", priority: "critical", when: "Brain Freeze decision", reason: "Brain Freeze targets an ally and is the official way to remove all Brain Worm stacks, at the cost of unavoidable Stun." },
    ],
    failureRisks: [
      "Treating Brain Worms like a normal debuff wastes cleanse actions because the modifier makes them immune to allied dispels.",
      "Ignoring stack count can cause start-of-turn Health loss to bypass Protection and kill or cripple a key Inquisitor.",
      "Using Brain Freeze too early wastes the stack reset; using it too late can allow the Health tax to become lethal.",
      "This pack is specifically the Third Sister-led Haven variant; other legal Inquisitor leaders are not represented as equivalent strategy states.",
    ],
    evidenceBoundary: "Brain Worm Outbreak and Brain Freeze are official Capital Games mission mechanics; Third Sister's R8 Haven requirement and current leader behavior are current-reference facts. Exact target order remains adaptive and Phase 4 clear viability is community-tested, not a guaranteed result.",
  }),
});

export function roteMandaloreInquisitorStrategyForMission(missionId) {
  return ROTE_MANDALORE_INQUISITOR_STRATEGIES[String(missionId || "")] || null;
}
