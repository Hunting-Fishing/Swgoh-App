import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('global asset chain reaches the manual War Room and every GAC intelligence module', () => {
  const assets = read('public/asset-resilience.js');
  const planner = read('public/gac-manual-counter-planner.js');
  const model = read('public/gac-manual-counter-planner-model.js');
  const guard = read('public/gac-manual-selection-guard.js');

  assert.match(assets, /import '\.\/gac-manual-counter-planner\.js'/);
  assert.match(planner, /gac-manual-counter-planner-model\.js/);
  assert.match(model, /import '\.\/gac-manual-selection-guard\.js'/);

  for (const moduleName of [
    'gac-counter-matrix-ui.js',
    'gac-board-optimization-ui.js',
    'gac-relic-suitability-ui.js',
    'gac-scouting-history-ui.js',
    'gac-scouting-staging-ui.js',
    'gac-datacron-readiness-ui.js',
    'gac-datacron-matrix-ui.js',
    'gac-intelligence-export.js',
  ]) assert.match(guard, new RegExp(moduleName.replaceAll('.', '\\.')));
});

test('GAC command deck exposes every release-critical intelligence destination', () => {
  const main = read('public/gac-main-section.js');
  for (const destination of ['board','matrix','execution','scouting','datacrons']) {
    assert.match(main, new RegExp(`data-gac-intel-open=\\"${destination}\\"`));
  }
  for (const selector of [
    'data-gac-board-workspace',
    'data-gac-counter-matrix',
    'data-gac-board-optimization',
    'data-gac-scout-history',
    'data-gac-datacron-matrix',
  ]) assert.match(main, new RegExp(selector));
  assert.match(main, /openIntelligenceSurface/);
  assert.match(main, /scrollIntoView/);
  assert.doesNotMatch(main, /setInterval\s*\(/);
});

test('professional release styling is additive, responsive, keyboard visible and loaded last', () => {
  const guard = read('public/gac-manual-selection-guard.js');
  const mainCss = read('public/gac-main-section.css');
  const intelCss = read('public/gac-intelligence-professional.css');

  assert.match(guard, /gac-intelligence-professional\.css/);
  assert.match(mainCss, /gac-main-intelligence-deck/);
  assert.match(mainCss, /focus-visible/);
  assert.match(mainCss, /min-height:42px/);
  assert.match(mainCss, /max-width:560px/);
  assert.match(mainCss, /prefers-reduced-motion/);

  for (const selector of [
    'data-gac-counter-matrix',
    'data-gac-board-optimization',
    'data-gac-relic-suitability',
    'data-gac-scout-history',
    'data-gac-datacron-readiness',
    'data-gac-datacron-matrix',
  ]) assert.match(intelCss, new RegExp(selector));
  assert.match(intelCss, /focus-visible/);
  assert.match(intelCss, /min-height:44px/);
  assert.match(intelCss, /prefers-reduced-motion/);
  assert.doesNotMatch(intelCss, /display\s*:\s*none/i);
});
