import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const v3 = fs.readFileSync(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');
const v3Styles = fs.readFileSync(new URL('../public/gac-war-room-v3.css', import.meta.url), 'utf8');
const professionalStyles = fs.readFileSync(new URL('../public/gac-war-room-professional.css', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../public/command-center-layout-v3.css', import.meta.url), 'utf8');
const assets = fs.readFileSync(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');

test('GAC v3 loads additively through the existing asset-resilience chain', () => {
  assert.match(assets, /import '\.\/gac-war-room-v3\.js'/);
  assert.match(v3, /gac-war-room-v3\.css/);
  assert.match(v3, /gac-war-room-professional\.css/);
  assert.match(v3, /command-center-layout-v3\.css/);
});

test('GAC v3 preserves older reference scaffolding after the enhanced workspace exists', () => {
  assert.match(v3, /document\.querySelector\('\[data-gacv2-root\]'\)/);
  assert.match(v3, /gacv3-superseded/);
  assert.match(v3, /#workspaceGacBody/);
  assert.match(layout, /Enhancement-only rule: preserve older\/reference GAC information/);
  assert.match(layout, /\.gacv3-superseded\s*\{[^}]*display:\s*block\s*!important/s);
  assert.doesNotMatch(layout, /\.gacv3-superseded\s*\{[^}]*display:\s*none/s);
});

test('tactical HUD exposes observable War Room state without inventing hidden-board evidence', () => {
  for (const key of ['round', 'format', 'opponent', 'board', 'counter']) {
    assert.match(v3, new RegExp(`data-gacv3-hud=\\"${key}\\"`));
  }
  assert.match(v3, /Expected squad \+ fleet defenses captured/);
  assert.match(v3, /Known board partially captured/);
  assert.match(v3, /Historical evidence used in board allocation/);
  assert.match(v3, /Non-overlapping smart counters allocated/);
  assert.doesNotMatch(v3, /hidden defense.*infer/i);
  assert.doesNotMatch(v3, /697738349/);
});

test('v3 keeps manual board entry and truth-gate diagnostics first-class', () => {
  assert.match(v3, /data-gacv3-open-tab=\"board\"/);
  assert.match(v3, /Enter Board/);
  assert.match(v3, /data-gacv3-open-tab=\"diagnostics\"/);
  assert.match(v3, /Truth Gate/);
  assert.match(v3Styles, /\.gacv3-enhanced \.gacv2-diagnostics/);
});

test('professional GAC layer converts dense command UI into readable game-mode surfaces', () => {
  assert.match(professionalStyles, /SWGOH Command Center — GAC War Room professional game UI layer/);
  assert.match(professionalStyles, /body \.gacv3-enhanced \.gacv2-metrics\s*\{[^}]*repeat\(4/s);
  assert.match(professionalStyles, /body \.gac-board-v2-map/);
  assert.match(professionalStyles, /body \.gac-board-v2-territory/);
  assert.match(professionalStyles, /body \.gac-board-v2-slot\.is-empty/);
  assert.match(professionalStyles, /body \.gacv3-enhanced \.gacv2-counter-card/);
  assert.match(professionalStyles, /--gac-pro-gold:\s*#ffd25e/);
  assert.match(professionalStyles, /--gac-pro-purple:\s*#b997ff/);
});

test('GAC professional layer retains responsive command and board layouts', () => {
  assert.match(professionalStyles, /@media \(max-width: 940px\)/);
  assert.match(professionalStyles, /grid-template-areas:\s*'fronttop' 'frontbottom' 'backtop' 'backbottom'/);
  assert.match(professionalStyles, /@media \(max-width: 680px\)/);
  assert.match(professionalStyles, /\.gac-board-v2-slots\s*\{\s*grid-template-columns:\s*1fr/);
});

test('Command Center layout v3 keeps workspace navigation responsive', () => {
  assert.match(layout, /\.workspace-tabs\s*\{/);
  assert.match(layout, /position:\s*sticky/);
  assert.match(layout, /grid-template-columns:\s*repeat\(10/);
  assert.match(layout, /@media \(max-width: 760px\)/);
  assert.match(layout, /grid-auto-flow:\s*column/);
});
