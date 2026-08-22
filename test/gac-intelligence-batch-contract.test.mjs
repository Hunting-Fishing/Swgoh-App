import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('GAC intelligence bootstrap wires all planned intelligence surfaces', () => {
  const bootstrap = read('public/gac-manual-selection-guard.js');
  for (const moduleName of [
    'gac-counter-matrix-ui.js',
    'gac-scouting-history-ui.js',
    'gac-datacron-readiness-ui.js',
    'gac-datacron-matrix-ui.js',
  ]) assert.match(bootstrap, new RegExp(moduleName.replaceAll('.', '\\.')));
  for (const cssName of [
    'gac-counter-matrix.css',
    'gac-scouting-history.css',
    'gac-datacron-readiness.css',
    'gac-datacron-matrix.css',
  ]) assert.match(bootstrap, new RegExp(cssName.replaceAll('.', '\\.')));
});

test('counter matrix is roster constrained, sample gated, and non-overlapping', () => {
  const model = read('public/gac-counter-matrix-model.js');
  assert.match(model, /counterAvailability/);
  assert.match(model, /minimumRelic/);
  assert.match(model, /minimumBattles/);
  assert.match(model, /allocateNonOverlapping/);
  assert.match(model, /projectedBanners/);
  assert.match(model, /exact-defense/);
});

test('counter matrix can lock an evidence variant into the authoritative attack plan', () => {
  const ui = read('public/gac-counter-matrix-ui.js');
  assert.match(ui, /\/api\/gac\/counters\/batch/);
  assert.match(ui, /\/api\/gac\/attack-plan\//);
  assert.match(ui, /PLAN THIS COUNTER/);
  assert.match(ui, /already-used-or-reserved/);
});

test('historical scouting remains explicitly non-current truth and stages into review editor', () => {
  const scout = read('public/gac-scouting-history-ui.js');
  assert.match(scout, /Historical defense tendencies/);
  assert.match(scout, /never treated as current hidden-board truth/);
  assert.match(scout, /\/api\/gac\/scouting\//);
  assert.match(scout, /openSquadSlot/);
  assert.match(scout, /REVIEW IN/);
});

test('Datacron evidence uses normalized signatures and preserves unknown versus none', () => {
  const signature = read('public/gac-datacron-evidence-signature.js');
  const matrix = read('public/gac-datacron-matrix-ui.js');
  const service = read('gac-datacron-counter-evidence-service.mjs');
  assert.match(signature, /DC:NONE/);
  assert.match(signature, /DC:UNKNOWN/);
  assert.match(signature, /SET=/);
  assert.match(matrix, /EXACT DC SIGNATURE/);
  assert.match(matrix, /Unknown DC state is never treated as none/);
  assert.match(service, /gac_datacron_battle_evidence/);
});

test('verified owner battle results feed supplemental Datacron evidence without blocking battle archival', () => {
  const verified = read('gac-verified-battle-service.mjs');
  assert.match(verified, /gacDatacronCounterEvidenceService/);
  assert.match(verified, /archiveDatacronEvidence/);
  assert.match(verified, /Verified GAC battle saved without supplemental Datacron evidence/);
});
