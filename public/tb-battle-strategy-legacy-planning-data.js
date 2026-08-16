import { legacyTbGlobalMechanicsForMission } from "./tb-legacy-global-mechanics-data.js";

const LEGACY_TB_IDS = new Set([
  "geo-separatist",
  "geo-republic",
  "hoth-imperial",
  "hoth-rebel",
]);

const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });
const text = (value) => String(value ?? "").trim();

function sourceRow(value, tbId) {
  if (value && typeof value === "object") {
    const id = text(value.id || value.label);
    if (!id) return null;
    return {
      ...value,
      id,
      label: text(value.label || value.id || "Mission source"),
      kind: text(value.kind || "mission-data-reference"),
    };
  }

  const id = text(value);
  if (!id) return null;
  return {
    id,
    label: `Mission source · ${id}`,
    kind: "mission-data-reference",
  };
}

function normalizedSources(mission = {}) {
  const tbId = text(mission.tbId);
  const global = legacyTbGlobalMechanicsForMission(mission);
  const rows = [
    ...(Array.isArray(mission.sources) ? mission.sources : []),
    ...(Array.isArray(mission.recommendations)
      ? mission.recommendations.flatMap((row) => Array.isArray(row?.sourceIds) ? row.sourceIds : [])
      : []),
    ...(global.source ? [global.source] : []),
  ].map((value) => sourceRow(value, tbId)).filter(Boolean);

  const unique = new Map();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  if (unique.size) return [...unique.values()];

  return [{
    id: `${tbId || "legacy-tb"}-mission-data`,
    label: "Canonical Territory Battle mission registry",
    kind: "mission-data",
  }];
}

function mandatoryKeyUnits(mission = {}) {
  const rows = Array.isArray(mission.entry?.mandatoryMembers) ? mission.entry.mandatoryMembers : [];
  return rows
    .filter((row) => text(row?.baseId))
    .map((row) => ({
      baseId: text(row.baseId),
      name: text(row.name || row.baseId),
      importance: "critical",
      reason: "Canonical mission-entry requirement. Recommended team members outside this mandatory list remain advisory, not hard strategy gates.",
    }));
}

function entryGateSummary(mission = {}) {
  const entry = mission.entry || {};
  const bits = [];
  if (entry.unitType) bits.push(entry.unitType === "Ship" ? "ship" : "character");
  if (entry.starsMin) bits.push(`${entry.starsMin}★`);
  if (entry.powerMin) bits.push(`${Number(entry.powerMin).toLocaleString()}+ GP each`);
  if (entry.gearMin) bits.push(`G${entry.gearMin}+`);
  if (entry.relicMin) bits.push(`R${entry.relicMin}+`);
  if (Array.isArray(entry.requiredCategories) && entry.requiredCategories.length) bits.push(entry.requiredCategories.join(entry.categoryMode === "any" ? " OR " : " + "));
  if (Array.isArray(entry.allowedAlignments) && entry.allowedAlignments.length) bits.push(entry.allowedAlignments.join(" / "));
  else if (entry.alignment && entry.alignment !== "Mixed") bits.push(entry.alignment);
  const mandatory = Array.isArray(entry.mandatoryMembers) ? entry.mandatoryMembers.map((row) => text(row?.name || row?.baseId)).filter(Boolean) : [];
  if (mandatory.length) bits.push(`required ${mandatory.join(" + ")}`);
  return bits.length ? bits.join(" · ") : "the canonical mission-entry gate";
}

function globalMechanicSummary(mission = {}) {
  const global = legacyTbGlobalMechanicsForMission(mission);
  if (!global.mechanics.length) return "";
  return ` Verified TB-wide mechanic${global.mechanics.length === 1 ? "" : "s"}: ${global.mechanics.map((row) => row.name).join(" + ")}.`;
}

function planningSummary(mission = {}) {
  const recommendations = Array.isArray(mission.recommendations) ? mission.recommendations.length : 0;
  const mechanics = Array.isArray(mission.mechanics) ? mission.mechanics.length : 0;
  const waves = Array.isArray(mission.waves) ? mission.waves.length : 0;
  return `This legacy Territory Battle mission has canonical entry/planning data but no independently verified mission-specific execution pack yet. Enforce ${entryGateSummary(mission)}${recommendations ? ` and rank ${recommendations} sourced/planning team core${recommendations === 1 ? "" : "s"} against the live roster` : ""}${mechanics ? ` while respecting ${mechanics} recorded mission mechanic${mechanics === 1 ? "" : "s"}` : ""}${waves ? ` across ${waves} recorded wave${waves === 1 ? "" : "s"}` : ""}.${globalMechanicSummary(mission)} Exact current enemy sequencing remains intentionally unverified.`;
}

function globalMechanicStage(mission = {}) {
  const global = legacyTbGlobalMechanicsForMission(mission);
  if (!global.mechanics.length && !global.conditional.length) return null;
  const steps = [
    ...global.mechanics.map((mechanic) => step(
      `tb-global-${mechanic.id}`,
      `${mechanic.name}: ${mechanic.response}`,
      { priority: mechanic.conditional ? "high" : "critical", mechanicId: mechanic.id, confidence: mechanic.conditional ? "conditional-platoon-state" : "current-reference" },
    )),
    ...global.conditional.map((warning, index) => step(
      `tb-conditional-${index + 1}`,
      warning,
      { priority: "info", confidence: "guild-state-dependent" },
    )),
  ];
  return stage("tb-global-mechanics", "Territory Battle mechanics · mode-specific planning", steps, {
    objective: "Exploit verified TB-wide bonuses while keeping platoon-dependent abilities conditional on the guild's actual battle state.",
  });
}

function planningStages(mission = {}) {
  const entry = mission.entry || {};
  const isFleet = text(mission.missionType).toLowerCase() === "fleet" || text(entry.unitType).toLowerCase() === "ship";
  const recommendations = Array.isArray(mission.recommendations) ? mission.recommendations : [];
  const mechanics = Array.isArray(mission.mechanics) ? mission.mechanics.filter(Boolean) : [];
  const mandatory = Array.isArray(entry.mandatoryMembers) ? entry.mandatoryMembers.map((row) => text(row?.name || row?.baseId)).filter(Boolean) : [];

  const preflight = [
    ...(mandatory.length ? [step("mandatory", `Verify the mandatory ${mandatory.join(" + ")} mission core before evaluating optional slots or substitutes.`, { priority: "critical" })] : []),
    step("entry-gate", `Verify ${entryGateSummary(mission)} before ranking battle options; mission legality is a hard gate and is separate from strategy quality.`, { priority: "critical" }),
    step("roster-fit", recommendations.length
      ? `Use the live roster to select the strongest legal fit among the ${recommendations.length} attached planning/recommendation core${recommendations.length === 1 ? "" : "s"}; recommendation membership is advisory unless the canonical entry contract marks a unit mandatory.`
      : "Use the live roster to build the strongest legal team from the canonical entry pool; no sourced preferred composition is attached yet.", { priority: "high" }),
  ];

  const opening = [
    step("scan-threat", isFleet
      ? "Read the opening fleet and identify the enemy ship driving the most dangerous damage, control, targetability, or reinforcement snowball before committing major cooldowns."
      : "Read the opening wave and identify the healer, revive source, high-impact AoE attacker, or control unit most capable of collapsing the selected team engine before committing major cooldowns.", { priority: "high" }),
    ...(mandatory.length ? [step("protect-core", `Preserve the mission-required ${mandatory.join(" + ")} core unless a sourced mechanic explicitly rewards sacrificing it; the fallback does not invent such a sacrifice rule.`, { priority: "high" })] : []),
    ...(mechanics.length ? [step("known-mechanics", `Account for the mission mechanics already recorded in the canonical registry: ${mechanics.join(" · ")}. Treat these as planning evidence only; do not infer unrecorded enemy behavior from them.`, { priority: "high" })] : []),
  ];

  const battle = isFleet ? [
    step("fleet-focus", "Focus the current enemy fleet engine/highest-impact damage or control ship when targetability permits instead of following an unsourced fixed kill order.", { priority: "high" }),
    step("reinforcement", "Call the reinforcement that solves the actual board state—tank, cleanse, control, target access, or burst—rather than following an unverified universal bench sequence.", { priority: "high" }),
    step("capital-cycle", "Preserve the decisive capital-ship control or survival ability for a board-changing window rather than spending it only because it is available.", { priority: "high" }),
  ] : [
    step("ground-focus", "Focus the current healer, revive source, high-impact AoE attacker, or control unit; do not spread damage while the enemy support engine remains active.", { priority: "high" }),
    step("sustain", "Preserve the selected team's cleanse, recovery, taunt, or control engine long enough to secure the next useful enemy defeat.", { priority: "high" }),
    step("adapt", "Re-evaluate target priority whenever the enemy composition or targetability changes instead of forcing a stale universal name order.", { priority: "high" }),
  ];

  const transition = [
    step("preserve-cooldowns", isFleet
      ? "When the board is already won, avoid unnecessary capital-ship or reinforcement actions that reduce flexibility for the remaining encounter state."
      : "When a wave is controlled, finish with lower-value actions where practical so key cleanse, control, recovery, and burst cooldowns enter the next wave available.", { priority: "high" }),
    step("evidence-boundary", "Treat this plan as a roster-aware partial strategy. Upgrade it to a verified mission script only after mission-specific battle evidence establishes stronger target, speed, or ability sequencing.", { priority: "info" }),
  ];

  return [
    stage("preflight", "Preflight · legality and roster fit", preflight, { objective: "Enter with a legal roster and the strongest evidence-supported planning core available." }),
    globalMechanicStage(mission),
    stage("opening", `Opening · identify the ${isFleet ? "fleet" : "wave"} failure condition`, opening, { objective: "Prevent the first dangerous enemy action from breaking the selected team engine." }),
    stage("battle-loop", isFleet ? "Battle · adaptive fleet control" : "Battle · control, focus, sustain", battle, { objective: "Convert the legal team engine into stable board control without inventing a fixed enemy script." }),
    stage("transition", isFleet ? "Closeout · preserve fleet options" : "Wave transition · preserve cooldowns", transition, { objective: "Carry as much control and flexibility as possible into the next mission state." }),
  ].filter(Boolean);
}

export function legacyPlanningBattleStrategyForMission(mission = {}) {
  const tbId = text(mission.tbId);
  const missionId = text(mission.id);
  if (!LEGACY_TB_IDS.has(tbId) || !missionId) return null;

  const recommendations = Array.isArray(mission.recommendations) ? mission.recommendations : [];
  const mechanics = Array.isArray(mission.mechanics) ? mission.mechanics : [];
  const enemies = Array.isArray(mission.enemies) ? mission.enemies : [];
  const waves = Array.isArray(mission.waves) ? mission.waves : [];
  const global = legacyTbGlobalMechanicsForMission(mission);

  return Object.freeze({
    id: `legacy-plan:${tbId}:${missionId}`,
    missionId,
    title: `${text(mission.name || missionId)} · Planning Strategy`,
    status: "mission-planning-partial",
    confidence: "mission-data-plus-global-mechanics-partial",
    lastVerified: mission.lastVerified || null,
    sources: normalizedSources(mission),
    summary: planningSummary(mission),
    keyUnits: mandatoryKeyUnits(mission),
    keyAbilities: [],
    stages: planningStages(mission),
    targetPriorities: [{
      target: text(mission.missionType).toLowerCase() === "fleet" ? "Current enemy fleet engine / highest-impact control or damage ship" : "Current healer / revive source / highest-impact AoE or control enemy",
      priority: "high",
      when: "throughout",
      reason: "The fallback uses adaptive threat selection because a mission-specific current kill order has not yet been independently verified.",
    }],
    failureRisks: [
      "Attached roster recommendations are planning evidence, not proof of an exact current battle rotation.",
      "A fixed enemy spawn, target order, speed threshold, or reinforcement sequence is not asserted without mission-specific evidence.",
      "Canonical mandatory units and entry thresholds are hard gates; other recommended team members remain advisory unless separately verified.",
      ...(global.conditional.length ? ["Platoon/territory-state strategic abilities can change the battle; the fallback does not assume a specific guild completion level."] : []),
      ...(mechanics.length || enemies.length || waves.length || global.mechanics.length ? [] : ["This mission has limited encounter-detail data in the current registry; tactical guidance must remain especially conservative."]),
    ],
    evidenceBoundary: `Generated from the canonical ${tbId} mission record plus ${global.mechanics.length} verified TB-wide mechanic${global.mechanics.length === 1 ? "" : "s"}: entry rules, ${recommendations.length} recommendation core${recommendations.length === 1 ? "" : "s"}, ${mechanics.length} recorded mission mechanic${mechanics.length === 1 ? "" : "s"}, ${enemies.length} enemy reference${enemies.length === 1 ? "" : "s"}, and ${waves.length} wave value${waves.length === 1 ? "" : "s"}. Platoon-dependent strategic abilities remain conditional on actual guild state. This is intentionally PARTIAL planning guidance. It does not claim a verified mission-specific enemy script, deterministic target order, guaranteed win rate, or unsupported stat threshold.`,
  });
}
