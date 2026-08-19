function clean(value) { return String(value ?? "").trim(); }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function modeFormat(value) {
  const mode = clean(value).toLowerCase();
  return mode === "3" || mode === "3v3" ? "3v3" : mode === "5" || mode === "5v5" ? "5v5" : "";
}
function modeSize(value) { return modeFormat(value) === "3v3" ? 3 : 5; }
function normalizeMembers(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeBaseId).filter(Boolean))];
}
function forecastEntryKey(prediction = {}) {
  return `${clean(prediction?.format).toLowerCase()}|${normalizeBaseId(prediction?.leaderBaseId)}|${normalizeMembers(prediction?.members).sort().join(",")}`;
}
function forecastPriorityValue(prediction = {}) {
  const evidenceRank = ({
    "verified-zone-recurring": 4,
    "verified-zone-once": 3,
    "battle-recurring": 2,
    "battle-observed": 1,
  })[clean(prediction?.evidenceClass).toLowerCase()] || 0;
  return evidenceRank * 1_000_000 +
    Math.max(0, Number(prediction?.verifiedHistoricalBoards || 0)) * 10_000 +
    Math.max(0, Number(prediction?.battleObservedMatchups || 0)) * 100 +
    Math.max(0, Number(prediction?.observedByPlayers || 0));
}
function visibleForecastRows(report = {}, modeValue = "", limit = 8) {
  const format = modeFormat(modeValue);
  const max = Math.max(1, Number(limit) || 8);
  return (Array.isArray(report?.predictions) ? report.predictions : [])
    .filter((prediction) => !format || clean(prediction?.format).toLowerCase() === format)
    .slice(0, max);
}
function forecastEligibleForPrestage(prediction = {}) {
  const evidenceClass = clean(prediction?.evidenceClass).toLowerCase();
  if (Number(prediction?.verifiedHistoricalBoards || 0) >= 1) return true;
  if (Number(prediction?.battleObservedMatchups || 0) >= 3) return true;
  return ["verified-zone-recurring", "verified-zone-once", "battle-recurring"].includes(evidenceClass);
}
function forecastPrestageReason(prediction = {}, modeValue = "") {
  const size = modeSize(modeValue);
  if (normalizeMembers(prediction?.members).length !== size) return "exact historical composition is unresolved for this format";
  if (!forecastEligibleForPrestage(prediction)) return "single/limited sighting does not reserve a scarce squad";
  return "eligible for advisory counter pre-stage";
}
function forecastEntries(report = {}, modeValue = "", limit = 8) {
  const size = modeSize(modeValue);
  const rows = visibleForecastRows(report, modeValue, limit)
    .map((prediction, forecastIndex) => ({ prediction, forecastIndex }));
  const seen = new Set();
  const valid = rows.filter(({ prediction }) => {
    const members = normalizeMembers(prediction?.members);
    if (members.length !== size || !forecastEligibleForPrestage(prediction)) return false;
    const key = forecastEntryKey(prediction);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return valid.map(({ prediction, forecastIndex }, planIndex) => {
    const defenseId = 900_000 + forecastIndex + 1;
    return Object.freeze({
      planIndex,
      forecastIndex,
      key: forecastEntryKey(prediction),
      defenseId,
      prediction,
      defense: Object.freeze({
        id: defenseId,
        leaderBaseId: normalizeBaseId(prediction?.leaderBaseId),
        members: Object.freeze(normalizeMembers(prediction?.members)),
      }),
    });
  });
}
function consumedAttackIds(assignments = []) {
  const ids = new Set();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of normalizeMembers(attempt?.members)) ids.add(id);
    }
    const status = clean(assignment?.status).toLowerCase();
    if (["planned", "attempted"].includes(status)) {
      for (const id of normalizeMembers(assignment?.members)) ids.add(id);
    }
  }
  return [...ids];
}
function ownDefenseIds(defenses = []) {
  return [...new Set((Array.isArray(defenses) ? defenses : [])
    .flatMap((defense) => normalizeMembers(defense?.members)))];
}
function planningExclusions(ownDefenses = [], assignments = []) {
  return [...new Set([...ownDefenseIds(ownDefenses), ...consumedAttackIds(assignments)])];
}
function evidenceMapFromBatch(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : [])
    .map((entry) => [normalizeBaseId(entry?.enemyLeaderBaseId), entry])
    .filter(([leader]) => Boolean(leader)));
}
function leadersForEntries(entries = []) {
  return [...new Set((Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeBaseId(entry?.defense?.leaderBaseId || entry?.prediction?.leaderBaseId))
    .filter(Boolean))].sort();
}
function rosterIndex(roster = {}) {
  return new Map((Array.isArray(roster?.units) ? roster.units : [])
    .map((unit) => [normalizeBaseId(unit?.baseId), unit])
    .filter(([id]) => Boolean(id)));
}
function defenderUnits(entry = {}, opponentRoster = {}) {
  const index = rosterIndex(opponentRoster);
  const members = normalizeMembers(entry?.defense?.members || entry?.prediction?.members);
  const units = members.map((id) => index.get(id)).filter(Boolean);
  return units.length === members.length ? units : [];
}
function allocationByForecastIndex(plan = {}) {
  return new Map((Array.isArray(plan?.assignments) ? plan.assignments : [])
    .map((assignment) => {
      const defenseId = Number(assignment?.defenseId || 0);
      const forecastIndex = defenseId >= 900_001 && defenseId <= 900_999
        ? defenseId - 900_001
        : Number(assignment?.sourceIndex);
      return [forecastIndex, assignment];
    })
    .filter(([index]) => Number.isInteger(index) && index >= 0));
}
function planningContextLabel(context = {}) {
  if (context?.round && context?.ownDefenseKnown && context?.attackPlanKnown) {
    return "FULL CONTEXT · own defense and current attack commitments protected";
  }
  if (context?.round) return "PARTIAL CONTEXT · some current-round exclusions were unavailable";
  return "PRE-MATCH CONTEXT · no current-round attack locks were applied";
}

export {
  allocationByForecastIndex,
  consumedAttackIds,
  defenderUnits,
  evidenceMapFromBatch,
  forecastEligibleForPrestage,
  forecastEntries,
  forecastEntryKey,
  forecastPrestageReason,
  forecastPriorityValue,
  leadersForEntries,
  modeFormat,
  modeSize,
  normalizeBaseId,
  ownDefenseIds,
  planningContextLabel,
  planningExclusions,
  rosterIndex,
  validRound,
  visibleForecastRows,
};
