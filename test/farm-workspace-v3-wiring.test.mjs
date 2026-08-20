import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loader = await readFile(new URL('../public/farm-workspace-loader.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('Farm workspace canonicalizes Journey Base IDs before any renderer loads presets', () => {
  const canonicalizer = loader.indexOf('/journey-preset-canonicalizer.js');
  const tracker = loader.indexOf('/journey-tracker-v2.js');
  const map = loader.indexOf('/farm-journey-map-pro.js');
  assert.ok(canonicalizer >= 0);
  assert.ok(tracker > canonicalizer);
  assert.ok(map > canonicalizer);
});

test('Farm v3 enhancer activates after durable tracking and eligibility shells are installed', () => {
  const tracker = loader.indexOf('/journey-tracker-v2.js');
  const eligibility = loader.indexOf('/journey-event-eligibility-pro.js');
  const enhancer = loader.indexOf('/farm-tracker-v3-enhancer.js');
  assert.ok(enhancer > tracker);
  assert.ok(enhancer > eligibility);
  assert.match(loader, /swgoh:farm-workspace-loaded/);
  assert.match(loader, /farmv3b/);
});

test('main shell cache-busts the Farm v3 matrix loader', () => {
  assert.match(index, /farm-workspace-loader\.js\?v=20260820-farmv3b/);
});
