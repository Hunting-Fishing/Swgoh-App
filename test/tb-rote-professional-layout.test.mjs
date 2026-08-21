import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const assets = fs.readFileSync(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/tb-rote-professional.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/tb-rote-professional.css', import.meta.url), 'utf8');

test('TB and ROTE professional layer loads additively', () => {
  assert.match(assets, /import '\.\/tb-rote-professional\.js'/);
  assert.match(loader, /tb-rote-professional\.css\?v=20260821-tbpro1/);
});

test('TB and ROTE enhancement does not fetch or replace tactical data', () => {
  assert.doesNotMatch(loader, /fetch\s*\(/);
  assert.doesNotMatch(loader, /innerHTML/);
  assert.doesNotMatch(loader, /\.remove\s*\(/);
});

test('TB and ROTE professional CSS retains the major tactical surfaces', () => {
  for (const selector of [
    'tb-rote-phase-deck',
    'tb-phase-tabs',
    'tb-phase-territory-card',
    'rote-galaxy-map',
    'rote-planet-node',
    'rote-mission-board',
    'rote-board-summary',
    'rote-gate-core',
    'rote-candidate',
    'tb-legacy-phase-deck',
    'tb-legacy-territory-card',
  ]) assert.match(styles, new RegExp(`\\.${selector}`));
});

test('TB and ROTE professional layer restores descriptive text hidden by prior density rules', () => {
  assert.match(styles, /tb-rote-fan-map \.rote-planet-copy small\s*\{[^}]*display:\s*block\s*!important/s);
  assert.match(styles, /tb-information-layout \.dsgeo-map \.dsgeo-territory small\s*\{[^}]*display:\s*block\s*!important/s);
});

test('TB and ROTE professional layer includes responsive tactical layouts', () => {
  assert.match(styles, /@media \(max-width: 1200px\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});
