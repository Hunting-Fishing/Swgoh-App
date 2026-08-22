import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [previewSource, versionSource, publishabilitySource, deliverySource] = await Promise.all([
  readFile(new URL('../tb-stage9-plan-preview-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../tb-assignment-version-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../tb-assignment-publishability-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../tb-stage10-discord-delivery-service.mjs', import.meta.url), 'utf8'),
]);

test('web-plan parity is materialized before immutable version creation', () => {
  assert.match(previewSource, /stage9-web-discord-parity-v2/);
  assert.match(previewSource, /parityPlanner\(planner\?\.guild, planner\?\.operations/);
  assert.match(previewSource, /versionService\.createVersion/);
  assert.match(previewSource, /delivery:\s*\{\s*mode:\s*'preview',\s*published:\s*false,\s*memberDms:\s*false\s*\}/);
});

test('immutable version hash includes assignments, unfilled rows and diagnostics regardless of planner origin', () => {
  assert.match(versionSource, /assignments:\s*canonicalValue\(array\(input\.assignments\)\)/);
  assert.match(versionSource, /unfilled:\s*canonicalValue\(array\(input\.unfilled\)\)/);
  assert.match(versionSource, /diagnostics:\s*canonicalValue\(object\(input\.diagnostics\)\)/);
  assert.match(versionSource, /computeTbAssignmentPlanHash/);
});

test('publishability remains exact-hash, exact-approval, latest-version and current-plan gated', () => {
  assert.match(publishabilitySource, /verifyTbAssignmentRunHash/);
  assert.match(publishabilitySource, /TB_ASSIGNMENT_APPROVAL_REQUIRED/);
  assert.match(publishabilitySource, /TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH/);
  assert.match(publishabilitySource, /TB_ASSIGNMENT_STALE_VERSION/);
  assert.match(publishabilitySource, /TB_ASSIGNMENT_CURRENT_PLAN_MISMATCH/);
  assert.match(publishabilitySource, /TB_ASSIGNMENT_SOURCE_PLAN_STALE/);
});

test('Stage 10 consumes only a publishability-approved immutable artifact before Discord delivery', () => {
  assert.match(deliverySource, /publishability\.assertPublishable/);
  assert.match(deliverySource, /VERIFIED_DESTINATION_REQUIRED/);
  assert.match(deliverySource, /STAGE10_HASH_CONFIRMATION_MISMATCH/);
  assert.match(deliverySource, /idempotencyKey/);
  assert.doesNotMatch(deliverySource, /planGuildTbOperationsParity/);
  assert.doesNotMatch(deliverySource, /stage9-web-discord-parity-v2/);
});
