const text = (value) => String(value ?? "").trim();

const COVERAGE_WEIGHT = Object.freeze({ missing: 100, partial: 55, covered: 0 });
const TYPE_WEIGHT = Object.freeze({ special: 35, fleet: 18, combat: 10 });
const TB_WEIGHT = Object.freeze({
  rote: 15,
  "geo-separatist": 12,
  "geo-republic": 11,
  "hoth-imperial": 7,
  "hoth-rebel": 6,
});

function rewardSignal(row = {}) {
  const value = `${text(row.missionName)} ${text(row.missionId)}`.toLowerCase();
  let score = 0;
  const reasons = [];
  if (/shard|ki-adi|wat|probe droid|leia|reva/.test(value)) {
    score += 28;
    reasons.push("character-shard reward mission");
  }
  if (/unlock|zeffo|mandalore/.test(value)) {
    score += 25;
    reasons.push("territory/unlock progression mission");
  }
  if (/special/.test(value)) {
    score += 12;
    reasons.push("special mission");
  }
  if (/jabba|acklay|dooku|asajj/.test(value)) {
    score += 8;
    reasons.push("high-value named encounter");
  }
  return { score, reasons };
}

function evidenceGapSignal(row = {}) {
  const value = `${text(row.strategyStatus)} ${text(row.confidence)} ${text(row.reason)}`.toLowerCase();
  let score = 0;
  const reasons = [];
  if (/partial|unverified|pending/.test(value)) {
    score += 14;
    reasons.push("explicit evidence gap");
  }
  if (row.strategyAvailable === false) {
    score += 20;
    reasons.push("no resolver-owned strategy");
  }
  if (Number(row.stageCount || 0) === 0) {
    score += 8;
    reasons.push("no execution stages");
  }
  return { score, reasons };
}

export function territoryBattleResearchPriority(row = {}) {
  const coverage = text(row.coverage).toLowerCase() || "missing";
  const missionType = text(row.missionType).toLowerCase() || "combat";
  const phase = Number(row.phase || 0);
  const reward = rewardSignal(row);
  const evidence = evidenceGapSignal(row);
  const score = (COVERAGE_WEIGHT[coverage] ?? 80)
    + (TYPE_WEIGHT[missionType] ?? 8)
    + (TB_WEIGHT[text(row.tbId)] ?? 0)
    + Math.max(0, phase) * 2
    + reward.score
    + evidence.score;

  const reasons = [
    coverage === "missing" ? "missing strategy coverage" : coverage === "partial" ? "partial strategy coverage" : "covered strategy",
    missionType === "special" ? "special mission priority" : missionType === "fleet" ? "fleet mission priority" : "combat mission priority",
    ...reward.reasons,
    ...evidence.reasons,
  ];

  return {
    score,
    reasons: [...new Set(reasons)],
    tier: score >= 145 ? "P0" : score >= 115 ? "P1" : score >= 85 ? "P2" : score >= 55 ? "P3" : "P4",
  };
}

export function buildTerritoryBattleResearchQueue(rows = [], { includeCovered = false, tbId = "" } = {}) {
  return (rows || [])
    .filter((row) => includeCovered || row.coverage !== "covered")
    .filter((row) => !tbId || row.tbId === tbId)
    .map((row) => ({ ...row, researchPriority: territoryBattleResearchPriority(row) }))
    .sort((a, b) => b.researchPriority.score - a.researchPriority.score
      || String(a.tbId).localeCompare(String(b.tbId))
      || Number(a.phase || 0) - Number(b.phase || 0)
      || String(a.missionName).localeCompare(String(b.missionName)));
}
