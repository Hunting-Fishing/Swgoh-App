import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../public/player-command-dashboard.js', import.meta.url), 'utf8');

test('compact Command Center CSS is linked in head before Player dashboard JavaScript executes', () => {
  const css = index.indexOf('/command-center-v2.css?v=20260820-ui2');
  const script = index.indexOf('/player-command-dashboard.js?v=20260820-ui2');
  assert.ok(css >= 0);
  assert.ok(script > css);
});

test('visual Events and Resources styling is linked before its module executes', () => {
  const css = index.indexOf('/workspace-visual-library.css?v=20260820-ui5');
  const script = index.indexOf('/resource-library.js?v=20260820-ui5');
  assert.ok(css >= 0);
  assert.ok(script > css);
});

test('dynamic v2 stylesheet fallback remains idempotent but is no longer required for first paint', () => {
  assert.match(dashboard, /data-command-center-v2/);
  assert.match(dashboard, /document\.querySelector\('link\[data-command-center-v2="true"\]'\)/);
  assert.match(index, /command-center-v2\.css\?v=20260820-ui2/);
});
