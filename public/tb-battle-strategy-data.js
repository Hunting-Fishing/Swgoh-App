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
});

export function battleStrategyForMission(missionId) {
  return TB_BATTLE_STRATEGIES[String(missionId || "")] || null;
}

export function battleStrategySources(strategy) {
  return (strategy?.sourceIds || []).map((id) => TB_BATTLE_STRATEGY_SOURCES[id]).filter(Boolean);
}
