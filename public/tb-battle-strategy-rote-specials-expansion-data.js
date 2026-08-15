const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_SPECIAL_EXPANSION_SOURCES = Object.freeze([
  { id: "cg-rote", label: "Capital Games · Rise of the Empire mission gates and planet modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "swgohgg-hondo", label: "SWGOH.GG · Hondo Ohnaka current kit and Felucia TB mission", kind: "current-reference", url: "https://swgoh.gg/units/hondo-ohnaka/" },
  { id: "swgohgg-saw", label: "SWGOH.GG · Saw Gerrera current kit and Kashyyyk TB mission", kind: "current-reference", url: "https://swgoh.gg/units/saw-gerrera/" },
  { id: "swgohgg-aphra", label: "SWGOH.GG · Doctor Aphra current kit", kind: "current-reference", url: "https://swgoh.gg/units/doctor-aphra/" },
  { id: "swgohgg-triplezero", label: "SWGOH.GG · 0-0-0 current kit and Hoth ROTE mission", kind: "current-reference", url: "https://swgoh.gg/units/0-0-0/" },
  { id: "bitdynasty-hondo", label: "BitDynasty · Felucia Hondo mission testing", kind: "community-tested", url: "https://swgoh.tv/video/45952-how-to-beat-the-hondo-special-mission-swgoh" },
  { id: "starwarsfans-saw", label: "StarWars-fans · Kashyyyk Saw Gerrera Special Mission walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/09/swgoh-rote-territory-battle-kashyyyk-special-mission-walkthrough-tips/" },
]);
const sources = (...ids) => ROTE_SPECIAL_EXPANSION_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_SPECIAL_EXPANSION_STRATEGIES = Object.freeze({
  "felucia-hondo": Object.freeze({
    id: "felucia-hondo-v1",
    missionId: "felucia-hondo",
    title: "Felucia · Hondo Ohnaka Special Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote", "swgohgg-hondo", "bitdynasty-hondo"),
    summary: "Hondo is the mandatory R6 core, but community clears use him inside stronger mixed carry shells rather than requiring a pure Scoundrel squad. Open by putting Captive on the highest-value non-GL threat: Captive sets a character's Speed to 0 and prevents bonus attacks/bonus Turn Meter, and its expiration grants Hondo 10 Ransom. Build Ransom because it progressively adds Max Health/Tenacity, crit immunity and self-recovery. Felucia's Nysillin HoT temporarily makes its holder immune to Buff Immunity, so Hondo's 5+ Ransom Buff Immunity branch against Light Side enemies may be suppressed while that HoT is active; his Dark Side Ability Block branch remains the better control hook there.",
    keyUnits: [
      { baseId: "HONDO", name: "Hondo Ohnaka", importance: "critical", reason: "Officially mandatory R6 character and the Captive/Ransom mission core." },
      { baseId: "GLREY", name: "Rey", importance: "helpful", reason: "Community-tested Felucia Hondo carry shell; not an entry requirement." },
      { baseId: "BAYLANSKOLL", name: "Baylan Skoll", importance: "helpful", reason: "Also appears in current community Hondo mission testing; advisory only." },
    ],
    keyAbilities: [
      { baseId: "HONDO", abilityName: "I Don't Want to Kill You Per Se", importance: "critical", expected: "AOE Turn Meter removal, Outmaneuver and unresistable Captive on a non-GL target", reason: "Captive is Hondo's strongest mission-control tool and its expiry builds 10 Ransom." },
      { baseId: "HONDO", abilityName: "Insolence? We are Pirates", importance: "high", expected: "Scoundrel/Mercenary cleanse, assist sequence, Ransom-scaled Offense and 5+/25+ Ransom control thresholds", reason: "Convert accumulated Ransom into team support and enemy control." },
    ],
    stages: [
      stage("captive", "Opening · immobilize the priority non-GL threat", [
        step("apply", "Use I Don't Want to Kill You Per Se on the highest-impact eligible enemy so Captive sets its Speed to 0 and blocks bonus attacks/bonus Turn Meter.", { priority: "critical", ability: "I Don't Want to Kill You Per Se" }),
        step("keep-hondo", "Keep Hondo alive until Captive expires; expiration is worth 10 Ransom and Hondo loses that payoff if he is defeated first.", { priority: "critical" }),
        step("nysillin", "Track Felucia's Nysillin Heal Over Time. While it is active, that unit is immune to Buff Immunity, so do not rely on Hondo's Light Side Buff Immunity rider during that state.", { priority: "high" }),
      ], { objective: "Trade Hondo's first control cycle into a safe 10-Ransom breakpoint." }),
      stage("ransom", "Midfight · convert Ransom into durability/control", [
        step("thresholds", "At 10 Ransom Hondo is crit-immune; at 15 he recovers Health each turn; at 20 he also recovers Protection. Preserve him long enough to exploit those breakpoints.", { priority: "high" }),
        step("insolence", "Use Insolence? We are Pirates when its cleanse/assist package and Ransom-based control matter. At 25+ Ransom it also increases all enemy cooldowns by 1.", { priority: "high", ability: "Insolence? We are Pirates" }),
      ], { objective: "Let Hondo become progressively harder to remove while the carry shell closes the battle." }),
    ],
    targetPriorities: [{ target: "Highest-impact eligible non-GL enemy", priority: "critical", when: "opening Captive", reason: "Captive can remove a dangerous unit's normal turn/bonus-action economy from the opening sequence." }],
    failureRisks: [
      "Captive cannot be placed on Galactic Legends.",
      "If Hondo is defeated before Captive expires, the expected 10-Ransom payoff is lost.",
      "Felucia's Nysillin HoT temporarily prevents Buff Immunity, so Hondo's Light Side 5+ Ransom control rider is not universally reliable there.",
      "Hondo's Omicron is a Grand Arena effect and is not a ROTE readiness requirement.",
    ],
    evidenceBoundary: "Hondo's R6 mission, Felucia modifier and current Captive/Ransom behavior are official/current-reference. Carry-shell examples are community-tested and remain advisory; no specific GL is treated as mandatory.",
  }),

  "kashyyyk-saw": Object.freeze({
    id: "kashyyyk-saw-v1",
    missionId: "kashyyyk-saw",
    title: "Kashyyyk · Saw Gerrera Rebel Fighter Special Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-wave-reference",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote", "swgohgg-saw", "starwarsfans-saw"),
    summary: "Use Saw lead with a full R7+ Rebel Fighter squad. A tested five is Saw, Jyn Erso, Cassian Andor, Luthen Rael and K-2SO. Kashyyyk's Righteous Retribution means every debuff restores 10% Protection to its target, so debuffing must buy enough control to justify that recovery. In Wave 1 the tested line used Jyn/Cassian control and Ability Block to suppress the Purge Troopers. In Wave 2, the successful target order removed Imperial Officer first, then Recon Stormtrooper, and did not waste the win condition on the summoned Probe Droid.",
    requiredLeaderBaseId: "SAWGERRERA",
    keyUnits: [
      { baseId: "SAWGERRERA", name: "Saw Gerrera", importance: "critical", reason: "Official mandatory R7 unit and the tested Rebel Fighter leader." },
      { baseId: "JYNERSO", name: "Jyn Erso", importance: "helpful", reason: "Tested control/revive/TM member." },
      { baseId: "CASSIANANDOR", name: "Cassian Andor", importance: "helpful", reason: "Tested debuff/control member." },
      { baseId: "LUTHENRAEL", name: "Luthen Rael", importance: "helpful", reason: "Tested Rebel Fighter damage/control member." },
      { baseId: "K2SO", name: "K-2SO", importance: "helpful", reason: "Tested Rebel Fighter tank/control member." },
    ],
    stages: [
      stage("wave1", "Wave 1 · control Purge Troopers", [
        step("ability-block", "Prioritize Ability Block/control on the Purge Troopers so their Specials do not control the opening wave.", { priority: "critical", target: "Purge Trooper" }),
        step("jyn", "Use Jyn's Turn Meter removal/Stun and revive tools as actual control/survival resources rather than routine cooldown spends.", { priority: "high" }),
        step("debuff-cost", "Remember Kashyyyk restores 10% Protection whenever a character is debuffed. Spread Cassian's debuffs when the cooldown/control value exceeds the Protection you are giving back.", { priority: "high" }),
      ], { objective: "Suppress Purge Trooper turns while keeping the Rebel Fighter core intact." }),
      stage("wave2", "Wave 2 · Officer → Recon", [
        step("officer", "Focus Imperial Officer first in the tested Wave 2 line.", { priority: "critical", target: "Imperial Officer" }),
        step("recon", "After the Officer is removed, focus Recon Stormtrooper.", { priority: "high", target: "Recon Stormtrooper" }),
        step("probe", "Do not divert the main damage cycle into the summoned Probe Droid when the required enemy units can be finished instead.", { priority: "high", target: "Probe Droid" }),
      ], { objective: "Remove the controlling Imperial units and finish the mission without chasing the summon." }),
    ],
    targetPriorities: [
      { target: "Purge Trooper", priority: "critical", when: "Wave 1", reason: "Tested strategy suppresses their Specials with Ability Block/control." },
      { target: "Imperial Officer", priority: "critical", when: "Wave 2", reason: "First Wave 2 kill in the documented successful run." },
      { target: "Recon Stormtrooper", priority: "high", when: "Wave 2 after Officer", reason: "Second documented Wave 2 priority." },
      { target: "Probe Droid", priority: "info", when: "summoned", reason: "The successful run completed without making the summon the primary kill objective." },
    ],
    failureRisks: [
      "Every debuff on Kashyyyk also restores 10% Protection to that target; uncontrolled debuff spam can erase damage progress.",
      "The Saw/Jyn/Cassian/Luthen/K-2SO squad is a tested five, not the only legal all-Rebel-Fighter composition.",
    ],
    evidenceBoundary: "The Saw + four Rebel Fighters R7 gate and Kashyyyk modifier are official; the five-unit shell and wave priorities are community-tested walkthrough evidence. No clear percentage is claimed.",
  }),

  "hoth-aphra": Object.freeze({
    id: "hoth-aphra-v1",
    missionId: "hoth-aphra",
    title: "Hoth · Doctor Aphra + BT-1 + 0-0-0 Special Mission",
    status: "verified-mechanic-core",
    confidence: "official-entry-current-kit-double-modifier-core",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote", "swgohgg-aphra", "swgohgg-triplezero"),
    summary: "Aphra, BT-1 and 0-0-0 are mandatory R9s. Aphra starts with 50% Turn Meter for each of BT-1 and 0-0-0, so the required trio naturally accelerates her opening. Rogue Archaeology raises all enemy cooldowns and applies Doubt; Dangerous Tech can restore/revive the Droid core. Hoth adds two independent survival problems: unavoidable Frostbite eventually defeats a unit at 10 stacks and must be controlled with Thermoregulate, while Deadly Storm heavily reduces combat stats and damages at start of turn until Smells Bad on the Outside removes it. Aphra's Droid recovery cannot substitute for Frostbite stack management.",
    requiredLeaderBaseId: "DOCTORAPHRA",
    keyUnits: [
      { baseId: "DOCTORAPHRA", name: "Doctor Aphra", importance: "critical", reason: "Official mandatory R9 unit and the sourced leader/control engine." },
      { baseId: "BT1", name: "BT-1", importance: "critical", reason: "Official mandatory R9 Dark Side Droid and Aphra damage partner." },
      { baseId: "TRIPLEZERO", name: "0-0-0", importance: "critical", reason: "Official mandatory R9 Dark Side Droid and Aphra control/recovery partner." },
      { baseId: "VADER", name: "Darth Vader", importance: "helpful", reason: "Explicitly supported by Aphra's leadership; flex only." },
      { baseId: "KRRSANTAN", name: "Krrsantan", importance: "helpful", reason: "Explicitly supported by Aphra's leadership; flex only." },
    ],
    keyAbilities: [
      { baseId: "DOCTORAPHRA", abilityName: "Rogue Archaeology", importance: "critical", expected: "AOE cooldown increase, Doubt and unresistable Potency Siphon", reason: "Best opening control resource while Hoth status pressure is still manageable." },
      { baseId: "DOCTORAPHRA", abilityName: "Dangerous Tech", importance: "high", expected: "Dark Side Turn Meter/Potency support, Droid recovery and BT-1/0-0-0 revive", reason: "Primary reset for the mandatory Droid core." },
    ],
    stages: [
      stage("opening", "Opening · exploit Aphra's required-trio Turn Meter", [
        step("archaeology", "Use Rogue Archaeology when its global cooldown increase/Doubt will suppress the widest enemy threat window.", { priority: "critical", ability: "Rogue Archaeology" }),
        step("storm", "Use Smells Bad on the Outside on key characters when clearing Deadly Storm's severe Offense/Speed/Critical penalties is worth the action.", { priority: "critical", ability: "Smells Bad on the Outside" }),
        step("frostbite", "Track Frostbite separately on Aphra, BT-1 and 0-0-0 from the first turn onward; 10 stacks defeats the unit regardless of current Health/Protection.", { priority: "critical" }),
      ], { objective: "Turn Aphra's accelerated opening into control before Hoth's status stacks become dangerous." }),
      stage("survival", "Midfight · Droid recovery is not Frostbite removal", [
        step("dangerous-tech", "Use Dangerous Tech when its Droid recovery/revive creates a meaningful reset for BT-1/0-0-0.", { priority: "high", ability: "Dangerous Tech" }),
        step("thermo", "Use Thermoregulate on the mandatory unit approaching a dangerous Frostbite threshold; it removes two Frostbite/Overheat stacks.", { priority: "critical", ability: "Thermoregulate" }),
        step("do-not-confuse", "Do not treat full Health/Protection or a Droid revive as protection from the 10-stack Frostbite defeat condition.", { priority: "critical" }),
      ], { objective: "Keep all three mandatory R9 units functional through the double-modifier attrition cycle." }),
    ],
    targetPriorities: [{ target: "Highest-impact enemy Special/control threat", priority: "high", when: "Rogue Archaeology control is active", reason: "Exact encounter spawn order is not independently normalized; shorten the Hoth status race by removing the unit most likely to create extra turns or control." }],
    failureRisks: [
      "Aphra's Grand Arena Omicrons are not Territory Battle requirements.",
      "Dangerous Tech can recover/revive the Droid core but does not remove Frostbite stacks.",
      "Full Health/Protection does not prevent the 10-stack Frostbite defeat condition.",
      "Deadly Storm/Smells Bad on the Outside is Hoth-specific and must not be reused on Death Star.",
    ],
    evidenceBoundary: "The R9 Aphra/BT-1/0-0-0 gate and Hoth Frostbite/Bacta mechanics are official; Aphra/0-0-0 kit interactions are current-reference. No unsupported enemy-specific kill order or win probability is generated.",
  }),
});

export function roteSpecialExpansionStrategyForMission(missionId) {
  return ROTE_SPECIAL_EXPANSION_STRATEGIES[String(missionId || "")] || null;
}
