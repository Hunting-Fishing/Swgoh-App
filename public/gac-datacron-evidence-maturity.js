const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const array = (value) => Array.isArray(value) ? value : [];

export function datacronWarehouseBattleSamples(batch = {}) {
  return array(batch?.results).reduce((sum, result) => sum + array(result?.observations)
    .reduce((rowSum, observation) => rowSum + Math.max(0, n(observation?.battles)), 0), 0);
}

export function summarizeDatacronWarehouseMaturity(batch = {}) {
  const battleSamples = datacronWarehouseBattleSamples(batch);
  const matchupRows = Math.max(0, Math.floor(n(batch?.count)));
  if (batch?.warehouseReady !== true) return Object.freeze({
    state: 'not-ready',
    label: 'WAREHOUSE NOT READY',
    detail: 'Datacron-specific evidence storage is not available yet.',
    battleSamples,
    matchupRows,
    experimental: true,
  });
  if (battleSamples === 0) return Object.freeze({
    state: 'empty',
    label: 'EXPERIMENTAL · NO VERIFIED DC SAMPLES',
    detail: 'The Datacron warehouse is ready but has no verified Datacron battle samples yet.',
    battleSamples,
    matchupRows,
    experimental: true,
  });
  if (battleSamples < 25) return Object.freeze({
    state: 'low-sample',
    label: 'EXPERIMENTAL · LOW SAMPLE',
    detail: `${battleSamples} verified Datacron battle sample(s). Treat matchup rates as early evidence.`,
    battleSamples,
    matchupRows,
    experimental: true,
  });
  if (battleSamples < 100) return Object.freeze({
    state: 'growing',
    label: 'GROWING EVIDENCE',
    detail: `${battleSamples} verified Datacron battle samples. Sample counts remain visible per matchup.`,
    battleSamples,
    matchupRows,
    experimental: false,
  });
  return Object.freeze({
    state: 'established',
    label: 'VERIFIED EVIDENCE',
    detail: `${battleSamples} verified Datacron battle samples. Historical evidence still does not guarantee the current battle.`,
    battleSamples,
    matchupRows,
    experimental: false,
  });
}
