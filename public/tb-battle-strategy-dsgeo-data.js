import { WAT_BATTLE_STRATEGY } from "./tb-battle-strategy-wat-data.js";
import { roteJabbaJkckStrategyForMission } from "./tb-battle-strategy-rote-jabba-jkck-data.js";

const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const DS_GEO_STRATEGY_SOURCES = Object.freeze([
  { id: "swgohgg-ds-geo", label: "SWGOH.GG · Geonosis: Separatist Might", kind: "current-reference", url: "https://swgoh.gg/territory-battles/t03D/" },
  { id: "swgohwiki-ds-geo", label: "SWGOH Wiki · Geonosis Separatist Might", kind: "current-reference", url: "https://swgoh.wiki/wiki/Geonosis_Separatist_Might" },
  { id: "swgohgg-nute", label: "SWGOH.GG · Nute Gunray current kit and TB mission listing", kind: "current-reference", url: "https://swgoh.gg/units/nute-gunray/" },
  { id: "swgohgg-b2", label: "SWGOH.GG · B2 Super Battle Droid current kit and TB mission listing", kind: "current-reference", url: "https://swgoh.gg/units/b2-super-battle-droid/" },
  { id: "swgohtv-p1-nute", label: "McMole2 · DS Geo Phase 1 Canyons special-mission guide", kind: "community-tested", url: "https://swgoh.tv/" },
  { id: "ea-acklay-thread", label: "EA Forums · Acklay mission control discussion", kind: "community-tested", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/acklay-mission/4327356" },
  { id: "ea-acklay-guide", label: "EA Forums · DS Geo P2 Acklay Special Mission guide", kind: "community-tested", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/swgoh---ds-geo-tb-phase-2---special-mission-guide---squash-the-acklay/4466877" },
  { id: "swgohtv-acklay", label: "SWGOH.TV · Acklay Special Mission guide", kind: "community-tested", url: "https://www.swgoh.tv/video/572-how-to-beat-the-acklay-special-mission-guide-win-with-all-geonosians-alive-galaxy-of-heroes" },
  { id: "swgohgg-dooku", label: "SWGOH.GG · Count Dooku current kit and DS Geo mission listings", kind: "current-reference", url: "https://swgoh.gg/units/count-dooku/" },
  { id: "swgohgg-asajj", label: "SWGOH.GG · Asajj Ventress current kit and DS Geo mission listing", kind: "current-reference", url: "https://swgoh.gg/units/asajj-ventress/" },
  { id: "swgohtv-dooku-p4", label: "BitDynasty · Phase 4 Dooku Combat Mission testing", kind: "community-tested", url: "https://swgoh.tv/video/22784-defeating-phase-4-dooku-combat-mission-ds-geo-tb-swgoh" },
  { id: "swgohtv-p4-full", label: "BitDynasty · Phase 4 DS Geo special/combat mission full-clear testing", kind: "community-tested", url: "https://swgoh.tv/video/22816-phase-4-special-combat-missions-full-clear-ds-geo-tb-swgoh" },
  { id: "ea-wat-p4", label: "EA Forums · Phase 4 Wat Special Mission after Wat changes", kind: "community-tested", url: "https://forums.ea.com/discussions/swgoh-strategy-and-tips-en/ds-geo-tb-p4-wat-special-mission-after-wat-changes/4533625" },
  { id: "swgohtv-wat-p4", label: "BitDynasty · Phase 4 Wat Special Mission guide", kind: "community-tested", url: "https://swgoh.tv/video/29930-best-team-phase-4-wat-special-mission-guide-ds-geo-tb-sm-p4-swgoh" },
  { id: "ea-wat-kit", label: "Capital Games · Wat Tambor kit reveal", kind: "official", url: "https://forums.ea.com/discussions/swgoh-strategy-and-tips-en/kit-reveal-wat-tambor/3746850" },
  { id: "cg-jabba-existing-tb", label: "Capital Games · Jabba missions added to Dark Side Hoth and Geonosis", kind: "official", url: "https://swgoh.gg/news/update-10122022/" },
  { id: "swgohgg-jabba", label: "SWGOH.GG · Jabba the Hutt current unit and Territory Battle missions", kind: "current-reference", url: "https://swgoh.gg/units/jabba-the-hutt/" },
]);

const source = (id) => DS_GEO_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

const P1_NUTE = Object.freeze({
  id: "s1-nute-separatists-v1",
  missionId: "s1",
  title: "Canyons · Nute Gunray Separatist Special Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgohgg-ds-geo", "swgohwiki-ds-geo", "swgohgg-nute", "swgohgg-b2", "swgohtv-p1-nute"),
  summary: "The current mission listings establish Nute Gunray, B1 Battle Droid, B2 Super Battle Droid and Droideka as the verified Phase 1 Canyons special-mission core. The tested approach uses Nute lead to establish Extortion/control, B1 to keep the droid shell functioning, B2 to strip buffs and apply Buff Immunity, and Droideka as burst/protection pressure. MagnaGuard is a tested fifth, not encoded as a mandatory portrait gate.",
  requiredLeaderBaseId: "NUTEGUNRAY",
  keyUnits: [
    { baseId: "NUTEGUNRAY", name: "Nute Gunray", importance: "critical", reason: "Current mission listing and tested guide identify Nute as the mission lead/core." },
    { baseId: "B1BATTLEDROIDV2", name: "B1 Battle Droid", importance: "critical", reason: "Current mission listing places B1 in this special mission; B1 is the sustain/assist backbone of the tested droid shell." },
    { baseId: "B2SUPERBATTLEDROID", name: "B2 Super Battle Droid", importance: "critical", reason: "Current mission listing places B2 in this special mission; mass dispel/Buff Immunity controls enemy buff engines." },
    { baseId: "DROIDEKA", name: "Droideka", importance: "critical", reason: "Current mission listing places Droideka in this special mission; it supplies protected burst windows." },
    { baseId: "MAGNAGUARD", name: "IG-100 MagnaGuard", importance: "helpful", reason: "Community-tested fifth slot that adds tank/control value; not asserted as a hard mission-entry portrait gate." },
  ],
  keyAbilities: [
    { baseId: "NUTEGUNRAY", abilityName: "Dubious Dealings", importance: "critical", expected: "Extortion pressure and control", reason: "Get the Extortion engine running rather than treating Nute as a passive leader." },
    { baseId: "NUTEGUNRAY", abilityName: "Motivate", importance: "high", expected: "Enemy buff dispel, cooldown pressure and assist interaction against Extorted targets", reason: "Use after the board is set up so the control/assist value is not wasted." },
    { baseId: "B2SUPERBATTLEDROID", abilityName: "Mow Down", importance: "high", expected: "AOE dispel and Buff Immunity pressure", reason: "Use against enemy buff/taunt states that block the mission's damage plan." },
  ],
  stages: [
    stage("opening", "Opening · establish Nute control", [
      step("extortion", "Open by establishing Nute's Extortion/control engine on a useful enemy rather than spending the first turns in a raw damage race.", { priority: "critical", ability: "Dubious Dealings" }),
      step("protect-b1", "Keep B1's stack/sustain engine healthy; avoid sacrificing the team's long-fight recovery for low-value early damage.", { priority: "high", target: "B1 Battle Droid" }),
      step("b2-control", "Use B2's mass control when enemy buffs, taunts or protection mechanics materially obstruct your priority target.", { priority: "high", ability: "Mow Down" }),
    ], { objective: "Build the Separatist control/sustain engine before committing the team's burst resources." }),
    stage("wave-loop", "Each wave · control then burst", [
      step("scan-threat", "Identify the enemy whose next special, heal, revive or AoE most threatens the droid engine and control that unit first.", { priority: "critical" }),
      step("nute-cycle", "Cycle Extortion and Nute control into high-impact enemies so Motivate and the Separatist assist engine gain value.", { priority: "high" }),
      step("droideka-window", "Use Droideka's protected burst window against the priority enemy after taunts/buffs are handled instead of spending it into low-value targets.", { priority: "high", target: "Priority threat" }),
    ], { objective: "Remove the enemy action that can break B1/B2 sustain, then convert the controlled board into damage." }),
    stage("transition", "Wave transition · preserve the engine", [
      step("cooldowns", "Before finishing a wave, avoid unnecessary specials if the board is safe so Nute/B2 control tools enter the next wave available.", { priority: "high" }),
      step("fifth-slot", "Treat the fifth Separatist as tactical support. MagnaGuard is the tested default in the sourced guide; do not display it as a mandatory mission gate.", { priority: "info" }),
    ], { objective: "Enter the next wave with control tools and the droid sustain engine intact." }),
  ],
  targetPriorities: [
    { target: "Enemy healer / revive / high-impact AoE threat", priority: "critical", when: "at the start of each wave", reason: "The tested shell wins by preserving the droid engine and preventing the enemy action that can break it." },
    { target: "Extorted priority enemy", priority: "high", when: "after Nute establishes Extortion", reason: "Concentrate Nute's control/assist value into a target that matters." },
  ],
  failureRisks: [
    "Treating MagnaGuard as a verified mandatory portrait would overstate the current entry evidence; it remains a tested fifth-slot recommendation.",
    "Losing B1 early removes much of the droid shell's sustain and can turn later waves into an attrition failure.",
    "Spending B2 mass control or Droideka burst before the real wave threat is identified can leave the team without the correct response.",
  ],
  evidenceBoundary: "The Phase 1 Canyons special-mission reward and Separatist gate are current-reference facts. Current unit mission listings establish Nute Gunray, B1 Battle Droid, B2 Super Battle Droid and Droideka in this mission. Nute lead and MagnaGuard as the fifth slot are community-tested guidance; no universal enemy spawn order or win percentage is asserted.",
});

const ACKLAY = Object.freeze({
  id: "s2-acklay-v1",
  missionId: "s2",
  title: "Petranaki Arena · Acklay Special Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgohgg-ds-geo", "swgohwiki-ds-geo", "ea-acklay-thread", "ea-acklay-guide", "swgohtv-acklay"),
  summary: "The Phase 2 Petranaki Arena Geonosian special mission is the Acklay encounter. The tested control core is to cancel Acklay's Enrage immediately when the mission action permits it, then prevent Jedi AoE turns with Ability Block or priority kills while preserving the Geonosian Brood Alpha/Hive Mind sustain engine and steadily damaging Acklay.",
  requiredLeaderBaseId: "GEONOSIANBROODALPHA",
  keyUnits: [
    { baseId: "GEONOSIANBROODALPHA", name: "Geonosian Brood Alpha", importance: "critical", reason: "The tested team is built around Hive Mind, health/protection equalization, Brute, and the Geo assist engine." },
    { baseId: "POGGLETHELESSER", name: "Poggle the Lesser", importance: "critical", reason: "Ability Block is the primary control tool against dangerous Jedi AoE attackers." },
    { baseId: "GEONOSIANSOLDIER", name: "Geonosian Soldier", importance: "high", reason: "Tenacity Down improves the reliability of important debuffs before Poggle control attempts." },
    { baseId: "GEONOSIANSPY", name: "Geonosian Spy", importance: "high", reason: "Spy supplies the team's concentrated burst when a safe Acklay or Jedi kill window opens." },
    { baseId: "SUNFAC", name: "Sun Fac", importance: "high", reason: "Tank and dispel utility helps keep the swarm intact through the long encounter." },
  ],
  keyAbilities: [
    { baseId: "POGGLETHELESSER", abilityName: "Martial Doom", importance: "critical", expected: "Ability Block", reason: "Keep the Jedi capable of dangerous AoE specials from taking those turns while Acklay is being managed." },
    { baseId: "GEONOSIANSOLDIER", abilityName: "Aggressive Advance", importance: "high", expected: "Tenacity Down", reason: "Use Tenacity Down setup before important Ability Block attempts when practical." },
    { baseId: "GEONOSIANBROODALPHA", abilityName: "Conscription", importance: "high", expected: "Cleanse, Brute summon and team sustain", reason: "Hold this as a recovery/reset tool when the Geo engine is under pressure instead of spending it without need." },
    { baseId: "GEONOSIANSPY", abilityName: "Silent Strike", importance: "high", expected: "High single-target burst", reason: "Use burst on the current run-ending Jedi threat or Acklay when the board is controlled." },
  ],
  stages: [
    stage("enrage-control", "Opening · cancel Acklay Enrage", [
      step("read-enrage", "Check Acklay's Enrage state before committing normal attacks. Community-tested guidance consistently treats removing/cancelling Enrage as the first mission priority.", { priority: "critical", target: "Acklay" }),
      step("cancel-enrage", "Use the mission-provided Enrage-removal/cancellation action as soon as it is legally available. Do not invent a normal Geo ability as the Enrage remover; it is encounter control.", { priority: "critical", target: "Acklay" }),
      step("stabilize", "After Enrage is under control, preserve Brute/Hive Mind and avoid spending the full burst package until the dangerous Jedi specials are also controlled.", { priority: "high" }),
    ], { objective: "Prevent the Acklay's Enraged damage window from deciding the run before the Geo engine stabilizes." }),
    stage("jedi-control", "Arena adds · suppress AoE threats", [
      step("scan-aoe", "Identify the Jedi reinforcement most capable of a damaging AoE or other run-ending special before selecting the next target.", { priority: "critical" }),
      step("tenacity-down", "When practical, land Geonosian Soldier's Tenacity Down before the important Poggle control attempt.", { priority: "high", ability: "Aggressive Advance" }),
      step("block-or-kill", "Ability Block the dangerous AoE Jedi with Poggle or remove that Jedi outright before returning full attention to Acklay.", { priority: "critical", ability: "Martial Doom" }),
      step("repeat-control", "Re-scan replacement Jedi as they enter. The encounter is a repeated control loop, not a pure Acklay damage race.", { priority: "critical" }),
    ], { objective: "Prevent Jedi AoE turns from deleting multiple Geonosians while the boss fight continues." }),
    stage("acklay-damage", "Damage windows · work Acklay down", [
      step("safe-burst", "When Enrage is cancelled and the active Jedi AoE threat is controlled, commit Spy burst and the Geo assist engine into Acklay.", { priority: "high", target: "Acklay", ability: "Silent Strike" }),
      step("protect-engine", "If protection or debuff pressure threatens the swarm, use Conscription/Brute recovery before forcing another damage window.", { priority: "high", ability: "Conscription" }),
      step("do-not-greed", "If Enrage or an uncontrolled AoE threat returns, leave the damage race and rebuild control first.", { priority: "critical" }),
    ], { objective: "Convert controlled windows into boss damage without sacrificing the Geo swarm." }),
  ],
  targetPriorities: [
    { target: "Acklay Enrage state", priority: "critical", when: "opening and whenever Enrage returns", reason: "Community-tested guidance repeatedly identifies cancelling Enrage as the first survival requirement." },
    { target: "Jedi AoE attacker", priority: "critical", when: "when an AoE special is available or approaching", reason: "Repeated community reports identify uncontrolled Jedi AoE attacks as a principal cause of failed runs." },
    { target: "Acklay", priority: "high", when: "Enrage is cancelled and Jedi specials are controlled", reason: "Use safe windows for concentrated boss damage rather than ignoring the encounter control loop." },
  ],
  failureRisks: [
    "Starting the damage race while Acklay remains Enraged can cause an early wipe.",
    "Ignoring the Jedi adds can allow an AoE attacker to remove multiple Geonosians even when Acklay control is correct.",
    "Spending Poggle control or Spy burst on low-impact targets can leave the next AoE or boss window unmanaged.",
    "This mission contains meaningful RNG; the strategy is a tested control framework, not a guaranteed clear rate.",
  ],
  evidenceBoundary: "The Phase 2 Petranaki Arena Geonosian special mission and reward are current-reference facts. Enrage cancellation plus Jedi AoE suppression is repeatedly community-tested guidance from EA Forum and SWGOH.TV sources. The pack does not claim a guaranteed win percentage, exact enemy spawn order, or a universal turn-by-turn script.",
});

const P2_DOOKU_ASAJJ = Object.freeze({
  id: "c8-dooku-asajj-v1",
  missionId: "c8",
  title: "Separatist Command · Count Dooku + Asajj Ventress Combat Mission",
  status: "current-entry-partial-strategy",
  confidence: "current-entry-partial",
  lastVerified: "2026-08-16",
  sources: sources("swgohgg-ds-geo", "swgohgg-dooku", "swgohgg-asajj"),
  summary: "Current unit mission listings establish Count Dooku and Asajj Ventress in this Phase 2 combat mission. The app can therefore enforce the entry core, but this pack intentionally remains partial until wave-specific enemy sequencing is independently re-tested.",
  keyUnits: [
    { baseId: "COUNTDOOKU", name: "Count Dooku", importance: "critical", reason: "Current mission listing places Dooku in this Phase 2 combat mission." },
    { baseId: "ASAJVENTRESS", name: "Asajj Ventress", importance: "critical", reason: "Current mission listing places Asajj in this Phase 2 combat mission." },
  ],
  keyAbilities: [
    { baseId: "COUNTDOOKU", abilityName: "Force Lightning", importance: "high", expected: "Shock/Stun control", reason: "Preserve Dooku's control for a high-impact Galactic Republic or support target rather than spending it blindly." },
  ],
  stages: [
    stage("entry-core", "Entry core · Dooku + Asajj", [
      step("verify-core", "Enter with both Count Dooku and Asajj Ventress clearing the mission's progression gate; do not substitute one of them based only on a generic Separatist recommendation.", { priority: "critical" }),
      step("adaptive-control", "Use Dooku's Stun/Shock and Asajj's control/damage reactively against the highest-impact enemy while wave-specific sequencing remains under verification.", { priority: "high" }),
    ], { objective: "Use the verified required pair without presenting an unverified exact wave script." }),
  ],
  targetPriorities: [{ target: "Highest-impact support / AoE threat", priority: "high", when: "each wave", reason: "Exact enemy order is intentionally left adaptive until this mission is re-tested against the current encounter." }],
  failureRisks: ["Treating a current entry correction as a fully verified battle rotation would overstate the evidence."],
  evidenceBoundary: "Dooku and Asajj participation is grounded in current SWGOH.GG mission listings. Exact wave-by-wave target order, fifth-slot composition and minimum battle stats remain under verification, so this strategy stays partial and must not be labelled verified strategy available.",
});

const WAT = Object.freeze({
  ...WAT_BATTLE_STRATEGY,
  id: "s3-wat-v2",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  evidenceBoundary: `${WAT_BATTLE_STRATEGY.evidenceBoundary} The pack is considered strategy-covered because multiple independent tested guides support the control loop; covered does not mean deterministic or guaranteed.`,
});

const P4_DOOKU = Object.freeze({
  id: "c21-dooku-v1",
  missionId: "c21",
  title: "Count Dooku's Hangar · Dooku Separatist Combat Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgohgg-ds-geo", "swgohgg-dooku", "swgohtv-dooku-p4", "swgohtv-p4-full"),
  summary: "Count Dooku is the hard mission core. Community-tested Phase 4 clears against Shaak Ti/Clone variants use Dooku's counter/control engine inside a Separatist shell: preserve Riposte/counter value, use Force Lightning to suppress a dangerous Galactic Republic target, and use Master of Makashi to reset Dooku and protect non-Tank Separatists with Stealth/Turn Meter before committing damage.",
  keyUnits: [
    { baseId: "COUNTDOOKU", name: "Count Dooku", importance: "critical", reason: "Current SWGOH.GG mission listing places Dooku in the Phase 4 Count Dooku's Hangar combat mission." },
  ],
  keyAbilities: [
    { baseId: "COUNTDOOKU", abilityName: "Force Lightning", importance: "critical", expected: "Shock and Stun control, especially valuable into Galactic Republic enemies", reason: "Use on the enemy whose next action most threatens the Separatist shell." },
    { baseId: "COUNTDOOKU", abilityName: "Master of Makashi", importance: "high", expected: "Dooku cleanse/Riposte plus Separatist Turn Meter and Stealth support", reason: "Use as a control/reset window before the enemy can focus fragile non-Tank Separatists." },
    { baseId: "COUNTDOOKU", abilityName: "Flawless Riposte", importance: "high", expected: "Counter-based pressure and sustain", reason: "Do not build the plan as if Dooku were only a one-time Stun source; his out-of-turn engine is part of the tested mission value." },
  ],
  stages: [
    stage("opening", "Opening · establish Dooku control", [
      step("identify-control-target", "Read the opening Galactic Republic lineup and identify the enemy special/AoE that most threatens your Separatist shell.", { priority: "critical" }),
      step("force-lightning", "Use Force Lightning on the highest-impact control target when the Stun/Shock window materially prevents that enemy turn.", { priority: "critical", ability: "Force Lightning" }),
      step("makashi", "Use Master of Makashi as a reset/protection window when Dooku is debuffed or fragile non-Tank Separatists need the Stealth/Turn Meter support.", { priority: "high", ability: "Master of Makashi" }),
    ], { objective: "Prevent the opening enemy rotation from breaking the Separatist team before Dooku's counter engine is established." }),
    stage("counter-cycle", "Midfight · convert control into counters", [
      step("preserve-dooku", "Keep Dooku active and avoid feeding him into avoidable lethal focus; Flawless Riposte counter pressure is part of the mission's long-fight engine.", { priority: "high", target: "Count Dooku" }),
      step("remove-support", "Once the major damage threat is controlled, remove the enemy healer/support or clone engine that can reset your progress before low-value cleanup.", { priority: "high" }),
      step("adapt-variant", "The tested mission can present different Galactic Republic/Clone variants; re-evaluate the priority after each defeat rather than hard-coding one universal name order.", { priority: "high" }),
    ], { objective: "Turn Dooku's control/counter engine into a stable numbers advantage across both mission waves." }),
  ],
  targetPriorities: [
    { target: "Highest-impact Galactic Republic special/AoE threat", priority: "critical", when: "opening", reason: "Dooku's Force Lightning is most valuable when it prevents the enemy action that can destabilize the Separatist shell." },
    { target: "Enemy healer / support / Clone engine", priority: "high", when: "after immediate damage is controlled", reason: "Prevent recovery or support loops from erasing target progress." },
  ],
  failureRisks: [
    "Spending Force Lightning on a low-impact target can leave the real Galactic Republic threat free to take its special turn.",
    "Allowing Dooku to die early removes the counter/control engine the mission-specific strategy is built around.",
    "The mission has tested enemy variants, so a single hard-coded kill order can be wrong for the actual board.",
  ],
  evidenceBoundary: "Dooku's Phase 4 mission participation and current ability behavior are current-reference facts. The two-wave control/counter framework is supported by BitDynasty mission testing against Shaak Ti and Clone variants. The pack intentionally keeps exact squad slots and kill order adaptive and does not claim a guaranteed clear percentage.",
});

const P4_WAT = Object.freeze({
  id: "s4-wat-separatists-v1",
  missionId: "s4",
  title: "Rear Flank · Wat Tambor + Separatists Special Mission",
  status: "community-tested-partial",
  confidence: "community-tested-partial",
  lastVerified: "2026-08-16",
  sources: sources("swgohgg-ds-geo", "ea-wat-kit", "ea-wat-p4", "swgohtv-wat-p4", "swgohtv-p4-full"),
  summary: "Wat Tambor is the hard Phase 4 Rear Flank special-mission core. Current Wat Tech behavior and post-change community testing show that the old pre-change Weapon Tech damage assumptions must not be reused blindly. Droids and Geonosians both have tested clears, so the app should evaluate the player's available Separatist shell and assign Tech for that shell rather than present one obsolete universal script.",
  keyUnits: [
    { baseId: "WATTAMBOR", name: "Wat Tambor", importance: "critical", reason: "Current mission data requires Wat for this Phase 4 Rear Flank special mission." },
  ],
  keyAbilities: [
    { baseId: "WATTAMBOR", abilityName: "Mass Manufacture", importance: "high", expected: "Distribute Tech to the selected Separatist shell", reason: "Tech allocation must match the chosen tank/sustain/damage engine; old Weapon Tech assumptions are explicitly not treated as current truth." },
    { baseId: "WATTAMBOR", abilityName: "Discharge Energy", importance: "high", expected: "Separatist/Dark Side Droid revive plus team recovery effects", reason: "Preserve Wat's recovery value for a board state where it changes survival rather than spending it automatically." },
  ],
  stages: [
    stage("shell-selection", "Preflight · choose the current Separatist shell", [
      step("wat-required", "Verify Wat Tambor is present and clears the mission entry gate before evaluating the rest of the Separatist shell.", { priority: "critical", target: "Wat Tambor" }),
      step("choose-shell", "Choose the strongest legal Separatist engine available—community evidence supports both droid and Geonosian approaches—without assuming an old Weapon Tech damage interaction still exists.", { priority: "critical" }),
      step("tech-role", "Allocate Wat Tech by role: sustain/tank protection to the unit that must hold the board and offensive/tempo Tech to the unit that actually drives the selected shell.", { priority: "high", ability: "Mass Manufacture" }),
    ], { objective: "Enter with a legal Wat shell whose Tech assignments match current kit behavior." }),
    stage("battle-loop", "Battle · preserve engine and recovery", [
      step("protect-engine", "Control or remove the enemy action most capable of deleting the selected shell's core unit before committing damage to lower-value targets.", { priority: "critical" }),
      step("wat-recovery", "Use Wat's recovery/revive resources when they preserve the shell's core engine; do not spend them automatically on cooldown.", { priority: "high", ability: "Discharge Energy" }),
      step("reassess", "Re-evaluate Tech value and target priority when the enemy composition changes between waves; exact wave-specific sequencing remains under verification.", { priority: "high" }),
    ], { objective: "Keep the selected Separatist engine intact through the four-wave mission." }),
  ],
  targetPriorities: [{ target: "Enemy capable of collapsing the selected Separatist engine", priority: "critical", when: "each wave", reason: "Current evidence supports multiple legal shells, so priority must be based on what threatens that shell rather than one stale universal list." }],
  failureRisks: [
    "Using an old pre-change Weapon Tech damage assumption can produce a plan that no longer matches current Wat behavior.",
    "A Geonosian and a Separatist-droid shell do not value the same Tech assignments or target timing.",
    "Wave-specific enemy sequencing is not sufficiently re-verified in the current source set, so this pack remains partial.",
  ],
  evidenceBoundary: "Wat's current kit and his required participation are current/official facts. Community sources document successful Phase 4 Wat mission clears and the impact of Wat Tech changes, including viable droid and Geo approaches. Exact current wave-by-wave Tech targets and kill order are not sufficiently re-verified, so this pack intentionally remains partial and cannot surface as VERIFIED STRATEGY AVAILABLE yet.",
});

const jabbaCore = roteJabbaJkckStrategyForMission("corellia-jabba");
const JABBA = Object.freeze({
  ...jabbaCore,
  id: "s5-jabba-dsgeo-v1",
  missionId: "s5",
  title: "Count Dooku's Hangar · Jabba + Hutt Cartel Special Mission",
  status: "verified-core",
  confidence: "official-entry-current-kit-core",
  lastVerified: "2026-08-16",
  sources: [source("cg-jabba-existing-tb"), source("swgohgg-jabba"), ...(Array.isArray(jabbaCore?.sources) ? jabbaCore.sources : [])].filter(Boolean),
  summary: `Capital Games explicitly added a Jabba mission to Dark Side Geonosis and SWGOH.GG currently lists the Phase 4 Count Dooku's Hangar special mission. Use the established Jabba/Hutt Cartel contract-and-ultimate engine while respecting this mission's 7-star, 16,500+ Hutt Cartel entry contract. ${jabbaCore?.summary || ""}`.trim(),
  evidenceBoundary: "Jabba's presence in Dark Side Geonosis and the current Phase 4 special-mission listing are official/current-reference facts. Jabba ability behavior comes from current kit references inherited by the sourced Jabba strategy core. This pack does not claim a mission-specific deterministic enemy sequence or guaranteed clear percentage where no authoritative source establishes one.",
});

export const DS_GEO_BATTLE_STRATEGIES = Object.freeze({
  s1: P1_NUTE,
  s2: ACKLAY,
  c8: P2_DOOKU_ASAJJ,
  s3: WAT,
  c21: P4_DOOKU,
  s4: P4_WAT,
  s5: JABBA,
});

export function dsGeoBattleStrategyForMission(missionId) {
  return DS_GEO_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
