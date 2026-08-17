import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = (path) => readFile(new URL(path, root), 'utf8');

test('Guild History workspace exposes every recovered historical lane lazily', async () => {
  const source = await text('public/guild-history-router.js');
  for (const view of ['membership','growth','tickets','raids','rote','reva','progression']) {
    assert.match(source, new RegExp(`['\"]${view}['\"]`));
  }
  for (const section of ['membershipPeriods','returns','guildSnapshots','playerMonthly','tickets','raids','rote','reva','trackedUnitMilestones']) {
    assert.match(source, new RegExp(`section\\(['\"]${section}['\"]\\)`));
  }
  assert.match(source, /history\/archive\?section=/);
  assert.doesNotMatch(source, /history\/archive(?:['"`]|\?)(?!section)/);
});

test('Guild History preserves evidence boundaries in officer-facing labels', async () => {
  const source = await text('public/guild-history-router.js');
  assert.match(source, /bounded leave window/i);
  assert.match(source, /fresh game-reported Guild join timestamp/i);
  assert.match(source, /Member\/phase GP aggregate/i);
  assert.match(source, /not labeled simple Guild GP/i);
  assert.match(source, /never fake zeroes/i);
  assert.match(source, /raw observed milestone events grouped/i);
});

test('Guild History router is loaded through the existing Guild module chain', async () => {
  const ability = await text('public/guild-ability-investment-panel.js');
  assert.match(ability, /^import "\.\/guild-history-router\.js";/);
});

test('Guild History styling is responsive and keeps tables scrollable', async () => {
  const css = await text('public/guild-history.css');
  assert.match(css, /overflow:auto/);
  assert.match(css, /position:sticky/);
  assert.match(css, /@media\(max-width:720px\)/);
});
