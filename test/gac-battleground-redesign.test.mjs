import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { boardRule } from '../public/gac-league-board-rules.js';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all supplied 5v5 and 3v3 defense totals are encoded exactly', () => {
  const expected = {
    Kyber: { '5v5':[11,3,14], '3v3':[15,3,18] },
    Aurodium: { '5v5':[9,2,11], '3v3':[13,2,15] },
    Chromium: { '5v5':[7,2,9], '3v3':[10,2,12] },
    Bronzium: { '5v5':[5,1,6], '3v3':[7,1,8] },
    Carbonite: { '5v5':[3,1,4], '3v3':[4,1,5] },
  };
  for (const [league, formats] of Object.entries(expected)) {
    for (const [format, values] of Object.entries(formats)) {
      const rule = boardRule(league, format);
      assert.deepEqual([rule.squadTeams, rule.fleetTeams, rule.totalDefenses], values, `${league} ${format}`);
      assert.equal(rule.territoryContractValid, true, `${league} ${format} territory capacity must match totals`);
    }
  }
});

test('Carbonite 3v3 renders four squad circles plus one fleet circle', () => {
  const rule = boardRule('Carbonite', '3v3');
  assert.equal(rule.territoryTeams['FRONT-TOP'], 1);
  assert.equal(rule.territoryTeams['FRONT-BOTTOM'], 1);
  assert.equal(rule.territoryTeams['BACK-BOTTOM'], 2);
  assert.equal(rule.territoryTeams['BACK-TOP'], 1);
});

test('battleground presentation reuses canonical manual board state and slot editor', async () => {
  const js = await source('public/gac-battleground-redesign.js');
  assert.match(js, /boardSnapshot/);
  assert.match(js, /openSquadSlot/);
  assert.match(js, /data-gac-redesign-slot/);
  assert.match(js, /data-gac-board-add-unit/);
  assert.match(js, /data-gac-board-edit/);
  assert.match(js, /data-gac-board-delete/);
  assert.doesNotMatch(js, /\/api\/gac\/current-board/);
});

test('placed board circles render leader portrait with member pips', async () => {
  const js = await source('public/gac-battleground-redesign.js');
  assert.match(js, /gac-arena-node-ring/);
  assert.match(js, /leaderFor\(defense/);
  assert.match(js, /memberPips\(defense/);
  assert.match(js, /gac-arena-portrait is-leader|portrait\(leader, 'is-leader'\)/);
});

test('fleet circles hand off to canonical fleet planner', async () => {
  const js = await source('public/gac-battleground-redesign.js');
  assert.match(js, /__gacFleetCanonicalOperations/);
  assert.match(js, /data-gac-manual-fleet-planner-focus/);
  assert.match(js, /data-gac-redesign-fleet-slot/);
});

test('legacy planner is preserved as a collapsed fallback instead of deleted', async () => {
  const js = await source('public/gac-battleground-redesign.js');
  assert.match(js, /gac-redesign-legacy-tools/);
  assert.match(js, /preserved fallback/);
  assert.doesNotMatch(js, /\.remove\(\).*gac-manual-counter-planner/);
});

test('arena styling uses a four-territory board and circular interactive nodes', async () => {
  const css = await source('public/gac-battleground-redesign.css');
  assert.match(css, /grid-template-areas:"fleet fronttop" "backbottom frontbottom"/);
  assert.match(css, /\.gac-arena-node-ring\{[^}]*border-radius:50%/);
  assert.match(css, /\.gac-arena-node\.is-selected/);
  assert.match(css, /\.gac-redesign-main\{display:grid/);
  assert.match(css, /\.gac-redesign-counter/);
});
