import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { boardRule } from '../public/gac-league-board-rules.js';
import { leagueBoard } from '../public/gac-league-board-model.js';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all supplied 5v5 and 3v3 defense totals are encoded exactly in canonical rules', () => {
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

test('manual live board model agrees with canonical totals including Carbonite 3v3', () => {
  for (const [league, key] of [['Carbonite','carbonite'],['Bronzium','bronzium'],['Chromium','chromium'],['Aurodium','aurodium'],['Kyber','kyber']]) {
    for (const format of ['5v5','3v3']) {
      const canonical = boardRule(league, format);
      const live = leagueBoard(format, key);
      assert.equal(live.squadCount, canonical.squadTeams, `${league} ${format} squad count`);
      assert.equal(live.fleetCount, canonical.fleetTeams, `${league} ${format} fleet count`);
      assert.equal(live.totalPlacements, canonical.totalDefenses, `${league} ${format} total count`);
    }
  }
});

test('runtime boots the live manual planner but no longer boots the rejected duplicate battleground layer', async () => {
  const bootstrap = await source('public/asset-resilience.js');
  assert.match(bootstrap, /import '\.\/gac-manual-counter-planner\.js';/);
  assert.doesNotMatch(bootstrap, /gac-battleground-redesign\.js/);
  assert.doesNotMatch(bootstrap, /gac-battleground-redesign-guard\.js/);
});

test('live battlefield uses circle selection, leader-in-node, member pips and existing editor actions', async () => {
  const ui = await source('public/gac-league-board-ui.js');
  assert.match(ui, /gac-league-slot-node is-filled/);
  assert.match(ui, /gac-league-node-orbit/);
  assert.match(ui, /gac-league-node-pips/);
  assert.match(ui, /portraitMarkup\(portraits\[0\], 'is-leader'\)/);
  assert.match(ui, /data-gac-league-slot-add/);
  assert.match(ui, /data-gac-league-slot-edit/);
  assert.match(ui, /data-gac-manual-defense-edit/);
  assert.match(ui, /data-gac-manual-defense-delete/);
  assert.doesNotMatch(ui, /fetch\(/);
});

test('live arena styling removes giant placement cards and renders circular interaction points', async () => {
  const css = await source('public/gac-league-board.css');
  assert.match(css, /\.gac-league-slot-node\{[^}]*width:104px/);
  assert.match(css, /\.gac-league-node-orbit\{[^}]*border-radius:50%/);
  assert.match(css, /\.gac-league-card-storage\{display:none!important/);
  assert.match(css, /\.gac-league-slot-node\.is-selected/);
  assert.match(css, /\.gac-live-arena-side/);
  assert.match(css, /\.gac-live-rules/);
});
