import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('GAC recovery bootstraps v2 without requiring the visible legacy renderer', async () => {
  const guard = await source('public/gac-ui-ready-guard.js');
  assert.match(guard, /ensureCompatibilityAnchor/);
  assert.match(guard, /gacCommandCenterPro/);
  assert.match(guard, /gacCompatibilityAnchor/);
  assert.match(guard, /data-gac-recovery-style/);
  assert.match(guard, /visibility:visible!important/);
  assert.doesNotMatch(guard, /GAC WAR ROOM FAILED TO INITIALIZE/);
});

test('matchup soft source avoids the missing matchup endpoint and normalizes bracket evidence', async () => {
  const sourceText = await source('public/gac-matchup-soft-source.js');
  assert.match(sourceText, /MATCHUP_PATH/);
  assert.match(sourceText, /bracket\/by-player/);
  assert.match(sourceText, /manual-matchup-required/);
  assert.match(sourceText, /visibility: 'manual-required'/);
  assert.match(sourceText, /window\.fetch = async function gacSoftFetch/);
});

test('manual selection chain installs recovery before arena enhancers', async () => {
  const selection = await source('public/gac-manual-selection-guard.js');
  assert.match(selection, /^import '\.\/gac-ui-ready-guard\.js';/);
  assert.match(selection, /gac-full-battlefield\.js/);
});
