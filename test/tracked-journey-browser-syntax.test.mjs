import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const files = [
  'public/web-actions.js',
  'public/web-action-feed.js',
  'public/journey-tracker-v2.js',
];

for (const relative of files) {
  test(`${relative} passes Node syntax validation`, () => {
    const path = fileURLToPath(new URL(relative, root));
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative} syntax failed:\n${result.stderr || result.stdout}`);
  });
}
