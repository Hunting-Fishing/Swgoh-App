import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  candidateSummary,
  promoteCandidate,
  promotionReady,
} from "./public/gac-strategy-source-review-model.js";
import { catalogPayload } from "./public/gac-strategy-catalog.js";

const ROOT = fileURLToPath(new URL("./", import.meta.url));
const CANDIDATE_PATH = resolve(ROOT, "public/data/gac-strategy-source-candidates.json");
const PRODUCTION_PATH = resolve(ROOT, "public/data/gac-strategy-records.json");
const GAME_CATALOG_PATH = resolve(ROOT, "public/data/catalog.json");

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function duplicateValues(values = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values.map(clean).filter(Boolean)) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return Object.freeze([...duplicates].sort());
}
function catalogBaseIdSet(gameCatalog = {}) {
  return new Set(asArray(gameCatalog?.units).map((unit) => normalizeBaseId(unit?.baseId)).filter(Boolean));
}
function strategyBaseIds(candidate = {}) {
  const record = candidate?.proposedRecord || {};
  return Object.freeze([...new Set([
    ...asArray(record?.defender?.members),
    ...asArray(record?.attacker?.members),
    record?.defender?.leaderBaseId,
    record?.attacker?.leaderBaseId,
  ].map(normalizeBaseId).filter(Boolean))].sort());
}
function invalidCandidateBaseIds(candidate = {}, gameCatalog = {}) {
  const known = catalogBaseIdSet(gameCatalog);
  if (!known.size) return Object.freeze(strategyBaseIds(candidate));
  return Object.freeze(strategyBaseIds(candidate).filter((id) => !known.has(id)));
}
function auditSourceCandidates(candidateBody = {}, productionBody = {}, gameCatalog = null) {
  const candidates = asArray(candidateBody?.candidates);
  const production = catalogPayload(productionBody);
  const summaries = candidates.map(candidateSummary);
  const approved = candidates.filter((candidate) => clean(candidate?.review?.status).toLowerCase() === "approved");
  const invalidApproved = approved.filter((candidate) => !promotionReady(candidate));
  const promotable = approved.filter((candidate) => promotionReady(candidate));
  const productionIds = new Set(production.records.map((record) => record.id));
  const duplicateProductionIds = promotable
    .map((candidate) => clean(candidate?.proposedRecord?.id))
    .filter((id) => id && productionIds.has(id));
  const duplicateCandidateIds = duplicateValues(candidates.map((candidate) => candidate?.candidateId));
  const duplicateProposedRecordIds = duplicateValues(candidates.map((candidate) => candidate?.proposedRecord?.id));
  const schemaVersion = Number(candidateBody?.schemaVersion || 0);
  const gameCatalogAuditEnabled = Boolean(gameCatalog && typeof gameCatalog === "object");
  const knownBaseIds = gameCatalogAuditEnabled ? catalogBaseIdSet(gameCatalog) : new Set();
  const baseIdAudit = candidates.map((candidate) => Object.freeze({
    candidateId: clean(candidate?.candidateId),
    invalidBaseIds: gameCatalogAuditEnabled ? invalidCandidateBaseIds(candidate, gameCatalog) : Object.freeze([]),
  }));
  const approvedInvalidBaseIds = new Set();
  if (gameCatalogAuditEnabled) {
    const approvedIds = new Set(approved.map((candidate) => clean(candidate?.candidateId)));
    for (const row of baseIdAudit) {
      if (!approvedIds.has(row.candidateId)) continue;
      for (const id of row.invalidBaseIds) approvedInvalidBaseIds.add(id);
    }
  }
  const safe = schemaVersion === 1
    && invalidApproved.length === 0
    && duplicateProductionIds.length === 0
    && duplicateCandidateIds.length === 0
    && duplicateProposedRecordIds.length === 0
    && production.rejected.length === 0
    && (!gameCatalogAuditEnabled || (knownBaseIds.size > 0 && approvedInvalidBaseIds.size === 0));
  return Object.freeze({
    schemaVersion,
    candidateCount: candidates.length,
    pending: summaries.filter((row) => row.status === "pending").length,
    quarantined: summaries.filter((row) => row.status === "quarantined").length,
    rejected: summaries.filter((row) => row.status === "rejected").length,
    approved: approved.length,
    promotionReady: promotable.length,
    invalidApproved: Object.freeze(invalidApproved.map(candidateSummary)),
    duplicateProductionIds: Object.freeze([...new Set(duplicateProductionIds)].sort()),
    duplicateCandidateIds,
    duplicateProposedRecordIds,
    gameCatalog: Object.freeze({
      audited: gameCatalogAuditEnabled,
      unitCount: knownBaseIds.size,
      approvedInvalidBaseIds: Object.freeze([...approvedInvalidBaseIds].sort()),
    }),
    baseIdAudit: Object.freeze(baseIdAudit),
    production: Object.freeze({
      accepted: production.records.length,
      rejected: production.rejected.length,
      schemaVersion: production.schemaVersion,
    }),
    candidates: Object.freeze(summaries),
    safe,
  });
}

function buildProductionCatalog(candidateBody = {}, productionBody = {}, generatedAt = new Date().toISOString(), gameCatalog = null) {
  const audit = auditSourceCandidates(candidateBody, productionBody, gameCatalog);
  if (!audit.safe) {
    const error = new Error("GAC strategy source audit is not safe for promotion.");
    error.code = "GAC_STRATEGY_AUDIT_FAILED";
    error.audit = audit;
    throw error;
  }
  const approved = asArray(candidateBody?.candidates)
    .filter((candidate) => clean(candidate?.review?.status).toLowerCase() === "approved")
    .map(promoteCandidate);
  const existing = catalogPayload(productionBody).records;
  return Object.freeze({
    schemaVersion: 1,
    generatedAt,
    sourcePolicy: clean(productionBody?.sourcePolicy),
    records: Object.freeze([...existing, ...approved]),
  });
}

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const [candidates, production, gameCatalog] = await Promise.all([
    readJson(CANDIDATE_PATH),
    readJson(PRODUCTION_PATH),
    readJson(GAME_CATALOG_PATH),
  ]);
  const audit = auditSourceCandidates(candidates, production, gameCatalog);
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  if (!audit.safe) process.exitCode = 1;
  if (!write) return audit;
  if (!audit.safe) throw new Error("Refusing to write production strategy catalog because the source audit failed.");
  const next = buildProductionCatalog(candidates, production, new Date().toISOString(), gameCatalog);
  const productionCount = asArray(production?.records).length;
  if (next.records.length === productionCount) {
    process.stdout.write("No approved strategy candidates are ready for promotion; production catalog unchanged.\n");
    return audit;
  }
  await writeFile(PRODUCTION_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  process.stdout.write(`Promoted ${next.records.length - productionCount} reviewed strategy record(s).\n`);
  return audit;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error?.message || error);
    if (error?.audit) console.error(JSON.stringify(error.audit, null, 2));
    process.exitCode = 1;
  });
}

export {
  auditSourceCandidates,
  buildProductionCatalog,
  catalogBaseIdSet,
  duplicateValues,
  invalidCandidateBaseIds,
  main,
  strategyBaseIds,
};
