const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_SPECIAL_BATTLE_STRATEGY_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "swgohgg-hondo", label: "SWGOH.GG · Hondo Ohnaka current kit and Felucia mission", kind: "current-reference", url: "https://swgoh.gg/units/hondo-ohnaka/" },
  { id: "bitdynasty-felucia-hondo", label: "BitDynasty · Felucia Hondo with Lord Vader", kind: "community-tested", url: "https://www.swgoh.tv/video/36643-felucia-hondo-lando-guide-with-lv-and-see-rise-of-the-empire-rote-tb-sector-p2-swgoh" },
  { id: "swgohgg-saw", label: "SWGOH.GG · Saw Gerrera current kit", kind: "current-reference", url: "https://swgoh.gg/units/saw-gerrera/" },
  { id: "cg-saw-kit", label: "Capital Games · Saw Gerrera kit reveal", kind: "official", url: "https://forums.ea.com/discussions/swgoh-strategy-and-tips-en/kit-reveal-saw-gerrera/4275597" },
  { id: "bitdynasty-kashyyyk-saw", label: "BitDynasty · Kashyyyk Saw Gerrera ROTE testing", kind: "community-tested", url: "https://www.swgoh.tv/video/39512-kashyyyk-saw-gerrera-special-mission-rote-tb-swgoh" },
  { id: "swgohgg-aphra", label: "SWGOH.GG · Doctor Aphra current kit", kind: "current-reference", url: "https://swgoh.gg/units/doctor-aphra/" },
  { id: "swgohgg-bt1", label: "SWGOH.GG · BT-1 current kit", kind: "current-reference", url: "https://swgoh.gg/units/bt-1/" },
  { id: "swgohgg-triplezero", label: "SWGOH.GG · 0-0-0 current kit", kind: "current-reference", url: "https://swgoh.gg/units/0-0-0/" },
]);

const sources = (...ids) => ROTE_SPECIAL_BATTLE_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_SPECIAL_BATTLE_STRATEGIES = Object.freeze({
  "felucia-hondo": Object.freeze({
    id: "felucia-hondo-lv-v1",
    missionId: "felucia-hondo",
    title: "Felucia · Hondo Ohnaka Special Mission · Lord Vader Variant",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-hondo", "bitdynasty-felucia-hondo"),
    summary: "Use the tested Lord Vader shell around mandatory Hondo. Felucia's Nysillin Farm grants Heal Over Time at the start of turns, gives Defense while Heal Over Time is active, converts expiration into Offense Up, and improves healing effectiveness. Let that sustain support Lord Vader's normal ramp while Hondo uses Captive to freeze a dangerous non-GL enemy and builds Ransom toward critical immunity and start-of-turn recovery.",
    requiredLeaderBaseId: "LORDVADER",
    keyUnits: [
      { baseId: "LORDVADER", name: "Lord Vader", importance: "critical", reason: "Leader for the community-tested Felucia Hondo strategy variant and the primary attrition/ramp engine." },
      { baseId: "HONDO", name: "Hondo Ohnaka", importance: "critical", reason: "Officially required at R6+ for the Felucia special mission; Captive and Ransom are the mission-specific control/sustain tools." },
      { baseId: "ROYALGUARD", name: "Royal Guard", importance: "helpful", reason: "Common Lord Vader protection shell; advisory because Operations can affect availability." },
      { baseId: "MAUL", name: "Maul", importance: "helpful", reason: "High-value Lord Vader damage accelerator when available; not an official Felucia entry requirement." },
    ],
    keyAbilities: [
      { baseId: "HONDO", abilityName: "I Don't Want to Kill You Per Se", importance: "high", expected: "Remove enemy Turn Meter, gain Outmaneuver, inflict Captive; Captive characters have Speed set to 0 and cannot bonus attack or gain bonus Turn Meter", reason: "Use on the highest-impact legal non-GL enemy to remove it from the normal tempo race while Hondo builds Ransom." },
      { baseId: "HONDO", abilityName: "That's Just Good Business", importance: "high", expected: "Ransom thresholds grant critical immunity and start-of-turn Health/Protection recovery", reason: "Track Hondo's Ransom thresholds because Felucia's healing modifier compounds his own sustain once the stack engine is active." },
    ],
    stages: [
      stage("farm-opening", "Opening · exploit Nysillin sustain", [
        step("expect-hot", "Account for Nysillin Farm's automatic Heal Over Time at the start of each character turn. While Heal Over Time is active the character gains Defense, and when it expires the character gains Offense Up.", { priority: "critical" }),
        step("lv-ramp", "Use the Felucia healing/Defense cushion to preserve Lord Vader's supporting shell while his normal Underestimated/Mastery/Ultimate ramp develops.", { priority: "high" }),
        step("capture-threat", "Use I Don't Want to Kill You Per Se on the highest-impact legal non-GL enemy when removing its Speed and bonus-Turn-Meter access materially stabilizes the wave.", { priority: "critical", ability: "I Don't Want to Kill You Per Se" }),
      ], { objective: "Convert Felucia's sustain into time for Lord Vader and Hondo to establish their ramp/control engines." }),
      stage("ransom", "Midfight · build Ransom and preserve Hondo", [
        step("keep-captive", "While an enemy is Captive, keep Hondo alive so he continues gaining encounter-long offensive stats and Speed at the start of his turns.", { priority: "high" }),
        step("ransom-10", "At 10+ Ransom, Hondo is immune to critical hits; treat this as a meaningful survivability breakpoint rather than spending Hondo as expendable support.", { priority: "high" }),
        step("ransom-15-20", "At 15+ and 20+ Ransom, Hondo recovers Health and then Protection at the start of his turns. Felucia's increased healing effectiveness makes these thresholds especially valuable in an attrition fight.", { priority: "high" }),
      ], { objective: "Turn Hondo from a mission requirement into a durable control piece while Lord Vader continues scaling." }),
      stage("closeout", "Closeout · convert LV ramp", [
        step("priority-threat", "Remove the highest remaining healer/controller/AOE threat after Captive and Lord Vader control have stabilized the board; do not invent a universal enemy sequence where the live encounter can vary.", { priority: "high" }),
        step("finish-ramp", "Use Lord Vader's accumulated Mastery/Ultimate window to finish before unnecessary extra turns extend the battle.", { priority: "high" }),
      ], { objective: "Finish from a stabilized position rather than forcing Hondo into a damage role before his Ransom engine matures." }),
    ],
    targetPriorities: [
      { target: "Highest-impact legal non-GL enemy", priority: "critical", when: "Hondo Captive is available", reason: "Captive sets a character's Speed to 0 and blocks bonus attacks/bonus Turn Meter, making it Hondo's strongest tempo-control tool." },
      { target: "Highest remaining healer/controller/AOE threat", priority: "high", when: "after stabilization", reason: "A stable universal Felucia spawn order is not asserted; target priority follows the live wave." },
    ],
    failureRisks: [
      "This is specifically the community-tested Lord Vader strategy variant; Lord Vader is not an official Felucia Hondo entry requirement.",
      "Hondo can escape if a Captive enemy is defeated before he has at least 10 Ransom, so do not casually kill the Captive target while Hondo is below that threshold.",
      "Grand Arena-only Hondo text is not used in this Territory Battle pack.",
    ],
    evidenceBoundary: "Felucia's Nysillin Farm and the Hondo R6 mission are official/current mission facts. Hondo Captive/Ransom behavior is current SWGOH.GG kit data. Lord Vader composition is community-tested strategy; exact enemy sequencing remains adaptive and no clear percentage is generated.",
  }),

  "kashyyyk-saw": Object.freeze({
    id: "kashyyyk-saw-rebel-fighters-v1",
    missionId: "kashyyyk-saw",
    title: "Kashyyyk · Saw Gerrera Rebel Fighter Special Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-saw", "cg-saw-kit", "bitdynasty-kashyyyk-saw"),
    summary: "Use Saw lead with an all-Rebel-Fighter starting squad so his mode-independent leader and unique are fully active. Kashyyyk's Righteous Retribution permanently increases Critical Damage when allies take damage and restores Protection when they gain debuffs; allied defeats trigger bonus turns. Imperial Supremacy makes Empire Specials call assists, so reduce enemy tempo with Saw's RPS-6 Rocket Launcher Blast and deploy Set Explosive Trap early enough for normal turns/Specials to count it down and detonate before the fight is already decided.",
    requiredLeaderBaseId: "SAWGERRERA",
    keyUnits: [
      { baseId: "SAWGERRERA", name: "Saw Gerrera", importance: "critical", reason: "Officially mandatory for the Kashyyyk Rebel Fighter special mission and the leader used by this strategy variant." },
    ],
    keyAbilities: [
      { baseId: "SAWGERRERA", abilityName: "RPS-6 Rocket Launcher Blast", importance: "high", expected: "Turn Meter removal based on buffed units, temporary enemy Offense reduction, broad buff dispel, ally recovery and Blind", reason: "Use to disrupt the Empire assist engine and remove important buffs while the Rebel Fighter sustain/ramp loop develops." },
      { baseId: "SAWGERRERA", abilityName: "Freedom Isn't Free", importance: "high", expected: "All-Rebel-Fighter Health/Defense/Speed/Heal-Over-Time engine plus granted Set Explosive Trap", reason: "The mode-independent all-Rebel-Fighter condition is the foundation of this Territory Battle strategy; Grand Arena Omicron additions are excluded." },
      { baseId: "SAWGERRERA", abilityName: "Adapt and Survive", importance: "high", expected: "First sub-50%-Health defensive reset for non-Tank Rebel Fighters", reason: "Gives the low-health Saw engine a controlled recovery branch instead of treating every dip below 50% as immediate failure." },
    ],
    stages: [
      stage("opening-trap", "Opening · establish the Rebel Fighter engine", [
        step("all-rf", "Start with all allies carrying the Rebel Fighter tag so Saw's non-GAC leader and unique conditions activate. Do not count Grand Arena Omicron-only effects as available here.", { priority: "critical" }),
        step("set-trap", "Use Set Explosive Trap while enough enemy turns and Specials remain for the 15 stacks to count down naturally. Each other ally turn or Special removes a stack; at zero it detonates at end of turn.", { priority: "high", ability: "Set Explosive Trap" }),
        step("rocket-control", "Use RPS-6 Rocket Launcher Blast when broad buff removal, Blind and temporary enemy Offense reduction will most reduce the Empire Special/assist chain.", { priority: "critical", ability: "RPS-6 Rocket Launcher Blast" }),
      ], { objective: "Activate Saw's full Rebel Fighter engine and blunt the first Imperial assist cycle." }),
      stage("kashyyyk-ramp", "Midfight · exploit Righteous Retribution", [
        step("damage-ramp", "Each time an ally is damaged, that ally gains 5% Critical Damage for the rest of the encounter. Treat controlled survivable damage as part of the planet's offensive ramp rather than as pure loss.", { priority: "high" }),
        step("debuff-protection", "When an ally gains a debuff, Kashyyyk restores 5% Protection. Combine that environmental recovery with Saw's Heal Over Time/health-recovery engine to survive the long wave.", { priority: "high" }),
        step("defeat-bonus-turn", "If an ally is defeated, all other allies gain a bonus turn. Use that emergency tempo to stabilize, control or finish a priority enemy rather than spending it on low-value actions.", { priority: "critical" }),
      ], { objective: "Convert Kashyyyk's damage/debuff economy into permanent Critical Damage and enough recovery to stay ahead of Imperial Supremacy." }),
      stage("closeout", "Closeout · detonate and suppress Empire Specials", [
        step("trap-detonation", "When Explosive Trap reaches zero, use the resulting enemy Stun/Burning/Stagger window to remove the highest-impact surviving Empire unit.", { priority: "high", ability: "Set Explosive Trap" }),
        step("special-threat", "Prioritize enemies whose Special abilities create the most dangerous assist chains under Imperial Supremacy. A fixed kill list is not asserted when Operations and encounter state can change practical priority.", { priority: "critical" }),
      ], { objective: "Finish during the trap/control window before repeated Empire Specials rebuild momentum." }),
    ],
    targetPriorities: [
      { target: "Highest-impact Empire Special-ability threat", priority: "critical", when: "throughout", reason: "Imperial Supremacy causes Empire Specials to call assists, so suppressing the most dangerous Special user is more robust than inventing a fixed spawn order." },
      { target: "Explosive Trap-stunned enemy", priority: "high", when: "after detonation", reason: "The detonation creates an unavoidable Stun plus Burning/Stagger window that should be converted into permanent removal." },
    ],
    failureRisks: [
      "Starting with a non-Rebel-Fighter ally disables major mode-independent portions of Saw's leader and unique, so this strategy variant should fail closed on faction composition in roster planning even though the evaluator currently checks the leader/unit core.",
      "Using Grand Arena Omicron-only Saw effects in Territory Battle calculations would overstate cooldown/TM/assist behavior; this pack explicitly excludes those clauses.",
      "Waiting until the final enemy to use Set Explosive Trap can waste most of its 15-stack countdown value.",
    ],
    evidenceBoundary: "Kashyyyk Righteous Retribution/Imperial Supremacy and the Saw Rebel Fighter special-mission context are official ROTE mechanics. Saw's non-GAC leader, unique and trap behavior are current/official kit facts. Specific squad composition beyond all-Rebel-Fighter and exact target sequencing remain community-tested/adaptive; no win percentage is generated.",
  }),

  "hoth-aphra": Object.freeze({
    id: "hoth-aphra-trio-v1",
    missionId: "hoth-aphra",
    title: "Hoth · Doctor Aphra + BT-1 + 0-0-0 Special Mission",
    status: "verified-mechanic-conservative",
    confidence: "official-modifier-current-kit",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-aphra", "swgohgg-bt1", "swgohgg-triplezero"),
    summary: "Treat Hoth's environment as the first opponent. Frostbite is unavoidable at the start of turns and defeats a unit at 10 stacks, so use the granted Thermoregulate before a critical unit reaches lethal stacks. Deadly Storm heavily suppresses offense/speed and drains Max Health until the first ally would be defeated, when the Bacta Tanks reset dispels debuffs, restores the team and removes Deadly Storm. Inside that survival clock, Aphra starts with major Turn Meter from mandatory BT-1/0-0-0, uses Rogue Archaeology to raise enemy cooldowns/apply Doubt, and Dangerous Tech to accelerate and sustain the Dark Side Droid core.",
    requiredLeaderBaseId: "DOCTORAPHRA",
    keyUnits: [
      { baseId: "DOCTORAPHRA", name: "Doctor Aphra", importance: "critical", reason: "Officially mandatory at R9 and the leader/control engine for the required trio." },
      { baseId: "BT1", name: "BT-1", importance: "critical", reason: "Officially mandatory at R9; Aphra gains 50% starting Turn Meter from BT-1 and Dangerous Tech directly buffs/recovers Dark Side Droids." },
      { baseId: "TRIPLEZERO", name: "0-0-0", importance: "critical", reason: "Officially mandatory at R9; Aphra gains another 50% starting Turn Meter from 0-0-0 and can revive the required Droid core through Dangerous Tech." },
    ],
    keyAbilities: [
      { baseId: "DOCTORAPHRA", abilityName: "Rogue Archaeology", importance: "high", expected: "AOE cooldown increase, Doubt and Potency Siphon", reason: "Use to delay enemy Specials while the trio handles Frostbite and Deadly Storm attrition." },
      { baseId: "DOCTORAPHRA", abilityName: "Dangerous Tech", importance: "high", expected: "Dark Side Potency Up/Turn Meter, Droid Offense/Critical Damage Up, 30% Health/Protection recovery and Droid revive", reason: "Primary Droid sustain/tempo button inside Hoth's environmental attrition cycle." },
    ],
    stages: [
      stage("deadly-storm", "Opening · survive Deadly Storm", [
        step("aphra-opening", "Aphra begins with 100% Turn Meter when both mandatory BT-1 and 0-0-0 are present. Use that opening tempo for control or sustain instead of wasting it on generic damage.", { priority: "critical" }),
        step("storm-accounting", "While Deadly Storm is active, account for its severe Critical Chance/Offense/Speed penalties and start-of-turn Max Health damage. Do not evaluate early damage output as if normal stats were active.", { priority: "critical" }),
        step("bacta-reset", "The first time an ally would be defeated, Bacta Tanks instead dispels that ally's debuffs, removes Deadly Storm from all allies, restores the endangered ally to full Health/Protection, and gives Damage Immunity plus Stun for one turn. Treat that as a one-time environmental reset, not an ordinary revive.", { priority: "critical" }),
      ], { objective: "Use Aphra's opening tempo to control the enemy while preserving the one-time Bacta safety reset." }),
      stage("frostbite", "Throughout · never lose the Frostbite count", [
        step("track-stacks", "Frostbite is applied unavoidably at the start of each unit turn and reduces Critical Chance, Potency and Speed by 2% per stack. A unit is defeated at 10 stacks.", { priority: "critical" }),
        step("thermoregulate", "Use the granted Thermoregulate on the ally whose Frostbite count is becoming dangerous, ideally before a critical trio member approaches 10 stacks. It removes two Frostbite stacks and has a 3-turn cooldown.", { priority: "critical", ability: "Thermoregulate" }),
        step("dont-hoard", "Do not hoard Thermoregulate past a lethal Frostbite threshold merely to optimize damage; environmental stack management outranks a normal attack when a required unit is near 10 stacks.", { priority: "critical" }),
      ], { objective: "Prevent the unavoidable Frostbite clock from defeating a required R9 unit." }),
      stage("aphra-control", "Control loop · Aphra + Droids", [
        step("rogue", "Use Rogue Archaeology when delaying enemy Specials has maximum value; its cooldown increase and Doubt buy time for the Frostbite/Thermoregulate cycle.", { priority: "high", ability: "Rogue Archaeology" }),
        step("tech", "Use Dangerous Tech to grant Dark Side Turn Meter/Potency and recover/buff BT-1 and 0-0-0; if a required Droid has fallen, the revive clause can also restore the core.", { priority: "high", ability: "Dangerous Tech" }),
        step("adaptive-target", "Focus the highest active enemy damage/control threat while environmental survival remains stable. Exact enemy order is deliberately adaptive because a current stable Hoth spawn script was not independently verified.", { priority: "high" }),
      ], { objective: "Convert Aphra's Droid tempo into a controlled clear after the environmental penalties are managed." }),
    ],
    targetPriorities: [
      { target: "Ally approaching 10 Frostbite stacks", priority: "critical", when: "Thermoregulate decision", reason: "Hoth's official modifier defeats a unit at 10 Frostbite stacks, so environmental triage outranks normal target selection." },
      { target: "Highest-impact enemy controller / damage source", priority: "high", when: "environmental state is safe", reason: "No universal Hoth enemy spawn/kill sequence is asserted without independent encounter verification." },
    ],
    failureRisks: [
      "Ignoring Frostbite because it is unavoidable is fatal: unavoidable means it must be actively managed with Thermoregulate, not that it can be safely ignored.",
      "Treating the Bacta Tank first-defeat prevention as reusable can produce a false safety margin; the modifier is a first-time reset.",
      "Aphra's 5v5 Grand Arena Omicron additions to Rogue Archaeology do not apply in Territory Battle and are excluded from this strategy.",
    ],
    evidenceBoundary: "Hoth Frostbite/Thermoregulate and Deadly Storm/Bacta Tank behavior are official ROTE mechanics. Aphra, BT-1 and 0-0-0 R9 entry and Aphra's current leadership/control/Droid sustain behavior are official/current-reference facts. Exact enemy target sequencing remains conservative/adaptive and no win probability is generated.",
  }),
});

export function roteSpecialBattleStrategyForMission(missionId) {
  return ROTE_SPECIAL_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
