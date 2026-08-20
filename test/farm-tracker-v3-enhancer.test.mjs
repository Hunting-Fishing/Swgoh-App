import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/farm-tracker-v3-enhancer.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/farm-tracker-v3.css', import.meta.url), 'utf8');

test('Farm v3 exposes the five FT2 command views', () => {
  assert.match(source, /\['active', 'Active Farms'/);
  assert.match(source, /\['ready', 'Ready to Unlock'/);
  assert.match(source, /\['completed', 'Completed'/);
  assert.match(source, /\['all', 'All Journeys'/);
  assert.match(source, /\['era', 'Era Journeys'/);
  assert.match(source, /data-farm-v3-view/);
});

test('compact target cards separate blockers from completed requirements', () => {
  assert.match(source, /model\.completedCount/);
  assert.match(source, /model\.blockerCount/);
  assert.match(source, /matrixMarkup/);
  assert.match(source, /Completed requirements/);
  assert.match(source, /farm-v3-complete-strip/);
  assert.match(css, /\.farm-v3-target-grid/);
  assert.match(css, /\.farm-v3-matrix-row/);
  assert.match(css, /\.farm-v3-complete-strip/);
});

test('requirement matrices are lazy and only render for expanded targets', () => {
  assert.match(source, /state\.expanded\.has\(event\.id\)/);
  assert.match(source, /expanded \? matrixMarkup/);
  assert.match(source, /data-farm-v3-expand/);
});

test('unresolved Journey mappings remain visible and counted', () => {
  assert.match(source, /DATA MAPPING REQUIRED/);
  assert.match(source, /never silently removed/);
  assert.match(source, /auditJourneyPresetsAgainstCatalog/);
  assert.doesNotMatch(source, /filter\([^\n]*unresolved[^\n]*=>[^\n]*false/i);
});

test('Era journeys stay separate from legacy numeric readiness', () => {
  assert.match(source, /CURRENT_JOURNEY_GUIDES/);
  assert.match(source, /ERA DATA/);
  assert.match(source, /Era readiness is withheld until Era Level is authoritative roster evidence/);
  assert.doesNotMatch(source, /era.*percent\s*=/i);
});

test('Farm v3 uses roster or canonical catalog artwork rather than fake image placeholders', () => {
  assert.match(source, /unit\.image \|\| unit\.imageUrl \|\| unit\.portrait/);
  assert.doesNotMatch(source, /unsplash|placeholder\.com|picsum|data:image/i);
});

test('legacy chooser/list are hidden only after v3 activates', () => {
  assert.match(source, /panel\.classList\.add\('farm-v3-active'\)/);
  assert.match(css, /\.farm-v3-active > \.farm-chooser/);
  assert.match(css, /\.farm-v3-active > #journeyTrackedList/);
});
