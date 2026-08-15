const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_COMBAT_EXPANSION_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission details", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "cg-zeffo", label: "Capital Games · Zeffo Bonus Zone Title Update", kind: "official", url: "https://swgoh.gg/news/title-update-6282023/" },
  { id: "swgohgg-fennec", label: "SWGOH.GG · Fennec Shand current kit", kind: "current-reference", url: "https://swgoh.gg/units/fennec-shand/" },
  { id: "swgohgg-rey", label: "SWGOH.GG · Rey current kit", kind: "current-reference", url: "https://swgoh.gg/units/rey/" },
  { id: "swgohgg-tarfful", label: "SWGOH.GG · Tarfful current kit", kind: "current-reference", url: "https://swgoh.gg/units/tarfful/" },
  { id: "bitdynasty-tatooine-fennec", label: "BitDynasty · Tatooine Sector 3 Fennec guide", kind: "community-tested", url: "https://swgoh.tv/video/32813-tatooine-s3-fennec-reva-sm-mix-cm-and-fleet-guide-rise-of-the-empire-rote-tb-sector-p3-swgoh" },
  { id: "egnards-tatooine-fennec", label: "Egnards · Tatooine Rey + Fennec auto battle", kind: "community-tested", url: "https://www.swgoh.tv/video/40006-auto-battle-rote-tatooine-rey-w-fennec" },
  { id: "starwarsfans-kashyyyk-wookiee", label: "StarWars-fans · Kashyyyk Wookiee combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2025/02/swgoh-rote-territory-battle-phase-3-kashyyyk-wookie-combat-mission-walkthrough-tips/" },
  { id: "starwarsfans-zeffo-middle", label: "StarWars-fans · Zeffo middle combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/02/swgoh-rote-territory-battle-zeffo-combat-mission-middle-walkthrough-tips/" },
  { id: "starwarsfans-zeffo-ufu", label: "StarWars-fans · Zeffo UFU combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/02/swgoh-rote-territory-battle-zeffo-ufu-combat-mission-top-walkthrough-tips/" },
]);

const sources = (...ids) => ROTE_COMBAT_EXPANSION_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_COMBAT_EXPANSION_STRATEGIES = Object.freeze({
  "tatooine-fennec": Object.freeze({
    id: "tatooine-fennec-v2",
    missionId: "tatooine-fennec",
    title: "Tatooine · Fennec Shand Combat Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-fennec", "swgohgg-rey", "bitdynasty-tatooine-fennec", "egnards-tatooine-fennec"),
    summary: "Treat Tatooine as an attrition fight. Dune Sandstorm repeatedly applies unavoidable Damage Over Time, so survival, Contract/Ultimate development and timely recovery matter more than trying to resist the environment. Community clears support both Rey + Fennec shells and Bounty Hunter approaches.",
    keyUnits: [
      { baseId: "FENNECSHAND", name: "Fennec Shand", importance: "critical", reason: "Mission-mandatory R7 character." },
      { baseId: "GLREY", name: "Rey", importance: "helpful", reason: "Community-tested survival/burst shell; not an official mission requirement." },
    ],
    keyAbilities: [
      { baseId: "FENNECSHAND", abilityName: "I Don't Miss", importance: "helpful", expected: "Armor Shred and focused pressure", reason: "Persistent Armor Shred helps shorten a long environmental attrition race." },
    ],
    stages: [
      stage("environment", "Opening · respect Dune Sandstorm", [
        step("accept-dot", "Expect the environmental Damage Over Time to return on its cadence; do not spend turns trying to make an unavoidable application resist.", { priority: "critical" }),
        step("develop-engine", "If using Bounty Hunters, advance Contract/Payout quickly. If using Rey, preserve the protection/Ultimate shell until a meaningful danger window.", { priority: "high" }),
      ], { objective: "Stabilize before environmental attrition compounds." }),
      stage("convert", "Midfight · convert sustain into kills", [
        step("recovery", "Use recovery or cleanse when it materially changes survival rather than immediately after every environmental debuff.", { priority: "high" }),
        step("focus", "Focus the highest-pressure enemy once the team engine is stable; avoid spreading damage through a long attrition battle.", { priority: "high" }),
      ], { objective: "Shorten the fight once the survival engine is online." }),
    ],
    targetPriorities: [{ target: "Highest-pressure enemy", priority: "high", when: "after stabilization", reason: "Exact encounter spawns can vary; remove the unit most likely to extend or spike the attrition fight." }],
    failureRisks: [
      "Dune Sandstorm's environmental Damage Over Time is unavoidable; a Tenacity-only plan does not solve the modifier.",
      "Community auto clears demonstrate a viable shell, not a guaranteed auto result for every roster and Operation state.",
    ],
    evidenceBoundary: "The Fennec mission gate and Dune Sandstorm are official/current-reference mechanics. Rey/Fennec and Bounty Hunter sequencing are community-tested guidance; no guaranteed clear rate is claimed.",
  }),

  "kashyyyk-wookiee": Object.freeze({
    id: "kashyyyk-wookiee-v2",
    missionId: "kashyyyk-wookiee",
    title: "Kashyyyk · Wookiee Combat Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-tarfful", "starwarsfans-kashyyyk-wookiee"),
    summary: "Use Tarfful lead to turn the Wookiee gate into a defense/sustain engine. Community sequencing removes Scout Trooper then Recon Stormtrooper in Wave 1; in Wave 2, dispel Ninth Sister's Taunt, eliminate the Purge Troopers, and leave Ninth Sister for the closeout.",
    requiredLeaderBaseId: "TARFFUL",
    keyUnits: [
      { baseId: "TARFFUL", name: "Tarfful", importance: "critical", reason: "Community-tested leader whose kit supplies Wookiee sustain, Provoked and defensive scaling." },
      { baseId: "ZAALBAR", name: "Zaalbar", importance: "helpful", reason: "Durable community-tested Wookiee tank option." },
      { baseId: "YOUNGCHEWBACCA", name: "Vandor Chewbacca", importance: "helpful", reason: "Community-tested sustain option." },
    ],
    keyAbilities: [
      { baseId: "TARFFUL", abilityName: "Rrrruuuurrr", importance: "high", expected: "Team cleanse, Tenacity Up, Max Health scaling and Provoked", reason: "Use as the major reset/control button under sustained pressure." },
      { baseId: "TARFFUL", abilityName: "Wookiee Fury", importance: "high", expected: "Wookiee assists, Stun and Defense scaling", reason: "Creates focused control/damage while improving encounter-long durability." },
    ],
    stages: [
      stage("wave1", "Wave 1 · dismantle the Troopers", [
        step("scout", "Remove Scout Trooper first when targetable.", { priority: "critical", target: "Scout Trooper" }),
        step("recon", "Move next to Recon Stormtrooper before low-value cleanup.", { priority: "high", target: "Recon Stormtrooper" }),
      ], { objective: "Remove the mobile offensive threats while Tarfful's defense engine scales." }),
      stage("wave2", "Wave 2 · bypass Ninth Sister", [
        step("dispel", "Dispel Ninth Sister's Taunt so the squad can reach the Purge Troopers.", { priority: "critical", target: "Ninth Sister" }),
        step("purge", "Remove both Purge Troopers before committing sustained damage into Ninth Sister.", { priority: "critical", target: "Purge Trooper" }),
        step("ninth", "Finish Ninth Sister after the Purge Troopers are gone.", { priority: "high", target: "Ninth Sister" }),
      ], { objective: "Remove higher-value Purge threats before the durable tank." }),
    ],
    targetPriorities: [
      { target: "Scout Trooper", priority: "critical", when: "Wave 1", reason: "Community-tested first target." },
      { target: "Recon Stormtrooper", priority: "high", when: "Wave 1 after Scout", reason: "Community-tested second target." },
      { target: "Purge Trooper", priority: "critical", when: "Wave 2 after dispelling Ninth Sister", reason: "Both are removed before Ninth Sister in the tested line." },
      { target: "Ninth Sister", priority: "high", when: "Wave 2 closeout", reason: "Leave the durable tank until the Purge threats are gone." },
    ],
    failureRisks: ["Remaining trapped behind Ninth Sister while Purge Troopers are alive wastes the team's buff-dispel tools."],
    evidenceBoundary: "Kashyyyk's R7 Light Side/Wookiee gate is official; Tarfful mechanics are current-reference; target order is community-tested and is not a guaranteed clear script.",
  }),

  "zeffo-generic-1": Object.freeze({
    id: "zeffo-generic-1-v2",
    missionId: "zeffo-generic-1",
    title: "Zeffo · Open Light Side Combat Mission",
    status: "community-tested",
    confidence: "official-mechanic-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-zeffo", "starwarsfans-zeffo-middle"),
    summary: "Bring reliable Stun. Community sequencing removes the Bounty Hunters before grinding through Haxion Brood Cannon Fodder. Wave 2's Tomb Guardians cannot be defeated unless Stunned, so preserve a Stun window before committing lethal damage.",
    requiredMechanics: [{ id: "stun", label: "Reliable Stun", importance: "critical", evidenceType: "debuff", evidenceKey: "Stun" }],
    keyUnits: [
      { baseId: "JEDIKNIGHTLUKE", name: "Jedi Knight Luke Skywalker", importance: "helpful", reason: "Community-tested AoE Stun source." },
      { baseId: "CAPTAINREX", name: "Captain Rex", importance: "helpful", reason: "Useful control option, though guild planning may reserve him for the Clone Special Mission." },
    ],
    stages: [
      stage("wave1", "Wave 1 · Bounty Hunters before Haxion Brood", [
        step("bounty", "Remove the Bounty Hunters before sinking major damage into Cannon Fodder stacks.", { priority: "critical", target: "Bounty Hunters" }),
        step("supports", "Work through supporting Haxion Brood droids before the Droid Captain when practical.", { priority: "high", target: "Haxion Brood Droid" }),
      ], { objective: "Avoid wasting the opening damage cycle into encounter durability." }),
      stage("wave2", "Wave 2 · create legal Tomb Guardian defeat windows", [
        step("preserve-stun", "Keep a reliable Stun available before trying to finish a Tomb Guardian.", { priority: "critical" }),
        step("stun-kill", "Stun the chosen Tomb Guardian, then commit the lethal damage window.", { priority: "critical", target: "Miktrullk Tomb Guardian" }),
      ], { objective: "Satisfy the official Stun defeat gate for each Guardian." }),
    ],
    targetPriorities: [
      { target: "Bounty Hunters", priority: "critical", when: "Wave 1", reason: "Community-tested opening order." },
      { target: "Miktrullk Tomb Guardian", priority: "critical", when: "Wave 2 while Stunned", reason: "Official defeat condition requires Stun." },
    ],
    failureRisks: ["Entering Wave 2 without reliable Stun can make sufficient damage unable to finish the Tomb Guardians."],
    evidenceBoundary: "The R7 entry and Tomb Guardian Stun defeat gate are official. Wave 1 sequencing is community-tested. The app does not require one fixed squad beyond the sourced mechanic need.",
  }),

  "zeffo-ufu": Object.freeze({
    id: "zeffo-ufu-v2",
    missionId: "zeffo-ufu",
    title: "Zeffo · Unaligned Force User Combat Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-zeffo", "swgohgg-rey", "starwarsfans-zeffo-ufu"),
    summary: "A community-tested Rey-led UFU shell preserves Rey through Wave 1 and uses her defensive/Ultimate windows to survive the Wave 2 Imperial AT-ST. This is a strategy variant, not an official Rey requirement; the mission itself requires five R7 Unaligned Force Users.",
    requiredLeaderBaseId: "GLREY",
    keyUnits: [
      { baseId: "GLREY", name: "Rey", importance: "critical", reason: "Required by this sourced strategy variant and its survival/damage engine." },
      { baseId: "CEREJUNDA", name: "Cere Junda", importance: "helpful", reason: "Community-tested UFU companion." },
      { baseId: "CALKESTIS", name: "Cal Kestis", importance: "helpful", reason: "Community-tested UFU companion." },
    ],
    keyAbilities: [
      { baseId: "GLREY", abilityName: "Heir to the Jedi", importance: "critical", expected: "Defensive Ultimate stance followed by true-damage burst", reason: "Use around the AT-ST's dangerous pressure window." },
      { baseId: "GLREY", abilityName: "Sudden Whirlwind", importance: "high", expected: "Major single-target damage", reason: "Primary damage window between Ultimate cycles." },
    ],
    stages: [
      stage("wave1", "Wave 1 · preserve the UFU core", [
        step("protect-rey", "Prioritize keeping Rey alive while removing enemies one at a time.", { priority: "critical", target: "Rey" }),
        step("control", "Use available UFU debuffs/control to reduce the enemy turn cycle rather than spreading damage.", { priority: "high" }),
      ], { objective: "Reach Wave 2 with Rey and a major defensive/offensive resource available." }),
      stage("atst", "Wave 2 · Imperial AT-ST", [
        step("ultimate", "When the AT-ST is about to create a dangerous pressure window and Rey has charge, use the Ultimate defensive stance before converting its follow-up into damage.", { priority: "critical", ability: "Heir to the Jedi", target: "Imperial AT-ST" }),
        step("burst", "Alternate Rey's major damage windows until the AT-ST is defeated.", { priority: "high", target: "Imperial AT-ST" }),
      ], { objective: "Survive the boss's pressure and convert Rey's defensive window into the finish." }),
    ],
    targetPriorities: [{ target: "Imperial AT-ST", priority: "critical", when: "Wave 2", reason: "Sole Wave 2 boss in the tested encounter." }],
    failureRisks: ["Rey lead is a community-tested strategy variant, not the mission's official entry requirement."],
    evidenceBoundary: "The five-UFU R7 entry requirement is official and Rey's kit behavior is current-reference. The Rey-led composition and AT-ST sequencing are community-tested; other legal UFU clears may exist.",
  }),
});

export function roteCombatExpansionStrategyForMission(missionId) {
  return ROTE_COMBAT_EXPANSION_STRATEGIES[String(missionId || "")] || null;
}
