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

test('battle plan export explicitly preserves server plan authority wording', () => {
  assert.match(source, /current server Attack Plan remains authoritative/i);
  assert.match(source, /DOWNLOAD TXT/);
  assert.match(source, /COPY PLAN/);
});

test('export mutation observer is idempotent through existing export markers', () => {
  assert.match(source, /querySelector\('\[data-gac-matrix-export\]'\)/);
  assert.match(source, /querySelector\('\[data-gac-plan-export\]'\)/);
  assert.match(source, /if \(!root \|\| root\.querySelector\('\[data-gac-matrix-export\]'\)\) return/);
});
