const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_P1_BATTLE_STRATEGY_SOURCES = Object.freeze([
  {
    id: "ea-rote-details",
    label: "EA / Capital Games · Rise of the Empire details and Phase 1 modifiers",
    kind: "official",
    url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373",
  },
  {
    id: "swgohgg-lv",
    label: "SWGOH.GG · Lord Vader current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/lord-vader/",
  },
  {
    id: "swgohgg-jabba",
    label: "SWGOH.GG · Jabba the Hutt current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/jabba-the-hutt/",
  },
  {
    id: "swgohgg-aphra",
    label: "SWGOH.GG · Doctor Aphra current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/doctor-aphra/",
  },
  {
    id: "swgohgg-jml",
    label: "SWGOH.GG · Jedi Master Luke Skywalker current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/jedi-master-luke-skywalker/",
  },
  {
    id: "swgohgg-jkl",
    label: "SWGOH.GG · Jedi Knight Luke Skywalker current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/jedi-knight-luke-skywalker/",
  },
  {
    id: "artoo-rote",
    label: "Artoo · RoTE TB team notes",
    kind: "community-tested",
    url: "https://hackmd.io/@swgoh/ryA5rQ0Xn",
  },
  {
    id: "bitdynasty-2026-p1",
    label: "BitDynasty · 2026 Autoplay Sector 1 testing",
    kind: "community-tested",
    url: "https://swgoh.tv/video/47107-2026-autoplay-sector-1-mustafar-coruscant-corellia-rote-tb-ls-ds-mix-swgoh",
  },
]);

const sources = (...ids) => ROTE_P1_BATTLE_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_P1_BATTLE_STRATEGIES = Object.freeze({
  "mustafar-lv": Object.freeze({
    id: "mustafar-lv-v1",
    missionId: "mustafar-lv",
    title: "Mustafar · Lord Vader Combat Mission",
    status: "community-tested",
    confidence: "community-validated-partial",
    lastVerified: "2026-08-15",
    sources: sources("ea-rote-details", "swgohgg-lv", "bitdynasty-2026-p1"),
    summary: "Treat Mustafar as an attrition-and-ramp fight rather than reacting to every Burning application. Lava Fields applies unavoidable Burning whenever a character uses an ability, while Lord Vader naturally ramps through Underestimated, Dark Harbinger, Unshackled Emotions and his Ultimate. Preserve the supporting shell long enough for that ramp to convert into control and damage.",
    requiredLeaderBaseId: "LORDVADER",
    keyUnits: [
      { baseId: "LORDVADER", name: "Lord Vader", importance: "critical", reason: "Mission-mandatory unit and the strategy's ramping damage/control engine." },
      { baseId: "MAUL", name: "Maul", importance: "helpful", reason: "Common Lord Vader companion; useful damage acceleration but not treated as a legal-entry requirement." },
      { baseId: "ROYALGUARD", name: "Royal Guard", importance: "helpful", reason: "Common protection shell for keeping the ramping core alive through Lava Fields attrition." },
      { baseId: "ADMIRALPIETT", name: "Admiral Piett", importance: "helpful", reason: "Community-tested Lord Vader compositions often use Empire support here; not mandatory for the mission." },
      { baseId: "VADER", name: "Darth Vader", importance: "helpful", reason: "Compatible Empire damage/debuff option when roster and Operations allow it." },
    ],
    keyAbilities: [
      { baseId: "LORDVADER", abilityName: "Dark Harbinger", importance: "high", expected: "Buff Immunity, Healing Immunity, Ultimate Charge and repeated-use scaling", reason: "Use on the current priority target to deny recovery/buffs while building Lord Vader's Ultimate and repeated-use damage." },
      { baseId: "LORDVADER", abilityName: "Unshackled Emotions", importance: "high", expected: "AOE Daze, Damage Over Time and Mastery ramp", reason: "The AOE control and Mastery gain are the main board-stabilization tools as Underestimated accumulates." },
    ],
    stages: [
      stage("lava-opening", "Opening · Respect Lava Fields", [
        step("expect-burning", "Expect Burning after every character ability. Lava Fields applies it automatically and it cannot be evaded or resisted, so do not interpret the debuff itself as a failed opening.", { priority: "critical" }),
        step("protect-shell", "Keep the tank/support shell intact while Lord Vader starts accumulating Underestimated; avoid spending turns merely trying to prevent an environmental Burning application that is unavoidable.", { priority: "high" }),
      ], { objective: "Absorb the environmental tax without breaking the Lord Vader ramp engine.", hazards: ["Unavoidable Burning after abilities", "Support attrition before Lord Vader has ramped"] }),
      stage("ramp-control", "Midfight · Ramp and suppress", [
        step("aoe-control", "Use Unshackled Emotions when its AOE Daze/Damage Over Time and Mastery ramp will suppress the widest threat window.", { priority: "high", ability: "Unshackled Emotions" }),
        step("priority-harbinger", "Use Dark Harbinger on the enemy whose healing, buffs or immediate pressure most needs to be shut down; repeated uses also scale its damage.", { priority: "high", ability: "Dark Harbinger" }),
        step("preserve-ramp", "Do not sacrifice healthy supporting characters for low-value cleanup if keeping them alive creates another Lord Vader ramp/Ultimate cycle.", { priority: "high" }),
      ], { objective: "Convert Underestimated stacks into board control, Mastery and Ultimate Charge." }),
      stage("ultimate-close", "Closeout · Convert the ramp", [
        step("ultimate-window", "Use End of the Galactic Republic when the Mastery conversion and resulting Lord Vader tempo create a safe closeout. A 100% charge use has materially stronger effects than the minimum-charge activation.", { priority: "high", ability: "End of the Galactic Republic" }),
        step("finish-threats", "After the Ultimate window, finish the highest-impact remaining controller, healer or AOE threat before low-value cleanup.", { priority: "high" }),
      ], { objective: "Turn the accumulated ramp into a controlled finish instead of extending Lava Fields attrition." }),
    ],
    targetPriorities: [
      { target: "Current healer / controller / high-impact AOE enemy", priority: "high", when: "when present", reason: "Exact enemy lineups can vary; prioritize the unit most capable of extending the fight or collapsing the supporting shell." },
    ],
    failureRisks: [
      "Trying to eliminate Lava Fields Burning through normal avoidance/resistance logic wastes actions because the modifier applies it unavoidably after abilities.",
      "Losing the supporting shell before Lord Vader has accumulated enough Underestimated/Ultimate momentum can turn a stable fight into an attrition loss.",
      "Community autoplay clears demonstrate viability, not a guaranteed auto result for every roster, Operation state or enemy roll.",
    ],
    evidenceBoundary: "Lava Fields and the Lord Vader kit interactions are official/current-reference mechanics. Composition and autoplay observations are community-tested guidance. Enemy-specific sequencing is deliberately adaptive until a stable encounter spawn set is independently verified; no guaranteed clear rate is claimed.",
  }),

  "corellia-jabba": Object.freeze({
    id: "corellia-jabba-v1",
    missionId: "corellia-jabba",
    title: "Corellia · Jabba the Hutt Combat Mission",
    status: "community-tested",
    confidence: "community-validated",
    lastVerified: "2026-08-15",
    sources: sources("ea-rote-details", "swgohgg-jabba", "artoo-rote", "bitdynasty-2026-p1"),
    summary: "Build Jabba's contract and Ultimate economy deliberately in Wave 1, exploit high Ultimate Charge to make Crumb's Revenge seed more Thermal Detonators, and enter Wave 2 with There Will Be No Bargain available for the dangerous Qi'ra leader. Corellia's Coaxium can let enemies ignore Taunt to attack its holder, so targetability must be evaluated dynamically.",
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: [
      { baseId: "JABBATHEHUTT", name: "Jabba the Hutt", importance: "critical", reason: "Mission-mandatory Galactic Legend; contract, Thermal Detonators and Ultimate are the entire control/finish plan." },
      { baseId: "BOUSHH", name: "Boushh (Leia Organa)", importance: "high", reason: "Strong Hutt Cartel Thermal Detonator synergy for accelerating the contract and pressure cycle." },
      { baseId: "KRRSANTAN", name: "Krrsantan", importance: "helpful", reason: "Durable Hutt Cartel tank option, but community-tested clears exist without him so he is not a hard blocker." },
    ],
    keyAbilities: [
      { baseId: "JABBATHEHUTT", abilityName: "Crumb's Revenge", importance: "high", expected: "AOE Thermal Detonators with additional detonators per 20% Ultimate Charge", reason: "High charge creates a stronger Thermal Detonator wave; use that interaction deliberately while preparing the contract/Ultimate state." },
    ],
    stages: [
      stage("wave1-contract", "Wave 1 · Contract and Ultimate economy", [
        step("track-coaxium", "Track who currently holds Coaxium before relying on Taunt; enemies can ignore Taunt to target the Coaxium holder.", { priority: "critical" }),
        step("build-contract", "Prioritize Jabba's contract/Ultimate engine over low-value early cleanup so the team reaches its Payout and Wave 2 with decisive resources.", { priority: "critical" }),
        step("charged-crumb", "When using Crumb's Revenge for the setup cycle, prefer a high Ultimate Charge state when practical because it adds one extra Thermal Detonator to every enemy per 20% charge.", { priority: "high", ability: "Crumb's Revenge" }),
      ], { objective: "Leave Wave 1 with the Hutt Cartel engine online and a Wave 2 execution resource available.", hazards: ["Coaxium bypassing normal Taunt protection", "Spending the decisive Ultimate before Wave 2"] }),
      stage("wave-transition", "Transition · Preserve the execution", [
        step("hold-ultimate", "If the board is already controlled, do not spend There Will Be No Bargain just to finish a low-value Wave 1 target; preserve it for Wave 2 Qi'ra.", { priority: "critical", ability: "There Will Be No Bargain" }),
        step("stabilize", "Use the remaining Hutt Cartel recovery and contract benefits to enter Wave 2 with Jabba and the damage core intact.", { priority: "high" }),
      ], { objective: "Enter Wave 2 with Jabba's instant-defeat tool ready whenever possible." }),
      stage("wave2-qira", "Wave 2 · Remove Qi'ra", [
        step("execute-qira", "Community-tested guidance prioritizes using There Will Be No Bargain on Qi'ra once Wave 2 opens and the Ultimate is available.", { priority: "critical", target: "Qi'ra", ability: "There Will Be No Bargain" }),
        step("cleanup", "After the dangerous leader is removed, clean up the remaining Smuggler/Cartel threats while continuing to track Coaxium targetability.", { priority: "high" }),
      ], { objective: "Delete the Wave 2 leader before her side can leverage Corellia's Scoundrel modifier." }),
    ],
    targetPriorities: [
      { target: "Qi'ra", priority: "critical", when: "Wave 2 and Jabba Ultimate is available", reason: "Community-tested Corellia guidance explicitly saves Jabba's instant defeat for the Wave 2 Qi'ra leader." },
      { target: "Current Coaxium holder", priority: "info", when: "throughout", reason: "Coaxium changes speed, critical interactions and targetability; track it before assuming Taunt protects an ally." },
    ],
    failureRisks: [
      "Spending Jabba's Ultimate in Wave 1 can remove the clean community-tested answer to Wave 2 Qi'ra.",
      "Ignoring Coaxium can invalidate normal Taunt assumptions and expose a key Hutt Cartel unit.",
      "Using Crumb's Revenge at low charge when a safe higher-charge window is available produces fewer Thermal Detonators and can slow the contract/ramp plan.",
    ],
    evidenceBoundary: "Corellia Scrumrats/Coaxium and One Step Ahead are official mission modifiers; Jabba's Thermal/Ultimate mechanics are current SWGOH.GG facts. Saving the instant defeat for Wave 2 Qi'ra and the contract sequencing are community-tested strategy, not a guaranteed result.",
  }),

  "corellia-aphra": Object.freeze({
    id: "corellia-aphra-v1",
    missionId: "corellia-aphra",
    title: "Corellia · Doctor Aphra Combat Mission",
    status: "community-tested",
    confidence: "community-validated-partial",
    lastVerified: "2026-08-15",
    sources: sources("ea-rote-details", "swgohgg-aphra", "artoo-rote", "bitdynasty-2026-p1"),
    summary: "Open with Doctor Aphra's second special, Rogue Archaeology, to raise enemy cooldowns and establish Doubt before the Imperial wave cycles. Then use Dangerous Tech to keep the Dark Side/Droid engine healthy and moving. Community testing specifically flags the second-wave leader as dangerous, so preserve control for that transition rather than switching to blind autoplay too early.",
    requiredLeaderBaseId: "DOCTORAPHRA",
    keyUnits: [
      { baseId: "DOCTORAPHRA", name: "Doctor Aphra", importance: "critical", reason: "Mission-mandatory leader; her cooldown control, Siphon and Droid sustain define the strategy." },
      { baseId: "BT1", name: "BT-1", importance: "high", reason: "Preferred Dark Side Droid damage partner and a direct beneficiary of Aphra's leader/tech interactions." },
      { baseId: "TRIPLEZERO", name: "0-0-0", importance: "helpful", reason: "Strong canonical Aphra partner, but community clears also exist when Operations remove him, so he is not a hard requirement." },
      { baseId: "VADER", name: "Darth Vader", importance: "helpful", reason: "Explicitly supported by Aphra's leadership and a tested substitute in Corellia compositions." },
      { baseId: "KRRSANTAN", name: "Krrsantan", importance: "helpful", reason: "Explicitly supported by Aphra's leadership and useful as a durable front line." },
    ],
    keyAbilities: [
      { baseId: "DOCTORAPHRA", abilityName: "Rogue Archaeology", importance: "critical", expected: "AOE cooldown increase, Doubt and Potency Siphon", reason: "Community-tested Corellia guidance starts with Aphra's second special; its current kit text provides the control logic for that opening." },
      { baseId: "DOCTORAPHRA", abilityName: "Dangerous Tech", importance: "high", expected: "Potency/TM support, Droid offense and recovery, plus revive/summon interactions at higher tiers", reason: "Use to stabilize and accelerate the Dark Side Droid engine after the opening cooldown disruption." },
    ],
    stages: [
      stage("wave1-control", "Wave 1 · Cooldown-control opening", [
        step("track-coaxium", "Identify the current Coaxium holder before relying on Taunt or selecting the opening target.", { priority: "critical" }),
        step("rogue-open", "Open with Rogue Archaeology when available to increase enemy cooldowns by 1 and apply Doubt before the Imperial squad can establish its preferred special-ability cycle.", { priority: "critical", ability: "Rogue Archaeology" }),
        step("tech-stabilize", "Follow with Dangerous Tech as the board demands to grant Dark Side allies Potency Up/Turn Meter and to recover/buff Dark Side Droid allies.", { priority: "high", ability: "Dangerous Tech" }),
      ], { objective: "Delay the Imperial opener and establish Aphra's debuff/Siphon engine.", hazards: ["Imperial special-ability snowball", "Coaxium changing targetability"] }),
      stage("wave1-finish", "Wave 1 · Preserve the engine", [
        step("protect-aphra", "Keep Aphra active and avoid trading her or BT-1 for low-value cleanup; the next wave is where the dangerous leader pressure is reported.", { priority: "critical" }),
        step("prepare-control", "Where practical, enter Wave 2 with Rogue Archaeology or another control action close to ready instead of exhausting every cooldown on the final Wave 1 enemy.", { priority: "high" }),
      ], { objective: "Carry cooldown control and the Droid damage engine into the second encounter." }),
      stage("wave2-leader", "Wave 2 · Dangerous leader", [
        step("control-leader", "Treat the Wave 2 leader/elite officer as the immediate control and damage priority; community-tested notes specifically flag the leader as dangerous.", { priority: "critical", target: "Wave 2 leader" }),
        step("reapply-control", "Reapply Rogue Archaeology cooldown pressure before switching to damage-only cleanup when the enemy special cycle is still live.", { priority: "high", ability: "Rogue Archaeology" }),
        step("droid-close", "Use Dangerous Tech recovery/offense support to keep BT-1 and the surviving Droid core functioning through cleanup.", { priority: "high", ability: "Dangerous Tech" }),
      ], { objective: "Prevent the second-wave leader from taking over the battle before Aphra's Droid engine closes it." }),
    ],
    targetPriorities: [
      { target: "Wave 2 leader / elite Imperial officer", priority: "critical", when: "Wave 2", reason: "Community-tested Corellia Aphra notes identify the second-wave leader as the primary danger." },
      { target: "Current Coaxium holder", priority: "info", when: "throughout", reason: "Coaxium changes targetability and combat stats; it must be tracked even when another enemy remains the kill priority." },
    ],
    failureRisks: [
      "Skipping the Rogue Archaeology opening gives the Imperial enemies more access to their first special-ability cycle.",
      "Entering Wave 2 with Aphra control exhausted can expose the squad to the dangerous leader before cooldown pressure is restored.",
      "Assuming a tank will always protect Aphra/BT-1 ignores Coaxium's enemy Taunt-bypass rule.",
    ],
    evidenceBoundary: "Corellia modifiers are official and Aphra ability behavior is current SWGOH.GG data. The second-special opener, example compositions and Wave 2 leader priority are community-tested guidance. This pack does not claim a universal enemy turn order or guaranteed clear probability.",
  }),

  "coruscant-jedi": Object.freeze({
    id: "coruscant-jml-v1",
    missionId: "coruscant-jedi",
    title: "Coruscant · Jedi / Jedi Master Luke Combat Mission",
    status: "community-tested",
    confidence: "community-validated-partial",
    lastVerified: "2026-08-15",
    sources: sources("ea-rote-details", "swgohgg-jml", "swgohgg-jkl", "bitdynasty-2026-p1"),
    summary: "Use Jedi Master Luke as a durable Jedi engine while actively feeding Coruscant's Democracy charge through buffs and debuffs. Thunderous Applause makes the enemy leader unkillable below 1% Health while another enemy remains, so eliminate supporting enemies before committing the final leader kill and spend Democracy when its unavoidable Stun/No Confidence window creates maximum control value.",
    requiredLeaderBaseId: "GRANDMASTERLUKE",
    keyUnits: [
      { baseId: "GRANDMASTERLUKE", name: "Jedi Master Luke Skywalker", importance: "critical", reason: "This is the JML-specific strategy variant; his all-Jedi leadership, Protection-based Inherited Teachings and Ultimate provide the sustain/ramp core." },
      { baseId: "JEDIKNIGHTLUKE", name: "Jedi Knight Luke Skywalker", importance: "high", reason: "Strong assist, cleanse and damage partner under JML; not a legal-entry requirement for the generic Jedi mission." },
      { baseId: "JEDIKNIGHTREVAN", name: "Jedi Knight Revan", importance: "helpful", reason: "Useful control/target selection and a common community JML mission partner." },
      { baseId: "HERMITYODA", name: "Hermit Yoda", importance: "helpful", reason: "Buffs, recovery and Turn Meter help both survivability and Democracy charge generation." },
      { baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis", importance: "helpful", reason: "High-value Territory Battle Jedi option with powerful control/survivability when available." },
    ],
    keyAbilities: [
      { baseId: "GRANDMASTERLUKE", abilityName: "Efflux", importance: "high", expected: "JML special control/damage while advancing the Jedi engine", reason: "Use JML's specials before defaulting to repeated granted-ability spam when their control value is available." },
      { baseId: "JEDIKNIGHTLUKE", abilityName: "Repulse", importance: "helpful", expected: "AOE control", reason: "Useful supporting control under JML when JKL is in the squad." },
    ],
    stages: [
      stage("democracy-opening", "Opening · Build Democracy", [
        step("identify-leader", "Identify the enemy leader immediately. Thunderous Applause gives both leaders major opening Potency, Tenacity and Speed, and the enemy leader cannot fall below 1% Health while another enemy remains.", { priority: "critical", target: "Enemy leader" }),
        step("feed-energy", "Favor useful Jedi actions that grant buffs or inflict debuffs so Democracy charge increases while the team is also advancing control, sustain or damage.", { priority: "critical" }),
        step("jml-engine", "Use JML's Jedi leadership and Inherited Teachings cycle to recover Protection, move Turn Meter and build Jedi Lessons/Ultimate without abandoning needed special-ability control.", { priority: "high" }),
      ], { objective: "Build the mission's granted-ability resource while stabilizing against the enemy leader's boosted opener.", hazards: ["Enemy leader opening Speed/Potency/Tenacity", "Wasting damage into a leader that cannot yet be defeated"] }),
      stage("support-clear", "Midfight · Remove support before the leader", [
        step("supports-first", "Do not commit the full finish into the enemy leader while another enemy remains; remove supporting enemies first because the modifier prevents the leader from dropping below 1% Health while an ally is active.", { priority: "critical" }),
        step("democracy-stun", "Spend Democracy when the unavoidable enemy-leader Stun and No Confidence stack opens a meaningful control window rather than firing it at a low-value moment.", { priority: "high", ability: "Democracy", target: "Enemy leader" }),
        step("assist-sustain", "Use Jedi assist/cleanse/recovery tools to keep the squad intact while clearing the supporting line.", { priority: "high" }),
      ], { objective: "Strip the enemy leader's 1%-Health protection condition by defeating the rest of the enemy squad." }),
      stage("leader-close", "Closeout · Finish the leader", [
        step("confirm-alone", "Before committing the lethal sequence, confirm no other enemy ally remains active; only then is the enemy leader allowed to fall below 1% Health.", { priority: "critical", target: "Enemy leader" }),
        step("ultimate-window", "Use JML's Heroic Stand transformation when its cleanse, cooldown reset and offense package creates the strongest closeout window.", { priority: "high", ability: "Heroic Stand" }),
        step("finish-leader", "Focus the isolated enemy leader and finish during the strongest available Democracy/JML control window.", { priority: "critical", target: "Enemy leader" }),
      ], { objective: "Convert the support clear into a legal, controlled leader defeat." }),
    ],
    targetPriorities: [
      { target: "Enemy supporting units", priority: "critical", when: "while any support remains", reason: "Thunderous Applause prevents the enemy leader from falling below 1% Health while an ally is present." },
      { target: "Enemy leader", priority: "critical", when: "after all other enemies are defeated", reason: "Once isolated, the mission-specific 1%-Health floor is no longer protected by another enemy ally." },
    ],
    failureRisks: [
      "Dumping major damage into the enemy leader before clearing its allies wastes the lethal window because the leader cannot fall below 1% Health while another enemy is present.",
      "Ignoring Democracy charge generation leaves an unavoidable Stun/No Confidence control tool unused.",
      "Treating BitDynasty autoplay examples as a fixed win condition ignores roster, mod and Operation-state differences.",
    ],
    evidenceBoundary: "Thunderous Applause/Democracy is official Capital Games mission text, and JML/JKL behavior is current SWGOH.GG kit data. JML squad composition and autoplay viability are community-tested guidance; this pack intentionally does not invent a universal enemy spawn order or win percentage.",
  }),
});

export function rotePhaseOneBattleStrategyForMission(missionId) {
  return ROTE_P1_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
