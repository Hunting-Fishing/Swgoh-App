const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_COMBAT_EXPANSION_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission details", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "cg-zeffo", label: "Capital Games · Zeffo Bonus Zone Title Update", kind: "official", url: "https://swgoh.gg/news/title-update-6282023/" },
  { id: "swgohgg-fennec", label: "SWGOH.GG · Fennec Shand current kit and ROTE mission", kind: "current-reference", url: "https://swgoh.gg/units/fennec-shand/" },
  { id: "swgohgg-rey", label: "SWGOH.GG · Rey current kit", kind: "current-reference", url: "https://swgoh.gg/units/rey/" },
  { id: "swgohgg-tarfful", label: "SWGOH.GG · Tarfful current kit", kind: "current-reference", url: "https://swgoh.gg/units/tarfful/" },
  { id: "swgohgg-vader", label: "SWGOH.GG · Darth Vader current kit", kind: "current-reference", url: "https://swgoh.gg/units/darth-vader/" },
  { id: "swgohgg-iden", label: "SWGOH.GG · Iden Versio current kit", kind: "current-reference", url: "https://swgoh.gg/units/iden-versio/" },
  { id: "bitdynasty-tatooine-fennec", label: "BitDynasty · Tatooine Sector 3 Fennec guide", kind: "community-tested", url: "https://swgoh.tv/video/32813-tatooine-s3-fennec-reva-sm-mix-cm-and-fleet-guide-rise-of-the-empire-rote-tb-sector-p3-swgoh" },
  { id: "egnards-tatooine-fennec", label: "Egnards · Tatooine Rey + Fennec auto battle", kind: "community-tested", url: "https://www.swgoh.tv/video/40006-auto-battle-rote-tatooine-rey-w-fennec" },
  { id: "artoo-rote", label: "Artoo · ROTE team notes", kind: "community-tested", url: "https://hackmd.io/@swgoh/ryA5rQ0Xn" },
  { id: "starwarsfans-kashyyyk-wookiee", label: "StarWars-fans · Kashyyyk Wookiee combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2025/02/swgoh-rote-territory-battle-phase-3-kashyyyk-wookie-combat-mission-walkthrough-tips/" },
  { id: "starwarsfans-zeffo-middle", label: "StarWars-fans · Zeffo middle combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/02/swgoh-rote-territory-battle-zeffo-combat-mission-middle-walkthrough-tips/" },
  { id: "starwarsfans-zeffo-ufu", label: "StarWars-fans · Zeffo UFU combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/02/swgoh-rote-territory-battle-zeffo-ufu-combat-mission-top-walkthrough-tips/" },
  { id: "starwarsfans-deathstar-vader", label: "StarWars-fans · Death Star Darth Vader combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2026/01/swgoh-rote-territory-battle-phase-6-death-star-darth-vader-combat-mission-walkthrough-tips/" },
  { id: "starwarsfans-rote-hub", label: "StarWars-fans · ROTE battle team hub", kind: "community-reference", url: "https://starwars-fans.com/rote-special-missions/" },
]);

const sources = (...ids) => ROTE_COMBAT_EXPANSION_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_COMBAT_EXPANSION_STRATEGIES = Object.freeze({
  "tatooine-fennec": Object.freeze({
    id: "tatooine-fennec-v1",
    missionId: "tatooine-fennec",
    title: "Tatooine · Fennec Shand Combat Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-fennec", "swgohgg-rey", "bitdynasty-tatooine-fennec", "egnards-tatooine-fennec", "artoo-rote"),
    summary: "Build around survival through Tatooine's unavoidable Dune Sandstorm Damage Over Time rather than trying to resist it. Two community-tested approaches exist: Rey + Fennec + durable Light Side leftovers for a protection/Ultimate shell, or a Fennec/Bounty Hunter shell that becomes materially sturdier after reaching Contract/Payout. Treat cleanse and sustain windows as survival resources because the environmental DoTs return every other turn.",
    keyUnits: [
      { baseId: "FENNECSHAND", name: "Fennec Shand", importance: "critical", reason: "Mission-mandatory R7 unit." },
      { baseId: "GLREY", name: "Rey", importance: "helpful", reason: "Community-tested shell uses Rey to absorb the attrition cycle and convert low-health windows into Sudden Whirlwind/Ultimate pressure." },
    ],
    keyAbilities: [
      { baseId: "FENNECSHAND", abilityName: "I Don't Miss", importance: "helpful", expected: "Armor Shred and focused single-target pressure", reason: "Use Fennec's persistent defense reduction on the durable priority target when available." },
      { baseId: "GLREY", abilityName: "Heir to the Jedi", importance: "helpful", expected: "Ultimate defensive stance followed by true-damage burst", reason: "In a Rey shell, time the defensive stance around dangerous enemy/environmental pressure instead of spending it as soon as charge is available." },
    ],
    stages: [
      stage("sandstorm-open", "Opening · accept the environmental tax", [
        step("expect-dots", "Dune Sandstorm applies unavoidable Damage Over Time at the end of every other turn. Do not waste the opening trying to build Tenacity specifically to prevent the environmental application.", { priority: "critical" }),
        step("choose-shell", "If using Rey, preserve the Light Side shell and let Rey supply the major survival/burst windows. If using Bounty Hunters, advance Contract/Payout quickly so the squad gains its durability/offense engine before attrition compounds.", { priority: "high" }),
        step("armor-shred", "Use Fennec's Armor Shred on the durable priority enemy when a safe window exists so subsequent focused attacks convert more efficiently.", { priority: "helpful", ability: "I Don't Miss" }),
      ], { objective: "Reach the first stabilized damage cycle without losing the mandatory Fennec core.", hazards: ["Unavoidable recurring Damage Over Time", "Overinvesting turns in resisting an environmental effect that cannot be resisted"] }),
      stage("attrition", "Midfight · sustain and convert", [
        step("recovery-window", "Use cleanse, protection and healing resources after they produce meaningful net survival; the Sandstorm will reapply DoTs on its cadence.", { priority: "high" }),
        step("rey-window", "In a Rey composition, use Ultimate/low-health damage windows to protect the squad through the enemy's highest-pressure turns and convert that survival into kills.", { priority: "high" }),
        step("bh-contract", "In a Bounty Hunter composition, prioritize completing Contract/Payout rather than spreading low-value damage once the board is stable; community notes specifically value the post-contract durability.", { priority: "high" }),
      ], { objective: "Outlast the enemy while the environmental modifier pressures both sides." }),
    ],
    targetPriorities: [
      { target: "Enemy leader / highest-offense threat", priority: "high", when: "when targetable", reason: "The reliable cross-source principle is to shorten the attrition race by removing the unit most capable of extending or spiking the fight; exact spawns can vary." },
    ],
    failureRisks: [
      "Building the plan around resisting Dune Sandstorm is invalid because the environmental DoT cannot be resisted.",
      "A Rey/Fennec auto clear is evidence that the shell is viable, not a guarantee that every leftover composition or Operation state can auto safely.",
      "A Bounty Hunter version is substantially more comfortable after Contract/Payout; failing to reach it can leave the team exposed to the attrition race.",
    ],
    evidenceBoundary: "Fennec's R7 mission and Dune Sandstorm are official/current-reference facts. Rey/Fennec and Bounty Hunter shells are community-tested approaches. Exact enemy-specific kill order is kept adaptive and no clear percentage is claimed.",
  }),

  "kashyyyk-wookiee": Object.freeze({
    id: "kashyyyk-wookiee-v1",
    missionId: "kashyyyk-wookiee",
    title: "Kashyyyk · Wookiee Combat Mission",
    status: "community-tested",
    confidence: "current-kit-community-validated",
    lastVerified: "2026-08-16",
    sources: sources("swgohgg-tarfful", "starwarsfans-kashyyyk-wookiee"),
    summary: "Use Tarfful lead to turn the five-Wookiee R7 gate into a defense/sustain engine. Open Wave 1 by clearing enemy buffs and removing Scout Trooper, then Recon Stormtrooper. In Wave 2, dispel Ninth Sister's Taunt, eliminate both Purge Troopers, and leave Ninth Sister for last. Tarfful's Provoked, ally cleanse, stacking Max Health and Wookiee assist/Stun tools keep the team stable while repeated buff dispels prevent taunts from dictating the fight.",
    requiredLeaderBaseId: "TARFFUL",
    keyUnits: [
      { baseId: "TARFFUL", name: "Tarfful", importance: "critical", reason: "Community-tested leader and the Wookiee defense/sustain/control engine." },
      { baseId: "CHEWBACCALEGENDARY", name: "Chewbacca", importance: "helpful", reason: "Tested damage/control member of the R7+ Wookiee shell." },
      { baseId: "YOUNGCHEWBACCA", name: "Vandor Chewbacca", importance: "helpful", reason: "Tested sustain-oriented Wookiee member." },
      { baseId: "ZAALBAR", name: "Zaalbar", importance: "helpful", reason: "Tested tank member who benefits from Tarfful's defense scaling." },
    ],
    keyAbilities: [
      { baseId: "TARFFUL", abilityName: "Rrrruuuurrr", importance: "high", expected: "Team cleanse, Tenacity Up, stacking Max Health and unavoidable Provoked", reason: "This is the primary reset/control button when debuffs or incoming pressure are building." },
      { baseId: "TARFFUL", abilityName: "Wookiee Fury", importance: "high", expected: "Wookiee assists, Stun and stacking Defense", reason: "Use to create a focused control/damage window and continue encounter-long defensive scaling." },
    ],
    stages: [
      stage("wave1", "Wave 1 · dismantle the Troopers", [
        step("strip-buffs", "Use available buff dispels early so enemy taunts/buffs do not dictate target order; Tarfful's basic itself dispels the target's buffs.", { priority: "high" }),
        step("scout-first", "Focus Scout Trooper first when targetable, then move to Recon Stormtrooper before the remaining standard Trooper pressure.", { priority: "critical", target: "Scout Trooper" }),
        step("provoked", "Use Tarfful's Provoked/cleanse cycle to control pressure and build the Wookiees' encounter-long Max Health rather than racing blindly for damage.", { priority: "high", ability: "Rrrruuuurrr" }),
      ], { objective: "Remove the mobile Trooper threats while the Wookiee defense engine scales." }),
      stage("wave2", "Wave 2 · Purge Troopers before Ninth Sister", [
        step("dispel-ninth", "Dispel Ninth Sister's Taunt immediately when possible so the squad can reach the Purge Troopers.", { priority: "critical", target: "Ninth Sister" }),
        step("purge-one", "Commit to one Purge Trooper and remove it before splitting damage into the second.", { priority: "critical", target: "Purge Trooper" }),
        step("purge-two", "Remove the second Purge Trooper before switching sustained damage into Ninth Sister.", { priority: "critical", target: "Purge Trooper" }),
        step("ninth-last", "Finish Ninth Sister after both Purge Troopers are gone; expect Protection recovery and keep buff dispel/control available.", { priority: "high", target: "Ninth Sister" }),
      ], { objective: "Bypass the tank and remove the two higher-value Purge threats before the closeout." }),
    ],
    targetPriorities: [
      { target: "Scout Trooper", priority: "critical", when: "Wave 1", reason: "Community-tested walkthrough removes Scout first." },
      { target: "Recon Stormtrooper", priority: "high", when: "Wave 1 after Scout", reason: "Second priority in the tested Wave 1 order." },
      { target: "Purge Trooper", priority: "critical", when: "Wave 2 after dispelling Ninth Sister", reason: "Both Purge Troopers are removed before Ninth Sister in the tested clear." },
      { target: "Ninth Sister", priority: "high", when: "Wave 2 after both Purge Troopers", reason: "Leave the durable tank for last after her Taunt is bypassed/removed." },
    ],
    failureRisks: [
      "Staying trapped behind Ninth Sister while Purge Troopers remain wastes the Wookiee team's available buff-dispel advantage.",
      "Ignoring Tarfful's encounter-long Defense/Max-Health scaling turns a survivability composition into an unnecessary damage race.",
      "The published test team is one validated shell, not the only legal Wookiee lineup.",
    ],
    evidenceBoundary: "Tarfful's kit mechanics are current-reference facts. Wave target order and the Tarfful/Chewbacca/Threepio & Chewie/Vandor/Zaalbar shell are community-tested. No guaranteed clear rate is claimed.",
  }),

  "zeffo-generic-1": Object.freeze({
    id: "zeffo-generic-1-v1",
    missionId: "zeffo-generic-1",
    title: "Zeffo · Open Light Side Combat Mission",
    status: "community-tested",
    confidence: "official-zone-community-validated",
    lastVerified: "2026-08-16",
    sources: sources("cg-zeffo", "starwarsfans-zeffo-middle"),
    summary: "Bring reliable Stun even though this is the open Light Side R7 mission. Wave 1 rewards removing the Bounty Hunters before grinding through Haxion Brood Cannon Fodder stacks and leaving the Droid Captain until its supporting droids are removed. Wave 2 has three Tomb Guardians; CG explicitly states this combat mission's Tomb Guardians cannot be defeated unless Stunned, so preserve or cycle Stun windows before committing lethal damage.",
    requiredMechanics: [
      { id: "stun", label: "Reliable Stun", importance: "critical", evidenceType: "debuff", evidenceKey: "Stun" },
    ],
    keyUnits: [
      { baseId: "JEDIKNIGHTLUKE", name: "Jedi Knight Luke Skywalker", importance: "helpful", reason: "Community-tested source of an AoE Stun that can create simultaneous Tomb Guardian kill windows." },
      { baseId: "CAPTAINREX", name: "Captain Rex", importance: "helpful", reason: "Community testing found his control package useful, though guild allocation may reserve him for the Clone Special Mission." },
    ],
    stages: [
      stage("wave1", "Wave 1 · Bounty Hunters before the droid captain", [
        step("bounty-first", "Prioritize the Bounty Hunters first instead of immediately sinking damage into Haxion Brood Cannon Fodder stacks.", { priority: "critical", target: "Bounty Hunters" }),
        step("strip-fodder", "After the Bounty Hunters are controlled/removed, work through the non-Captain Haxion Brood droids and their Cannon Fodder stacks.", { priority: "high", target: "Haxion Brood Droid" }),
        step("captain-last", "Treat the Haxion Brood Droid Captain as the late Wave 1 target after its supporting droids are removed.", { priority: "high", target: "Haxion Brood Droid Captain" }),
      ], { objective: "Avoid wasting the opening damage cycle into droid durability while higher-value Bounty Hunters remain." }),
      stage("wave2", "Wave 2 · Tomb Guardian Stun gates", [
        step("hold-stun", "Do not commit every Stun before a Tomb Guardian is actually in a lethal window; each Guardian must be Stunned to be defeated.", { priority: "critical" }),
        step("stun-then-kill", "Stun the chosen Tomb Guardian and immediately convert the control window into lethal damage.", { priority: "critical", target: "Miktrullk Tomb Guardian" }),
        step("reset", "If the remaining Guardian survives past the available Stun, stabilize and wait for the next reliable Stun rather than wasting finishers into an undefeatable state.", { priority: "high" }),
      ], { objective: "Create one legal defeat window per Tomb Guardian." }),
    ],
    targetPriorities: [
      { target: "Bounty Hunters", priority: "critical", when: "Wave 1", reason: "Tested strategy removes them before resolving the Haxion Brood durability order." },
      { target: "Haxion Brood Droid Captain", priority: "helpful", when: "late Wave 1", reason: "Community testing found the Captain effectively protected while supporting droids remained." },
      { target: "Miktrullk Tomb Guardian", priority: "critical", when: "Wave 2 while Stunned", reason: "Official defeat gate requires Stun." },
    ],
    failureRisks: [
      "Entering Wave 2 without reliable Stun can make otherwise sufficient damage unable to finish Tomb Guardians.",
      "Using Captain Rex here can conflict with a guild plan that needs him in Zeffo's Clone Trooper Special Mission.",
      "Treat Cannon Fodder behavior as encounter-specific PVE mechanics rather than assuming a normal player-unit health model.",
    ],
    evidenceBoundary: "The R7 Light Side entry and Tomb Guardian Stun defeat gate are official. Wave 1 target order and example Jedi/Leia variants are community-tested observations. The app does not claim a single mandatory squad beyond the mechanic requirement.",
  }),

  "zeffo-ufu": Object.freeze({
    id: "zeffo-ufu-v1",
    missionId: "zeffo-ufu",
    title: "Zeffo · Unaligned Force User Combat Mission",
    status: "community-tested",
    confidence: "official-entry-community-validated",
    lastVerified: "2026-08-16",
    sources: sources("cg-zeffo", "swgohgg-rey", "starwarsfans-zeffo-ufu"),
    summary: "Use a durable UFU shell around Rey to control Wave 1 and preserve Rey through focused enemy pressure, then enter Wave 2 against the Imperial AT-ST with Ultimate available when possible. Rey's Ultimate defensive stance can reduce allied incoming damage to 1 until her follow-up, making it the key emergency window immediately before a dangerous AT-ST action; alternate Ultimate and Sudden Whirlwind/major damage windows rather than treating the second wave as a normal target-priority fight.",
    requiredLeaderBaseId: "GLREY",
    keyUnits: [
      { baseId: "GLREY", name: "Rey", importance: "critical", reason: "Community-tested leader and main survival/damage engine for this five-UFU mission." },
      { baseId: "REYJEDITRAINING", name: "Rey (Jedi Training)", importance: "helpful", reason: "Tested UFU companion." },
      { baseId: "CEREJUNDA", name: "Cere Junda", importance: "helpful", reason: "Tested UFU companion with useful support interactions." },
      { baseId: "CALKESTIS", name: "Cal Kestis", importance: "helpful", reason: "Tested UFU companion; preserve him through Wave 1 because unexpected burst can remove him despite apparent Health/Protection." },
    ],
    keyAbilities: [
      { baseId: "GLREY", abilityName: "Heir to the Jedi", importance: "critical", expected: "Defensive stance reduces Light Side ally damage to 1, then true-damage finish", reason: "Time this around the AT-ST's dangerous turn or a Wave 1 collapse window." },
      { baseId: "GLREY", abilityName: "Sudden Whirlwind", importance: "high", expected: "Massive damage and anti-revive", reason: "Community-tested approach uses Rey's major damage special as a primary offense button between Ultimate cycles." },
    ],
    stages: [
      stage("wave1", "Wave 1 · preserve Rey and the UFU shell", [
        step("debuff-control", "Use available UFU debuffs/control to slow the enemy turn cycle rather than splitting damage without a control plan.", { priority: "high" }),
        step("monitor-rey", "Track Rey's Health and incoming focus closely; community testing specifically notes the enemies like to target her.", { priority: "critical", target: "Rey" }),
        step("whirlwind", "Use Sudden Whirlwind and Rey's other major damage windows to remove enemies one at a time while keeping the support shell alive.", { priority: "high", ability: "Sudden Whirlwind" }),
      ], { objective: "Reach the AT-ST wave with Rey alive and a major defensive/offensive resource available." }),
      stage("atst", "Wave 2 · Imperial AT-ST", [
        step("ultimate-before-hit", "When the AT-ST is about to take a dangerous action and Rey has sufficient Ultimate Charge, enter Heir to the Jedi's defensive stance to absorb the pressure window.", { priority: "critical", ability: "Heir to the Jedi", target: "Imperial AT-ST" }),
        step("debuff-atst", "Apply available debuffs/control to the AT-ST when they land; do not depend on a single control effect as the only survival plan.", { priority: "high", target: "Imperial AT-ST" }),
        step("alternate-burst", "Alternate Rey's Ultimate finish and major special damage windows until the AT-ST is defeated.", { priority: "high", target: "Imperial AT-ST" }),
      ], { objective: "Use Rey's defensive stance to survive the AT-ST's pressure and convert the follow-up into damage." }),
    ],
    targetPriorities: [
      { target: "Highest-pressure Wave 1 enemy", priority: "high", when: "Wave 1", reason: "Community walkthrough wins by controlled one-by-one removal rather than a fixed universal spawn order." },
      { target: "Imperial AT-ST", priority: "critical", when: "Wave 2", reason: "Sole Wave 2 boss in the tested encounter." },
    ],
    failureRisks: [
      "Losing Rey in Wave 1 removes both the strongest survival window and the primary damage engine for the AT-ST.",
      "Looking only at current Health/Protection can be misleading because the community test recorded sudden Cal Kestis loss despite appearing stable.",
      "Requiring Rey lead is a strategy-variant requirement for this sourced pack, not an official mission-entry requirement; other UFU compositions may exist.",
    ],
    evidenceBoundary: "The five-UFU R7 entry requirement is official. Rey's ability behavior is current-reference. The Rey-led composition, enemy observations and AT-ST sequencing are community-tested and are not presented as the only legal team or a guaranteed clear.",
  }),

  "death-star-vader": Object.freeze({
    id: "death-star-vader-v1",
    missionId: "death-star-vader",
    title: "Death Star · Darth Vader Solo Combat Mission",
    status: "community-tested-high-risk",
    confidence: "official-modifier-current-kit-community-partial",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-vader", "starwarsfans-deathstar-vader"),
    summary: "This is an R9 Darth Vader solo mission and should be treated as a survivability-sensitive, high-risk battle rather than a routine R9 check. Death Star's Volatile Energies can impose Deadly Storm penalties until the granted ability clears it. Community attempts emphasize Merciless Massacre/Ability Block control but also document repeated failures at R9, so the app should recommend dedicated remodding and never represent this mission as reliably solved from relic level alone.",
    requiredLeaderBaseId: "VADER",
    keyUnits: [
      { baseId: "VADER", name: "Darth Vader", importance: "critical", reason: "Officially required solo unit at R9." },
    ],
    keyAbilities: [
      { baseId: "VADER", abilityName: "Merciless Massacre", importance: "critical", expected: "Sequential bonus turns against marked enemies", reason: "Primary control/tempo resource in the community attempts; use it to spread control and avoid giving the enemy an uncontested turn cycle." },
      { baseId: "VADER", abilityName: "Force Crush", importance: "high", expected: "AOE Damage Over Time and Speed Down", reason: "Sets up Vader's debuff-based damage/control engine, but environmental status management and survival take precedence." },
      { baseId: "VADER", abilityName: "Terrifying Swing", importance: "high", expected: "Ability Block on Jedi/Rebels plus basic damage", reason: "Community attempts lean on Ability Block to reduce incoming enemy specials during the solo control cycle." },
    ],
    stages: [
      stage("volatile-open", "Opening · manage Volatile Energies", [
        step("deadly-storm", "Track the Death Star Volatile Energies state. Deadly Storm heavily reduces Critical Chance, Offense and Speed and also damages the character at the start of its turn.", { priority: "critical" }),
        step("granted-clear", "Use the encounter-granted Volatile Energies ability when available to remove Deadly Storm and gain the temporary offensive/speed buffs instead of blindly following a normal Vader rotation.", { priority: "critical", ability: "Smells Bad on the Outside" }),
        step("control", "Use Merciless Massacre as the primary tempo window and prioritize Ability Block/control over low-value damage when enemy specials would threaten the solo run.", { priority: "critical", ability: "Merciless Massacre" }),
      ], { objective: "Avoid entering an enemy turn cycle while heavily penalized by the planet modifier." }),
      stage("survive-close", "Closeout · survival before greed", [
        step("debuff-burst", "Use Force Crush and Culling Blade only when they advance a safe kill/control window; a large damage number is not useful if Vader exposes himself to lethal retaliation.", { priority: "high" }),
        step("remod-warning", "Treat survivability and speed remodding as mission-specific preparation. The published R9 attempts show that meeting the relic gate alone does not make the battle reliable.", { priority: "critical" }),
      ], { objective: "Convert each Merciless/Volatile-Energies window into fewer enemy actions while preserving Vader." }),
    ],
    targetPriorities: [
      { target: "Enemy special-ability threat", priority: "critical", when: "when Ability Block or a kill is available", reason: "This solo mission is lost by allowing uncontrolled enemy turns more readily than by taking an extra damage cycle." },
    ],
    failureRisks: [
      "R9 is only the entry gate; community attempts document repeated losses at R9 and explicitly point to survivability/remodding concerns.",
      "Ignoring Deadly Storm's Offense/Speed/Crit penalties can make a normal Vader rotation materially weaker and more dangerous.",
      "This pack deliberately does not publish a win probability because available community evidence does not justify one.",
    ],
    evidenceBoundary: "The R9 Darth Vader requirement and Volatile Energies modifier are official/current-reference. Merciless/Ability-Block sequencing and the high-risk survivability warning come from community attempts. This is execution guidance, not a solved or guaranteed mission.",
  }),

  "death-star-iden": Object.freeze({
    id: "death-star-iden-v1",
    missionId: "death-star-iden",
    title: "Death Star · Iden Versio Combat Mission",
    status: "community-reference-partial",
    confidence: "official-modifier-current-kit-community-team-reference",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-iden", "starwarsfans-rote-hub"),
    summary: "The published 2026 community shell is Iden Versio with Supreme Leader Kylo Ren, Darth Malgus, Darth Malak and Sith Empire Trooper at R9+. That is a mixed Dark Side survivability team, not Iden's normal all–non-Droid-Imperial-Trooper engine. Because SLKR carries a Leader tag, Iden's conditional no-other-Leader branches do not fully activate in that shell. Use Iden's unconditional Rebel control where relevant, manage Death Star Volatile Energies, and rely on the GL/Sith durability core rather than falsely assuming Iden's Trooper revive loop is active.",
    keyUnits: [
      { baseId: "IDENVERSIO", name: "Iden Versio", importance: "critical", reason: "Mission-mandatory R9 unit." },
      { baseId: "SUPREMELEADERKYLOREN", name: "Supreme Leader Kylo Ren", importance: "helpful", reason: "Published 2026 community team uses SLKR as the primary high-end damage/survival core." },
      { baseId: "DARTHMALGUS", name: "Darth Malgus", importance: "helpful", reason: "Published mixed Dark Side durability shell." },
      { baseId: "DARTHMALAK", name: "Darth Malak", importance: "helpful", reason: "Published mixed Dark Side durability shell." },
      { baseId: "SITHTROOPER", name: "Sith Empire Trooper", importance: "helpful", reason: "Published fifth member; supplies another durable Dark Side body." },
    ],
    keyAbilities: [
      { baseId: "IDENVERSIO", abilityName: "Push Forward", importance: "helpful", expected: "AOE Vulnerable plus target dispel, Healing Immunity and Stun; Rebel control is unresistable", reason: "The unconditional control portion still has value even when the mixed squad disables Iden's conditional assist branch." },
      { baseId: "IDENVERSIO", abilityName: "We Can Grieve Later", importance: "info", expected: "Iden/Imperial-Trooper protection and cleanse; conditional We Adapt, Or Die only with no other Leader-tag ally", reason: "Do not assume the full conditional package applies to the published SLKR mixed team." },
    ],
    stages: [
      stage("modifier", "Opening · separate mission rules from Iden's normal team rules", [
        step("volatile", "Track Volatile Energies/Deadly Storm and use the encounter-granted clear/buff ability when it creates a safer tempo window.", { priority: "critical", ability: "Smells Bad on the Outside" }),
        step("conditional-warning", "If using the published SLKR/Malgus/Malak/Sith Empire Trooper shell, do not plan around Iden's no-other-Leader or all-non-Droid-Imperial-Trooper conditional branches; the squad does not satisfy those conditions.", { priority: "critical" }),
        step("iden-control", "Use Push Forward's dispel/Healing Immunity/Stun control on the immediate Rebel threat when applicable; its Rebel-target control is not dependent on the full Trooper shell.", { priority: "high", ability: "Push Forward" }),
      ], { objective: "Avoid a false-synergy plan and use the mixed R9 shell for raw survival/control under the Death Star modifier." }),
    ],
    targetPriorities: [],
    failureRisks: [
      "Assuming Iden's full revive/assist engine is active with SLKR in the published team is incorrect because those effects require no other ally with the Leader tag and, for First In Last Out, an all non-Droid Imperial Trooper squad.",
      "The available community hub confirms the team composition but does not expose enough battle-by-battle sequencing to justify a deterministic kill order.",
      "Volatile Energies can heavily penalize Speed/Offense/Critical Chance if its state is ignored.",
    ],
    evidenceBoundary: "The Death Star modifier and Iden's current conditional kit text are official/current-reference facts. The Iden/SLKR/Malgus/Malak/Sith Empire Trooper composition is a current community reference. Exact wave target sequencing remains intentionally unclaimed until the full encounter walkthrough is independently available.",
  }),
});

export function roteCombatExpansionStrategyForMission(missionId) {
  return ROTE_COMBAT_EXPANSION_STRATEGIES[String(missionId || "")] || null;
}
