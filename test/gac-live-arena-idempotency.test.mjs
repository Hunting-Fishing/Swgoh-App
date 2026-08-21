import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live arena transforms each rendered map only once per format and league signature', async () => {
  const ui = await source('public/gac-league-board-ui.js');
  assert.match(ui, /map\.dataset\.gacLeagueEnhanced !== signature/);
  assert.match(ui, /map\.dataset\.gacLeagueEnhanced = signature/);
  assert.match(ui, /panel\.dataset\.signature === signature/);
  assert.match(ui, /new MutationObserver\(scheduleEnhance\)/);
});

test('move and swap mode remains owned by the existing GAC UX handler', async () => {
  const ui = await source('public/gac-league-board-ui.js');
  const ux = await source('public/gac-ux-polish.js');
  assert.match(ui, /gac-ux-moving/);
  assert.match(ui, /\.gac-ux-move-target,\.gac-ux-swap-target/);
  assert.match(ux, /moveToEmpty/);
  assert.match(ux, /swapWith/);
});

test('live arena displays the saved leaderBaseId instead of assuming member zero is leader', async () => {
  const fix = await source('public/gac-live-arena-leader-fix.js');
  const guard = await source('public/gac-manual-selection-guard.js');
  assert.match(fix, /leaderBaseId/);
  assert.match(fix, /capitalShipBaseId/);
  assert.match(fix, /data-inspect-base-id/);
  assert.match(fix, /portraits\.find\(\(node\) => portraitId\(node\) === leaderId\)/);
  assert.match(fix, /gacActualLeader/);
  assert.match(guard, /gac-live-arena-leader-fix\.js/);
});
