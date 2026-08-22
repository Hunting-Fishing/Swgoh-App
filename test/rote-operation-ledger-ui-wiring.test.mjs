import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../public/guild-tw-router.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/rote-operation-ledger-ui.js', import.meta.url), 'utf8');

test('Guild shell imports the additive ROTE Operation ledger enhancer and the app entry loads that shell', () => {
  assert.match(router, /import\s+["']\.\/rote-operation-ledger-ui\.js["'];/);
  assert.match(index, /src=["']\/guild-tw-router\.js[^"']*["']/);
});

test('A4 exposes separate officer and member-safe ledger hosts', () => {
  assert.match(ui, /roteOperationLedgerOfficer/);
  assert.match(ui, /roteOperationLedgerMember/);
  assert.match(ui, /#guildOpsRequirements/);
  assert.match(ui, /data-workspace-panel=[\\"']guild[\\"']/);
});

test('A4 consumes only authenticated A3 contribution endpoints and does not expose a GAME_DATA ingestion route', () => {
  assert.match(ui, /\/api\/account\/tb-operations\/event\/current\/ledger/);
  assert.match(ui, /\/api\/account\/tb-operations\/contributions\/self/);
  assert.match(ui, /\/api\/account\/tb-operations\/contributions\/officer/);
  assert.doesNotMatch(ui, /recordGameEvidence|game_gateway|\/game-evidence/);
});

test('A4 has no mutation path for UPDATE, PUT, PATCH or DELETE contribution evidence', () => {
  assert.doesNotMatch(ui, /method:\s*["'](?:PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(ui, /\.update\(|\.delete\(/i);
});

test('A4 preserves transport retry identity instead of converting technical failures into game outcomes', () => {
  assert.match(ui, /Retry will reuse the same evidence ID/);
  assert.match(ui, /Railway\/server\/network failures do not create FAILED or SKIPPED battle outcomes/);
  assert.match(ui, /sessionStorage\.getItem/);
  assert.match(ui, /sessionStorage\.removeItem/);
});

test('MutationObserver rehydration uses rendered host markers instead of continuously re-rendering its own mutations', () => {
  assert.match(ui, /dataset\.roteLedgerRendered\s*=\s*["']true["']/);
  assert.match(ui, /officer\.dataset\.roteLedgerRendered\s*!==\s*["']true["']/);
  assert.match(ui, /member\.dataset\.roteLedgerRendered\s*!==\s*["']true["']/);
  assert.match(ui, /new MutationObserver\(\(\) => schedule\(\)\)/);
});

test('A4 does not introduce fabricated predictive or win-percentage language', () => {
  assert.doesNotMatch(ui, /predictiveProbability/);
  assert.doesNotMatch(ui, /win\s*(?:%|percentage|probability)/i);
});
