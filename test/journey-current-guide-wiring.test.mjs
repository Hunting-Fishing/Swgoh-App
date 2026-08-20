import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const enhancer = await readFile(new URL('../public/journey-current-guide-enhancer.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/journey-current-guide.css', import.meta.url), 'utf8');

test('current Journey enhancer is loaded in the main Command Center shell', () => {
  assert.match(index, /journey-current-guide\.css\?v=20260820-ui3/);
  assert.match(index, /journey-current-guide-enhancer\.js\?v=20260820-ui3/);
});

test('current Journey band attaches to the existing Journey Map instead of replacing legacy readiness', () => {
  assert.match(enhancer, /swgoh:journey-map-rendered/);
  assert.match(enhancer, /farmJourneyMap/);
  assert.match(enhancer, /journey-map-toolbar/);
  assert.match(enhancer, /Legacy STAR \/ GEAR \/ RELIC readiness remains calculated below/);
});

test('Era Journey UI explicitly withholds readiness rather than inventing a percentage', () => {
  assert.match(enhancer, /ERA READINESS UNKNOWN/);
  assert.match(enhancer, /does not calculate a readiness percentage/);
  assert.doesNotMatch(enhancer, /eraLevel\s*\/\s*125/);
  assert.doesNotMatch(enhancer, /predictiveProbability|win\s*(?:%|probability)/i);
});

test('current Journey visuals resolve portraits from the authoritative local catalog by name', () => {
  assert.match(enhancer, /__swgohCatalogSnapshot/);
  assert.match(enhancer, /\/data\/catalog\.json\?journey-current=1/);
  assert.match(enhancer, /resolveJourneyCatalogUnit/);
  assert.match(enhancer, /unit\.image \|\| unit\.imageUrl \|\| unit\.portrait/);
});

test('current Journey evidence is surfaced on both dashboard and map', () => {
  assert.match(enhancer, /ccv2-journey-module/);
  assert.match(enhancer, /CURRENT_DARTH_JAR_JAR/);
  assert.match(enhancer, /CURRENT_JMMW/);
  assert.match(enhancer, /CURRENT_CASSIAN_UNDERCOVER/);
  assert.match(css, /\.journey-current-grid/);
  assert.match(css, /\.ccv2-journey-current-row/);
});
