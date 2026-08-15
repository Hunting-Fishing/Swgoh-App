const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_JABBA_JKCK_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire planet modifiers and mission gates", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "cg-zeffo", label: "Capital Games · Zeffo Bonus Zone Title Update", kind: "official", url: "https://swgoh.gg/news/title-update-6282023/" },
  { id: "swgohgg-jkck", label: "SWGOH.GG · Jedi Knight Cal Kestis current kit", kind: "current-reference", url: "https://swgoh.gg/units/jedi-knight-cal-kestis/" },
  { id: "swgohgg-jabba", label: "SWGOH.GG · Jabba the Hutt current kit", kind: "current-reference", url: "https://swgoh.gg/units/jabba-the-hutt/" },
  { id: "scrybe-zeffo", label: "Scrybe Gaming · Zeffo full guide · JKCK no Omicron", kind: "community-tested", url: "https://swgoh.tv/video/38759-watch-this-before-you-do-your-zeffo-missionsfull-guide" },
  { id: "kiaowe-jkck-no-omi", label: "Kiaowe · JKCK Zeffo mission no Omicron", kind: "community-tested", url: "https://swgoh.tv/video/44470-complete-the-jedi-knight-cal-mission-no-omi-needed" },
  { id: "bitdynasty-p3-2025", label: "BitDynasty · 2025 ROTE Phase 3 testing", kind: "community-tested", url: "https://swgoh.tv/video/45963-phase-3-testing-relic-delta-impact-swgoh-rote-tb" },
  { id: "egnards-felucia-jabba", label: "Egnards · Felucia Jabba auto battle", kind: "community-tested", url: "https://www.swgoh.tv/video/40014-auto-battle-rote-felucia-jabba" },
  { id: "bitdynasty-jabba-p1-p3", label: "BitDynasty · Corellia/Felucia/Tatooine Jabba missions", kind: "community-tested", url: "https://swgoh.tv/video/32902-jabba-missions-corellia-felucia-tatooine-mix-rise-of-the-empire-rote-tb-sector-p1-p2-p3-swgoh" },
]);

const sources = (...ids) => ROTE_JABBA_JKCK_SOURCES.filter((source) => ids.includes(source.id));
const jabbaUnits = () => [
  { baseId: "JABBATHEHUTT", name: "Jabba the Hutt", importance: "critical", reason: "Mission-mandatory Galactic Legend and strategy engine." },
  { baseId: "BOUSHH", name: "Boushh (Leia Organa)", importance: "helpful", reason: "Hutt Cartel Thermal Detonator partner and common mission shell." },
  { baseId: "KRRSANTAN", name: "Krrsantan", importance: "helpful", reason: "Durable Hutt Cartel tank option." },
  { baseId: "SKIFFGUARD", name: "Skiff Guard (Lando Calrissian)", importance: "helpful", reason: "Common Hutt Cartel support/damage option." },
];
const jabbaAbilities = () => [
  { baseId: "JABBATHEHUTT", abilityName: "Crumb's Revenge", importance: "high", expected: "Unresistable Thermal Detonators, buff dispel and charge-scaled extra detonators", reason: "Use the thermal/mastery engine while respecting the current planet modifier." },
  { baseId: "JABBATHEHUTT", abilityName: "There Will Be No Bargain", importance: "high", expected: "Instant defeat on non-GL targets plus full Health/Protection recovery for BH/Hutt/Smuggler allies", reason: "The Ultimate is both a delete button and a major team reset; time it around each planet's survival/control pressure." },
];

export const ROTE_JABBA_JKCK_STRATEGIES = Object.freeze({
  "zeffo-jkck": Object.freeze({
    id: "zeffo-jkck-v1",
    missionId: "zeffo-jkck",
    title: "Zeffo · Jedi Knight Cal Kestis Combat Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-no-omicron-clear",
    lastVerified: "2026-08-16",
    sources: sources("cg-zeffo", "swgohgg-jkck", "scrybe-zeffo", "kiaowe-jkck-no-omi", "bitdynasty-p3-2025"),
    summary: "Build Jedi Knight Cal Kestis through his Configuration/Impetuous cycle rather than treating the battle as a generic Jedi mission. Whirlwind Slam and Windmill Defense can each add Impetuous when switching configurations; at 30 stacks, Impetuous Assault becomes available, instantly defeats its first target that encounter, and in Territory Battles gives JKCK protection-ignoring attacks plus a large encounter-long team Offense boost. Community clears explicitly show the mission can be completed without JKCK's TB Omicron, so the Omicron is an enhancement rather than an entry or strategy blocker.",
    keyUnits: [
      { baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis", importance: "critical", reason: "Mission-mandatory R7 character and the Configuration/Impetuous engine." },
    ],
    keyAbilities: [
      { baseId: "JEDIKNIGHTCAL", abilityName: "Whirlwind Slam", importance: "high", expected: "Double-Bladed configuration, +5 Impetuous on switch, AOE Speed Down, Stun/Armor Shred/Daze and TB Windmill setup", reason: "Use configuration changes to build Impetuous while controlling the board." },
      { baseId: "JEDIKNIGHTCAL", abilityName: "Windmill Defense", importance: "high", expected: "Dual-Wield configuration, +5 Impetuous on switch, full ally cleanse, assist and Protection Up", reason: "Primary sustain/reset button and another route toward 30 Impetuous." },
      { baseId: "JEDIKNIGHTCAL", abilityName: "Impetuous Assault", importance: "critical", expected: "Requires 30 Impetuous; first use instantly defeats target; TB relic-scaled damage and encounter-long offense conversion", reason: "This is the decisive conversion point of JKCK's TB kit." },
    ],
    stages: [
      stage("build", "Opening · build Impetuous through configuration changes", [
        step("whirlwind", "Use Whirlwind Slam when its configuration switch/control package has value; a fresh switch adds 5 Impetuous and sets up the next Windmill Defense TB recovery package.", { priority: "high", ability: "Whirlwind Slam" }),
        step("windmill", "Use Windmill Defense as a team cleanse/sustain reset and configuration switch when appropriate, adding another 5 Impetuous when entering Dual-Wield.", { priority: "high", ability: "Windmill Defense" }),
        step("track-30", "Track Impetuous explicitly. Do not plan an Impetuous Assault execution until JKCK reaches 30 stacks.", { priority: "critical" }),
      ], { objective: "Reach 30 Impetuous while preserving the team through the setup cycle." }),
      stage("convert", "30 Impetuous · convert the kit into an execution", [
        step("execute", "Use the first Impetuous Assault on the highest-value legal enemy once 30 stacks are available; its first use this encounter instantly defeats the target.", { priority: "critical", ability: "Impetuous Assault" }),
        step("offense", "After Impetuous Assault, exploit JKCK's TB protection-ignore and the encounter-long ally Offense gain instead of resetting to a slow setup-only pattern.", { priority: "high" }),
      ], { objective: "Turn the setup stacks into a decisive removal and sustained TB damage advantage." }),
    ],
    targetPriorities: [{ target: "Highest-impact legal non-boss enemy", priority: "critical", when: "first Impetuous Assault is ready", reason: "The first use is a sourced instant defeat; exact encounter spawns are not hard-coded without a stable independent target-order source." }],
    failureRisks: [
      "Treating the TB Omicron as mandatory would incorrectly block proven no-Omicron clears.",
      "Spending configuration changes without tracking Impetuous can delay the 30-stack execution window.",
      "Exact enemy kill order is intentionally adaptive until a stable encounter-specific walkthrough is normalized into structured enemy data.",
    ],
    evidenceBoundary: "The R7 JKCK mission and current TB-specific ability behavior are official/current-reference facts. Multiple community videos document successful Zeffo JKCK play without the Omicron. The app therefore never marks that Omicron as required and does not fabricate a fixed enemy order.",
  }),

  "felucia-jabba": Object.freeze({
    id: "felucia-jabba-v1",
    missionId: "felucia-jabba",
    title: "Felucia · Jabba the Hutt Combat Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-jabba", "egnards-felucia-jabba", "bitdynasty-jabba-p1-p3"),
    summary: "Felucia's Nysillin Farm gives every character a 10% Heal Over Time at the start of its turn, +25% Defense and Buff Immunity immunity while that HoT is active, Offense Up when it expires, and 20% stronger recovery. Jabba should lean on his unresistable Thermal Detonators, Contract/Ultimate economy and the planet's enhanced sustain rather than depending on Crumb's Revenge Buff Immunity while an enemy is protected by its HoT.",
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: jabbaUnits(),
    keyAbilities: jabbaAbilities(),
    stages: [
      stage("nysillin", "Opening · exploit the recovery environment", [
        step("hot-state", "Expect each acting character to gain Heal Over Time; while it is active the unit has extra Defense and is immune to Buff Immunity.", { priority: "critical" }),
        step("thermals", "Use Jabba's unresistable Thermal Detonator engine without assuming its Buff Immunity rider will stick through an active Nysillin HoT.", { priority: "high", ability: "Crumb's Revenge" }),
        step("contract", "Build Contract/Ultimate state while Felucia's increased recovery helps the Hutt Cartel shell absorb the opening damage cycle.", { priority: "high" }),
      ], { objective: "Develop Jabba's engine without fighting the planet's temporary Buff Immunity immunity." }),
      stage("ultimate", "Conversion · use the Ultimate as removal plus reset", [
        step("delete", "Use There Will Be No Bargain on the highest-value eligible target when the instant defeat materially shortens the battle; the same use fully restores BH/Hutt/Smuggler Health and Protection.", { priority: "critical", ability: "There Will Be No Bargain" }),
      ], { objective: "Convert Jabba's charge into both threat removal and a full-team sustain reset." }),
    ],
    targetPriorities: [{ target: "Highest-impact eligible enemy", priority: "high", when: "Ultimate is ready", reason: "No fixed spawn order is claimed; use the instant defeat where it removes the most dangerous non-GL target." }],
    failureRisks: ["Relying on Buff Immunity while the target has Nysillin Heal Over Time ignores the official modifier's temporary immunity."],
    evidenceBoundary: "Nysillin Farm and the R6 Jabba gate are official; Jabba kit behavior is current-reference; community auto clears validate the core shell but are not treated as guaranteed auto results.",
  }),

  "tatooine-jabba": Object.freeze({
    id: "tatooine-jabba-v1",
    missionId: "tatooine-jabba",
    title: "Tatooine · Jabba the Hutt Combat Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-tested",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-jabba", "bitdynasty-jabba-p1-p3", "bitdynasty-p3-2025"),
    summary: "Dune Sandstorm adds unavoidable Damage Over Time at the end of every other turn, turning Jabba's R7 mission into an attrition race that favors his Hutt Cartel sustain and Ultimate reset. Build charge and Thermal Detonators while preserving the core; There Will Be No Bargain can remove a priority target and restore the Hutt/BH/Smuggler shell to full Health and Protection, but the environmental DoTs will continue on their normal cadence afterward.",
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: jabbaUnits(),
    keyAbilities: jabbaAbilities(),
    stages: [
      stage("sandstorm", "Opening · outlast the unavoidable DoT cycle", [
        step("accept-dot", "Do not build the plan around resisting Dune Sandstorm; its recurring Damage Over Time cannot be resisted.", { priority: "critical" }),
        step("charge", "Build Jabba's Ultimate and Thermal Detonator pressure while keeping the Hutt Cartel core alive rather than overreacting to every environmental DoT application.", { priority: "high" }),
      ], { objective: "Reach a decisive Ultimate window before attrition collapses the shell." }),
      stage("reset", "Ultimate · delete and fully restore", [
        step("ultimate", "Use There Will Be No Bargain on the highest-impact eligible enemy when its instant defeat plus full Health/Protection recovery creates the strongest survival swing.", { priority: "critical", ability: "There Will Be No Bargain" }),
        step("continue", "After the reset, continue respecting Sandstorm; full recovery does not disable future environmental DoT applications.", { priority: "high" }),
      ], { objective: "Turn Jabba's Ultimate into both a kill and an attrition reset." }),
    ],
    targetPriorities: [{ target: "Highest-impact eligible enemy", priority: "high", when: "Ultimate available", reason: "Use the instant defeat where it most improves the remaining attrition race." }],
    failureRisks: ["A cleanse/recovery action does not stop Dune Sandstorm from reapplying its unavoidable Damage Over Time later."],
    evidenceBoundary: "Dune Sandstorm and the R7 Jabba gate are official; Jabba's recovery/Ultimate mechanics are current-reference; community ROTE clears validate Jabba here without supporting a universal fixed target order.",
  }),

  "kessel-jabba": Object.freeze({
    id: "kessel-jabba-v1",
    missionId: "kessel-jabba",
    title: "Kessel · Jabba the Hutt Combat Mission",
    status: "verified-mechanic-core",
    confidence: "official-modifier-current-kit",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-jabba"),
    summary: "Kessel punishes Special-ability spam with Confuse. At 1 stack a character cannot gain buffs; at 2 it cannot counter, assist or gain bonus Turn Meter; at 3 its Basic increases its cooldowns. Jabba's team is Special- and assist-heavy, and his Ultimate normally grants Hutt Cartel 50% Turn Meter, so use the granted Recompute ability deliberately before Confuse suppresses the next important assist/TM/cooldown cycle.",
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: jabbaUnits(),
    keyAbilities: jabbaAbilities(),
    stages: [
      stage("confuse", "Opening · budget Special abilities", [
        step("track", "Track Confuse separately on each character; every Special ability adds a stack up to 3.", { priority: "critical" }),
        step("one-stack", "At 1 Confuse, remember that the affected character cannot gain buffs; avoid planning a buff-dependent survival/damage window on that turn.", { priority: "high" }),
        step("two-stack", "At 2 Confuse, the affected character cannot counter, assist or gain bonus Turn Meter. Recompute before an important assist/TM window when practical.", { priority: "critical", ability: "Recompute" }),
        step("three-stack", "Avoid sitting at 3 Confuse into a Basic-heavy recovery cycle because the Basic increases cooldowns; clear the stacks instead.", { priority: "high", ability: "Recompute" }),
      ], { objective: "Keep Jabba's Hutt engine functional instead of letting Confuse disable its assist/TM economy." }),
      stage("ultimate", "Ultimate · check Confuse before conversion", [
        step("clean-window", "Before There Will Be No Bargain, check whether key Hutt Cartel allies are at 2 Confuse and therefore unable to gain the Ultimate's bonus Turn Meter; Recompute first if preserving that TM swing matters.", { priority: "high", ability: "Recompute" }),
        step("delete", "Use There Will Be No Bargain on the highest-impact eligible target once the modifier state will not waste the desired follow-up tempo.", { priority: "critical", ability: "There Will Be No Bargain" }),
      ], { objective: "Spend Jabba's Ultimate in a modifier state that preserves as much of its recovery/tempo value as possible." }),
    ],
    targetPriorities: [],
    failureRisks: [
      "Blindly using a Special every turn can push key Hutt units to 2-3 Confuse and disable assists, bonus Turn Meter or normal cooldown flow.",
      "The app does not invent an enemy kill order because this pack is grounded in official Kessel/Jabba mechanics rather than a normalized encounter walkthrough.",
    ],
    evidenceBoundary: "Confusing Tunnels/Recompute and the R8 Jabba gate are official; Jabba's assist/TM/Ultimate interactions are current-reference. Exact enemy sequencing remains intentionally unclaimed.",
  }),

  "vandor-jabba": Object.freeze({
    id: "vandor-jabba-v1",
    missionId: "vandor-jabba",
    title: "Vandor · Jabba the Hutt Combat Mission",
    status: "verified-mechanic-core",
    confidence: "official-modifier-current-kit",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-jabba"),
    summary: "Vandor combines Sabacc Shift with Boxed In. Characters can swing between Health Up/Down, while enemies begin with unpreventable Healing Immunity and receive modifier Damage Over Time each enemy turn. The summoned allied Crate is indestructible; when an enemy damages it, that enemy recovers 50% Health and Protection in a way that cannot be prevented and removes the modifier DoTs. Jabba should build Thermal/Ultimate pressure and prioritize enemies that repeatedly convert Crate hits into large resets.",
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: jabbaUnits(),
    keyAbilities: jabbaAbilities(),
    stages: [
      stage("boxed", "Opening · understand the Crate recovery exception", [
        step("healing-immunity", "Do not assume Boxed In's Healing Immunity prevents Crate recovery; the Crate's 50% Health/Protection recovery explicitly cannot be prevented.", { priority: "critical" }),
        step("thermals", "Layer Jabba's Thermal Detonators on top of the modifier DoT pressure while building Ultimate charge.", { priority: "high", ability: "Crumb's Revenge" }),
        step("sabacc", "Track Sabacc Shift Health Up/Down as a temporary survivability swing, not a dice-roll or attack-roll mechanic.", { priority: "high" }),
      ], { objective: "Preserve pressure even when enemies obtain a Crate-triggered recovery reset." }),
      stage("delete", "Ultimate · remove the best reset-capable threat", [
        step("ultimate", "Use There Will Be No Bargain on the highest-impact eligible enemy when deleting it is worth more than allowing another Crate-recovery cycle.", { priority: "critical", ability: "There Will Be No Bargain" }),
      ], { objective: "Use Jabba's instant defeat to bypass a long recovery loop." }),
    ],
    targetPriorities: [{ target: "Enemy generating the most Crate/recovery pressure", priority: "high", when: "identified", reason: "Exact spawns are not hard-coded; prioritize the unit most capable of repeatedly resetting enemy durability through the Crate." }],
    failureRisks: [
      "Healing Immunity does not stop the Crate's explicitly unpreventable 50% Health/Protection recovery.",
      "Sabacc Shift is Health Up/Health Down state management; it must not be represented as a dice or attack-roll system.",
    ],
    evidenceBoundary: "Sabacc Shift, Boxed In and the R9 Jabba gate are official; Jabba kit behavior is current-reference. The pack intentionally avoids unsupported enemy-specific rotations.",
  }),

  "hoth-jabba": Object.freeze({
    id: "hoth-jabba-v1",
    missionId: "hoth-jabba",
    title: "Hoth · Jabba the Hutt Combat Mission",
    status: "verified-mechanic-core",
    confidence: "official-double-modifier-current-kit",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-jabba"),
    summary: "Hoth requires simultaneous management of Frostbite and Bacta Tanks. Every unit gains unavoidable Frostbite at the start of its turn; each stack removes Critical Chance, Potency and Speed, and 10 stacks defeats the unit. Thermoregulate removes two Frostbite/Overheat stacks from an ally. Separately, Deadly Storm starts on all units with severe offense/speed penalties and start-turn Max-Health damage; Smells Bad on the Outside removes Deadly Storm from self. Jabba's Ultimate can fully restore Health/Protection, but it does not remove Frostbite, so status-stack management remains mandatory.",
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: jabbaUnits(),
    keyAbilities: jabbaAbilities(),
    stages: [
      stage("cold", "Opening · remove Deadly Storm without losing Frostbite control", [
        step("deadly-storm", "Use Smells Bad on the Outside on key characters when removing Deadly Storm's Critical Chance, Offense, Speed and start-turn damage penalty is worth the cooldown.", { priority: "critical", ability: "Smells Bad on the Outside" }),
        step("track-frostbite", "Track Frostbite on every core unit. At 10 stacks the unit is defeated, regardless of current Health/Protection.", { priority: "critical" }),
        step("thermoregulate", "Use Thermoregulate on the ally approaching a dangerous Frostbite threshold; it removes two Frostbite/Overheat stacks and is the actual stack-control tool.", { priority: "critical", ability: "Thermoregulate" }),
      ], { objective: "Restore functional Speed/Offense while keeping every essential Hutt below the Frostbite defeat threshold." }),
      stage("bacta", "Emergency trigger · understand the first would-be defeat", [
        step("bacta-trigger", "The first time an ally would be defeated, Bacta Tanks instead cleanses that ally, removes Deadly Storm from all allies, fully restores it, and applies the encounter's Damage Immunity/Stun safety state. Do not mistake this one-time safety net for Frostbite removal on the whole team.", { priority: "high" }),
      ], { objective: "Use the Bacta safety net as insurance, not as a substitute for Thermoregulate." }),
      stage("ultimate", "Jabba conversion · heal is not Frostbite control", [
        step("ultimate", "Use There Will Be No Bargain when its instant defeat and full Health/Protection recovery create a decisive swing.", { priority: "critical", ability: "There Will Be No Bargain" }),
        step("still-cold", "Immediately continue tracking Frostbite after the Ultimate; Health/Protection recovery does not remove the stacks or the 10-stack defeat condition.", { priority: "critical" }),
      ], { objective: "Convert Jabba's Ultimate without losing a recovered character to unmanaged Frostbite." }),
    ],
    targetPriorities: [],
    failureRisks: [
      "Full Health/Protection does not protect a unit from the 10-stack Frostbite defeat condition.",
      "Deadly Storm/Smells Bad on the Outside belongs to Hoth's Bacta Tanks modifier; it must not leak into Death Star strategy data.",
      "Exact enemy kill order is intentionally omitted until a battle-specific encounter source is normalized.",
    ],
    evidenceBoundary: "Frigid Expanse, Thermoregulate, Bacta Tanks, Deadly Storm and the R9 Jabba gate are official. Jabba recovery/Ultimate behavior is current-reference; enemy sequencing remains source-bounded rather than fabricated.",
  }),
});

export function roteJabbaJkckStrategyForMission(missionId) {
  return ROTE_JABBA_JKCK_STRATEGIES[String(missionId || "")] || null;
}
