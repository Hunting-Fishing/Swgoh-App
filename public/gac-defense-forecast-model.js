function clean(value) { return String(value ?? "").trim(); }

function predictionFormatForMode(value) {
  const mode = clean(value).toLowerCase();
  if (mode === "3" || mode === "3v3") return "3v3";
  if (mode === "5" || mode === "5v5") return "5v5";
  return "";
}

function predictionCoverageForMode(coverage = {}, modeValue = "") {
  const format = predictionFormatForMode(modeValue);
  if (!format) return coverage || {};
  return coverage?.byFormat?.[format] || {
    battleObservedMatchups: 0,
    verifiedHistoricalBoards: 0,
  };
}

function predictionEvidenceLabel(value) {
  const key = clean(value).toLowerCase();
  return ({
    "verified-zone-recurring": "VERIFIED ZONE · RECURRING",
    "verified-zone-once": "VERIFIED ZONE · SEEN ONCE",
    "battle-recurring": "BATTLE HISTORY · RECURRING",
    "battle-observed": "BATTLE HISTORY · OBSERVED",
  })[key] || "HISTORICAL EVIDENCE";
}

function predictionEvidenceTone(value) {
  const key = clean(value).toLowerCase();
  if (key === "verified-zone-recurring") return "strong";
  if (key === "verified-zone-once") return "verified";
  if (key === "battle-recurring") return "recurring";
  return "observed";
}

function visiblePredictions(report = {}, modeValue = "", limit = 8) {
  const format = predictionFormatForMode(modeValue);
  const rows = Array.isArray(report?.predictions) ? report.predictions : [];
  const filtered = format ? rows.filter((row) => clean(row?.format).toLowerCase() === format) : rows;
  return filtered.slice(0, Math.max(1, Number(limit) || 8));
}

function predictionZoneSummary(prediction = {}) {
  const zone = Array.isArray(prediction?.zoneTendencies) ? prediction.zoneTendencies[0] : null;
  if (!zone?.zone) return "No verified historical zone evidence";
  const appearances = Math.max(0, Number(zone.verifiedBoards || 0));
  const teamBoards = Math.max(0, Number(prediction?.verifiedHistoricalBoards || 0));
  const slot = Array.isArray(prediction?.slotTendencies)
    ? prediction.slotTendencies.find((entry) => clean(entry?.zone) === clean(zone.zone))
    : null;
  const slotText = slot && Number.isInteger(Number(slot.slot))
    ? ` · slot ${Number(slot.slot) + 1} seen ${Math.max(0, Number(slot.verifiedBoards || 0))}/${appearances || 1}`
    : "";
  return `${clean(zone.zone)} · ${appearances}/${teamBoards || appearances} verified appearances${slotText}`;
}

function scopedPredictionCoverage(prediction = {}, coverage = {}) {
  if (prediction?.formatCoverage && typeof prediction.formatCoverage === "object") return prediction.formatCoverage;
  return predictionCoverageForMode(coverage, prediction?.format);
}

function predictionBroadSummary(prediction = {}, coverage = {}) {
  const appearances = Math.max(0, Number(prediction?.battleObservedMatchups || 0));
  const scoped = scopedPredictionCoverage(prediction, coverage);
  const boards = Math.max(0, Number(scoped?.battleObservedMatchups || 0));
  if (!appearances) return "No published battle-history recurrence";
  return `${appearances}/${boards || appearances} observed historical matchups`;
}

function predictionVerifiedSummary(prediction = {}, coverage = {}) {
  const appearances = Math.max(0, Number(prediction?.verifiedHistoricalBoards || 0));
  const scoped = scopedPredictionCoverage(prediction, coverage);
  const boards = Math.max(0, Number(scoped?.verifiedHistoricalBoards || 0));
  if (!appearances) return "No completed verified boards for this exact team";
  return `${appearances}/${boards || appearances} completed verified boards`;
}

function historicalDatacronSummary(datacron) {
  if (!datacron || typeof datacron !== "object") return "";
  const level = Number.isFinite(Number(datacron.level)) ? Number(datacron.level) : null;
  const setId = clean(datacron.setId);
  const pieces = [];
  if (level !== null) pieces.push(`Level ${level}`);
  if (setId) pieces.push(`Set ${setId}`);
  return pieces.length ? `Last verified historical datacron · ${pieces.join(" · ")}` : "Last verified historical datacron recorded";
}

export {
  historicalDatacronSummary,
  predictionBroadSummary,
  predictionCoverageForMode,
  predictionEvidenceLabel,
  predictionEvidenceTone,
  predictionFormatForMode,
  predictionVerifiedSummary,
  predictionZoneSummary,
  visiblePredictions,
};
