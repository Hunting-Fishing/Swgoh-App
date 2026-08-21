import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('full battlefield renders four territories per player and eight locations total', async () => {
  const ui = await source('public/gac-full-battlefield.js');
  const css = await source('public/gac-full-battlefield.css');
  assert.match(ui, /OWN_TERRITORIES/);
  assert.match(ui, /BACK-TOP/);
  assert.match(ui, /FRONT-TOP/);
  assert.match(ui, /BACK-BOTTOM/);
  assert.match(ui, /FRONT-BOTTOM/);
  assert.match(ui, /gacTerritoryLocations = '8'/);
  assert.match(css, /own-back-top own-front-top center enemy-front-top enemy-back-top/);
  assert.match(css, /own-back-bottom own-front-bottom center enemy-front-bottom enemy-back-bottom/);
});

test('opponent team circles remain canonical and league capacities stay separate from map geometry', async () => {
  const full = await source('public/gac-full-battlefield.js');
  const leagueUi = await source('public/gac-league-board-ui.js');
  const model = await source('public/gac-league-board-model.js');
  assert.match(full, /markOpponentZones/);
  assert.match(leagueUi, /zoneCapacity\(format, league, zone\)/);
  assert.match(leagueUi, /data-gac-league-slot-add/);
  assert.match(model, /chromium: Object\.freeze\(\{ 'FRONT-TOP': 3, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 2, 'BACK-TOP': 2 \}\)/);
});

test('own-side territories do not fabricate zone assignments and focus existing defense controls', async () => {
  const ui = await source('public/gac-full-battlefield.js');
  assert.match(ui, /Open defense roster/);
  assert.match(ui, /gac-manual-own-defense/);
  assert.match(ui, /gac-ux-collapsed/);
  assert.match(ui, /collapse\.click\(\)/);
  assert.doesNotMatch(ui, /ownDefenseForZone|saveOwnZoneDefense/);
});

test('manual planner bootstrap loads the full battlefield after the canonical league board', async () => {
  const guard = await source('public/gac-manual-selection-guard.js');
  const leagueIndex = guard.indexOf("import './gac-league-board-ui.js';");
  const fullIndex = guard.indexOf("import './gac-full-battlefield.js';");
  assert.ok(leagueIndex >= 0);
  assert.ok(fullIndex > leagueIndex);
});
