import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eventProgress } from '../public/journey-progress.js';

const source = await readFile(new URL('../public/farm-tracker-v3-enhancer.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/farm-tracker-v3.css', import.meta.url), 'utf8');

const event = {
  targetBaseId: 'TARGET',
  requirements: [
    { baseId: 'A', type: 'RELIC', tier: 5 },
    { baseId: 'B', type: 'STAR', tier: 7 },
  ],
};

function stateFor(rosterMap) {
  const targetOwned = rosterMap.has(event.targetBaseId);
  const progress = eventProgress(event.requirements, rosterMap);
  if (targetOwned) return 'completed';
  if (progress.complete) return 'ready';
  return 'active';
}

test('Farm v3 defines distinct active, ready-to-unlock and completed target states', () => {
  const active = new Map([
    ['A', { baseId: 'A', stars: 7, level: 85, gear: 13, relic: 4 }],
    ['B', { baseId: 'B', stars: 7 }],
  ]);
  const ready = new Map([
    ['A', { baseId: 'A', stars: 7, level: 85, gear: 13, relic: 5 }],
    ['B', { baseId: 'B', stars: 7 }],
  ]);
  const completed = new Map([...ready, ['TARGET', { baseId: 'TARGET', stars: 7 }]]);
  assert.equal(stateFor(active), 'active');
  assert.equal(stateFor(ready), 'ready');
  assert.equal(stateFor(completed), 'completed');
  assert.match(source, /label: 'ACTIVE FARM'/);
  assert.match(source, /label: 'READY TO UNLOCK'/);
  assert.match(source, /label: 'COMPLETED'/);
});

test('completed prerequisite language is separated from readiness language', () => {
  assert.match(source, /badge\.textContent = 'Complete'/);
  assert.match(source, /Completed requirements/);
  assert.match(source, /data-journey-filter="ready"/);
  assert.match(source, /completedFilter\.innerHTML = `Completed/);
  assert.match(css, /\.farm-v3-completed-lane/);
  assert.match(css, /\.farm-v3-completed-grid/);
});

test('unresolved Journey mappings remain visible and counted', () => {
  assert.match(source, /DATA MAPPING REQUIRED/);
  assert.match(source, /remain counted and are not silently removed/);
  assert.match(source, /auditJourneyPresetsAgainstCatalog/);
  assert.doesNotMatch(source, /\.filter\([^\n]*unresolved/i);
});

test('Farm v3 uses roster or canonical catalog artwork rather than fake image placeholders', () => {
  assert.match(source, /unit\.image \|\| unit\.imageUrl \|\| unit\.portrait/);
  assert.doesNotMatch(source, /unsplash|placeholder\.com|picsum|data:image/i);
});
