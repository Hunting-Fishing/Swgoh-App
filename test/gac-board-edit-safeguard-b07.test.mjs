import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server-backed board edits preserve the canonical mutation gate instead of falling back to a local draft', async () => {
  const source = await readFile(new URL('../public/gac-manual-board-workspace.js', import.meta.url), 'utf8');
  assert.match(source, /const serverBacked=state\.editor\.storage==='server'/);
  assert.match(source, /if\(serverBacked&&!persisted\)/);
  assert.match(source, /state\.editor\.error=/);
  assert.match(source, /War Room plan\/attempt mutation gate applies/);
  assert.match(source, /if\(!persisted\)saveDraft\(defense\)/);
  assert.ok(source.indexOf('if(serverBacked&&!persisted)') < source.indexOf('if(!persisted)saveDraft(defense)'), 'server-backed failure guard must run before local draft fallback');
});

test('exact assigned Datacron is carried into canonical save payload while unresolved assignment blocks editor save', async () => {
  const source = await readFile(new URL('../public/gac-manual-board-workspace.js', import.meta.url), 'utf8');
  assert.match(source, /datacronId:defense\.datacronState==='assigned'/);
  assert.match(source, /canSaveDatacronSelection/);
  assert.match(source, /datacronUnresolved/);
  assert.match(source, /ASSIGNED SNAPSHOT UNRESOLVED/);
  assert.doesNotMatch(source, /datacronId:''/);
});

test('canonical backend still rejects assigned state without an exact current live Datacron ID', async () => {
  const source = await readFile(new URL('../gac-board-observation-api.mjs', import.meta.url), 'utf8');
  assert.match(source, /datacronState=assigned requires an exact Datacron ID from the current live roster/);
  assert.match(source, /The selected datacron ID is not present in the .* current live datacron inventory/);
});
