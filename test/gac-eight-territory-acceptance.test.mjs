import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('battlefield geometry is eight territories while team capacities remain league-driven', async () => {
  const full = await source('public/gac-full-battlefield.js');
  const css = await source('public/gac-full-battlefield.css');
  const model = await source('public/gac-league-board-model.js');

  assert.match(full, /gacTerritoryLocations = '8'/);
  assert.match(css, /own-back-top own-front-top center enemy-front-top enemy-back-top/);
  assert.match(css, /own-back-bottom own-front-bottom center enemy-front-bottom enemy-back-bottom/);
  assert.match(model, /chromium: Object\.freeze\(\{ 'FRONT-TOP': 3, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 2, 'BACK-TOP': 2 \}\)/);
});
