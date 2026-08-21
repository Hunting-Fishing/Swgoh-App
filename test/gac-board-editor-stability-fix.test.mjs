import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BOARD_EDITOR_TRIGGER_SELECTOR,
  createBoardEditorClickStabilizer,
} from '../public/gac-board-editor-stability-fix.js';

function fakeEvent(trigger) {
  const calls = { preventDefault: 0, stopImmediatePropagation: 0 };
  return {
    target: { closest: () => trigger },
    preventDefault() { calls.preventDefault += 1; },
    stopImmediatePropagation() { calls.stopImmediatePropagation += 1; },
    calls,
  };
}

test('stabilizer covers squad and fleet editor entry controls', () => {
  assert.match(BOARD_EDITOR_TRIGGER_SELECTOR, /data-gac-board-v2-squad-slot/);
  assert.match(BOARD_EDITOR_TRIGGER_SELECTOR, /data-gac-board-v2-fleet-slot/);
  assert.match(BOARD_EDITOR_TRIGGER_SELECTOR, /data-gac-board-v2-fleet-edit/);
});

test('first editor click is ended and replayed after the original event', () => {
  let handler;
  let replayCount = 0;
  let replayIntercepted = null;
  const trigger = {
    isConnected: true,
    click() {
      replayCount += 1;
      replayIntercepted = handler(fakeEvent(trigger));
    },
  };
  handler = createBoardEditorClickStabilizer({ schedule: (callback) => callback() });
  const first = fakeEvent(trigger);
  assert.equal(handler(first), true);
  assert.equal(first.calls.preventDefault, 1);
  assert.equal(first.calls.stopImmediatePropagation, 1);
  assert.equal(replayCount, 1);
  assert.equal(replayIntercepted, false, 'deferred replay must flow through to the normal Board v2 handler');
});

test('detached controls are ignored instead of replayed', () => {
  let scheduled = 0;
  const handler = createBoardEditorClickStabilizer({ schedule: () => { scheduled += 1; } });
  const trigger = { isConnected: false, click() { throw new Error('must not click'); } };
  const event = fakeEvent(trigger);
  assert.equal(handler(event), false);
  assert.equal(scheduled, 0);
  assert.equal(event.calls.preventDefault, 0);
});

test('stability guard loads after War Room v3 so Board v2 and capture queue bind first', async () => {
  const source = await readFile(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');
  const warRoom = source.indexOf("import './gac-war-room-v3.js';");
  const guard = source.indexOf("import './gac-board-editor-stability-fix.js';");
  assert.ok(warRoom >= 0 && guard > warRoom);
});
