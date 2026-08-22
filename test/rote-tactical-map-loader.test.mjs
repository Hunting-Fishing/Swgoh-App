import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routerSource = readFileSync(new URL('../public/guild-tw-router.js', import.meta.url), 'utf8');
const integrationSource = readFileSync(new URL('../public/rote-tactical-map-integration.js', import.meta.url), 'utf8');

test('global guild/TB entrypoint activates ROTE Tactical Map v2 integration', () => {
  assert.match(
    routerSource,
    /import\s+["']\.\/rote-tactical-map-integration\.js["'];/,
    'guild-tw-router.js must import the ROTE Tactical Map v2 integration module'
  );
});

test('ROTE Tactical Map v2 integration keeps automatic browser installation', () => {
  assert.match(integrationSource, /installRoteTacticalMapIntegration\(\)/);
  assert.match(integrationSource, /data-rote-zoom-planet/);
  assert.match(integrationSource, /roteTacticalReadinessMarkup/);
});

test('ROTE Tactical Map integration wires active-event observed results into the mission inspector', () => {
  assert.match(integrationSource, /from ['"]\.\/rote-observed-results-ui\.js['"]/);
  assert.match(integrationSource, /buildRoteObservedMissionResults/);
  assert.match(integrationSource, /roteObservedMissionResultsMarkup/);
  assert.match(integrationSource, /\/rote-observed-results-ui\.css\?v=20260822-n6/);
  assert.match(integrationSource, /__swgohTbMissionAttemptSnapshot/);
  assert.match(integrationSource, /swgoh:tb-mission-attempts-updated/);
  assert.match(integrationSource, /tacticalObservedEvidence/);
});
