import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { warRoomEventSummary } from '../public/tb-war-room-entry.js';

test('War Room summary aggregates explicit current-phase zone state only', () => {
  const result = warRoomEventSummary({
    configured: true,
    event: { currentPhase: 'P2', sourceKind: 'officer', phaseEndsAt: '2026-08-20T00:00:00Z' },
    zones: [
      { planetId: 'geonosis', currentTp: 120000000, currentStars: 0, targetStars: 1, commandState: 'preload' },
      { planetId: 'felucia', currentTp: 160000000, currentStars: 1, targetStars: 2, commandState: 'attack' },
      { planetId: 'bracca', currentTp: 0, currentStars: 0, targetStars: 0, commandState: 'stop' },
    ],
    evidenceBoundary: 'Officer-entered state.',
  }, Date.parse('2026-08-19T12:00:00Z'));
  assert.equal(result.configured, true);
  assert.equal(result.phase, 'P2');
  assert.equal(result.zoneCount, 3);
  assert.equal(result.currentTp, 280000000);
  assert.equal(result.currentStars, 1);
  assert.equal(result.targetStars, 3);
  assert.equal(result.commandCounts.preload, 1);
  assert.equal(result.commandCounts.attack, 1);
  assert.equal(result.commandCounts.stop, 1);
  assert.equal(result.urgentCount, 1);
  assert.match(result.phaseTime, /remaining/);
});

test('War Room summary fails closed when no durable event is configured', () => {
  const result = warRoomEventSummary({ configured: false, evidenceBoundary: 'Reference only.' });
  assert.equal(result.configured, false);
  assert.equal(result.zoneCount, 0);
  assert.equal(result.currentTp, 0);
  assert.equal(result.phaseTime, 'No active TB event');
});

test('Guild route enhancer loads the War Room module and the module self-loads its CSS', () => {
  const router = fs.readFileSync(new URL('../public/guild-unit-matrix-router.js', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../public/tb-war-room-entry.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/tb-war-room-entry.css', import.meta.url), 'utf8');
  assert.match(router, /^import "\.\/tb-war-room-entry\.js";/);
  assert.match(js, /\/api\/account\/web-actions\/tb/);
  assert.match(js, /Open Today in TB/);
  assert.match(js, /tb-war-room-entry\.css/);
  assert.match(js, /swgoh:guild-command-snapshot/);
  assert.match(css, /\.tb-war-room-entry/);
  assert.match(css, /\.tb-war-zone\.command-stop/);
});

test('War Room browser modules parse', () => {
  for (const path of [
    new URL('../public/tb-war-room-entry.js', import.meta.url),
    new URL('../public/guild-unit-matrix-router.js', import.meta.url),
  ]) execFileSync(process.execPath, ['--check', path.pathname]);
});
