import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { candidateSummary, normalizeCandidate } from './public/gac-strategy-source-review-model.js';

const ROOT = fileURLToPath(new URL('./', import.meta.url));
const CANDIDATE_PATH = resolve(ROOT, 'public/data/gac-strategy-source-candidates.json');
const INDEX_PATH = resolve(ROOT, 'public/data/gac-strategy-provenance-index.json');
const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();

function side(value = {}) {
  return Object.freeze({
    leaderBaseId: normalizeId(value.leaderBaseId),
    members: Object.freeze([...new Set(asArray(value.members).map(normalizeId).filter(Boolean))]),
  });
}
function validationRef(value = {}) {
  return Object.freeze({
    kind: clean(value.kind), sourceName: clean(value.sourceName), sourceRef: clean(value.sourceRef), capturedAt: clean(value.capturedAt), note: clean(value.note),
  });
}
function sanitizedEntry(candidateInput = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const summary = candidateSummary(candidateInput);
  const record = candidateInput?.proposedRecord || {};
  const provenance = record?.provenance || {};
  const validity = record?.validity || {};
  const rawResearch = candidateInput?.research || {};
  return Object.freeze({
    candidateId: candidate.candidateId,
    recordId: clean(record.id),
    format: clean(record.format).toLowerCase(),
    defender: side(record.defender),
    attacker: side(record.attacker),
    source: Object.freeze({
      name: clean(provenance.sourceName), ref: clean(provenance.sourceRef), type: clean(provenance.sourceType), author: clean(provenance.author), updatedAt: clean(provenance.sourceUpdatedAt || provenance.sourcePublishedAt), capturedAt: clean(provenance.capturedAt),
    }),
    review: Object.freeze({
      status: candidate.review.status,
      promotionReady: summary.promotionReady === true,
      blockers: summary.blockers,
      flags: candidate.review.flags,
    }),
    validity: Object.freeze({
      validFrom: clean(validity.validFrom), validUntil: clean(validity.validUntil), gameDataVersion: clean(validity.gameDataVersion), notes: clean(validity.notes),
    }),
    research: Object.freeze({
      snapshotDate: clean(rawResearch.sourceSnapshotDate),
      notes: clean(rawResearch.sourceNotes),
      validationRefs: Object.freeze(asArray(rawResearch.validationRefs).map(validationRef)),
    }),
  });
}
function buildProvenanceIndex(candidateBody = {}, generatedAt = clean(candidateBody.generatedAt) || new Date().toISOString()) {
  if (Number(candidateBody?.schemaVersion || 0) !== 1) throw new Error('Unsupported GAC strategy candidate schema.');
  const entries = asArray(candidateBody.candidates).map(sanitizedEntry);
  const ids = entries.map((row) => row.candidateId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate GAC strategy candidate IDs cannot be indexed.');
  const payload = Object.freeze({ schemaVersion: 1, generatedAt, entries: Object.freeze(entries) });
  const text = JSON.stringify(payload);
  for (const forbidden of ['"guidance"','"opening"','"targets"','"mechanics"','"avoid"']) {
    if (text.includes(forbidden)) throw new Error(`Unsafe execution field leaked into provenance index: ${forbidden}`);
  }
  return payload;
}
async function main(argv = process.argv.slice(2)) {
  const candidateBody = JSON.parse(await readFile(CANDIDATE_PATH, 'utf8'));
  const payload = buildProvenanceIndex(candidateBody);
  if (argv.includes('--write')) {
    await writeFile(INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`Wrote ${payload.entries.length} sanitized GAC provenance entries.\n`);
  } else {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }
  return payload;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });

export { buildProvenanceIndex, sanitizedEntry, main };
