import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/farm-gallery-tabs.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/farm-gallery-tabs.css', import.meta.url), 'utf8');
const styleLoader = await readFile(new URL('../public/farm-gallery-style-loader.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/farm-workspace-loader.js', import.meta.url), 'utf8');

test('Farm Gallery exposes the six primary command tabs', () => {
  for (const label of ['Tracked', 'Journey Gallery', 'Requirements', 'Shopping List', 'Priority Queue', 'Era Journeys']) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /data-farm-gallery-tab/);
  assert.match(css, /\.farm-gallery-tabs/);
});

test('requirements are portrait-first tiles with progression beneath the unit art', () => {
  assert.match(source, /farm-unit-portrait/);
  assert.match(source, /farm-unit-stats/);
  assert.match(source, /stars:/);
  assert.match(source, /level:/);
  assert.match(source, /gear:/);
  assert.match(source, /relic:/);
  assert.match(source, /farm-unit-target/);
  assert.match(source, /farm-unit-delta/);
  assert.match(css, /grid-template-columns: repeat\(7/);
  assert.match(css, /\.farm-unit-portrait img/);
});

test('selected Journey requirements move into their own tab rather than an inline page expansion', () => {
  assert.match(source, /data-gallery-requirements/);
  assert.match(source, /state\.tab = 'requirements'/);
  assert.match(source, /data-gallery-selected-event/);
  assert.match(source, /Needs Work/);
  assert.match(source, /Completed/);
  assert.match(source, /All ·/);
});

test('existing Master Farm Plan information remains available through Shopping and Priority tabs', () => {
  assert.match(source, /buildMasterFarmPlan/);
  assert.match(source, /plan\.materials/);
  assert.match(source, /plan\.queue/);
  assert.match(source, /plan\.farmSummaries/);
  assert.match(source, /totalRelicLevelsRemaining/);
  assert.match(source, /totalGearTiersRemaining/);
  assert.match(source, /Copy Master Plan/);
  assert.match(source, /Plan Upgrade/);
});

test('durable Journey tracking remains delegated to the existing account-backed tracker', () => {
  assert.match(source, /data-track-journey/);
  assert.match(source, /data-untrack-journey/);
  assert.match(source, /trackedIds\(panel\)/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
});

test('Era Journey evidence remains separate and does not fabricate readiness percentage', () => {
  assert.match(source, /Era-Level requirements remain separate/);
  assert.match(source, /No fabricated readiness percentage/);
  assert.match(source, /CURRENT_JOURNEY_GUIDES/);
});

test('legacy visual surfaces are hidden only after the tabbed gallery is active', () => {
  assert.match(styleLoader, /farm-gallery-tabs-active \[data-farm-v3-command\]/);
  assert.match(styleLoader, /farm-gallery-tabs-active #farmMasterPlan/);
  assert.match(source, /panel\.classList\.add\('farm-gallery-tabs-active'\)/);
});

test('Farm Gallery controller loads after canonical Farm v3 state and styling', () => {
  const enhancer = loader.indexOf('/farm-tracker-v3-enhancer.js');
  const style = loader.indexOf('/farm-gallery-style-loader.js');
  const gallery = loader.indexOf('/farm-gallery-tabs.js');
  assert.ok(enhancer >= 0);
  assert.ok(style > enhancer);
  assert.ok(gallery > style);
});
