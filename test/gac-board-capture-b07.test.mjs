import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canSaveDatacronSelection,
  datacronLabel,
  liveDatacronInventory,
  localDatacronSnapshot,
  restoredDatacronSelection,
  selectionFromControl,
} from '../public/gac-board-datacron-model.js';
import {
  captureQueue,
  captureStatus,
  restoreSummary,
  visibleCaptureSlots,
} from '../public/gac-board-capture-model.js';
import {
  boardTerritories,
  defaultRevealState,
} from '../public/gac-board-v2-model.js';

const rule = Object.freeze({
  territories: Object.freeze([
    { value: 'BACK-TOP', label: 'Fleet Territory', kind: 'fleet', capacity: 1, unlockFrom: 'FRONT-TOP' },
    { value: 'FRONT-TOP', label: 'Front Top', kind: 'squad', capacity: 2 },
    { value: 'BACK-BOTTOM', label: 'Back Bottom', kind: 'squad', capacity: 2, unlockFrom: 'FRONT-BOTTOM' },
    { value: 'FRONT-BOTTOM', label: 'Front Bottom', kind: 'squad', capacity: 2 },
  ]),
});

const liveRoster = Object.freeze({
  datacrons: Object.freeze([
    { id: 'dc-current-00000001', setId: 30, level: 9, affixes: [] },
    { id: 'dc-current-00000002', setId: 30, level: 6, affixes: [] },
  ]),
});

test('board Datacron inventory only exposes stable exact instance IDs', () => {
  assert.equal(liveDatacronInventory({}), null);
  assert.deepEqual(liveDatacronInventory({ datacrons: [] }), []);
  assert.deepEqual(liveDatacronInventory({ datacrons: [{ setId: 30 }, ...liveRoster.datacrons] }).map((row) => row.id), [
    'dc-current-00000001',
    'dc-current-00000002',
  ]);
  assert.equal(datacronLabel(liveRoster.datacrons[0]), 'L9 · Set 30 · 00000001');
});

test('restored exact assigned Datacron remains assigned when current live inventory resolves it', () => {
  const restored = restoredDatacronSelection({
    datacronState: 'assigned',
    datacron: { id: 'dc-current-00000001', setId: 30, level: 9 },
  }, liveRoster);
  assert.equal(restored.state, 'assigned');
  assert.equal(restored.id, 'dc-current-00000001');
  assert.equal(restored.unresolved, false);
  assert.equal(restored.datacron.id, 'dc-current-00000001');
  assert.equal(canSaveDatacronSelection(restored), true);
});

test('restored assigned Datacron fails closed when exact current instance cannot be resolved', () => {
  const missing = restoredDatacronSelection({
    datacronState: 'assigned',
    datacron: { id: 'dc-retired-99999999', setId: 29, level: 9 },
  }, liveRoster);
  assert.equal(missing.state, 'assigned');
  assert.equal(missing.id, 'dc-retired-99999999');
  assert.equal(missing.unresolved, true);
  assert.equal(canSaveDatacronSelection(missing), false);

  const inventoryUnavailable = restoredDatacronSelection({
    datacronState: 'assigned',
    datacron: { id: 'dc-current-00000001' },
  }, {});
  assert.equal(inventoryUnavailable.state, 'assigned');
  assert.equal(inventoryUnavailable.unresolved, true);
  assert.equal(canSaveDatacronSelection(inventoryUnavailable), false);
});

test('unknown, confirmed none and exact assigned are distinct control states', () => {
  const unknown = selectionFromControl('unknown', liveRoster);
  const none = selectionFromControl('none', liveRoster);
  const assigned = selectionFromControl('assigned:dc-current-00000002', liveRoster);
  const invented = selectionFromControl('assigned:not-in-live-roster', liveRoster);

  assert.deepEqual({ state: unknown.state, id: unknown.id }, { state: 'unknown', id: '' });
  assert.deepEqual({ state: none.state, id: none.id }, { state: 'none', id: '' });
  assert.equal(assigned.state, 'assigned');
  assert.equal(assigned.id, 'dc-current-00000002');
  assert.equal(assigned.datacron.id, 'dc-current-00000002');
  assert.equal(invented.state, 'unknown');
  assert.equal(invented.id, '');
  assert.equal(canSaveDatacronSelection(assigned), true);
  assert.equal(canSaveDatacronSelection({ state: 'assigned', id: '', unresolved: false }), false);
});

test('local draft snapshot preserves exact Datacron identity without inventing tactical mechanics', () => {
  const assigned = selectionFromControl('assigned:dc-current-00000001', liveRoster);
  assert.deepEqual(localDatacronSnapshot(assigned), {
    id: 'dc-current-00000001',
    setId: 30,
    level: 9,
  });
  assert.equal(localDatacronSnapshot(selectionFromControl('none', liveRoster)), null);
});

test('initial capture queue includes only visible front territories and prioritizes exact Front Top slots', () => {
  const territories = boardTerritories(rule, [], [], defaultRevealState());
  const slots = visibleCaptureSlots(territories);
  assert.deepEqual(slots.map((row) => `${row.zone}|${row.slot}`), [
    'FRONT-TOP|0',
    'FRONT-TOP|1',
    'FRONT-BOTTOM|0',
    'FRONT-BOTTOM|1',
  ]);
  const queue = captureQueue(territories);
  assert.equal(queue.next.zone, 'FRONT-TOP');
  assert.equal(queue.next.slot, 0);
  assert.equal(queue.hiddenCapacity, 3);
  assert.deepEqual([...queue.hiddenTerritories].sort(), ['BACK-BOTTOM', 'BACK-TOP']);
});

test('occupied visible slots are skipped and hidden rear defenses never become next targets', () => {
  const squads = [
    { zone: 'FRONT-TOP', slot: 0, members: ['A','B','C'] },
    { zone: 'BACK-BOTTOM', slot: 0, members: ['D','E','F'] },
  ];
  const territories = boardTerritories(rule, squads, [], defaultRevealState());
  const queue = captureQueue(territories);
  assert.equal(queue.next.zone, 'FRONT-TOP');
  assert.equal(queue.next.slot, 1);
  assert.equal(queue.slots.some((row) => row.zone === 'BACK-BOTTOM'), false);
});

test('rear squad and fleet slots enter capture queue only after explicit reveal state', () => {
  const rearSquad = boardTerritories(rule, [], [], { 'BACK-BOTTOM': true, 'BACK-TOP': false });
  const squadSlots = visibleCaptureSlots(rearSquad);
  assert.equal(squadSlots.some((row) => row.zone === 'BACK-BOTTOM'), true);
  assert.equal(squadSlots.some((row) => row.zone === 'BACK-TOP'), false);

  const allRevealed = boardTerritories(rule, [], [], { 'BACK-BOTTOM': true, 'BACK-TOP': true });
  const allSlots = visibleCaptureSlots(allRevealed);
  assert.equal(allSlots.some((row) => row.zone === 'BACK-TOP' && row.kind === 'fleet'), true);
});

test('visible-complete and full-board capture statuses are distinct', () => {
  const frontSquads = [
    { zone: 'FRONT-TOP', slot: 0 }, { zone: 'FRONT-TOP', slot: 1 },
    { zone: 'FRONT-BOTTOM', slot: 0 }, { zone: 'FRONT-BOTTOM', slot: 1 },
  ];
  const frontOnly = captureQueue(boardTerritories(rule, frontSquads, [], defaultRevealState()));
  assert.equal(frontOnly.visibleComplete, true);
  assert.equal(frontOnly.fullComplete, false);
  assert.equal(captureStatus(frontOnly).code, 'visible-complete');

  const allSquads = [
    ...frontSquads,
    { zone: 'BACK-BOTTOM', slot: 0 }, { zone: 'BACK-BOTTOM', slot: 1 },
  ];
  const allFleet = [{ zone: 'BACK-TOP', slot: 0, capitalShipBaseId: 'CAPITALX', starters: ['S1','S2','S3'], reinforcements: [] }];
  const full = captureQueue(boardTerritories(rule, allSquads, allFleet, { 'BACK-BOTTOM': true, 'BACK-TOP': true }));
  assert.equal(full.visibleComplete, true);
  assert.equal(full.fullComplete, true);
  assert.equal(captureStatus(full).code, 'full');
});

test('restore summary distinguishes canonical/server rows from local drafts', () => {
  const summary = restoreSummary([
    { zone: 'FRONT-TOP', slot: 0, storage: 'server' },
    { zone: 'FRONT-TOP', slot: 1, storage: 'draft' },
    { zone: 'FRONT-BOTTOM', slot: 0 },
  ], [
    { zone: 'BACK-TOP', slot: 0 },
    { zone: 'BACK-TOP', slot: 1 },
  ], [
    { zone: 'BACK-TOP', slot: 0, id: 123 },
  ]);
  assert.deepEqual(summary, {
    serverSquads: 1,
    localSquads: 2,
    canonicalFleets: 1,
    localFleets: 1,
  });
});

test('B07 workspace persists exact Datacron ID and does not retain the old hardcoded empty ID path', async () => {
  const source = await readFile(new URL('../public/gac-manual-board-workspace.js', import.meta.url), 'utf8');
  assert.match(source, /restoredDatacronSelection/);
  assert.match(source, /ASSIGNED SNAPSHOT UNRESOLVED/);
  assert.match(source, /datacronId:defense\.datacronState==='assigned'/);
  assert.doesNotMatch(source, /datacronId:''/);
  assert.match(source, /canSaveDatacronSelection/);
});

test('B07 capture controller reuses exact Board v2 slot controls and never auto-reveals rear territories', async () => {
  const accelerator = await readFile(new URL('../public/gac-board-capture-accelerator.js', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');
  const backend = await readFile(new URL('../gac-board-observation-service.mjs', import.meta.url), 'utf8');

  assert.match(bootstrap, /import '\.\/gac-board-capture-accelerator\.js';/);
  assert.match(accelerator, /data-gac-board-v2-squad-slot/);
  assert.match(accelerator, /data-gac-board-v2-fleet-slot/);
  assert.match(accelerator, /requestBoardRefresh\(true\)/);
  assert.match(accelerator, /AUTO ADVANCE/);
  assert.doesNotMatch(accelerator, /data-gac-board-v2-reveal/);
  assert.doesNotMatch(accelerator, /setReveal\(/);
  assert.match(backend, /Release the locked War Room plan before this saved defense can be/);
  assert.match(backend, /War Room attempt history and cannot be/);
});
