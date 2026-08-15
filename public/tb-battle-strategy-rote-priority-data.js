const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_PRIORITY_BATTLE_STRATEGY_SOURCES = Object.freeze([
  { id: "cg-mandalore-zone", label: "Capital Games · Mandalore Bonus Zone Information", kind: "official", url: "https://swgoh.gg/news/mandalore-bonus-zone-information/" },
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "swgohgg-bkm", label: "SWGOH.GG · Bo-Katan (Mand'alor) current kit and TB missions", kind: "current-reference", url: "https://swgoh.gg/units/bo-katan-mandalor/" },
  { id: "swgohgg-bam", label: "SWGOH.GG · The Mandalorian (Beskar Armor) current kit", kind: "current-reference", url: "https://swgoh.gg/units/the-mandalorian-beskar-armor/" },
  { id: "swgohgg-dtmg", label: "SWGOH.GG · Dark Trooper Moff Gideon current kit and TB mission", kind: "current-reference", url: "https://swgoh.gg/units/dark-trooper-moff-gideon/" },
  { id: "swgohgg-reva", label: "SWGOH.GG · Third Sister current kit and Haven TB mission", kind: "current-reference", url: "https://swgoh.gg/units/third-sister/" },
  { id: "starwarsfans-mandalore-unlock", label: "StarWars-fans · Tatooine Mandalore unlock walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/05/swgoh-rote-territory-battle-unlocking-mandalore-special-mission-walkthrough-tips/" },
  { id: "starwarsfans-dtmg", label: "StarWars-fans · Mandalore DTMG combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/07/swgoh-rote-territory-battle-mandalore-dtmg-combat-mission-walkthrough-tips/" },
  { id: "starwarsfans-remnant", label: "StarWars-fans · Imperial Remnant DTMG composition cross-check", kind: "community-tested", url: "https://starwars-fans.com/2024/07/swgoh-best-mods-for-the-imperial-remnant-faction/" },
]);

const sources = (...ids) => ROTE_PRIORITY_BATTLE_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_PRIORITY_BATTLE_STRATEGIES = Object.freeze({
  "tatooine-mandalore-unlock": Object.freeze({
    id: "tatooine-mandalore-unlock-v1",
    missionId: "tatooine-mandalore-unlock",
    title: "Tatooine · Mandalore Unlock · Krayt Dragon",
    status: "community-tested",
    confidence: "official-entry-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-mandalore-zone", "swgohgg-bkm", "swgohgg-bam", "starwarsfans-mandalore-unlock"),
    summary: "Use the official Bo-Katan (Mand'alor) + Beskar Mando core with a third R7+ Mandalorian. The tested Krayt plan is to establish Armor Shred with Darksaber Flourish, use the granted Fire Ballista immediately when the Krayt swallows a Mandalorian, then preserve Bo-Katan's cleanse/swarm and the squad's recovery tools for the boss's heavy debuff and damage cycles.",
    requiredLeaderBaseId: "MANDALORBOKATAN",
    keyUnits: [
      { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", importance: "critical", reason: "Officially required at R7+; this sourced strategy uses her as leader and damage/control engine." },
      { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", importance: "critical", reason: "Officially required at R7+ and part of the tested three-unit clear." },
      { baseId: "IG12", name: "IG-12 & Grogu", importance: "helpful", reason: "Community-tested third Mandalorian with assist and recovery utility; the official gate allows any additional R7+ Mandalorian." },
    ],
    keyAbilities: [
      { baseId: "MANDALORBOKATAN", abilityName: "Darksaber Flourish", importance: "high", expected: "Persistent Armor Shred, True damage and Stun", reason: "The tested boss clear uses repeated Armor Shred to reduce the Krayt's durability." },
      { baseId: "MANDALORBOKATAN", abilityName: "Reinforcements Have Arrived", importance: "high", expected: "Light Side Mandalorian cleanse and assist burst", reason: "Preserve it for a meaningful debuff-clear and damage window." },
    ],
    speedOrders: [
      { fasterBaseId: "THEMANDALORIANBESKARARMOR", slowerBaseId: "MANDALORBOKATAN", label: "Beskar Mando faster than Bo-Katan", importance: "high", reason: "The current BKM kit strategy guidance recommends Beskar Mando acting before Bo-Katan for maximum damage sequencing." },
    ],
    stages: [
      stage("opening", "Opening · establish Armor Shred", [
        step("assist-bkm", "If the third Mandalorian can call an ally to assist, favor Bo-Katan when that advances the opening damage cycle without sacrificing recovery.", { priority: "helpful" }),
        step("armor-shred", "Use Darksaber Flourish to put persistent Armor Shred on the Krayt Dragon and begin the boss damage ramp.", { priority: "critical", ability: "Darksaber Flourish", target: "Krayt Dragon" }),
        step("preserve-reset", "Avoid spending the full-team cleanse/recovery package before the boss creates a meaningful debuff or damage window.", { priority: "high" }),
      ], { objective: "Start the permanent defense-reduction loop while keeping defensive cooldowns available." }),
      stage("swallow", "Swallow cycle · free the captured Mandalorian", [
        step("fire-ballista", "When the Krayt swallows a Mandalorian and Fire Ballista becomes available, use the granted mission ability to free the captured ally before returning to normal damage sequencing.", { priority: "critical", ability: "Fire Ballista" }),
        step("cleanse-swarm", "After the boss's major debuff pressure lands, use Reinforcements Have Arrived when its cleanse and assist wave provide real survival and damage value.", { priority: "high", ability: "Reinforcements Have Arrived" }),
        step("recover", "Use Beskar Mando or the third Mandalorian's recovery/protection tools to stabilize the lowest ally before another heavy boss action.", { priority: "high" }),
      ], { objective: "Answer the mission-specific swallow mechanic without losing the three-unit core." }),
      stage("finish", "Closeout · stack Shred and finish", [
        step("reapply-shred", "Reapply Darksaber Flourish when available; the tested clear uses another Armor Shred to accelerate the final health segment.", { priority: "high", ability: "Darksaber Flourish", target: "Krayt Dragon" }),
        step("assist-finish", "Convert assist calls and True-damage windows into the finish while retaining enough recovery to survive another boss action if required.", { priority: "high" }),
      ], { objective: "Finish through accumulated Armor Shred rather than an unsupported burst attempt." }),
    ],
    targetPriorities: [
      { target: "Krayt Dragon", priority: "critical", when: "all normal attacks", reason: "The encounter is a three-versus-one boss battle; strategy revolves around Armor Shred, assists and boss-mechanic responses." },
    ],
    failureRisks: [
      "Missing either official required character or the third R7+ Mandalorian fails the mission entry requirement.",
      "Ignoring Fire Ballista after a swallow can leave a required unit unavailable while the Krayt continues its damage cycle.",
      "Spending the BKM cleanse/swarm before the dangerous debuff window can remove a major survival tool.",
    ],
    evidenceBoundary: "The R7 BKM/Beskar-Mando/third-Mandalorian entry requirement is official. Armor Shred, cleanse and current kit behavior are current-reference facts. The Krayt sequencing and IG-12 recommendation are community-tested guidance, not a guaranteed clear rate.",
  }),

  "mandalore-dtmg": Object.freeze({
    id: "mandalore-dtmg-v1",
    missionId: "mandalore-dtmg",
    title: "Mandalore · Dark Trooper Moff Gideon R8 Combat Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-mandalore-zone", "swgohgg-dtmg", "starwarsfans-dtmg", "starwarsfans-remnant"),
    summary: "Use DTMG lead with a full Imperial Remnant shell so Shadow Contingency's full-team branch remains active. Build Insight, pair Daze/Offense Down/Stagger with Force Lance to create Stuns, preserve Scout Trooper cleanse and DTMG's Unwavering Presence as survival resets, remove Canderous/Maul pressure in Wave 1, then prioritize Bo-Katan (Mand'alor) and Paz Vizsla in Wave 2 while leaving IG-12 & Grogu late.",
    requiredLeaderBaseId: "MOFFGIDEONS3",
    keyUnits: [
      { baseId: "MOFFGIDEONS3", name: "Dark Trooper Moff Gideon", importance: "critical", reason: "Officially required at R8+; leader slot activates the strongest Imperial Remnant revive branch." },
      { baseId: "MOFFGIDEON", name: "Moff Gideon", importance: "high", reason: "Community-tested Imperial Remnant partner with Turn Meter control and Daze access." },
      { baseId: "SCOUTTROOPER", name: "Scout Trooper", importance: "high", reason: "Community-tested support whose debuff cleanse is specifically important to surviving the mission." },
      { baseId: "DEATHTROOPER", name: "Death Trooper", importance: "high", reason: "Cross-checked community composition; supplies Daze and post-kill Deathmark pressure." },
      { baseId: "STORMTROOPER", name: "Stormtrooper", importance: "high", reason: "Secondary taunt helps distribute pressure away from DTMG." },
    ],
    keyAbilities: [
      { baseId: "MOFFGIDEONS3", abilityName: "Force Lance", importance: "high", expected: "Gain Insight; Stun if target has Daze, Offense Down or Stagger", reason: "Turn existing debuff setup into control while advancing DTMG's Insight engine." },
      { baseId: "MOFFGIDEONS3", abilityName: "Unwavering Presence", importance: "high", expected: "Taunt, recovery, assist and leader-slot Imperial Remnant revive", reason: "Primary survival reset; defeated Imperial Remnant allies revive at full Health/Protection when DTMG leads." },
    ],
    stages: [
      stage("wave1-survive", "Wave 1 · survive the Mandalorian opener", [
        step("protect-dtmg", "Keep DTMG durable and avoid exposing him to an unchecked Maul multi-attack sequence; alternate DTMG and Stormtrooper protection windows instead of overlapping them wastefully.", { priority: "critical" }),
        step("canderous", "Remove Canderous Ordo's offense early when targetability allows; the community walkthrough identifies his sustained damage as a major opening pressure source.", { priority: "high", target: "Canderous Ordo" }),
        step("debuff-stun", "Apply Daze, Offense Down or Stagger before Force Lance when practical so DTMG converts the setup into a Stun while gaining Insight.", { priority: "high", ability: "Force Lance" }),
        step("save-resets", "Keep Scout Trooper's cleanse and Unwavering Presence for actual danger windows rather than consuming both as routine opening actions.", { priority: "high" }),
      ], { objective: "Stabilize the first wave without losing DTMG or exhausting both survival resets.", hazards: ["Maul repeated attacks", "Canderous sustained offense", "DTMG dying before the revive/Insight engine develops"] }),
      stage("wave1-kill", "Wave 1 · convert the first defeat", [
        step("maul", "Once the board is stable, prioritize Maul as the major threat removal when targetability opens.", { priority: "critical", target: "Maul" }),
        step("deathmark", "With Death Trooper in the cross-checked shell, preserve the post-kill Deathmark window for the next high-impact target rather than spending it before the first defeat.", { priority: "high" }),
        step("jango-later", "Community testing commonly leaves Jango Fett later and uses a later Deathmark window to stop the fight from extending around his revive behavior.", { priority: "helpful", target: "Jango Fett" }),
      ], { objective: "Turn the first enemy defeat into control over the remaining high-pressure units." }),
      stage("wave2", "Wave 2 · break the Light Side Mandalorians", [
        step("bkm-first", "Focus Bo-Katan (Mand'alor) immediately when Paz's protection and targetability allow it; the tested strategy identifies BKM as the preferred first Wave 2 kill.", { priority: "critical", target: "Bo-Katan (Mand'alor)" }),
        step("paz-next", "After BKM is removed, make Paz Vizsla the next major durability target and use the available post-kill pressure window to accelerate him.", { priority: "high", target: "Paz Vizsla" }),
        step("ig12-late", "Leave IG-12 & Grogu until late rather than spending the early damage cycle on the support unit while more dangerous Mandalorians remain.", { priority: "high", target: "IG-12 & Grogu" }),
        step("revive-reset", "If an Imperial Remnant ally falls and DTMG remains active as leader, use Unwavering Presence when the full-health/full-protection revive materially resets the fight.", { priority: "critical", ability: "Unwavering Presence" }),
      ], { objective: "Remove BKM/Paz pressure while preserving DTMG's revive engine for the closeout." }),
    ],
    targetPriorities: [
      { target: "Canderous Ordo", priority: "high", when: "Wave 1 opening when targetable", reason: "Community-tested walkthrough prioritizes removing his offense early." },
      { target: "Maul", priority: "critical", when: "Wave 1 after stabilization", reason: "Repeated attacks can collapse DTMG if left unchecked." },
      { target: "Bo-Katan (Mand'alor)", priority: "critical", when: "Wave 2", reason: "Preferred first Wave 2 focus in the tested Mandalore strategy." },
      { target: "Paz Vizsla", priority: "high", when: "Wave 2 after BKM", reason: "Durability and taunt pressure make him the next major obstacle." },
      { target: "IG-12 & Grogu", priority: "helpful", when: "late Wave 2", reason: "Community guidance leaves this support unit until late while higher-impact Mandalorians are removed." },
    ],
    failureRisks: [
      "Breaking the all-Imperial-Remnant starting composition disables the strongest branch of Shadow Contingency's team engine.",
      "Letting DTMG die before Insight and Unwavering Presence can stabilize the fight removes the composition's primary survival/reset mechanism.",
      "The original walkthrough's opening list says Dark Trooper while its tactical instructions repeatedly use Death Trooper. A separate Imperial Remnant guide from the same publisher explicitly confirms Death Trooper in the intended five-unit DTMG shell; this pack uses that cross-checked version.",
    ],
    evidenceBoundary: "The DTMG R8 mission requirement and DTMG kit mechanics are official/current-reference facts. Enemy priorities and the Imperial Remnant composition are community-tested. The source's Dark-Trooper/Death-Trooper inconsistency is explicitly cross-checked rather than hidden, and no guaranteed clear percentage is generated.",
  }),

  "haven-reva": Object.freeze({
    id: "haven-reva-v1",
    missionId: "haven-reva",
    title: "Haven · Third Sister Inquisitorius Special Mission",
    status: "verified-mechanic-community-strategy",
    confidence: "official-mechanic-current-kit",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-reva"),
    summary: "Use Third Sister as the strategy leader and treat Brain Worm Outbreak as the primary encounter clock. Every character begins with Brain Worms; each Special adds another stack to its target, and each stack costs 5% Health at the start of the afflicted character's turn while ignoring Protection. Use Brain Freeze proactively to clear dangerous stacks from a key ally, accepting the granted ability's unavoidable Stun, while Reva's lead starts enemies at five Purge stacks.",
    requiredLeaderBaseId: "THIRDSISTER",
    keyUnits: [
      { baseId: "THIRDSISTER", name: "Third Sister", importance: "critical", reason: "Officially required at R8+ for the Haven Inquisitorius special mission; this pack evaluates the Third-Sister-led variant." },
      { baseId: "GRANDINQUISITOR", name: "Grand Inquisitor", importance: "high", reason: "High-value Inquisitor partner that immediately exploits the Purge state Reva establishes." },
      { baseId: "FIFTHBROTHER", name: "Fifth Brother", importance: "helpful", reason: "Inquisitor control and dispel utility, subject to Operations availability." },
      { baseId: "SEVENTHSISTER", name: "Seventh Sister", importance: "helpful", reason: "Sustain/control option for the attrition-heavy Brain Worm environment." },
    ],
    stages: [
      stage("worm-accounting", "Opening · account for Brain Worms", [
        step("start-one", "Assume every character begins with one unavoidable, non-dispellable Brain Worm stack and access to the granted Brain Freeze ability; ordinary allied dispels do not remove Brain Worms.", { priority: "critical" }),
        step("special-cost", "Before using a Special, account for the fact that the acting character's Brain Worm effect adds a stack to the target. Do not spam Specials without tracking who is accumulating start-of-turn Health loss.", { priority: "critical" }),
        step("purge-open", "Under Third Sister lead, exploit the five starting Purge stacks on enemies to accelerate Inquisitor Purge-dependent control and damage.", { priority: "high" }),
      ], { objective: "Treat Brain Worm stacks as an attrition resource instead of a normal dispellable debuff.", hazards: ["5% Health loss per Brain Worm stack at start of turn", "Brain Worm damage ignores Protection"] }),
      stage("brain-freeze", "Attrition control · use Brain Freeze deliberately", [
        step("clear-danger", "Use Brain Freeze on a key ally before its Brain Worm stack count becomes a lethal or destabilizing start-of-turn tax.", { priority: "critical", ability: "Brain Freeze" }),
        step("accept-stun", "Brain Freeze's Stun cannot be prevented, so choose the ally and timing where losing the immediate action is safer than carrying the accumulated Health drain.", { priority: "critical" }),
        step("avoid-wasted-cleanse", "Do not spend ordinary cleanse abilities specifically to remove Brain Worms because the official modifier prevents allied dispels from removing them.", { priority: "critical" }),
      ], { objective: "Trade a controlled unavoidable Stun for removal of dangerous Health-drain stacks." }),
      stage("closeout", "Closeout · Purge control with managed worm load", [
        step("focus-threat", "Use Purge-dependent control and damage on the highest current enemy threat while keeping the next Brain Freeze recipient in mind.", { priority: "high" }),
        step("preserve-reva", "Keep Third Sister functional so the Purge and tank engine remains available through the attrition cycle.", { priority: "high" }),
        step("avoid-extra-special", "When the enemy is nearly defeated, prefer a controlled finish over unnecessary Specials because every additional Special can create another Brain Worm stack and future Health loss.", { priority: "high" }),
      ], { objective: "Finish with the Purge engine intact without allowing the environmental Health tax to become the main failure condition." }),
    ],
    targetPriorities: [
      { target: "Current highest-impact enemy controller / damage source", priority: "critical", when: "throughout", reason: "The official mission-defining mechanic is Brain Worm Outbreak; this pack does not invent a universal enemy spawn/kill order without stable encounter data." },
      { target: "Ally with dangerous Brain Worm stacks", priority: "critical", when: "Brain Freeze decision", reason: "Brain Freeze is the official stack-reset tool and trades those stacks for an unavoidable Stun." },
    ],
    failureRisks: [
      "Treating Brain Worms like a normal debuff wastes cleanse actions because the modifier prevents allied dispels from removing them.",
      "Ignoring stack count can allow start-of-turn Health loss to bypass Protection and cripple a key Inquisitor.",
      "Using Brain Freeze too early wastes the reset; using it too late can allow the Health tax to become lethal.",
      "This pack is specifically the Third-Sister-led Haven strategy variant; it does not claim every legal Inquisitor leader has equivalent sequencing.",
    ],
    evidenceBoundary: "Brain Worm Outbreak and Brain Freeze are official Capital Games mission mechanics. Third Sister's R8 Haven requirement and current Purge leader behavior are current-reference facts. Exact enemy target order remains adaptive, and no win probability is generated.",
  }),
});

export function rotePriorityBattleStrategyForMission(missionId) {
  return ROTE_PRIORITY_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
