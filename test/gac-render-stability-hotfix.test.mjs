import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('eight-territory enhancer does not mutate its own summary when value is unchanged', async () => {
  const sourceText = await source('public/gac-full-battlefield.js');
  assert.match(sourceText, /if \(label\.textContent === next\) return false;/);
  assert.match(sourceText, /label\.textContent = next;/);
  assert.match(sourceText, /gacFullBattlefieldReady/);
});

test('GAC first paint hides legacy renderer until the manual planner exists', async () => {
  const css = await source('public/gac-command-center.css');
  const guard = await source('public/gac-ui-ready-guard.js');
  const selectionGuard = await source('public/gac-manual-selection-guard.js');

  assert.match(css, /#gacCommandCenterPro\{display:none!important\}/);
  assert.match(css, /data-gac-ui-ready/);
  assert.match(css, /INITIALIZING GAC WAR ROOM/);
  assert.match(guard, /\[data-gac-manual-counter-planner\]/);
  assert.match(guard, /panel\.dataset\.gacUiReady = 'true'/);
  assert.match(guard, /gacUiTimeout/);
  assert.match(selectionGuard, /gac-ui-ready-guard\.js/);
});
