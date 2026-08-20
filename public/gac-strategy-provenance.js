import { findExactProvenance, provenanceState } from './gac-strategy-provenance-model.js';

const state = { promise: null, value: null };

async function loadProvenanceIndex({ force = false, fetchImpl = fetch } = {}) {
  if (!force && state.value) return state.value;
  if (!force && state.promise) return state.promise;
  const promise = fetchImpl('/data/gac-strategy-provenance-index.json', {
    method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-cache',
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `GAC provenance index returned HTTP ${response.status}.`);
    const value = Object.freeze({
      schemaVersion: Number(body?.schemaVersion || 0),
      generatedAt: String(body?.generatedAt || '').trim(),
      entries: Object.freeze(Array.isArray(body?.entries) ? body.entries.slice(0, 5000) : []),
    });
    state.value = value;
    return value;
  }).finally(() => { if (state.promise === promise) state.promise = null; });
  state.promise = promise;
  return promise;
}

async function findStrategyProvenance(context = {}, { productionGuidance = null, ...options } = {}) {
  let candidate = null;
  try {
    const index = await loadProvenanceIndex(options);
    candidate = findExactProvenance(index.entries, context);
  } catch {
    candidate = null;
  }
  return provenanceState({ productionGuidance, candidate });
}

function resetStrategyProvenanceForTest() {
  state.promise = null;
  state.value = null;
}

export { findStrategyProvenance, loadProvenanceIndex, resetStrategyProvenanceForTest };
