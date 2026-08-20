import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../public/player-command-dashboard.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/command-center-v2.css', import.meta.url), 'utf8');

test('Dashboard v2 is driven by the canonical Player Command model and not mock player data', () => {
  assert.match(dashboard, /buildPlayerCommandDashboard/);
  assert.match(dashboard, /\/api\/player\/\$\{allyCode\}\/baseline/);
  assert.match(dashboard, /\/api\/guild\/by-player\/\$\{allyCode\}\/baseline/);
  assert.doesNotMatch(dashboard, /8,542,718|Galactic Commander|123-456-789/);
});

test('Dashboard v2 exposes a first-class Journey Guide launch that reuses the existing Journey Map', () => {
  assert.match(dashboard, /JOURNEY_PRESETS/);
  assert.match(dashboard, /data-ccv2-launch="journey"/);
  assert.match(dashboard, /openWorkspace\("farm"\)/);
  assert.match(dashboard, /data-farm-view="map"/);
});

test('Dashboard v2 keeps deep evidence available rather than deleting it', () => {
  assert.match(dashboard, /ccv2-deep-dive/);
  assert.match(dashboard, /ROTE REQUIREMENT COVERAGE/);
  assert.match(dashboard, /DEVELOPMENT EVIDENCE/);
  assert.match(dashboard, /PERSISTENT HISTORY/);
  assert.match(dashboard, /fabricated universal player score/);
});

test('Dashboard v2 has compact KPI, launch and primary-module grids', () => {
  assert.match(css, /\.ccv2-kpis\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(10/);
  assert.match(css, /\.ccv2-launch-rail\s*\{/);
  assert.match(css, /\.ccv2-module-grid\s*\{/);
  assert.match(css, /grid-template-columns:\s*1\.05fr 1fr 1fr/);
});

test('Overview removes redundant stacked intro/profile space only after Player Command is ready', () => {
  assert.match(css, /workspace-panel\[data-workspace-panel="overview"\] > \.workspace-intro:not\(#playerCommandDashboard\)/);
  assert.match(css, /\.ccv2-player-ready > #profile/);
  assert.match(dashboard, /classList\.add\("ccv2-player-ready"\)/);
});

test('UI v2 does not introduce fabricated win probability language', () => {
  assert.doesNotMatch(dashboard, /win\s*(?:%|percentage|probability)/i);
  assert.doesNotMatch(dashboard, /predictiveProbability/);
});
