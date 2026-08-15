const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_FACTION_BATTLE_STRATEGY_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "swgohgg-hera", label: "SWGOH.GG · Hera Syndulla current kit", kind: "current-reference", url: "https://swgoh.gg/units/hera-syndulla/" },
  { id: "swgohgg-captain-rex", label: "SWGOH.GG · Captain Rex current kit", kind: "current-reference", url: "https://swgoh.gg/units/captain-rex/" },
  { id: "bitdynasty-lothal", label: "BitDynasty · Lothal Phase 4 Phoenix mission guide", kind: "community-tested", url: "https://www.swgoh.tv/video/36653-lothal-s4-phoenix-jedi-ls-fleet-cm-guide-rise-of-the-empire-rote-tb-sector-p4-swgoh" },
  { id: "swgohgg-daka", label: "SWGOH.GG · Old Daka current kit", kind: "current-reference", url: "https://swgoh.gg/units/old-daka/" },
  { id: "swgohgg-merrin", label: "SWGOH.GG · Merrin current kit", kind: "current-reference", url: "https://swgoh.gg/units/merrin/" },
  { id: "starwarsfans-dathomir-merrin", label: "StarWars-fans · Dathomir Merrin special mission walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2024/10/swgoh-rote-territory-battle-dathomir-special-mission-with-merrin-walkthrough-tips/" },
]);

const sources = (...ids) => ROTE_FACTION_BATTLE_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_FACTION_BATTLE_STRATEGIES = Object.freeze({
  "lothal-phoenix": Object.freeze({
    id: "lothal-phoenix-v1",
    missionId: "lothal-phoenix",
    title: "Lothal · Phoenix Combat Mission",
    status: "verified-mechanic-community-strategy",
    confidence: "official-mechanics-current-kit",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-hera", "swgohgg-captain-rex", "bitdynasty-lothal"),
    summary: "Use the Hera-led Captain Rex Phoenix variant to exploit Lothal's Rebellious modifier. Every Phoenix Special already triggers Lothal's random assist, while another Phoenix ally using a Special also triggers Captain Rex's assist, rapidly creating out-of-turn attacks and Rebellious stacks. Control Imperial Troopers with Rex's Suppressing Fire and treat Endless Ranks revives as a shared stack-drain mechanic rather than a failed kill.",
    requiredLeaderBaseId: "HERASYNDULLAS3",
    keyUnits: [
      { baseId: "HERASYNDULLAS3", name: "Hera Syndulla", importance: "critical", reason: "This pack is specifically the Hera-led Phoenix strategy variant; Hera also supplies targeted assist, cleanse, cooldown reduction and Turn Meter through Play to Strengths." },
      { baseId: "CAPTAINREX", name: "Captain Rex", importance: "high", reason: "His Phoenix Special-assist unique directly compounds Lothal's out-of-turn attack/Rebellious engine and his AOE supplies Daze, Offense Down and Turn Meter." },
    ],
    keyAbilities: [
      { baseId: "CAPTAINREX", abilityName: "Suppressing Fire", importance: "high", expected: "AOE Tenacity Down, Daze, Offense Down and Phoenix Turn Meter", reason: "Use as a high-value control Special: it triggers a Lothal assist, debuffs the enemy formation and advances Phoenix tempo." },
      { baseId: "HERASYNDULLAS3", abilityName: "Play to Strengths", importance: "high", expected: "Targeted assist; Phoenix cleanse, cooldown reduction and Turn Meter", reason: "Creates another intentional out-of-turn attack and can reset a Phoenix ally's control cycle." },
      { baseId: "CAPTAINREX", abilityName: "The Lost Commander", importance: "high", expected: "Captain Rex assists when another Phoenix ally uses a Special", reason: "This current-kit interaction stacks naturally with Lothal's own random assist on Phoenix Specials." },
    ],
    stages: [
      stage("opening-control", "Opening · start the Rebellious engine", [
        step("rex-control", "Use Suppressing Fire when the enemy formation can absorb its full value: Tenacity Down, Daze and Offense Down suppress Imperial Trooper tempo while the Special itself triggers Lothal's random assist.", { priority: "critical", ability: "Suppressing Fire" }),
        step("special-chain", "Favor useful Phoenix Specials over low-value basics when control, cleanse or recovery is needed. Each Special used on that ally's turn triggers a random Lothal assist, and Specials from Phoenix allies other than Rex also trigger Rex's own assist.", { priority: "critical" }),
        step("track-rebellious", "Treat out-of-turn attacks as permanent encounter ramp: each attacker gains a Rebellious stack, increasing Critical Chance and Critical Damage, with an additional Offense increase at 20 stacks.", { priority: "high" }),
      ], { objective: "Suppress the opening Imperial tempo while accelerating the mission-specific assist/ramp loop.", hazards: ["Imperial Trooper tempo before Daze/Offense Down lands", "Wasting Phoenix Specials when their assist/control value is low"] }),
      stage("endless-ranks", "Endless Ranks · drain the shared revive pool", [
        step("expect-revive", "Expect an Imperial Trooper to revive after defeat while Endless Ranks stacks remain. The revive is the encounter mechanic, not evidence that the target priority failed.", { priority: "critical" }),
        step("drain-shared", "Each Imperial Trooper defeat removes one Endless Ranks stack from all Imperial Troopers before the defeated unit revives. Continue creating controlled defeats until the shared revive pool is exhausted.", { priority: "critical" }),
        step("control-live-threat", "Keep the highest-impact live Trooper Dazed or otherwise controlled while draining ranks; do not invent a fixed kill order when the encounter lineup and Operations state can alter practical priority.", { priority: "high" }),
      ], { objective: "Convert repeated controlled defeats into permanent removal once Endless Ranks is exhausted." }),
      stage("closeout", "Closeout · convert accumulated Rebellious", [
        step("assist-burst", "Once Endless Ranks is depleted or nearly depleted, chain useful Specials and Hera assist calls into the most dangerous remaining target so accumulated Rebellious turns into real finish pressure.", { priority: "high" }),
        step("preserve-cleanse", "Keep Hera's Phoenix cleanse/cooldown utility available if a control debuff would otherwise interrupt the final assist cycle.", { priority: "high", ability: "Play to Strengths" }),
      ], { objective: "Use the encounter's own assist scaling to finish after the revive pool is gone." }),
    ],
    targetPriorities: [
      { target: "Highest-impact active Imperial Trooper", priority: "critical", when: "while Endless Ranks remain", reason: "Exact enemy lineup/turn order is not hard-coded; control the unit most likely to break the Phoenix assist loop while each defeat drains the shared revive pool." },
      { target: "Imperial Trooper with depleted Endless Ranks", priority: "high", when: "revive pool is exhausted", reason: "Once the shared stack pool is gone, defeats can become permanent and the fight transitions to cleanup." },
    ],
    failureRisks: [
      "Treating an Endless Ranks revive as a reason to abandon the strategy can lead to unfocused damage; repeated defeats are how the shared revive pool is drained.",
      "Captain Rex's Suppressing Fire is control, not a Stun. It applies Tenacity Down, Daze and Offense Down and should not be misrepresented as the Zeffo Tomb Guardian kill mechanic.",
      "The Grand Arena-only portions of Captain Rex's unique do not apply here; this pack uses only his mode-independent Phoenix assist, Turn Meter and recovery text.",
    ],
    evidenceBoundary: "Rebellious, Endless Ranks and the R8 Phoenix requirement are official Capital Games mechanics. Hera and Captain Rex interactions are current SWGOH.GG kit facts. The Hera/Rex composition is a battle-strategy variant supported by community testing; no universal enemy kill order or win percentage is asserted.",
  }),

  "dathomir-merrin": Object.freeze({
    id: "dathomir-merrin-v1",
    missionId: "dathomir-merrin",
    title: "Dathomir · Merrin Nightsister Special Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-daka", "swgohgg-merrin", "starwarsfans-dathomir-merrin"),
    summary: "Use the Old Daka-led survivability variant with mandatory Merrin. Daka's leader grants Nightsisters +50% Health and Defense, giving the squad more room to let Plague and revive mechanics work. Spread Tenacity Down before Plague where the selected roster supports it, use Merrin's Shadow Stride proactively for Plague/recovery and its prepared cleanse/revive state, and keep Dash Rendar controlled with Stun in Wave 2 while Dathomir's Dark Magick periodically revives defeated characters.",
    requiredLeaderBaseId: "DAKA",
    keyUnits: [
      { baseId: "DAKA", name: "Old Daka", importance: "critical", reason: "This tested strategy variant uses Daka lead for +50% Health and Defense, prioritizing survival through the long Dathomir attrition fight." },
      { baseId: "MERRIN", name: "Merrin", importance: "critical", reason: "Merrin is an official mission requirement and supplies the Plague, proactive cleanse/revive setup and targeted Stun central to this strategy." },
    ],
    keyAbilities: [
      { baseId: "DAKA", abilityName: "Nightsister Elder", importance: "high", expected: "+50% Health and +50% Defense for Nightsister allies", reason: "The community-tested Daka-lead variant explicitly uses this durability to survive the mission's heavy damage." },
      { baseId: "MERRIN", abilityName: "Shadow Stride", importance: "high", expected: "AOE Plague, Nightsister recovery, self-cleanse and prepared team cleanse/revive", reason: "Use proactively before expected debuff/defeat pressure so the Magick Stealth trigger can convert that event into a team reset." },
      { baseId: "MERRIN", abilityName: "Dathomir Will Be Your Grave", importance: "high", expected: "Single-target Stun; Plague burst on kill; buff dispel against enemies with Plague", reason: "Primary Merrin control button for dangerous targets such as Dash Rendar in Wave 2." },
    ],
    stages: [
      stage("wave1-plague", "Wave 1 · survive and establish Plague", [
        step("daka-shell", "Use Old Daka's durability lead as the baseline survival plan rather than racing the Hondo/IG-88 wave with unsupported burst damage.", { priority: "critical" }),
        step("tenacity-setup", "When the selected Nightsister roster has a reliable Tenacity Down source, spread it before committing the main Plague cycle so subsequent debuffs land more consistently.", { priority: "high" }),
        step("shadow-stride", "Use Shadow Stride proactively when its AOE Plague, 10% Health/Protection recovery and prepared cleanse/revive trigger will protect the squad from the next dangerous debuff or defeat event.", { priority: "critical", ability: "Shadow Stride" }),
        step("plague-pressure", "Continue applying Plague while preserving Daka/Merrin; the tested strategy wins through survivability and accumulating debuff pressure rather than a fragile first-wave burst.", { priority: "high" }),
      ], { objective: "Outlast the first wave while building Plague pressure and keeping the revive engine intact.", hazards: ["Hondo/IG-88 damage pressure", "Spending the Merrin reset before it can answer a dangerous event"] }),
      stage("dark-magick", "Dark Magick · account for periodic revives", [
        step("expect-global-revive", "Every 10 turns, Dathomir's official Dark Magick modifier revives all defeated characters at 50% Health. Do not assume an enemy defeat is permanently removed until the encounter state confirms it.", { priority: "critical" }),
        step("use-revive-engine", "Allied defeats/revives also feed Merrin's mode-independent Turn Meter mechanics, so keep the Nightsister revive core functional instead of treating every temporary allied defeat as a lost run.", { priority: "high" }),
      ], { objective: "Plan around the zone's revive cadence instead of being surprised by it." }),
      stage("wave2-dash", "Wave 2 · control Dash and let Plague work", [
        step("dash-control", "Prioritize controlling Dash Rendar's AOE with Stun when possible. Community-tested guidance identifies Dash as the key second-wave control target.", { priority: "critical", target: "Dash Rendar", ability: "Dathomir Will Be Your Grave" }),
        step("spread-plague", "Continue the Tenacity-Down-then-Plague pattern where available while the squad absorbs Maul, Qi'ra and Cartel pressure through Daka durability and Nightsister recovery.", { priority: "high" }),
        step("patient-close", "Do not abandon the attrition plan for low-value burst attempts. Maintain Dash control, Plague uptime and the revive shell until the wave collapses.", { priority: "high" }),
      ], { objective: "Prevent Dash's AOE from breaking the survival shell while Plague closes the encounter." }),
    ],
    targetPriorities: [
      { target: "Dash Rendar", priority: "critical", when: "Wave 2", reason: "Community-tested Dathomir guidance explicitly prioritizes Stunning Dash to control his AOE." },
      { target: "Current high-damage Wave 1 threat", priority: "high", when: "Wave 1", reason: "The tested guide emphasizes survival and Plague rather than asserting a universal fixed kill order among Hondo, IG-88 and the accompanying units." },
    ],
    failureRisks: [
      "Using a damage-first leader instead of the Daka survivability variant changes the assumptions of this strategy pack; this evaluator intentionally fails closed on the selected strategy leader.",
      "Ignoring Dash Rendar's AOE can collapse a low-health Nightsister shell before Plague and revives take over Wave 2.",
      "Dark Magick revives all defeated characters every 10 turns, so permanent-removal assumptions can produce bad cooldown and target decisions.",
      "Merrin's Grand Arena-only Omicron text is not used here; the pack relies on her mode-independent Plague, Turn Meter, recovery, Stun and revive mechanics.",
    ],
    evidenceBoundary: "Dark Magick and the R7 Dathomir context are official Capital Games information; Old Daka and Merrin ability behavior is current SWGOH.GG data. Daka lead, Plague sequencing and Dash control are community-tested strategy. No anecdotal clear count is converted into a win probability.",
  }),
});

export function roteFactionBattleStrategyForMission(missionId) {
  return ROTE_FACTION_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
