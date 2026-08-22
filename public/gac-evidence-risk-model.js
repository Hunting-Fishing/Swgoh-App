const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const array = (value) => Array.isArray(value) ? value : [];

const WILSON_Z_90 = 1.6448536269514722;

export function wilsonLowerBound(wins, battles, z = WILSON_Z_90) {
  const total = Math.max(0, Math.floor(finite(battles, 0)));
  if (!total) return null;
  const success = Math.max(0, Math.min(total, finite(wins, 0)));
  const p = success / total;
  const zValue = Math.max(0, finite(z, WILSON_Z_90));
  const z2 = zValue * zValue;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = zValue * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, Math.min(1, (center - margin) / denominator));
}

export function gacEvidenceSampleQuality(battles) {
  const total = Math.max(0, Math.floor(finite(battles, 0)));
  if (!total) return 'none';
  if (total < 5) return 'very-low';
  if (total < 20) return 'low';
  if (total < 50) return 'moderate';
  if (total < 100) return 'strong';
  return 'deep';
}

export function gacFailureRiskBand(lowerBound, battles) {
  const total = Math.max(0, Math.floor(finite(battles, 0)));
  if (!total || !Number.isFinite(Number(lowerBound))) return 'unknown';
  if (total < 5) return 'insufficient';
  const floor = Number(lowerBound);
  if (floor >= 0.9) return 'very-low';
  if (floor >= 0.8) return 'low';
  if (floor >= 0.65) return 'moderate';
  if (floor >= 0.5) return 'high';
  return 'critical';
}

export function gacRelicBurdenBand(averageRelicDelta, relicDeltaSamples = 0) {
  const samples = Math.max(0, Math.floor(finite(relicDeltaSamples, 0)));
  const delta = finite(averageRelicDelta, null);
  if (!samples || delta === null) return 'unknown';
  if (delta >= 2) return 'high';
  if (delta >= 1) return 'elevated';
  if (delta > 0.25) return 'slight';
  if (delta >= -0.25) return 'neutral';
  return 'efficient';
}

function resolvedWins(input = {}, battles = 0) {
  const explicit = finite(input?.wins, null);
  if (explicit !== null) return Math.max(0, Math.min(battles, explicit));
  const rate = finite(input?.winRate, null);
  if (rate === null) return 0;
  return Math.max(0, Math.min(battles, Math.round(Math.max(0, Math.min(1, rate)) * battles)));
}

export function historicalGacEvidenceRisk(input = {}) {
  const battles = Math.max(0, Math.floor(finite(input?.battles, 0)));
  const wins = resolvedWins(input, battles);
  const observedWinRate = battles
    ? Math.max(0, Math.min(1, finite(input?.winRate, wins / battles)))
    : null;
  const observedWinRateLowerBound90 = wilsonLowerBound(wins, battles);
  const confidence = Math.max(0, Math.min(1, finite(input?.confidence, 1)));
  const defenderSize = array(input?.enemyMembers || input?.defenderMembers).length;
  const attackerSize = array(input?.counterMembers || input?.attackerMembers).length;
  const undersizeCount = defenderSize && attackerSize ? Math.max(0, defenderSize - attackerSize) : 0;
  const averageRelicDelta = finite(input?.averageRelicDelta, null);
  const relicDeltaSamples = Math.max(0, Math.floor(finite(input?.relicDeltaSamples, 0)));

  return Object.freeze({
    battles,
    wins,
    observedWinRate,
    observedWinRateLowerBound90,
    sampleQuality: gacEvidenceSampleQuality(battles),
    failureRiskBand: gacFailureRiskBand(observedWinRateLowerBound90, battles),
    confidence,
    undersizeCount,
    averageRelicDelta,
    relicDeltaSamples,
    relicBurdenBand: gacRelicBurdenBand(averageRelicDelta, relicDeltaSamples),
    evidenceBoundary: 'Historical evidence risk is descriptive. The 90% lower confidence bound is not a predicted win probability for the current battle.',
  });
}

export function gacEvidenceRankingScore(input = {}) {
  const risk = historicalGacEvidenceRisk(input);
  const floor = finite(risk.observedWinRateLowerBound90, 0);
  const sampleTerm = Math.log10(Math.max(1, risk.battles) + 1) * 15;
  const bannerTerm = Number.isFinite(Number(input?.averageBanners)) ? Number(input.averageBanners) * 0.25 : 0;
  const relicPenalty = risk.relicDeltaSamples && risk.averageRelicDelta > 0 ? Math.min(4, risk.averageRelicDelta) * 8 : 0;
  const undersizeBonus = floor >= 0.8 ? Math.min(2, risk.undersizeCount) * 8 : 0;
  return floor * 1000 + risk.confidence * 35 + sampleTerm + bannerTerm + undersizeBonus - relicPenalty;
}

export const GAC_EVIDENCE_RISK_VERSION = 'gac-evidence-risk-v1';
