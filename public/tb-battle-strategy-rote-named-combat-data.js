const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_NAMED_COMBAT_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission gates and planet modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "swgohgg-mace", label: "SWGOH.GG · Mace Windu current kit", kind: "current-reference", url: "https://swgoh.gg/units/mace-windu/" },
  { id: "swgohgg-younglando", label: "SWGOH.GG · Young Lando Calrissian current kit", kind: "current-reference", url: "https://swgoh.gg/units/young-lando-calrissian/" },
  { id: "swgohgg-gba", label: "SWGOH.GG · Geonosian Brood Alpha current kit", kind: "current-reference", url: "https://swgoh.gg/units/geonosian-brood-alpha/" },
  { id: "swgohgg-aphra", label: "SWGOH.GG · Doctor Aphra current kit", kind: "current-reference", url: "https://swgoh.gg/units/doctor-aphra/" },
  { id: "swgohgg-gi", label: "SWGOH.GG · Grand Inquisitor current kit", kind: "current-reference", url: "https://swgoh.gg/units/grand-inquisitor/" },
  { id: "swgohgg-raddus", label: "SWGOH.GG · Admiral Raddus current kit", kind: "current-reference", url: "https://swgoh.gg/units/admiral-raddus/" },
  { id: "swgohgg-cassian", label: "SWGOH.GG · Cassian Andor current kit", kind: "current-reference", url: "https://swgoh.gg/units/cassian-andor/" },
  { id: "swgohgg-baze", label: "SWGOH.GG · Baze Malbus current kit", kind: "current-reference", url: "https://swgoh.gg/units/baze-malbus/" },
  { id: "bitdynasty-p2-auto", label: "BitDynasty · ROTE Phase 2 autoplay teams", kind: "community-tested", url: "https://swgoh.tv/video/38006-autoplay-most-missions-in-sector-2-geonosis-felucia-bracca-rote-tb-ls-ds-mix-swgoh" },
  { id: "egnards-p2", label: "Egnards · Phase 2 ROTE explained and completed", kind: "community-tested", url: "https://swgoh.tv/video/42051-phase-2-rote-explained-and-completed-geonosis-felucia-bracca-mostly-auto" },
  { id: "bitdynasty-geos", label: "BitDynasty · Geonosis Geonosians mission guide", kind: "community-tested", url: "https://swgoh.tv/video/35454-geonosis-geos-guide-s2-dathomir-merrin-nightsisters-s3-rise-of-the-empire-rote-tb-swgoh" },
  { id: "bitdynasty-p3", label: "BitDynasty · 2025 Phase 3 ROTE testing", kind: "community-tested", url: "https://swgoh.tv/video/45963-phase-3-testing-relic-delta-impact-swgoh-rote-tb" },
  { id: "egnards-p4", label: "Egnards · Phase 4 ROTE explained and completed", kind: "community-tested", url: "https://swgoh.tv/video/44224-phase-4-rote-explained-and-completed-dathomir-kessel-zeffo-lothal-mandalore-mostly-auto" },
  { id: "bitdynasty-malachor", label: "BitDynasty · Malachor Sector 5 Inquisitor testing", kind: "community-tested", url: "https://swgoh.tv/content-creator/bitdynasty?page=13" },
]);

const sources = (...ids) => ROTE_NAMED_COMBAT_SOURCES.filter((source) => ids.includes(source.id));
const official = (...extra) => sources("cg-rote-details", ...extra);

const democracyStages = () => [
  stage("charge", "Build Democracy charge", [
    step("buff-debuff", "Generate buffs and debuffs aggressively: each allied buff gained or enemy debuff inflicted adds 5% Democracy energy to all allies.", { priority: "critical" }),
    step("leader-rule", "Do not rely on a normal instant defeat against the enemy Leader while allies remain; the Coruscant modifier prevents it and holds the Leader above 1% Health.", { priority: "critical" }),
  ], { objective: "Reach a Democracy activation without wasting turns into the protected enemy Leader." }),
  stage("confidence", "Convert charge into No Confidence", [
    step("democracy", "At full charge, use Democracy on the enemy Leader. It resets allied Democracy charge, applies one No Confidence stack and an unavoidable Stun.", { priority: "critical", ability: "Democracy", target: "Enemy Leader" }),
    step("repeat", "Rebuild charge and repeat. At three No Confidence stacks the enemy Leader is instantly defeated, including a Galactic Legend, and allies gain Thunderous Applause.", { priority: "critical", target: "Enemy Leader" }),
  ], { objective: "Win the leader race through the planet mechanic instead of raw damage." }),
];

const endlessRanksStages = ({ leadText = "Use control on the Empire leader and high-pressure Troopers while the revive pool is being stripped." } = {}) => [
  stage("ranks", "Strip Endless Ranks", [
    step("same-target", "When a vulnerable Imperial Trooper is available, repeated defeats of that Trooper efficiently remove one Endless Ranks stack from every Imperial Trooper ally each time it revives.", { priority: "critical" }),
    step("control", leadText, { priority: "high" }),
    step("final-kills", "Once the shared Endless Ranks pool is exhausted, convert the next defeat cycle into permanent kills rather than spreading damage across protected Troopers.", { priority: "critical" }),
  ], { objective: "Turn the shared revive mechanic into a finite stack-removal problem." }),
];

const darkMagickStages = ({ finisher = "Use your strongest controlled damage cycle" } = {}) => [
  stage("timer", "Play around the 10-turn resurrection pulse", [
    step("track-10", "Count the global turn cadence. Every 10 turns, all defeated characters return at 50% Health.", { priority: "critical" }),
    step("avoid-drip", "Avoid creating isolated early kills that simply return at the next Dark Magick pulse unless the kill materially removes immediate pressure.", { priority: "high" }),
    step("control", "Use Stun, cooldown increase, Ability Block or Turn Meter control to keep damaged enemies contained while preparing a synchronized finish.", { priority: "high" }),
  ], { objective: "Enter a post-revive window with multiple enemies ready to be removed together." }),
  stage("wipe", "Finish inside one resurrection window", [
    step("burst", `${finisher} immediately after a Dark Magick pulse or when enough enemies are low to finish the board before the next 10-turn trigger.`, { priority: "critical" }),
  ], { objective: "Prevent a long loop of half-health mass revives." }),
];

const scarifStages = () => [
  stage("pulse", "Respect You May Fire When Ready", [
    step("count", "Track the global 10-turn cadence. Every 10 turns all characters take massive unavoidable damage, so recovery and revive resources should be timed around the pulse rather than spent casually.", { priority: "critical" }),
    step("ranks", "If Imperial Troopers carry Endless Ranks, repeatedly defeat one accessible Trooper to strip the shared revive stacks before final cleanup.", { priority: "high" }),
  ], { objective: "Survive each massive-damage pulse while exhausting the enemy revive pool." }),
  stage("hope", "Rogue One recovery window", [
    step("upload", "With Admiral Raddus, build Upload through Rogue One Specials, Expose damage and Jyn actions rather than delaying the engine.", { priority: "high" }),
    step("hope", "At 100% Upload, use Hope when its full-team revive, full Health/Protection recovery and unavoidable Protection Disruption/Healing Immunity will reset the fight after a dangerous pulse or collapse the enemy board.", { priority: "critical", ability: "Hope" }),
  ], { objective: "Use Rogue One's one-time full reset to answer Scarif's unavoidable damage cycle." }),
];

export const ROTE_NAMED_COMBAT_STRATEGIES = Object.freeze({
  "coruscant-mace-kit": Object.freeze({
    id: "coruscant-mace-kit-v1", missionId: "coruscant-mace-kit", title: "Coruscant · Mace Windu + Kit Fisto Jedi Combat Mission",
    status: "verified-mechanic-core", confidence: "official-modifier-current-kit", lastVerified: "2026-08-16",
    sources: official("swgohgg-mace"),
    summary: "The mandatory Mace Windu + Kit Fisto Jedi core should play Coruscant's Democracy mechanic, not simply race the protected enemy Leader. Buffs and debuffs charge Democracy; each activation applies No Confidence and an unavoidable Stun to the enemy Leader. At three No Confidence stacks that Leader is instantly defeated, including Galactic Legends, and Thunderous Applause turns subsequent Specials into assist calls.",
    keyUnits: [
      { baseId: "MACEWINDU", name: "Mace Windu", importance: "critical", reason: "Officially mandatory R5 Jedi." },
      { baseId: "KITFISTO", name: "Kit Fisto", importance: "critical", reason: "Officially mandatory R5 Jedi." },
    ],
    keyAbilities: [
      { baseId: "MACEWINDU", abilityName: "Smite", importance: "helpful", expected: "Buff dispel plus Shatterpoint Stun/Turn Meter swing", reason: "Useful control while building the Democracy cycle." },
      { baseId: "MACEWINDU", abilityName: "Sense Weakness", importance: "helpful", expected: "Shatterpoint and Galactic Republic Jedi Protection recovery", reason: "Provides control/sustain without replacing the planet mechanic." },
    ],
    stages: democracyStages(), targetPriorities: [{ target: "Enemy Leader", priority: "critical", when: "Democracy reaches full charge", reason: "Three No Confidence applications execute the otherwise protected Leader." }],
    failureRisks: ["Trying to brute-force a protected enemy Leader can waste turns because the modifier prevents normal destroy effects and keeps that Leader above 1% while allies remain."],
    evidenceBoundary: "Mace/Kit entry requirements and Democracy/No Confidence are official; Mace kit interactions are current-reference. No unsupported fixed Jedi trio or enemy spawn order is claimed.",
  }),

  "geonosis-geos": Object.freeze({
    id: "geonosis-geos-v1", missionId: "geonosis-geos", title: "Geonosis · Geonosians Combat Mission",
    status: "community-tested", confidence: "official-modifier-current-kit-community-tested", lastVerified: "2026-08-16",
    sources: official("swgohgg-gba", "bitdynasty-geos"), requiredLeaderBaseId: "GEONOSIANBROODALPHA",
    summary: "Use the standard Geonosian Brood Alpha Hive Mind shell and deliberately exploit Geonosis Arena. Every Special used gives that character a permanent Entertainment stack worth +10% Max Health, Offense and Potency. GBA's Conscription is especially valuable because it cleanses the Geonosians, restores 35% Health/Protection, grants Turn Meter and maintains the Brute while also adding Entertainment to GBA.",
    keyUnits: [{ baseId: "GEONOSIANBROODALPHA", name: "Geonosian Brood Alpha", importance: "critical", reason: "Community-tested leader; Hive Mind, Brute and Conscription are the faction's sustain engine." }],
    keyAbilities: [{ baseId: "GEONOSIANBROODALPHA", abilityName: "Conscription", importance: "high", expected: "Geonosian cleanse, Brute summon/refresh, Turn Meter and 35% Health/Protection recovery", reason: "Primary recovery button and a productive Special for Entertainment stacking." }],
    stages: [stage("entertainment", "Scale through Special abilities", [
      step("specials", "Use Specials when they create real control/sustain value; each user permanently gains another +10% Max Health, Offense and Potency from Entertainment.", { priority: "high" }),
      step("conscription", "Use Conscription when the team needs a cleanse/recovery/Brute reset rather than allowing Hive Mind to collapse around a lost support cycle.", { priority: "critical", ability: "Conscription" }),
      step("hive", "Preserve Brood Alpha: Hive Mind equalization and constant assists are the core reason the faction survives long enough to scale Entertainment.", { priority: "critical" }),
    ], { objective: "Keep Hive Mind intact while the faction's Special users become progressively harder-hitting and tougher." })],
    targetPriorities: [], failureRisks: ["Losing Geonosian Brood Alpha removes the Hive Mind engine and can rapidly collapse the team even if other Geonosians have Entertainment stacks."],
    evidenceBoundary: "The Geonosian gate and Entertainment modifier are official; GBA kit mechanics are current-reference; the GBA-led shell is community-tested. Exact encounter target order remains source-bounded.",
  }),

  "felucia-lando": Object.freeze({
    id: "felucia-lando-v1", missionId: "felucia-lando", title: "Felucia · Young Lando Calrissian Combat Mission",
    status: "community-tested", confidence: "official-modifier-current-kit-community-tested", lastVerified: "2026-08-16",
    sources: official("swgohgg-younglando", "bitdynasty-p2-auto", "egnards-p2"),
    summary: "Young Lando is mandatory, but current community clears pair him with high-end survival shells such as SLKR rather than forcing a pure Prepared squad. Felucia's Nysillin HoT gives +25% Defense and temporary Buff Immunity immunity, then Offense Up on expiry, while all recovery is 20% stronger. Use Young Lando's Dealer's Choice to cleanse/protect the ally who needs it and pass Prepared when it creates a meaningful Speed/tempo window.",
    keyUnits: [
      { baseId: "YOUNGLANDO", name: "Young Lando Calrissian", importance: "critical", reason: "Officially mandatory R6 character." },
      { baseId: "SUPREMELEADERKYLOREN", name: "Supreme Leader Kylo Ren", importance: "helpful", reason: "Community-tested Young Lando mission shell; not an official entry requirement." },
    ],
    keyAbilities: [{ baseId: "YOUNGLANDO", abilityName: "Dealer's Choice", importance: "high", expected: "Target ally cleanse, Stealth/Potency Up, 50% self Turn Meter and Prepared transfer", reason: "Use as a targeted survival/tempo tool rather than an automatic cooldown spend." }],
    stages: [stage("nysillin", "Use Felucia's recovery window", [
      step("hot", "Expect the current actor to gain a 10% Heal Over Time, +25% Defense and immunity to Buff Immunity while the HoT lasts.", { priority: "high" }),
      step("dealer", "Use Dealer's Choice on the ally whose cleanse/Stealth matters most; if Young Lando is Prepared, account for transferring Prepared and granting Speed Up to Prepared allies.", { priority: "high", ability: "Dealer's Choice" }),
      step("shell", "Let the selected carry/survival shell do the heavy lifting; do not force Young Lando to be the primary damage engine simply because he is mandatory.", { priority: "critical" }),
    ], { objective: "Keep the mandatory Young Lando alive while exploiting Felucia's enhanced sustain." })],
    targetPriorities: [], failureRisks: ["Felucia temporarily makes units with Nysillin HoT immune to Buff Immunity; do not build target control around landing Buff Immunity during that state."],
    evidenceBoundary: "Young Lando's R6 gate and Nysillin Farm are official; his Prepared/Dealer's Choice behavior is current-reference; SLKR-style carry shells are community-tested rather than mandatory.",
  }),

  "bracca-jedi": Object.freeze({
    id: "bracca-jedi-v1", missionId: "bracca-jedi", title: "Bracca · Jedi Combat Mission",
    status: "community-tested", confidence: "official-modifier-community-tested", lastVerified: "2026-08-16",
    sources: official("bitdynasty-p2-auto", "egnards-p2"),
    summary: "Bracca is a revive-pool problem. Imperial Troopers begin with shared Endless Ranks stacks; each Trooper defeat removes one stack from all of them before that defeated Trooper revives at 60% Health/Protection. Repeatedly defeating one accessible Trooper therefore strips the shared pool efficiently. Meanwhile Imperial Supremacy can make an Empire-led enemy team ramp damage and mass-assist on Specials, so Jedi control should suppress the leader/high-pressure Special users while the stack pool is burned down.",
    keyUnits: [
      { baseId: "GRANDMASTERLUKE", name: "Jedi Master Luke Skywalker", importance: "helpful", reason: "Common community-tested Bracca Jedi anchor." },
      { baseId: "JEDIKNIGHTLUKE", name: "Jedi Knight Luke Skywalker", importance: "helpful", reason: "Strong Jedi control/damage option for repeated Trooper defeat cycles." },
    ],
    stages: endlessRanksStages({ leadText: "Control the Empire leader and Special-heavy threats because Imperial Supremacy increases Empire damage on Specials and calls the rest of the Empire team to assist." }),
    targetPriorities: [{ target: "Lowest-risk accessible Imperial Trooper", priority: "high", when: "Endless Ranks stacks remain", reason: "Repeated defeats of one target remove a stack from every Imperial Trooper, accelerating exhaustion of the shared revive pool." }],
    failureRisks: ["Spreading damage without actually triggering Trooper defeats does not reduce the shared Endless Ranks stack pool."],
    evidenceBoundary: "Bracca's Jedi gate, Endless Ranks and Imperial Supremacy are official; Jedi GL/control shells are community-tested. No single leader is marked mandatory.",
  }),

  "dathomir-empire": Object.freeze({
    id: "dathomir-empire-v1", missionId: "dathomir-empire", title: "Dathomir · Empire Combat Mission",
    status: "community-tested", confidence: "official-modifier-community-tested", lastVerified: "2026-08-16",
    sources: official("bitdynasty-p3"),
    summary: "Dathomir revives every defeated character at 50% Health every 10 turns. Empire teams should therefore control and soften the board, avoid a slow trickle of isolated kills, and then compress final defeats into one post-revive window. Current ROTE testing continues to clear the Empire mission, but the pack deliberately does not force one Empire leader because several high-end Empire shells can satisfy the gate.",
    keyUnits: [], keyAbilities: [], stages: darkMagickStages({ finisher: "Use the Empire squad's strongest AOE, assist or Turn Meter-control burst" }),
    targetPriorities: [], failureRisks: ["A long sequence of isolated kills can loop indefinitely when Dark Magick revives the board every 10 turns."],
    evidenceBoundary: "The Empire R7 gate and 10-turn Dark Magick mass revive are official; current Phase 3 testing validates Empire clears without proving one universally required composition.",
  }),

  "dathomir-aphra": Object.freeze({
    id: "dathomir-aphra-v1", missionId: "dathomir-aphra", title: "Dathomir · Doctor Aphra Combat Mission",
    status: "community-tested", confidence: "official-modifier-current-kit-community-tested", lastVerified: "2026-08-16",
    sources: official("swgohgg-aphra", "bitdynasty-p3"), requiredLeaderBaseId: "DOCTORAPHRA",
    summary: "Use Aphra's cooldown/debuff/Siphon engine to control the board while tracking Dathomir's 10-turn mass revive. Rogue Archaeology can raise enemy cooldowns and establish Doubt; the Aphra/BT-1/0-0-0 core gains Turn Meter from debuff activity. Build that control and damage engine, then time the board wipe after a Dark Magick resurrection pulse instead of feeding the enemy repeated 50%-Health revives.",
    keyUnits: [
      { baseId: "DOCTORAPHRA", name: "Doctor Aphra", importance: "critical", reason: "Officially mandatory R7 unit and sourced strategy leader." },
      { baseId: "BT1", name: "BT-1", importance: "helpful", reason: "Canonical Aphra damage partner and beneficiary of her Dark Side Droid engine." },
      { baseId: "TRIPLEZERO", name: "0-0-0", importance: "helpful", reason: "Canonical Aphra control partner." },
    ],
    keyAbilities: [
      { baseId: "DOCTORAPHRA", abilityName: "Rogue Archaeology", importance: "high", expected: "AOE cooldown increase, Doubt and Siphon", reason: "Suppress enemy turns while the team prepares a synchronized finish." },
      { baseId: "DOCTORAPHRA", abilityName: "Dangerous Tech", importance: "high", expected: "Dark Side support, Droid recovery and revive interactions", reason: "Preserve the Droid engine through a long Dark Magick cycle." },
    ],
    stages: darkMagickStages({ finisher: "Use Aphra's controlled Droid burst and debuff/TM engine" }), targetPriorities: [],
    failureRisks: ["Dark Magick can undo early single-target progress; Aphra's control should be used to synchronize the final defeats rather than merely extend the fight."],
    evidenceBoundary: "Aphra's R7 gate and Dark Magick are official; Aphra kit behavior is current-reference; Phase 3 Aphra clears are community-tested and no fixed spawn order is fabricated.",
  }),

  "lothal-jedi": Object.freeze({
    id: "lothal-jedi-v1", missionId: "lothal-jedi", title: "Lothal · Jedi Combat Mission",
    status: "community-tested", confidence: "official-modifier-community-tested", lastVerified: "2026-08-16",
    sources: official("egnards-p4"),
    summary: "Lothal rewards Jedi teams that already use Specials and assists. Every Special used on the character's turn calls a random ally to assist; every out-of-turn attack adds Rebellious, giving +2% Critical Chance and Critical Damage per stack and another +30% Offense at 20 stacks. When Endless Ranks appears, repeated Trooper defeats strip the shared revive pool. Preserve assist-producing Specials for productive damage/control windows rather than firing them blindly into protected Troopers.",
    keyUnits: [
      { baseId: "GRANDMASTERLUKE", name: "Jedi Master Luke Skywalker", importance: "helpful", reason: "Common high-end Jedi anchor that can leverage repeated Jedi actions and assists." },
      { baseId: "JEDIKNIGHTLUKE", name: "Jedi Knight Luke Skywalker", importance: "helpful", reason: "Strong control/damage option for the Endless Ranks cycle." },
    ],
    stages: [
      stage("rebellious", "Build Rebellious through productive Specials", [
        step("special-assist", "Each on-turn Special calls a random other ally to assist. Use Specials when the assist and the Special itself advance control or a real kill window.", { priority: "high" }),
        step("stacks", "Out-of-turn attacks build Rebellious; at 20 stacks that attacker has the full Critical Chance/Critical Damage scaling plus 30% extra Offense.", { priority: "high" }),
      ], { objective: "Let the planet modifier amplify a normal Jedi control/assist cycle." }),
      ...endlessRanksStages(),
    ],
    targetPriorities: [{ target: "Accessible Imperial Trooper", priority: "high", when: "Endless Ranks is active", reason: "Repeated defeats burn the shared revive pool." }],
    failureRisks: ["Spending every Special immediately can waste the random assist into an unproductive target or leave key control cooldowns unavailable after Troopers exhaust Endless Ranks."],
    evidenceBoundary: "The Jedi R8 gate, Rebellious and Endless Ranks are official; community Phase 4 testing validates Jedi clears without proving one mandatory Jedi leader.",
  }),

  "malachor-inqs": Object.freeze({
    id: "malachor-inqs-v1", missionId: "malachor-inqs", title: "Malachor · Eighth + Fifth + Seventh Sister Combat Mission",
    status: "community-tested", confidence: "official-modifier-current-kit-community-tested", lastVerified: "2026-08-16",
    sources: official("swgohgg-gi", "bitdynasty-malachor"),
    summary: "The R9 mission requires Eighth Brother, Fifth Brother and Seventh Sister. Drain Essence transfers 25% of every other ally's Max Health/Protection into Offense for the acting unit and grants a bonus turn, so the planet itself creates burst windows at a durability cost. Rebel enemies can become Cornered below 40% Health, gaining +30% Offense and calling a random Rebel assist whenever they use an ability; if healed above 70%, Cornered is removed but they gain stacking permanent Offense. Push Purge/control aggressively and finish low-health Rebels instead of repeatedly letting them cycle across the Cornered thresholds.",
    keyUnits: [
      { baseId: "EIGHTHBROTHER", name: "Eighth Brother", importance: "critical", reason: "Official mandatory R9 unit." },
      { baseId: "FIFTHBROTHER", name: "Fifth Brother", importance: "critical", reason: "Official mandatory R9 unit." },
      { baseId: "SEVENTHSISTER", name: "Seventh Sister", importance: "critical", reason: "Official mandatory R9 unit." },
      { baseId: "GRANDINQUISITOR", name: "Grand Inquisitor", importance: "helpful", reason: "Strong Inquisitorius Purge engine when available; not an official mission requirement." },
    ],
    stages: [
      stage("essence", "Use Drain Essence as a burst resource", [
        step("cost", "Remember that Drain Essence strips Max Health/Protection from the other allies to feed the acting unit Offense and a bonus turn; do not treat the bonus action as free durability.", { priority: "high" }),
        step("purge", "Use Inquisitorius Purge and control to suppress the Rebel turn cycle before pushing multiple enemies into Cornered simultaneously.", { priority: "critical" }),
      ], { objective: "Create a controlled burst without leaving the mandatory trio too fragile." }),
      stage("cornered", "Finish Cornered Rebels", [
        step("below40", "When a Rebel drops below 40% and gains Cornered, prioritize finishing or controlling that unit; Cornered adds 30% Offense and a random Rebel assist on ability use.", { priority: "critical" }),
        step("heal-threshold", "Do not intentionally let a dangerous Rebel bounce repeatedly above 70% Health: removing Cornered that way also grants 10% permanent Offense, stacking to 50%.", { priority: "high" }),
      ], { objective: "Prevent the enemy from converting health-threshold cycling into escalating Rebel offense." }),
    ],
    targetPriorities: [{ target: "Current Cornered Rebel", priority: "critical", when: "below 40% Health", reason: "Leaving a Cornered Rebel active increases offense and creates extra Rebel assists." }],
    failureRisks: ["Ignoring Drain Essence's allied Max-Health/Protection cost can leave the mandatory Inquisitors vulnerable even while their damage rises.", "Repeatedly healing an enemy Rebel above 70% can remove Cornered but permanently stack that Rebel's Offense."],
    evidenceBoundary: "The mandatory R9 trio, Drain Essence and Cornered rules are official; current Inquisitor kit context and recent Malachor testing support the Purge/control approach. No unsupported fixed five-unit team is required.",
  }),

  "kafrene-cassian": Object.freeze({
    id: "kafrene-cassian-v1", missionId: "kafrene-cassian", title: "Ring of Kafrene · Cassian Andor + K-2SO Combat Mission",
    status: "verified-mechanic-core", confidence: "official-modifier-current-kit", lastVerified: "2026-08-16",
    sources: official("swgohgg-raddus", "swgohgg-cassian"),
    summary: "Cassian Andor and K-2SO are mandatory at R9. Critical Intel secretly marks one ally and one enemy as Informants; critical hits reveal them. The first Informant defeated gives the surviving Informant's entire team a large Armor Penetration/Critical Chance/Critical Damage/Speed package, so once the enemy Informant is revealed, remove it while protecting your own revealed Informant. Admiral Raddus is a natural Rogue One flex because the mandatory pair advance his Upload engine and Hope provides a one-time full-team revive/recovery reset.",
    keyUnits: [
      { baseId: "CASSIANANDOR", name: "Cassian Andor", importance: "critical", reason: "Official mandatory R9 Rogue One unit." },
      { baseId: "K2SO", name: "K-2SO", importance: "critical", reason: "Official mandatory R9 Rogue One unit." },
      { baseId: "ADMIRALRADDUS", name: "Admiral Raddus", importance: "helpful", reason: "Synergistic Rogue One flex with Upload/Hope; not officially mandatory." },
    ],
    stages: [
      stage("intel", "Reveal and win the Informant race", [
        step("crit-scout", "Use safe critical-hit opportunities across priority enemies until the enemy Informant is revealed; a critical hit is the reveal trigger.", { priority: "high" }),
        step("protect-own", "If your own Informant becomes revealed, preserve that ally. The first Informant death awards the major team buff to the still-active Informant's side.", { priority: "critical" }),
        step("enemy-informant", "Once the enemy Informant is known, focus it if doing so lets your surviving Informant trigger the allied Critical Intel reward.", { priority: "critical", target: "Enemy Informant" }),
      ], { objective: "Be the side whose Informant remains active after the first Informant defeat." }),
      stage("rogue", "Rogue One reset", [
        step("upload", "With Admiral Raddus, use Rogue One Specials/Expose interactions to build Upload toward Hope.", { priority: "helpful" }),
        step("hope", "Use Hope at 100% when its team revive/full recovery and unavoidable Protection Disruption/Healing Immunity create the decisive recovery or closeout window.", { priority: "helpful", ability: "Hope" }),
      ]),
    ],
    targetPriorities: [{ target: "Enemy Informant", priority: "critical", when: "revealed and your Informant is still active", reason: "Its defeat awards the surviving Informant's team the Critical Intel combat bonuses." }],
    failureRisks: ["Killing your own revealed Informant first can hand the enemy team the Critical Intel stat package."],
    evidenceBoundary: "Cassian/K-2SO R9 entry and Critical Intel are official; Cassian/Raddus kit interactions are current-reference. Raddus is a recommended flex, not an official mission gate.",
  }),

  "scarif-baze": Object.freeze({
    id: "scarif-baze-v1", missionId: "scarif-baze", title: "Scarif · Baze + Chirrut + Scarif Rebel Pathfinder Combat Mission",
    status: "verified-mechanic-core", confidence: "official-modifier-current-kit", lastVerified: "2026-08-16",
    sources: official("swgohgg-baze", "swgohgg-raddus"),
    summary: "Baze, Chirrut and Scarif Rebel Pathfinder are mandatory R9s. Scarif deals massive unavoidable damage to every character every 10 turns and can also field Imperial Troopers with Endless Ranks. Use the mandatory trio's Rogue One/Rebel Fighter sustain plus two flex slots to survive each pulse; Admiral Raddus + Jyn is a high-value Rogue One completion because Hope can revive the entire team and restore full Health/Protection after a dangerous pulse.",
    keyUnits: [
      { baseId: "BAZEMALBUS", name: "Baze Malbus", importance: "critical", reason: "Official mandatory R9 unit; tank, dispel and Chirrut interaction." },
      { baseId: "CHIRRUTIMWE", name: "Chirrut Îmwe", importance: "critical", reason: "Official mandatory R9 unit and Baze sustain partner." },
      { baseId: "SCARIFREBEL", name: "Scarif Rebel Pathfinder", importance: "critical", reason: "Official mandatory R9 Rebel Fighter." },
      { baseId: "ADMIRALRADDUS", name: "Admiral Raddus", importance: "helpful", reason: "Strong Rogue One flex whose Hope can answer Scarif's massive-damage pulse." },
      { baseId: "JYNERSO", name: "Jyn Erso", importance: "helpful", reason: "Raddus synergy and fast Upload contribution when using the Rogue One flex package." },
    ],
    stages: scarifStages(), targetPriorities: [{ target: "Accessible Imperial Trooper", priority: "high", when: "Endless Ranks is active", reason: "Repeated defeats exhaust the shared Trooper revive pool." }],
    failureRisks: ["Ignoring the 10-turn massive-damage pulse can wipe a healthy-looking team before normal sustain cooldowns are available."],
    evidenceBoundary: "The mandatory three-unit core, massive-damage pulse and Endless Ranks are official; Baze/Raddus kit interactions are current-reference. Raddus/Jyn are recommended flexes, not official requirements.",
  }),

  "scarif-cassian": Object.freeze({
    id: "scarif-cassian-v1", missionId: "scarif-cassian", title: "Scarif · Cassian + Pao + K-2SO Combat Mission",
    status: "verified-mechanic-core", confidence: "official-modifier-current-kit", lastVerified: "2026-08-16",
    sources: official("swgohgg-cassian", "swgohgg-raddus"),
    summary: "Cassian Andor, Pao and K-2SO are mandatory R9s. Treat Scarif as a timed survival fight: every 10 turns all characters take massive unavoidable damage, while Endless Ranks can force repeated Imperial Trooper defeats. Admiral Raddus and Jyn naturally fill the two open slots in a Rogue One-oriented version; build Upload aggressively so Hope is available as a one-time revive/full-recovery response to the pulse and as a Protection Disruption closeout tool.",
    keyUnits: [
      { baseId: "CASSIANANDOR", name: "Cassian Andor", importance: "critical", reason: "Official mandatory R9 unit." },
      { baseId: "PAO", name: "Pao", importance: "critical", reason: "Official mandatory R9 unit." },
      { baseId: "K2SO", name: "K-2SO", importance: "critical", reason: "Official mandatory R9 unit." },
      { baseId: "ADMIRALRADDUS", name: "Admiral Raddus", importance: "helpful", reason: "Natural Rogue One flex with the Hope reset." },
      { baseId: "JYNERSO", name: "Jyn Erso", importance: "helpful", reason: "Raddus synergy and Upload acceleration." },
    ],
    stages: scarifStages(), targetPriorities: [{ target: "Accessible Imperial Trooper", priority: "high", when: "Endless Ranks is active", reason: "Repeated defeats burn the shared revive pool." }],
    failureRisks: ["Using Hope too early can leave no full-team reset available after a later Scarif massive-damage pulse."],
    evidenceBoundary: "The mandatory Cassian/Pao/K-2SO core, Scarif pulse and Endless Ranks are official; Cassian/Raddus kit interactions are current-reference. Flex recommendations are explicitly advisory.",
  }),
});

export function roteNamedCombatStrategyForMission(missionId) {
  return ROTE_NAMED_COMBAT_STRATEGIES[String(missionId || "")] || null;
}
