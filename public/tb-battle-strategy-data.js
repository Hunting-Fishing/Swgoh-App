export const TB_BATTLE_STRATEGY_SOURCES = Object.freeze({
  "cg-zeffo-2023": {
    id: "cg-zeffo-2023",
    label: "Capital Games · Zeffo Title Update",
    kind: "official",
    url: "https://swgoh.gg/news/title-update-6282023/",
  },
  "ea-captain-rex-kit": {
    id: "ea-captain-rex-kit",
    label: "EA / Capital Games · Captain Rex Kit Reveal",
    kind: "official",
    url: "https://www.ea.com/en-au/news/kit-reveal-captain-rex",
  },
  "swgohgg-rote": {
    id: "swgohgg-rote",
    label: "SWGOH.GG · Rise of the Empire",
    kind: "current-reference",
    url: "https://swgoh.gg/territory-battles/t05D/",
  },
  "swgohgg-grand-inquisitor": {
    id: "swgohgg-grand-inquisitor",
    label: "SWGOH.GG · Grand Inquisitor current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/grand-inquisitor/",
  },
  "swgohgg-fifth-brother": {
    id: "swgohgg-fifth-brother",
    label: "SWGOH.GG · Fifth Brother current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/FIFTHBROTHER/ability/specialability_fifthbrother01/8/",
  },
  "ea-forum-reva-workgroup": {
    id: "ea-forum-reva-workgroup",
    label: "EA Forums · Reva mission testing / strategy workgroup",
    kind: "community-tested",
    url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/reva-new-info-next-steps-/4679361",
  },
  "swgohtv-kam-mikayas": {
    id: "swgohtv-kam-mikayas",
    label: "SWGOH.TV · Mikayas KAM mission strategy notes",
    kind: "community-tested",
    url: "https://swgoh.tv/video/13682-kam-mission-no-audio-read-description",
  },
  "swgohgg-shaak-ti": {
    id: "swgohgg-shaak-ti",
    label: "SWGOH.GG · Shaak Ti current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/shaak-ti/",
  },
  "swgohgg-rex": {
    id: "swgohgg-rex",
    label: "SWGOH.GG · CT-7567 Rex current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/ct-7567-rex/",
  },
  "swgohgg-fives": {
    id: "swgohgg-fives",
    label: "SWGOH.GG · CT-5555 Fives Tactical Awareness",
    kind: "current-reference",
    url: "https://swgoh.gg/units/CT5555/ability/uniqueability_ct555502/8/",
  },
  "swgohgg-arc": {
    id: "swgohgg-arc",
    label: "SWGOH.GG · ARC Trooper current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/arc-trooper/",
  },
  "swgohgg-echo": {
    id: "swgohgg-echo",
    label: "SWGOH.GG · CT-21-0408 Echo current kit",
    kind: "current-reference",
    url: "https://swgoh.gg/units/ct-21-0408-echo/",
  },
});

const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const TB_BATTLE_STRATEGIES = Object.freeze({
  "zeffo-clones": {
    id: "zeffo-clones-v1",
    missionId: "zeffo-clones",
    title: "Zeffo Clone Trooper Special Mission",
    status: "verified-core",
    confidence: "high",
    lastVerified: "2026-08-15",
    sourceIds: ["cg-zeffo-2023", "ea-captain-rex-kit"],
    summary: "The mission-specific hard gate is control: Tomb Guardians cannot be defeated unless they are stunned. Preserve reliable Stun access for the lethal window instead of treating raw damage as sufficient.",
    requiredMechanics: [
      { id: "stun", label: "Reliable Stun", importance: "critical", evidenceType: "debuff", evidenceKey: "Stun" },
    ],
    keyUnits: [
      { baseId: "CAPTAINREX", name: "Captain Rex", importance: "high", reason: "Master Marksman is an explicit single-target Stun source and is part of the current planning core." },
    ],
    keyAbilities: [
      { baseId: "CAPTAINREX", abilityName: "Master Marksman", importance: "critical", expected: "Stun", reason: "Use as a controlled Stun source for Tomb Guardian kill windows." },
    ],
    stages: [
      stage("guardian-control", "Tomb Guardian control loop", [
        step("identify-guardian", "Identify the active Tomb Guardian before committing the team's major damage sequence.", { priority: "critical" }),
        step("preserve-stun", "Keep at least one reliable Stun source available before attempting to finish a Tomb Guardian.", { priority: "critical" }),
        step("apply-stun", "Apply Stun to the Tomb Guardian, then commit the lethal damage window while the mission defeat condition is satisfied.", { priority: "critical", mechanicId: "stun" }),
        step("reset-control", "If the Guardian survives or another Guardian becomes the priority, rebuild the control window instead of assuming damage alone can finish it.", { priority: "high" }),
      ], {
        objective: "Create a verified Stun window before each Tomb Guardian defeat attempt.",
      }),
    ],
    targetPriorities: [
      { target: "Tomb Guardian", priority: "critical", when: "when reliable Stun is available", reason: "CG explicitly states Tomb Guardians cannot be defeated unless stunned in the relevant Zeffo battles." },
    ],
    failureRisks: [
      "Attempting to finish a Tomb Guardian without Stun can waste the damage window because the mission-specific defeat condition is not satisfied.",
      "Spending the only reliable Stun on a low-value target can leave the team without the control mechanic needed for the Guardian.",
    ],
    evidenceBoundary: "The defeat condition and need for reliable Stun are official. Exact per-turn sequencing beyond that control requirement is tactical guidance derived from the sourced mechanic, not a guaranteed win script.",
  },

  "tatooine-reva": {
    id: "tatooine-reva-v1",
    missionId: "tatooine-reva",
    title: "Tatooine Third Sister Shard Special Mission",
    status: "community-tested",
    confidence: "community-validated",
    lastVerified: "2026-08-15",
    sourceIds: ["swgohgg-rote", "swgohgg-grand-inquisitor", "swgohgg-fifth-brother", "ea-forum-reva-workgroup"],
    summary: "The opening plan is built around reaching six stacks of Purge on Chief Nebit before Grand Inquisitor commits Ready to Die?, using that six-Purge threshold to grant Inquisitorius allies Tenacity Up, then using Fifth Brother's team-wide dispel and focusing Jawa Scavenger while thermal risk is controlled.",
    requiredLeaderBaseId: "GRANDINQUISITOR",
    requiredMechanics: [
      { id: "purge", label: "Purge application", importance: "critical", evidenceType: "debuff", evidenceKey: "Purge" },
      { id: "tenacity_up", label: "Team Tenacity Up", importance: "critical", evidenceType: "buff", evidenceKey: "Tenacity Up" },
      { id: "dispel_enemy", label: "Enemy buff dispel", importance: "high", evidenceType: "mechanic", evidenceKey: "dispel_enemy" },
    ],
    keyUnits: [
      { baseId: "GRANDINQUISITOR", name: "Grand Inquisitor", importance: "critical", reason: "Required mission unit and the six-Purge Ready to Die? interaction supplies squad-wide Tenacity Up." },
      { baseId: "FIFTHBROTHER", name: "Fifth Brother", importance: "high", reason: "The Kill is Mine dispels all enemy buffs at max level and is used after the opening Purge/Tenacity setup." },
    ],
    keyAbilities: [
      { baseId: "GRANDINQUISITOR", abilityName: "Ready to Die?", importance: "critical", expected: "At six Purge, Inquisitorius allies gain Tenacity Up", reason: "Do not spend the key opening use before the six-Purge threshold if the tactical state allows you to wait." },
      { baseId: "FIFTHBROTHER", abilityName: "The Kill is Mine", importance: "high", expected: "Dispel all enemy buffs", reason: "Used to clear the Jawa opening buffs/taunt/stealth after the Tenacity Up setup." },
    ],
    stages: [
      stage("wave-1-opening", "Wave 1 · Jawa thermal-control opening", [
        step("stack-purge", "Build Chief Nebit to six stacks of Purge before Grand Inquisitor's key Ready to Die? use.", { priority: "critical" }),
        step("tenacity-window", "Use Ready to Die? on the six-Purge target to trigger the Inquisitorius-wide Tenacity Up threshold.", { priority: "critical", ability: "Ready to Die?" }),
        step("dispel-jawas", "After the Tenacity Up setup, use Fifth Brother's The Kill is Mine to clear enemy buffs and open the Jawa target line.", { priority: "high", ability: "The Kill is Mine" }),
        step("focus-scavenger", "Commit damage into Jawa Scavenger and remove it before the protected Tenacity window expires when possible.", { priority: "critical", target: "Jawa Scavenger" }),
      ], {
        objective: "Get squad-wide Tenacity Up before thermals become lethal, then remove Jawa Scavenger quickly.",
        hazards: ["Thermal Detonators", "Losing the six-Purge timing before Ready to Die?"],
      }),
      stage("wave-2", "Wave 2 · Jedi Master Kenobi encounter", [
        step("enter-controlled", "Enter Wave 2 with control abilities available where possible; community reports specifically value having Seventh Sister's Ability Block available for the Jedi Master Kenobi encounter.", { priority: "helpful", confidence: "community-advisory" }),
        step("adapt-npc-kit", "Treat the PVE Jedi Master Kenobi as an encounter-specific NPC variant rather than assuming the player kit behaves identically.", { priority: "high", confidence: "system-safety" }),
      ], {
        objective: "Preserve enough control and survivability to handle the encounter-specific JMK variant.",
        confidence: "partial",
      }),
    ],
    targetPriorities: [
      { target: "Chief Nebit", priority: "setup", when: "opening", reason: "Use as the six-Purge setup target for Ready to Die?." },
      { target: "Jawa Scavenger", priority: "critical", when: "after Tenacity Up and dispel", reason: "Community testing identifies Scavenger as the priority kill before thermal pressure compounds." },
    ],
    failureRisks: [
      "Using Ready to Die? before reaching six Purge can miss the squad-wide Tenacity Up threshold needed by the opening strategy.",
      "Leaving Jawa Scavenger alive too long increases thermal-detector pressure and can collapse the run despite meeting the R7 entry gate.",
      "NPC JMK behavior can differ from the player unit; the app must not assume an exact player-kit rotation for the second encounter.",
    ],
    evidenceBoundary: "Entry rules and current ability behavior are current-reference facts. The six-Purge/Tenacity/Jawa sequence is community-tested strategy, not an official CG guaranteed-win rotation. No win probability is generated.",
  },

  "p3-kam": {
    id: "p3-kam-v1",
    missionId: "p3-kam",
    title: "Ki-Adi-Mundi Shard · Reek Mission",
    status: "community-tested",
    confidence: "community-validated",
    lastVerified: "2026-08-15",
    sourceIds: ["swgohtv-kam-mikayas", "swgohgg-shaak-ti", "swgohgg-rex", "swgohgg-fives", "swgohgg-arc", "swgohgg-echo"],
    summary: "The community-tested control plan is to clear Trampled from Shaak Ti first and Echo second, use Rex's cleanse/Tenacity Up window to control Burning, place ARC's Command on Echo, remove the B2s before Jango, manage Jango's Trampled damage gate, preserve Fives for Tactical Awareness, then commit to Reek only after Jango is gone.",
    requiredLeaderBaseId: "SHAAKTI",
    requiredMechanics: [
      { id: "tenacity_up", label: "Team Tenacity Up", importance: "high", evidenceType: "buff", evidenceKey: "Tenacity Up" },
      { id: "cleanse", label: "Team debuff cleanse", importance: "high", evidenceType: "mechanic", evidenceKey: "dispel_ally" },
    ],
    keyUnits: [
      { baseId: "SHAAKTI", name: "Shaak Ti", importance: "critical", reason: "Mission-mandatory leader and the team's sustain/cleanse engine." },
      { baseId: "ARCTROOPER501ST", name: "ARC Trooper", importance: "critical", reason: "Mission-mandatory clone; community plan assigns Command/Turret support to Echo." },
      { baseId: "CT7567", name: "CT-7567 'Rex'", importance: "critical", reason: "Form Up supplies the cleanse/Tenacity window and Aerial Advantage is the major Jango damage tool." },
      { baseId: "CT5555", name: "CT-5555 'Fives'", importance: "critical", reason: "Tactical Awareness is the key emergency sacrifice/stat-transfer safety net when fully upgraded." },
      { baseId: "CT210408", name: "CT-21-0408 'Echo'", importance: "critical", reason: "The community plan prioritizes keeping Echo free of Trampled so his assists remain available." },
    ],
    keyAbilities: [
      { baseId: "CT7567", abilityName: "Form Up", importance: "critical", minimumTier: 4, expected: "Cleanse allies and grant Tenacity Up", reason: "The KAM plan uses this to control Burning/debuff pressure. Tenacity Up exists from the relevant upgraded tiers onward." },
      { baseId: "CT7567", abilityName: "Aerial Advantage", importance: "critical", expected: "High-value Jango damage window", reason: "Community sequencing preserves or uses this against Jango when needed rather than wasting it." },
      { baseId: "CT5555", abilityName: "Tactical Awareness", importance: "critical", minimumTier: 8, requiresZeta: true, expected: "Fives sacrifice transfers Max Health, Max Protection, Speed and Offense", reason: "The stat-transfer upgrade is the safety net the strategy is protecting; direct Fives death does not provide the same outcome." },
      { baseId: "ARCTROOPER501ST", abilityName: "Assign Command", importance: "high", expected: "Command/Turret support", reason: "Community plan assigns the turret/Command support to Echo." },
      { baseId: "CT210408", abilityName: "EMP Grenade", importance: "high", expected: "AOE pressure and enemy buff dispel", reason: "Community plan calls for using Echo's AOE while available." },
      { baseId: "SHAAKTI", abilityName: "Training Exercises", importance: "high", expected: "Targeted heal and assist", reason: "Use Shaak Ti's sustain to keep the run stable, especially when Fives is at risk of dying directly." },
    ],
    stages: [
      stage("opening-trampled", "Opening · Trampled and debuff control", [
        step("cleanse-shaak", "Clear Trampled from Shaak Ti first whenever the opening state allows it; losing her access to the team's sustain/cleanse cycle is a major failure risk.", { priority: "critical", target: "Shaak Ti" }),
        step("cleanse-echo", "Clear Trampled from Echo second so he can resume assisting out of turn.", { priority: "critical", target: "Echo" }),
        step("rex-tenacity", "Use Rex's Form Up cleanse/Tenacity Up window to reduce Burning/debuff risk; if the board is stable, the community guide allows delaying it until Echo is cleansed to gain more value.", { priority: "high", ability: "Form Up" }),
        step("command-echo", "Assign ARC Trooper's Command/Turret support to Echo in the standard community sequence.", { priority: "high", ability: "Assign Command", target: "Echo" }),
      ], {
        objective: "Restore Shaak Ti and Echo functionality before committing to the damage race.",
        hazards: ["Trampled on Shaak Ti", "Trampled on Echo", "Burning/debuff pressure"],
      }),
      stage("b2-control", "Target phase 1 · Remove B2 Super Battle Droids", [
        step("b2-first", "Focus the B2 Super Battle Droids before Jango and Reek.", { priority: "critical", target: "B2 Super Battle Droid" }),
        step("avoid-reek-feeds", "Do not feed Reek low-value attacks from Rex or Shaak Ti while the B2/Jango plan is still active; the community guide warns that hitting Reek grants it Turn Meter.", { priority: "critical", target: "Reek" }),
        step("use-echo-arc", "Keep using Echo's AOE and ARC's useful special actions when available instead of low-impact Reek basics.", { priority: "high" }),
      ], {
        objective: "Remove the B2 pressure without accelerating Reek unnecessarily.",
        hazards: ["Feeding Reek Turn Meter with low-value attacks"],
      }),
      stage("jango-control", "Target phase 2 · Jango Fett", [
        step("jango-second", "After the B2s are gone, make Jango the second kill target.", { priority: "critical", target: "Jango Fett" }),
        step("trampled-gate", "Only commit attacks into Jango from characters that satisfy the encounter's Trampled-stack damage condition; otherwise select a legal/value target instead.", { priority: "critical", target: "Jango Fett" }),
        step("rex-aa", "Use Aerial Advantage on Jango when the damage window needs it; if a normal attack safely removes the current life, preserve Aerial Advantage for the next life/window.", { priority: "high", ability: "Aerial Advantage", target: "Jango Fett" }),
        step("protect-fives", "Keep Fives alive from direct lethal damage so Tactical Awareness remains available to save another 501st clone and transfer his stats if the trigger occurs.", { priority: "critical", target: "Fives" }),
      ], {
        objective: "Defeat Jango without wasting the Trampled gate or losing Fives incorrectly.",
        hazards: ["Attacking Jango outside the Trampled condition", "Fives dying directly before Tactical Awareness can trigger"],
      }),
      stage("reek-finish", "Target phase 3 · Finish Reek", [
        step("all-in-reek", "Once Jango is defeated, switch the team to Reek and commit the remaining damage plan.", { priority: "critical", target: "Reek" }),
        step("sustain-run", "Use Shaak Ti's healing/assist tools as needed to preserve Rex, Echo, ARC and the remaining team through the finish.", { priority: "high", target: "Allies" }),
      ], {
        objective: "Convert the stabilized board into the Reek kill after Jango is removed.",
      }),
    ],
    targetPriorities: [
      { target: "B2 Super Battle Droid", priority: "critical", when: "opening target phase", reason: "Community-tested sequence removes the B2s first to reduce pressure." },
      { target: "Jango Fett", priority: "critical", when: "after B2s", reason: "Second kill target; respect the encounter-specific Trampled damage condition." },
      { target: "Reek", priority: "critical", when: "after Jango", reason: "Final all-in target once the earlier control/damage gates are cleared." },
    ],
    failureRisks: [
      "Leaving Shaak Ti or Echo Trampled too long can break the sustain/assist engine the community sequence depends on.",
      "Low-value attacks into Reek before the proper target phase can accelerate it by granting Turn Meter.",
      "Attacking Jango without satisfying the encounter's Trampled condition can waste turns and damage windows.",
      "If Fives dies directly instead of through Tactical Awareness, the surviving 501st clones do not receive the strategy's intended stat-transfer safety net.",
    ],
    evidenceBoundary: "Current ability behavior and installed-upgrade checks are grounded in current SWGOH.GG kit data. The Trampled management, target order and action sequencing are community-tested KAM guidance, not an official CG guaranteed-win rotation. No win probability is generated.",
  },
});

export function battleStrategyForMission(missionId) {
  return TB_BATTLE_STRATEGIES[String(missionId || "")] || null;
}

export function battleStrategySources(strategy) {
  return (strategy?.sourceIds || []).map((id) => TB_BATTLE_STRATEGY_SOURCES[id]).filter(Boolean);
}
