import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cleanup=fs.readFileSync(new URL('../public/gac-fleet-cleanup-control.js',import.meta.url),'utf8');
const provenance=fs.readFileSync(new URL('../public/gac-fleet-cleanup-provenance.js',import.meta.url),'utf8');
const provenanceCss=fs.readFileSync(new URL('../public/gac-fleet-cleanup-provenance.css',import.meta.url),'utf8');
const plans=fs.readFileSync(new URL('../gac-fleet-attack-plan-service.mjs',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../public/asset-resilience.js',import.meta.url),'utf8');

test('cleanup replans use the normal canonical plan lifecycle while preserving prior attempt history',()=>{
  assert.match(cleanup,/gac-command-center-fleet-cleanup-lock/);
  assert.match(cleanup,/planEndpoint\(snapshot\)/);
  assert.match(cleanup,/method:'POST'/);
  assert.match(plans,/attempt_log: sanitizeAttemptLog\(existing\?\.attempt_log\)/);
  assert.match(plans,/existingStatus === "attempted"/);
  assert.match(plans,/existingStatus === "win"/);
  assert.match(plans,/for \(const attempt of sanitizeAttemptLog\(assignment\.attempt_log\)\)/);
});

test('normal canonical plan rows retain explicit cleanup provenance after replan',()=>{
  assert.match(provenance,/gac-command-center-fleet-cleanup-lock/);
  assert.match(provenance,/CLEANUP COUNTER · FULL-FLEET REFERENCE/);
  assert.match(provenance,/Post-loss observation gated this replan/);
  assert.match(provenance,/not the residual state/);
  assert.match(provenance,/no residual win probability is claimed/);
  assert.match(provenanceCss,/\.gac-fleet-canonical-plan-row\.is-cleanup-plan/);
  assert.match(bootstrap,/import '\.\/gac-fleet-cleanup-provenance\.js'/);
});
