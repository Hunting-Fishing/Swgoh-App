import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const v3 = fs.readFileSync(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');
const v3Styles = fs.readFileSync(new URL('../public/gac-war-room-v3.css', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../public/command-center-layout-v3.css', import.meta.url), 'utf8');
const assets = fs.readFileSync(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');

test('GAC v3 loads additively through the existing asset-resilience chain', () => {
  assert.match(assets, /import '\.\/gac-war-room-v3\.js'/);
  assert.match(v3, /gac-war-room-v3\.css/);
  assert.match(v3, /command-center-layout-v3\.css/);
});

test('GAC v3 removes duplicate workspace scaffolding only after v2 exists', () => {
  assert.match(v3, /document\.querySelector\('\[data-gacv2-root\]'\)/);
  assert.match(v3, /gacv3-superseded/);
  assert.match(v3, /#workspaceGacBody/);
  assert.match(layout, /\.gacv3-superseded\s*\{\s*display:\s*none\s*!important/);
});

test('tactical HUD exposes only observable War Room state', () => {
  for (const key of ['round', 'format', 'opponent', 'board', 'counter']) {
    assert.match(v3, new RegExp(`data-gacv3-hud=\\"${key}\\"`));
  }
  assert.match(v3, /Visible defense fully selected/);
  assert.match(v3, /Partial visible defense selection/);
  assert.match(v3, /Historical counter evidence matched/);
  assert.match(v3, /Heuristic roster-fit fallback/);
  assert.doesNotMatch(v3, /hidden defense.*infer/i);
  assert.doesNotMatch(v3, /697738349/);
});

test('v3 keeps truth-gate diagnostics first-class', () => {
  assert.match(v3, /data-gacv3-open-tab=\"diagnostics\"/);
  assert.match(v3, /Truth Gate/);
  assert.match(v3Styles, /\.gacv3-enhanced \.gacv2-diagnostics/);
});

test('GAC v3 is a tactical command surface rather than another long report', () => {
  assert.match(v3Styles, /\.gacv3-mission-strip/);
  assert.match(v3Styles, /\.gacv3-mission-grid/);
  assert.match(v3Styles, /\.gacv3-quick-actions/);
  assert.match(v3Styles, /\.gacv3-tab-icon/);
  assert.match(v3Styles, /grid-template-columns:\s*repeat\(8/);
});

test('Command Center layout v3 turns workspace navigation into a responsive command rail', () => {
  assert.match(layout, /\.workspace-tabs\s*\{/);
  assert.match(layout, /position:\s*sticky/);
  assert.match(layout, /grid-template-columns:\s*repeat\(10/);
  assert.match(layout, /@media \(max-width: 760px\)/);
  assert.match(layout, /grid-auto-flow:\s*column/);
});
