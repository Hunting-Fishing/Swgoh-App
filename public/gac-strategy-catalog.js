import { SCHEMA_VERSION, findExactStrategy, strategyGuidance, validateRecord } from "./gac-strategy-record-model.js";

const state = {
  promise: null,
  value: null,
};

function catalogPayload(body = {}) {
  const schemaVersion = Number(body?.schemaVersion || 0);
  const records = Array.isArray(body?.records) ? body.records.slice(0, 5000) : [];
  const accepted = [];
  const rejected = [];
  if (schemaVersion !== SCHEMA_VERSION) {
    rejected.push(Object.freeze({ id: "$catalog", errors: Object.freeze(["unsupported-catalog-schema-version"]) }));
    return Object.freeze({
      schemaVersion,
      generatedAt: body?.generatedAt || null,
      records: Object.freeze([]),
      rejected: Object.freeze(rejected),
      sourcePolicy: String(body?.sourcePolicy || "").trim(),
    });
  }

  const seenIds = new Set();
  for (const source of records) {
    const result = validateRecord(source);
    if (!result.valid) {
      rejected.push(Object.freeze({ id: String(source?.id || "").trim(), errors: result.errors }));
      continue;
    }
    if (seenIds.has(result.record.id)) {
      rejected.push(Object.freeze({ id: result.record.id, errors: Object.freeze(["duplicate-id"]) }));
      continue;
    }
    seenIds.add(result.record.id);
    accepted.push(result.record);
  }
  return Object.freeze({
    schemaVersion,
    generatedAt: body?.generatedAt || null,
    records: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
    sourcePolicy: String(body?.sourcePolicy || "").trim(),
  });
}

async function fetchCatalog(fetchImpl = fetch) {
  const response = await fetchImpl("/data/gac-strategy-records.json", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-cache",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `GAC strategy catalog returned HTTP ${response.status}.`);
  return catalogPayload(body);
}

async function loadStrategyCatalog({ force = false, fetchImpl = fetch } = {}) {
  if (!force && state.value) return state.value;
  if (!force && state.promise) return state.promise;
  const promise = fetchCatalog(fetchImpl)
    .then((value) => {
      state.value = value;
      return value;
    })
    .finally(() => {
      if (state.promise === promise) state.promise = null;
    });
  state.promise = promise;
  return promise;
}

async function findStrategyGuidance(context = {}, options = {}) {
  const catalog = await loadStrategyCatalog(options);
  const record = findExactStrategy(catalog.records, context);
  return Object.freeze({
    matched: Boolean(record),
    guidance: record ? strategyGuidance(record) : null,
    record: record || null,
    catalog: Object.freeze({
      schemaVersion: catalog.schemaVersion,
      generatedAt: catalog.generatedAt,
      accepted: catalog.records.length,
      rejected: catalog.rejected.length,
    }),
  });
}

function resetStrategyCatalogForTest() {
  state.promise = null;
  state.value = null;
}

export {
  catalogPayload,
  fetchCatalog,
  findStrategyGuidance,
  loadStrategyCatalog,
  resetStrategyCatalogForTest,
};
