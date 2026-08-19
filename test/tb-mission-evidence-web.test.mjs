import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const routerUrl = new URL('../public/guild-unit-matrix-router.js', import.meta.url);
const evidenceUrl = new URL('../public/tb-mission-evidence.js', import.meta.url);
const cssUrl = new URL('../public/tb-mission-evidence.css', import.meta.url);

test('Guild router loads mission evidence without losing existing Unit Matrix/TB enhancements', () => {
  const router = fs.readFileSync(routerUrl, 'utf8');
  assert.match(router, /^import "\.\/tb-war-room-entry\.js";\nimport "\.\/tb-mission-evidence\.js";/);
  assert.match(router, /function ensureNavLink\(/);
  assert.match(router, /function injectOverviewCard\(/);
  assert.match(router, /function enhanceTbTables\(/);
  assert.match(router, /async function renderUnitRoute\(/);
  assert.match(router, /swgoh:guild-command-snapshot/);
});

test('mission evidence browser layer renders separated Community, Your Guild, and You evidence', () => {
  const js = fs.readFileSync(evidenceUrl, 'utf8');
  assert.match(js, /MISSION EVIDENCE · COMMUNITY \/ YOUR GUILD \/ YOU/);
  assert.match(js, />COMMUNITY</);
  assert.match(js, />YOUR GUILD</);
  assert.match(js, />YOU</);
  assert.match(js, /No win rate is inferred/);
  assert.match(js, /reported outcomes ≠ guaranteed success/);
  assert.doesNotMatch(js, /successRate|winRate|win_pct|success_pct/);
});

test('mission evidence browser layer supports all accepted report outcomes and officer corrections', () => {
  const js = fs.readFileSync(evidenceUrl, 'utf8');
  assert.match(js, /\['2\/2','1\/2','0\/2','failed','skipped'\]/);
  assert.match(js, /\/mission-evidence\?/);
  assert.match(js, /\/mission-attempt`/);
  assert.match(js, /\/mission-attempt\/\$\{encodeURIComponent\(attemptId\)\}\/correct/);
  assert.match(js, /data-correction-reason/);
  assert.match(js, /swgoh:tb-mission-evidence-updated/);
});

test('mission evidence UI has evidence, reporting, and officer styling', () => {
  const css = fs.readFileSync(cssUrl, 'utf8');
  assert.match(css, /\.tb-evidence-grid/);
  assert.match(css, /\.tb-evidence-card\.community/);
  assert.match(css, /\.tb-evidence-card\.guild/);
  assert.match(css, /\.tb-evidence-card\.you/);
  assert.match(css, /\.tb-evidence-report/);
  assert.match(css, /\.tb-evidence-officer/);
});

test('mission evidence and restored Guild router browser modules parse', () => {
  for (const file of [evidenceUrl, routerUrl]) execFileSync(process.execPath, ['--check', file.pathname]);
});
