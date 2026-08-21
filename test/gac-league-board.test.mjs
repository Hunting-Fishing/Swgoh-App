import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GAC_ZONE_CAPACITY,
  leagueBoard,
  normalizeLeague,
  zoneCapacity,
} from '../public/gac-league-board-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_5V5 = {
  carbonite: { 'FRONT-TOP': 1, 'FRONT-BOTTOM': 1, 'BACK-BOTTOM': 1, 'BACK-TOP': 1 },
  bronzium: { 'FRONT-TOP': 2, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 1, 'BACK-TOP': 1 },
  chromium: { 'FRONT-TOP': 3, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 2, 'BACK-TOP': 2 },
  aurodium: { 'FRONT-TOP': 3, 'FRONT-BOTTOM': 3, 'BACK-BOTTOM': 3, 'BACK-TOP': 2 },
  kyber: { 'FRONT-TOP': 4, 'FRONT-BOTTOM': 4, 'BACK-BOTTOM': 3, 'BACK-TOP': 3 },
};

const EXPECTED_3V3 = {
  carbonite: { 'FRONT-TOP': 1, 'FRONT-BOTTOM': 1, 'BACK-BOTTOM': 1, 'BACK-TOP': 1 },
  bronzium: { 'FRONT-TOP': 2, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 3, 'BACK-TOP': 1 },
  chromium: { 'FRONT-TOP': 3, 'FRONT-BOTTOM': 3, 'BACK-BOTTOM': 4, 'BACK-TOP': 2 },
  aurodium: { 'FRONT-TOP': 4, 'FRONT-BOTTOM': 4, 'BACK-BOTTOM': 5, 'BACK-TOP': 2 },
  kyber: { 'FRONT-TOP': 5, 'FRONT-BOTTOM': 5, 'BACK-BOTTOM': 5, 'BACK-TOP': 3 },
};

test('5v5 league capacities match the verified GAC table', () => {
  assert.deepEqual(GAC_ZONE_CAPACITY['5v5'], EXPECTED_5V5);
  assert.equal(leagueBoard('5v5', 'kyber').squadCount, 11);
  assert.equal(leagueBoard('5v5', 'aurodium').squadCount, 9);
  assert.equal(leagueBoard('5v5', 'chromium').squadCount, 7);
  assert.equal(leagueBoard('5v5', 'bronzium').squadCount, 5);
  assert.equal(leagueBoard('5v5', 'carbonite').squadCount, 3);
});

test('3v3 league capacities match the verified GAC table', () => {
  assert.deepEqual(GAC_ZONE_CAPACITY['3v3'], EXPECTED_3V3);
  assert.equal(leagueBoard('3v3', 'kyber').squadCount, 15);
  assert.equal(leagueBoard('3v3', 'aurodium').squadCount, 13);
  assert.equal(leagueBoard('3v3', 'chromium').squadCount, 10);
  assert.equal(leagueBoard('3v3', 'bronzium').squadCount, 7);
  assert.equal(leagueBoard('3v3', 'carbonite').squadCount, 3);
});

test('league model keeps fleet territory in rear top and does not guess unknown league', () => {
  assert.equal(zoneCapacity('5v5', 'kyber', 'BACK-TOP'), 3);
  assert.equal(zoneCapacity('3v3', 'chromium', 'BACK-TOP'), 2);
  assert.equal(normalizeLeague(''), '');
  assert.equal(leagueBoard('5v5', ''), null);
});

test('league UI provides exact slot node targeting and game-style rank selector', () => {
  const ui = fs.readFileSync(path.join(root, 'public/gac-league-board-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/gac-league-board.css'), 'utf8');
  const guard = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');
  assert.match(ui, /data-gac-league-slot-add/);
  assert.match(ui, /data-gac-league-rank/);
  assert.match(ui, /data-gac-manual-editor-slot/);
  assert.match(ui, /OUTSIDE .* CAPACITY/);
  assert.match(css, /gac-league-node-orbit/);
  assert.match(css, /gac-league-medal/);
  assert.match(guard, /gac-league-board-ui\.js/);
});
