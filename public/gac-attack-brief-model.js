const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function metricTotal(units = [], key) {
  const rows = Array.isArray(units) ? units.filter(Boolean) : [];
  if (!rows.length) return null;
  let total = 0;
  for (const unit of rows) {
    const value = finiteOrNull(unit?.[key]);
    if (value === null) return null;
    total += value;
  }
  return total;
}
function fastestKnownSpeed(units = []) {
  const speeds = (Array.isArray(units) ? units : [])
    .map((unit) => finiteOrNull(unit?.speed))
    .filter((value) => value !== null && value > 0);
  return speeds.length ? Math.max(...speeds) : null;
}
function signed(value) {
  const numeric = finiteOrNull(value);
  if (numeric === null) return "—";
  if (!numeric) return "0";
  return `${numeric > 0 ? "+" : "−"}${number.format(Math.abs(numeric))}`;
}
function matchupDelta(attackerUnits = [], defenderUnits = [], ability = {}) {
  const attackers = Array.isArray(attackerUnits) ? attackerUnits.filter(Boolean) : [];
  const defenders = Array.isArray(defenderUnits) ? defenderUnits.filter(Boolean) : [];
  if (!attackers.length || !defenders.length) {
    return Object.freeze({ known: false, relicDelta: null, zetaDelta: null, omicronDelta: null, speedDelta: null, abilityDelta: null });
  }
  const attackerFastest = fastestKnownSpeed(attackers);
  const defenderFastest = fastestKnownSpeed(defenders);
  const attackerAbilityScore = finiteOrNull(ability?.attackerScore);
  const defenderAbilityScore = finiteOrNull(ability?.defenderScore);
  const difference = (key) => {
    const left = metricTotal(attackers, key);
    const right = metricTotal(defenders, key);
    return left === null || right === null ? null : left - right;
  };
  return Object.freeze({
    known: true,
    relicDelta: difference("relic"),
    zetaDelta: difference("zetas"),
    omicronDelta: difference("omicrons"),
    speedDelta: attackerFastest === null || defenderFastest === null ? null : attackerFastest - defenderFastest,
    abilityDelta: attackerAbilityScore === null || defenderAbilityScore === null ? null : attackerAbilityScore - defenderAbilityScore,
    attackerFastest,
    defenderFastest,
    attackerAbilityScore,
    defenderAbilityScore,
  });
}
function risk(code, severity, title, detail, evidenceType) {
  return Object.freeze({ code, severity, title, detail, evidenceType });
}
function historicalRisks(evidenceMatch) {
  if (!evidenceMatch) {
    return [risk(
      "historical-exact-unavailable",
      "info",
      "No exact actionable historical sample",
      "This selected squad is not being presented as an exact historical counter. No win rate is inferred.",
      "historical",
    )];
  }
  const battles = Math.max(0, Number(evidenceMatch?.battles || 0));
  const holds = Math.max(0, Number(evidenceMatch?.holds || 0));
  const rows = [];
  if (battles < 5) {
    rows.push(risk(
      "historical-thin-sample",
      "warning",
      "Thin historical sample",
      `${battles} observed battle${battles === 1 ? "" : "s"}. Treat the observed record as limited evidence, not a forecast.`,
      "historical",
    ));
  }
  if (holds > 0) {
    rows.push(risk(
      "historical-holds-observed",
      "warning",
      "Historical holds exist",
      `${holds} hold${holds === 1 ? "" : "s"} appear in the exact observed sample. This is evidence of failure cases, not a predicted failure rate.`,
      "historical",
    ));
  }
  return rows;
}
function rosterRisks(delta = {}, abilityConcerns = []) {
  const rows = [];
  if (delta?.speedDelta === null || delta?.speedDelta === undefined) {
    rows.push(risk(
      "speed-unresolved",
      "warning",
      "Fastest-speed evidence incomplete",
      "A fastest-known speed comparison cannot be resolved for both squads. No speed advantage is assumed.",
      "roster",
    ));
  } else if (Number(delta.speedDelta) < 0) {
    rows.push(risk(
      "speed-disadvantage",
      "warning",
      "Fastest-known speed disadvantage",
      `The recommended attackers are ${number.format(Math.abs(Number(delta.speedDelta)))} speed slower at the fastest-known unit comparison. This does not by itself determine turn order.`,
      "roster",
    ));
  }
  if (delta?.relicDelta !== null && delta?.relicDelta !== undefined && Number(delta.relicDelta) < 0) {
    rows.push(risk(
      "relic-disadvantage",
      "warning",
      "Relic-level disadvantage",
      `Total resolved Relic delta is ${signed(delta.relicDelta)} across the selected squads.`,
      "roster",
    ));
  }
  if (delta?.omicronDelta !== null && delta?.omicronDelta !== undefined && Number(delta.omicronDelta) < 0) {
    rows.push(risk(
      "omicron-count-disadvantage",
      "info",
      "Purchased Omicron count is lower",
      `Resolved purchased-Omicron count delta is ${signed(delta.omicronDelta)}. Mode applicability is not inferred from this aggregate count.`,
      "roster",
    ));
  }
  if (delta?.abilityDelta !== null && delta?.abilityDelta !== undefined && Number(delta.abilityDelta) < 0) {
    rows.push(risk(
      "ability-readiness-disadvantage",
      "warning",
      "Ability-readiness disadvantage",
      `Roster readiness delta is ${signed(delta.abilityDelta)}. Readiness is a roster heuristic, not a counter-specific ability requirement.`,
      "roster",
    ));
  }
  if (Array.isArray(abilityConcerns) && abilityConcerns.length) {
    const names = abilityConcerns.slice(0, 3).map((entry) => clean(entry?.name || entry?.baseId)).filter(Boolean);
    rows.push(risk(
      "low-tier-ability-concerns",
      "warning",
      "Low-tier purchased abilities detected",
      `${abilityConcerns.length} attacker${abilityConcerns.length === 1 ? " has" : "s have"} resolved low-tier ability concerns${names.length ? `: ${names.join(", ")}` : ""}.`,
      "roster",
    ));
  }
  return rows;
}
function datacronRisks(datacron = {}) {
  if (datacron?.selected !== true) {
    return [risk(
      "datacron-not-selected",
      "info",
      "No owned Datacron selected",
      "No Datacron benefit or requirement is assumed for this recommendation.",
      "datacron",
    )];
  }
  const coverage = datacron?.coverage;
  if (!coverage || coverage.known !== true) {
    return [risk(
      "datacron-coverage-unresolved",
      "warning",
      "Datacron ability-target coverage unresolved",
      "A Datacron is selected, but exact ability-affix target coverage is not fully resolved. Stat-affix value is not converted into an arbitrary power score.",
      "datacron",
    )];
  }
  if (Number(coverage.eligibleMembers || 0) < Number(coverage.squadSize || 0)) {
    return [risk(
      "datacron-partial-ability-coverage",
      "warning",
      "Partial Datacron ability-target coverage",
      `${coverage.eligibleMembers}/${coverage.squadSize} squad members have resolved eligibility for at least one unlocked ability target. This is not an overall Datacron value score.`,
      "datacron",
    )];
  }
  return [];
}
function normalizeGuidanceStep(value) {
  const text = clean(value?.text || value);
  if (!text) return null;
  return Object.freeze({ text, note: clean(value?.note) });
}
function normalizeSourcedExecutionGuidance(value = {}) {
  const sourceName = clean(value?.sourceName);
  const sourceRef = clean(value?.sourceRef);
  const sourceUpdatedAt = clean(value?.sourceUpdatedAt);
  const opening = (Array.isArray(value?.opening) ? value.opening : []).map(normalizeGuidanceStep).filter(Boolean);
  const targets = (Array.isArray(value?.targets) ? value.targets : []).map(normalizeGuidanceStep).filter(Boolean);
  const mechanics = (Array.isArray(value?.mechanics) ? value.mechanics : []).map(normalizeGuidanceStep).filter(Boolean);
  const avoid = (Array.isArray(value?.avoid) ? value.avoid : []).map(normalizeGuidanceStep).filter(Boolean);
  const hasContent = opening.length || targets.length || mechanics.length || avoid.length;
  if (!sourceName || !sourceRef || !hasContent) {
    return Object.freeze({
      available: false,
      label: "NO SOURCED EXECUTION SEQUENCE",
      sourceName: "",
      sourceRef: "",
      sourceUpdatedAt: "",
      opening: Object.freeze([]),
      targets: Object.freeze([]),
      mechanics: Object.freeze([]),
      avoid: Object.freeze([]),
      reason: "Opening ability, target priority and kill order are intentionally withheld until a strategy record with provenance is loaded.",
    });
  }
  return Object.freeze({
    available: true,
    label: "SOURCED EXECUTION GUIDANCE",
    sourceName,
    sourceRef,
    sourceUpdatedAt,
    opening: Object.freeze(opening),
    targets: Object.freeze(targets),
    mechanics: Object.freeze(mechanics),
    avoid: Object.freeze(avoid),
    reason: "",
  });
}
function primarySource(evidenceMatch, heuristicMatch) {
  if (evidenceMatch?.reliability?.automatic === true) return "EXACT HISTORICAL EVIDENCE";
  if (heuristicMatch) return "ROSTER-FIT HEURISTIC";
  return "AUTHORITATIVE WAR ROOM ALLOCATION";
}
function preBattleChecks({ evidenceMatch = null, delta = null, abilityKnown = false, datacron = {} } = {}) {
  return Object.freeze([
    Object.freeze({ label: "Current saved defense", status: "ready", detail: "Exact current saved-board composition resolved before brief generation." }),
    Object.freeze({ label: "Recommended attackers", status: "ready", detail: "All selected attacker units resolved from the current live roster." }),
    Object.freeze({ label: "Historical counter evidence", status: evidenceMatch ? "ready" : "unknown", detail: evidenceMatch ? `${evidenceMatch.wins || 0}/${evidenceMatch.battles || 0} observed wins in the exact actionable sample.` : "No exact actionable sample is attached to this selected squad." }),
    Object.freeze({ label: "Fastest-known speed", status: delta?.speedDelta == null ? "unknown" : "ready", detail: delta?.speedDelta == null ? "Speed comparison unresolved; no turn-order claim is made." : `Resolved fastest-known delta ${signed(delta.speedDelta)}.` }),
    Object.freeze({ label: "Ability readiness", status: abilityKnown ? "ready" : "unknown", detail: abilityKnown ? "Purchased-ability readiness is resolved for the attacker squad." : "Ability readiness is incomplete; no counter-specific minimum is inferred." }),
    Object.freeze({ label: "Datacron", status: datacron?.selected === true ? (datacron?.coverage?.known === true ? "ready" : "unknown") : "not-selected", detail: datacron?.selected === true ? (datacron?.coverage?.known === true ? "Selected owned Datacron has resolved ability-target coverage." : "Selected Datacron coverage is partially unresolved.") : "No owned Datacron is selected; none is assumed." }),
  ]);
}
function buildAttackBrief(input = {}) {
  const evidenceMatch = input.evidenceMatch || null;
  const heuristicMatch = input.heuristicMatch || null;
  const delta = input.delta || null;
  const abilityConcerns = Array.isArray(input.abilityConcerns) ? input.abilityConcerns : [];
  const datacron = input.datacron || {};
  const risks = [
    ...historicalRisks(evidenceMatch),
    ...rosterRisks(delta || {}, abilityConcerns),
    ...datacronRisks(datacron),
  ];
  return Object.freeze({
    source: primarySource(evidenceMatch, heuristicMatch),
    allocationReason: clean(input.allocationReason) || "Authoritative board-wide allocation",
    delta,
    evidenceMatch,
    heuristicMatch,
    datacron,
    abilityConcerns: Object.freeze(abilityConcerns),
    risks: Object.freeze(risks),
    checks: preBattleChecks({ evidenceMatch, delta, abilityKnown: input.abilityKnown === true, datacron }),
    execution: normalizeSourcedExecutionGuidance(input.executionGuidance || {}),
    truthBoundary: "Observed historical results are evidence, not predicted win probability. Roster readiness and delta checks are heuristics. Unsourced opening moves, target priority and kill order are not generated.",
  });
}

export {
  buildAttackBrief,
  datacronRisks,
  fastestKnownSpeed,
  finiteOrNull,
  historicalRisks,
  matchupDelta,
  metricTotal,
  normalizeBaseId,
  normalizeSourcedExecutionGuidance,
  preBattleChecks,
  primarySource,
  rosterRisks,
  signed,
};
