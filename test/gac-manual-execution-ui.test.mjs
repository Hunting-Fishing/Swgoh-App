import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const executionUrl = new URL('../public/gac-battle-execution-ui.js', import.meta.url);
const resultUrl = new URL('../public/gac-attempt-result-ui.js', import.meta.url);
const bridgeUrl = new URL('../public/gac-manual-war-room-bridge.js', import.meta.url);
const contractUrl = new URL('../public/gac-manual-execution-contract.js', import.meta.url);
const loaderUrl = new URL('../public/asset-resilience.js', import.meta.url);

async function sources() {
  const [execution, result, bridge, contract, loader] = await Promise.all([
    readFile(executionUrl, 'utf8'),
    readFile(resultUrl, 'utf8'),
    readFile(bridgeUrl, 'utf8'),
    readFile(contractUrl, 'utf8'),
    readFile(loaderUrl, 'utf8'),
  ]);
  return { execution, result, bridge, contract, loader };
}

test('B08 mounts the authoritative pre-battle checklist directly on verified manual defense cards', async () => {
  const { execution, bridge } = await sources();
  assert.match(execution, /gac-visible-defense\[data-defense-id\]/);
  assert.match(execution, /data-gac-manual-war-action=\\?"preflight\\?"/);
  assert.match(execution, /async function togglePreflight/);
  assert.match(execution, /executionConfirmation:checklist\.fingerprint/);
  assert.match(execution, /gac-visible-board-rendered/);
  assert.match(execution, /stopImmediatePropagation\(\)/);
  assert.match(bridge, /data-gac-manual-war-action=\\?"preflight\\?"/);
});

test('B09 opens direct WIN or LOSS capture on the same manual defense card', async () => {
  const { result, bridge } = await sources();
  assert.match(result, /gac-visible-defense\[data-defense-id\]/);
  assert.match(result, /data-gac-manual-war-action=\\?"result\\?"/);
  assert.match(result, /WHAT HAPPENED IN GAME\?/);
  assert.match(result, /data-gac-result-choice-status=\\?"win\\?"/);
  assert.match(result, /data-gac-result-choice-status=\\?"loss\\?"/);
  assert.match(result, /async function toggleOutcomeChoice/);
  assert.match(result, /postAttempt:model\.postAttempt/);
  assert.match(result, /gac-visible-board-rendered/);
  assert.match(result, /stopImmediatePropagation\(\)/);
  assert.match(bridge, /data-gac-manual-war-action=\\?"result\\?"/);
});

test('direct manual result capture preserves the existing unknown-state safety boundary', async () => {
  const { result } = await sources();
  assert.match(result, /TM \/ HEALTH \/ PROTECTION: NOT CAPTURED/);
  assert.match(result, /Turn Meter, Health, Protection, cooldowns/);
  assert.doesNotMatch(result, /data-gac-result-(?:tm|health|protection)/i);
  assert.match(result, /survivors-confirmed/);
});

test('manual and saved board share one battle-card selector contract', async () => {
  const { execution, result } = await sources();
  const expected = /#gacBoardPlannerGrid \.gac-saved-board-card,\[data-gac-board-workspace\] \.gac-visible-defense\[data-defense-id\]/;
  assert.match(execution, expected);
  assert.match(result, expected);
});

test('manual bridge controls normalize into native War Room actions without relying on listener order', async () => {
  const { contract, loader } = await sources();
  assert.match(contract, /dataset\.warAction='attempt'/);
  assert.match(contract, /delete button\.dataset\.gacManualWarAction/);
  assert.match(contract, /resultButton\(button,'win','✓ RECORD WIN'\)/);
  assert.match(contract, /resultButton\(button,'loss','× RECORD LOSS'\)/);
  assert.match(contract, /MutationObserver/);
  assert.match(loader, /import '\.\/gac-manual-execution-contract\.js';/);
});
