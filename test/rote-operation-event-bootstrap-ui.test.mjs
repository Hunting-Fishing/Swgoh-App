import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../public/guild-tw-router.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/rote-operation-event-bootstrap-ui.js', import.meta.url), 'utf8');

test('Guild shell wires the officer ROTE event bootstrap after the ledger enhancer', () => {
  assert.match(router, /import\s+["']\.\/rote-operation-ledger-ui\.js["'];[\s\S]*import\s+["']\.\/rote-operation-event-bootstrap-ui\.js["'];/);
});

test('event bootstrap uses the existing authenticated TB event API and canonical slot sync API', () => {
  assert.match(ui, /\/api\/account\/web-actions\/tb\/event/);
  assert.match(ui, /\/api\/account\/tb-operations\/event\/current\/reference-sync/);
});

test('event bootstrap requires an explicit P1-P6 officer-selected phase and labels the event as officer-entered', () => {
  assert.match(ui, /\['P1','P2','P3','P4','P5','P6'\]/);
  assert.match(ui, /officer-entered/);
  assert.match(ui, /currentPhase:\s*phase/);
  assert.match(ui, /status:\s*'active'/);
});

test('event bootstrap does not infer assignments or contributions', () => {
  assert.match(ui, /It will not infer who was assigned or who filled anything/);
  assert.match(ui, /No assignment or contribution evidence was inferred/);
  assert.doesNotMatch(ui, /contributions\/self|contributions\/officer/);
});

test('event activation retry checks for an already-created active event before attempting another create', () => {
  const currentCheck = ui.indexOf('const latest = await currentEvent()');
  const createCall = ui.indexOf("method: 'POST'", currentCheck);
  assert.ok(currentCheck >= 0);
  assert.ok(createCall > currentCheck);
  assert.match(ui, /if \(!latest\?\.configured \|\| !event\?\.id\)/);
});

test('bootstrap observer stops automatic retries on error and exposes explicit retry', () => {
  assert.match(ui, /!state\.checking && !state\.error/);
  assert.match(ui, /roteBootstrapRetry/);
  assert.match(ui, /dataset\.roteEventBootstrapRendered/);
});
