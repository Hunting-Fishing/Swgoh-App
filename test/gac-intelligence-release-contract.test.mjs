import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'public/gac-counter-matrix-model.js',
  'public/gac-counter-matrix-ui.js',
  'public/gac-counter-matrix.css',
  'public/gac-board-optimization-model.js',
  'public/gac-board-optimization-ui.js',
  'public/gac-board-optimization.css',
  'public/gac-relic-suitability-model.js',
  'public/gac-relic-suitability-ui.js',
  'public/gac-relic-suitability.css',
  'public/gac-scouting-history-model.js',
  'public/gac-scouting-history-ui.js',
  'public/gac-scouting-history.css',
  'public/gac-scouting-staging-ui.js',
  'public/gac-scouting-staging.css',
  'public/gac-datacron-evidence-signature.js',
  'public/gac-datacron-readiness-ui.js',
  'public/gac-datacron-readiness.css',
  'public/gac-datacron-matrix-ui.js',
  'public/gac-datacron-matrix.css',
  'public/gac-intelligence-export.js',
  'public/gac-intelligence-export.css',
  'gac-datacron-counter-evidence-service.mjs',
  'supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql',
];

function source(path) { return readFileSync(resolve(root, path), 'utf8'); }

test('every GAC intelligence runtime module referenced by the bootstrap exists', () => {
  for (const path of required) assert.equal(existsSync(resolve(root, path)), true, `${path} must exist`);
  const bootstrap = source('public/gac-manual-selection-guard.js');
  for (const module of [
    'gac-counter-matrix-ui.js',
    'gac-board-optimization-ui.js',
    'gac-relic-suitability-ui.js',
    'gac-scouting-history-ui.js',
    'gac-scouting-staging-ui.js',
    'gac-datacron-readiness-ui.js',
    'gac-datacron-matrix-ui.js',
    'gac-intelligence-export.js',
  ]) assert.match(bootstrap, new RegExp(module.replaceAll('.', '\\.')));
});

test('intelligence panels are on-demand rather than automatic recurring network analyzers', () => {
  const optimizer = source('public/gac-board-optimization-ui.js');
  const relic = source('public/gac-relic-suitability-ui.js');
  const dcMatrix = source('public/gac-datacron-matrix-ui.js');
  const staging = source('public/gac-scouting-staging-ui.js');
  assert.match(optimizer, /data-gac-opt-analyze/);
  assert.match(relic, /data-gac-relic-analyze/);
  assert.match(dcMatrix, /data-gac-dcm-load/);
  assert.match(staging, /data-gac-stage-build/);
  assert.doesNotMatch(optimizer, /setInterval\s*\(/);
  assert.doesNotMatch(relic, /setInterval\s*\(/);
  assert.doesNotMatch(dcMatrix, /setInterval\s*\(/);
  assert.doesNotMatch(staging, /setInterval\s*\(/);
});

test('historical staging never silently saves current-board defenses', () => {
  const staging = source('public/gac-scouting-staging-ui.js');
  assert.match(staging, /Nothing is saved automatically/);
  assert.match(staging, /openSquadSlot/);
  assert.doesNotMatch(staging, /\/api\/gac\/current-board\/.*POST/);
  assert.doesNotMatch(staging, /fetchJson\([^\n]*method\s*:\s*['"]POST['"]/);
});

test('relic suitability is explicitly current-roster context rather than historical relic evidence', () => {
  const relic = source('public/gac-relic-suitability-ui.js');
  assert.match(relic, /Current RΔ is a roster-fit check/i);
  assert.match(relic, /not relic-normalized/i);
  assert.doesNotMatch(relic, /historical average relic delta/i);
});

test('Datacron evidence preserves none versus unknown and excludes instance IDs from signatures', () => {
  const signature = source('public/gac-datacron-evidence-signature.js');
  assert.match(signature, /DC:NONE/);
  assert.match(signature, /DC:UNKNOWN/);
  assert.doesNotMatch(signature, /datacron\?\.id/);
  assert.doesNotMatch(signature, /instanceId/);
});

test('verified battle save treats Datacron archival as supplemental', () => {
  const verified = source('gac-verified-battle-service.mjs');
  assert.match(verified, /archiveDatacronEvidence/);
  assert.match(verified, /Verified GAC battle saved without supplemental Datacron evidence/);
  assert.match(verified, /store\.upsert\("gac_battles"/);
});

test('Datacron evidence migration is additive, indexed and inaccessible to browser roles', () => {
  const migration = source('supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql');
  assert.match(migration, /create table if not exists public\.gac_datacron_battle_evidence/);
  assert.match(migration, /battle_key text not null unique/);
  assert.match(migration, /gac_dc_battle_exact_matchup_idx/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.gac_datacron_battle_evidence from anon, authenticated/);
});

test('whole-board optimizer explicitly describes banners as evidence, not guaranteed score', () => {
  const ui = source('public/gac-board-optimization-ui.js');
  assert.match(ui, /not guaranteed scores/i);
  assert.match(ui, /Server Attack Plan remains authoritative/i);
});

test('matrix and plan exports are client-side only', () => {
  const exportUi = source('public/gac-intelligence-export.js');
  assert.match(exportUi, /DOWNLOAD CSV/);
  assert.match(exportUi, /DOWNLOAD TXT/);
  assert.doesNotMatch(exportUi, /fetch\s*\(/);
});
