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
const jabbaUnits = Object.freeze([
  { baseId: "JABBATHEHUTT", name: "Jabba the Hutt", importance: "critical", reason: "Mission-mandatory Galactic Legend and strategy engine." },
  { baseId: "BOUSHH", name: "Boushh (Leia Organa)", importance: "helpful", reason: "Common Hutt Cartel Thermal Detonator partner." },
  { baseId: "KRRSANTAN", name: "Krrsantan", importance: "helpful", reason: "Common Hutt Cartel tank option." },
  { baseId: "UNDERCOVERLANDO", name: "Skiff Guard (Lando Calrissian)", importance: "helpful", reason: "Canonical Skiff Guard game identifier; common Hutt Cartel support option." },
]);
const jabbaAbilities = Object.freeze([
  { baseId: "JABBATHEHUTT", abilityName: "Crumb's Revenge", importance: "high", expected: "Unresistable Thermal Detonators with additional detonators by Ultimate Charge", reason: "Shared Hutt pressure/mastery engine." },
  { baseId: "JABBATHEHUTT", abilityName: "There Will Be No Bargain", importance: "high", expected: "Instant defeat on eligible targets plus full Health/Protection recovery for BH/Hutt/Smuggler allies", reason: "Shared threat-removal and team-reset resource." },
]);

function jabbaPack({ id, title, status = "verified-mechanic-core", confidence = "official-modifier-current-kit", sourceIds = [], summary, stages, targetPriorities = [], failureRisks = [] }) {
  return Object.freeze({
    id: `${id}-v1`,
    missionId: id,
    title,
    status,
    confidence,
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-jabba", ...sourceIds),
    summary,
    requiredLeaderBaseId: "JABBATHEHUTT",
    keyUnits: [...jabbaUnits],
    keyAbilities: [...jabbaAbilities],
    stages,
    targetPriorities,
    failureRisks,
    evidenceBoundary: "Planet rules and the Jabba mission gate are official; Jabba kit interactions are current-reference. Community evidence is used only where explicitly sourced, and no unsupported clear percentage or deterministic enemy order is generated.",
  });
}

export const ROTE_JABBA_JKCK_STRATEGIES = Object.freeze({
  "zeffo-jkck": Object.freeze({
    id: "zeffo-jkck-v1",
    missionId: "zeffo-jkck",
    title: "Zeffo · Jedi Knight Cal Kestis Combat Mission",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-no-omicron-clear",
    lastVerified: "2026-08-16",
    sources: sources("cg-zeffo", "swgohgg-jkck", "scrybe-zeffo", "kiaowe-jkck-no-omi", "bitdynasty-p3-2025"),
    summary: "Build Jedi Knight Cal Kestis through his Configuration/Impetuous cycle. Whirlwind Slam and Windmill Defense can add Impetuous when switching configurations; at 30 stacks, Impetuous Assault becomes available, instantly defeats its first target that encounter, and in Territory Battles converts into protection-ignoring JKCK attacks plus a large encounter-long ally Offense gain. Community clears explicitly demonstrate the Zeffo mission without JKCK's TB Omicron, so the Omicron is an enhancement rather than a blocker.",
    keyUnits: [{ baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis", importance: "critical", reason: "Mission-mandatory R7 unit and the Configuration/Impetuous engine." }],
    keyAbilities: [
      { baseId: "JEDIKNIGHTCAL", abilityName: "Whirlwind Slam", importance: "high", expected: "Configuration switch, +5 Impetuous, Speed Down, Stun/Armor Shred/Daze and TB Windmill setup", reason: "Board control plus Impetuous development." },
      { baseId: "JEDIKNIGHTCAL", abilityName: "Windmill Defense", importance: "high", expected: "Configuration switch, +5 Impetuous, cleanse, assist and Protection Up", reason: "Sustain/reset plus Impetuous development." },
      { baseId: "JEDIKNIGHTCAL", abilityName: "Impetuous Assault", importance: "critical", expected: "Requires 30 Impetuous; first use instantly defeats target; TB relic-scaled damage and lasting ally Offense", reason: "Decisive TB conversion point." },
    ],
    stages: [
      stage("build", "Opening · build Impetuous", [
        step("whirlwind", "Use Whirlwind Slam when its configuration switch/control package has value; a fresh Double-Bladed switch adds 5 Impetuous.", { priority: "high", ability: "Whirlwind Slam" }),
        step("windmill", "Use Windmill Defense as a cleanse/sustain reset and fresh Dual-Wield switch when appropriate, adding another 5 Impetuous.", { priority: "high", ability: "Windmill Defense" }),
        step("track", "Track Impetuous explicitly and preserve the team until the 30-stack execution window.", { priority: "critical" }),
      ], { objective: "Reach 30 Impetuous without wasting the configuration cycle." }),
      stage("convert", "30 Impetuous · execute and snowball", [
        step("execute", "Use the first Impetuous Assault on the highest-value legal enemy; its first use this encounter instantly defeats the target.", { priority: "critical", ability: "Impetuous Assault" }),
        step("snowball", "After Impetuous Assault, exploit JKCK's TB protection-ignore and the encounter-long ally Offense gain.", { priority: "high" }),
      ], { objective: "Convert setup into a decisive removal and persistent damage advantage." }),
    ],
    targetPriorities: [{ target: "Highest-impact legal enemy", priority: "critical", when: "first Impetuous Assault is ready", reason: "Use the sourced instant defeat where it creates the largest swing; exact spawn order is not fabricated." }],
    failureRisks: ["Treating the TB Omicron as mandatory would incorrectly block proven no-Omicron clears.", "Spending configuration changes without tracking Impetuous delays the 30-stack execution window."],
    evidenceBoundary: "Zeffo's JKCK gate and current TB-specific ability behavior are official/current-reference. Multiple community videos document successful no-Omicron clears, so the Omicron is not a required readiness check.",
  }),

  "felucia-jabba": jabbaPack({
    id: "felucia-jabba",
    title: "Felucia · Jabba the Hutt Combat Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-tested",
    sourceIds: ["egnards-felucia-jabba", "bitdynasty-jabba-p1-p3"],
    summary: "Nysillin Farm gives each acting character a 10% Heal Over Time, +25% Defense and immunity to Buff Immunity while that HoT is active, then Offense Up when it expires; recovery effects are also 20% stronger. Build Jabba's Thermal/Ultimate engine without depending on Crumb's Revenge Buff Immunity while the target is protected by its Nysillin HoT.",
    stages: [
      stage("nysillin", "Opening · exploit recovery without fighting the modifier", [
        step("hot", "Expect the acting unit's Nysillin Heal Over Time and its temporary Buff Immunity immunity.", { priority: "critical" }),
        step("thermal", "Use Jabba's unresistable Thermal Detonators without assuming the Buff Immunity rider will stick through an active HoT.", { priority: "high", ability: "Crumb's Revenge" }),
        step("charge", "Build Contract/Ultimate state while Felucia's stronger recovery helps stabilize the Hutt shell.", { priority: "high" }),
      ], { objective: "Develop Jabba's engine while respecting the temporary defensive state." }),
      stage("ultimate", "Conversion · remove and reset", [step("delete", "Use There Will Be No Bargain when its instant defeat plus full team recovery creates the best swing.", { priority: "critical", ability: "There Will Be No Bargain" })]),
    ],
    failureRisks: ["Relying on Buff Immunity while the target has the Nysillin HoT ignores the official modifier."],
  }),

  "tatooine-jabba": jabbaPack({
    id: "tatooine-jabba",
    title: "Tatooine · Jabba the Hutt Combat Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-tested",
    sourceIds: ["bitdynasty-jabba-p1-p3", "bitdynasty-p3-2025"],
    summary: "Dune Sandstorm applies unavoidable Damage Over Time at the end of every other turn, making this an attrition race that favors Jabba's sustain and Ultimate reset. Build charge/Thermals while preserving the Hutt core, then use There Will Be No Bargain as both a priority-target delete and full Health/Protection reset.",
    stages: [
      stage("sandstorm", "Opening · outlast the DoT cadence", [
        step("unavoidable", "Do not build the plan around resisting Dune Sandstorm; the environmental Damage Over Time cannot be resisted.", { priority: "critical" }),
        step("engine", "Build Jabba's Ultimate/Thermal pressure while keeping the Hutt core intact.", { priority: "high" }),
      ], { objective: "Reach a decisive Ultimate window before attrition compounds." }),
      stage("reset", "Ultimate · delete and recover", [
        step("ultimate", "Use There Will Be No Bargain when its instant defeat and full Health/Protection recovery create the strongest survival swing.", { priority: "critical", ability: "There Will Be No Bargain" }),
        step("cadence", "Continue tracking Sandstorm afterward; the full recovery does not disable future environmental DoTs.", { priority: "high" }),
      ]),
    ],
    failureRisks: ["Cleanse or recovery does not stop Dune Sandstorm from applying its unavoidable DoT again later."],
  }),

  "kessel-jabba": jabbaPack({
    id: "kessel-jabba",
    title: "Kessel · Jabba the Hutt Combat Mission",
    summary: "Confusing Tunnels punishes Special-ability spam. At 1 Confuse a character cannot gain buffs; at 2 it cannot counter, assist or gain bonus Turn Meter; at 3 its Basic increases cooldowns. Because Jabba's team relies on Specials, assists and an Ultimate that normally grants Hutt Cartel bonus Turn Meter, use the granted Clear Head ability before Confuse suppresses a critical tempo window.",
    stages: [
      stage("confuse", "Opening · budget Specials and Confuse", [
        step("track", "Track Confuse separately on every character; each Special adds one stack up to 3.", { priority: "critical" }),
        step("two", "At 2 Confuse, counter/assist/bonus-TM are disabled. Use Clear Head before an important assist or Ultimate follow-up when practical.", { priority: "critical", ability: "Clear Head" }),
        step("three", "At 3 Confuse, a Basic increases cooldowns; clear the stacks instead of accepting a broken cooldown cycle.", { priority: "high", ability: "Clear Head" }),
      ], { objective: "Keep the Hutt assist/TM engine functional." }),
      stage("ultimate", "Ultimate · check Confuse before conversion", [step("delete", "Before There Will Be No Bargain, check whether key Hutt allies are at 2 Confuse and unable to receive its bonus Turn Meter; use Clear Head first when that tempo matters.", { priority: "critical", ability: "Clear Head" })]),
    ],
    failureRisks: ["Blind Special spam can push key Hutt units to 2-3 Confuse and disable assists, bonus Turn Meter or normal cooldown flow.", "Recompute is the ship version of the Confuse-clearing ability; Kessel ground characters use Clear Head."],
  }),

  "vandor-jabba": jabbaPack({
    id: "vandor-jabba",
    title: "Vandor · Jabba the Hutt Combat Mission",
    summary: "Sabacc Shift alternates temporary Health Up/Health Down, while Boxed In gives enemies unpreventable Healing Immunity plus modifier DoTs and summons an indestructible allied Crate. When an enemy damages the Crate it recovers 50% Health and Protection in a way that cannot be prevented and removes the modifier DoTs. Build Jabba's Thermal/Ultimate pressure with that recovery exception in mind.",
    stages: [
      stage("boxed", "Opening · respect the Crate recovery exception", [
        step("crate", "Do not assume Healing Immunity blocks Crate recovery; the 50% Health/Protection recovery explicitly cannot be prevented.", { priority: "critical" }),
        step("thermal", "Layer Jabba's Thermal Detonators on top of Boxed In pressure while building Ultimate charge.", { priority: "high", ability: "Crumb's Revenge" }),
        step("sabacc", "Track Sabacc Shift as Health Up/Health Down state management, not as a dice or attack-roll mechanic.", { priority: "high" }),
      ], { objective: "Maintain pressure through enemy Crate resets." }),
      stage("delete", "Ultimate · bypass the recovery loop", [step("ultimate", "Use There Will Be No Bargain on the most impactful eligible enemy when deleting it is worth more than allowing another recovery cycle.", { priority: "critical", ability: "There Will Be No Bargain" })]),
    ],
    failureRisks: ["Healing Immunity does not stop the Crate's explicitly unpreventable recovery.", "Sabacc Shift is Health Up/Health Down state management; it is not a dice or attack-roll system."],
  }),

  "hoth-jabba": jabbaPack({
    id: "hoth-jabba",
    title: "Hoth · Jabba the Hutt Combat Mission",
    summary: "Hoth combines Frigid Expanse and Bacta Tanks. Every unit gains unavoidable Frostbite at the start of its turn; each stack lowers Critical Chance, Potency and Speed, and 10 stacks defeats the unit. Thermoregulate removes two Frostbite/Overheat stacks. Deadly Storm separately imposes major Critical Chance, Offense and Speed penalties plus start-turn Max-Health damage; Smells Bad on the Outside removes Deadly Storm from self. Jabba's Ultimate fully restores Health/Protection but does not remove Frostbite.",
    stages: [
      stage("cold", "Opening · separate Deadly Storm from Frostbite", [
        step("storm", "Use Smells Bad on the Outside on key characters when removing Deadly Storm's combat penalties is worth the cooldown.", { priority: "critical", ability: "Smells Bad on the Outside" }),
        step("frostbite", "Track Frostbite on every essential Hutt; 10 stacks defeats the unit regardless of current Health/Protection.", { priority: "critical" }),
        step("thermo", "Use Thermoregulate on the ally approaching a dangerous Frostbite threshold; it removes two stacks and is the real stack-control tool.", { priority: "critical", ability: "Thermoregulate" }),
      ], { objective: "Restore functional combat stats while keeping the Hutt core below the Frostbite defeat threshold." }),
      stage("ultimate", "Jabba reset · healing is not Frostbite removal", [
        step("ultimate", "Use There Will Be No Bargain for a decisive delete/full-recovery swing.", { priority: "critical", ability: "There Will Be No Bargain" }),
        step("still-cold", "Continue tracking Frostbite immediately afterward; Health/Protection recovery does not remove the stacks.", { priority: "critical" }),
      ]),
    ],
    failureRisks: ["Full Health/Protection does not protect a unit from the 10-stack Frostbite defeat condition.", "Deadly Storm/Smells Bad on the Outside belongs to Hoth and must never leak into Death Star strategy data."],
  }),
});

export function roteJabbaJkckStrategyForMission(missionId) {
  return ROTE_JABBA_JKCK_STRATEGIES[String(missionId || "")] || null;
}
