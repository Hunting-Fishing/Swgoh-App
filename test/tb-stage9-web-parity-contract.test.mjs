import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tb-stage9-plan-preview-service.mjs', import.meta.url), 'utf8');

test('Stage 9 immutable preview imports and invokes the shared web Operations parity planner', () => {
  assert.match(source, /from ['"]\.\/public\/guild-operations-parity-planner\.js['"]/);
  assert.match(source, /planGuildTbOperationsParity/);
  assert.match(source, /phaseLayout:\s*object\(sourcePlan\.phase_layout\)/);
  assert.match(source, /requirementOverrides:\s*object\(sourcePlan\.requirement_overrides\)/);
  assert.match(source, /ignoredMissions:\s*array\(sourcePlan\.ignored_missions\)/);
  assert.match(source, /ignoredPlatoons:\s*array\(sourcePlan\.ignored_platoons\)/);
  assert.match(source, /ignoredSlots:\s*array\(sourcePlan\.ignored_slots\)/);
  assert.match(source, /groupingRules:\s*source\.groupingRules/);
  assert.match(source, /preAssignments/);
});

test('Stage 9 no longer rejects supported persisted web-plan customization', () => {
  assert.doesNotMatch(source, /TB_ASSIGNMENT_PLAN_CUSTOMIZATION_UNSUPPORTED/);
  assert.doesNotMatch(source, /unsupportedPlanCustomization/);
});

test('Stage 9 still fails closed for unresolved parity requirements and control mutation', () => {
  assert.match(source, /TB_ASSIGNMENT_PARITY_PREVIEW_NOT_READY/);
  assert.match(source, /TB_ASSIGNMENT_PLANNING_CONTROLS_CHANGED/);
  assert.match(source, /controlsBeforeHash\s*!==\s*controlsAfterHash/);
});

test('immutable fingerprint binds web plan, grouping rules, preassignments, controls and parity output', () => {
  for (const field of [
    'sourcePlanHash',
    'groupingRulesHash',
    'preassignmentsHash',
    'effectivePlanningControlsHash',
    'parityOutputHash',
  ]) assert.match(source, new RegExp(field));
  assert.match(source, /stage9-web-discord-parity-v2/);
});
