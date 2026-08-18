import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../public/guild-tw-router.js', import.meta.url), 'utf8');
const enhancer = await readFile(new URL('../public/guild-operations-professional-enhancer.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/guild-operations-professional.css', import.meta.url), 'utf8');

test('Guild Operations loads the professional officer UX layer', () => {
  assert.match(router, /guild-operations-professional-enhancer\.js/);
  assert.match(enhancer, /OFFICER REQUIREMENT EDITOR/);
  assert.match(enhancer, /Refresh Guild Now/);
});

test('officer requirement editor exposes override, canonical reset, ignore and re-include actions', () => {
  assert.match(enhancer, /Save Officer Override/);
  assert.match(enhancer, /Restore Canonical Requirement/);
  assert.match(enhancer, /Ignore This Slot/);
  assert.match(enhancer, /Re-include This Slot/);
  assert.match(enhancer, /requirementOverrides/);
  assert.match(enhancer, /ignoredSlots/);
});

test('TW team editing no longer requires officers to memorize raw base IDs', () => {
  assert.match(enhancer, /Find unit/);
  assert.match(enhancer, /Minimum relic/);
  assert.match(enhancer, /Add Unit to Team/);
  assert.match(enhancer, /catalogOptions/);
});

test('operations UX supports fast keyboard workflow and human-readable preassignments', () => {
  assert.match(enhancer, /event\.key\.toLowerCase\(\) === 's'/);
  assert.match(enhancer, /event\.key === 'Enter'/);
  assert.match(enhancer, /event\.altKey/);
  assert.match(enhancer, /humanizePreassignments/);
});

test('professional layer includes responsive focus-visible styling', () => {
  assert.match(css, /focus-visible/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /guild-ops-professional-bar/);
});
