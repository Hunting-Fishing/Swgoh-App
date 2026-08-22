import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'public/gac-intelligence-export.js'), 'utf8');

test('matrix export is DOM-only and adds no API queries', () => {
  assert.match(source, /gac-counter-matrix-table/);
  assert.match(source, /DOWNLOAD CSV/);
  assert.match(source, /COPY TSV/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
});

test('battle plan export follows the numbered execution queue and officer blockers', () => {
  assert.match(source, /gac-opt-execution-step/);
  assert.match(source, /gac-opt-sequence b/);
  assert.match(source, /gac-opt-execution-counter/);
  assert.match(source, /BATTLE EXECUTION QUEUE/);
  assert.match(source, /gac-opt-blocker/);
  assert.match(source, /OFFICER BLOCKERS — NOT ATTACK NUMBERS/);
  assert.match(source, /current server Attack Plan remains authoritative/i);
  assert.match(source, /not guaranteed win predictions/i);
  assert.match(source, /DOWNLOAD TXT/);
  assert.match(source, /COPY PLAN/);
});

test('legacy optimizer priority cards are only a fallback when the execution queue is absent', () => {
  assert.match(source, /const legacy = execution\.length \? \[\] : legacyPriorityRows\(root\)/);
  assert.match(source, /else if \(legacy\.length\)/);
});

test('export mutation observer is idempotent through existing export markers', () => {
  assert.match(source, /querySelector\('\[data-gac-matrix-export\]'\)/);
  assert.match(source, /querySelector\('\[data-gac-plan-export\]'\)/);
  assert.match(source, /if \(!root \|\| root\.querySelector\('\[data-gac-matrix-export\]'\)\) return/);
});
