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
function forecastEntries(report = {}, modeValue = "", limit = 8) {
  const format = modeFormat(modeValue);
  const size = modeSize(modeValue);
  const max = Math.max(1, Number(limit) || 8);
  const rows = (Array.isArray(report?.predictions) ? report.predictions : [])
    .filter((prediction) => !format || clean(prediction?.format).toLowerCase() === format)
    .slice(0, max)
    .map((prediction, forecastIndex) => ({ prediction, forecastIndex }));
  const seen = new Set();
  const valid = rows.filter(({ prediction }) => {
    const members = normalizeMembers(prediction?.members);
    if (members.length !== size) return false;
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
  return members.map((id) => index.get(id)).filter(Boolean);
}
function allocationByForecastIndex(plan = {}) {
  return new Map((Array.isArray(plan?.assignments) ? plan.assignments : [])
    .map((assignment) => [Number(assignment?.sourceIndex), assignment])
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
  forecastEntries,
  forecastEntryKey,
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
};
