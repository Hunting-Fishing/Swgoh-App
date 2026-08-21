import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('GAC runtime bootstrap explicitly owns the main-section integration', async () => {
  const bootstrap = await source('public/asset-resilience.js');
  assert.match(bootstrap, /^import '\.\/gac-main-section\.js';/m);
  assert.match(bootstrap, /import '\.\/gac-war-room-v3\.js';/);
  assert.match(bootstrap, /import '\.\/gac-manual-war-room-bridge\.js';/);
  assert.match(bootstrap, /import '\.\/gac-fleet-manual-parity\.js';/);
});

test('main GAC integration mounts only inside the existing GAC workspace', async () => {
  const integration = await source('public/gac-main-section.js');
  assert.match(integration, /\[data-workspace-panel=\\?"gac\\?"\]/);
  assert.match(integration, /dataGacMainOperations/);
  assert.match(integration, /data-gac-main-war-room-host/);
  assert.match(integration, /\[data-gacv2-root\]/);
  assert.match(integration, /appendChild\(root\)/);
  assert.doesNotMatch(integration, /data-workspace-panel=\\?"(?:farm|mods|guild|roster|squads)\\?"/);
});

test('main GAC integration reuses the canonical War Room instead of cloning battle state', async () => {
  const integration = await source('public/gac-main-section.js');
  assert.match(integration, /import '\.\/gac-war-room-v2\.js';/);
  assert.match(integration, /document\.querySelector\(ROOT_SELECTOR\)/);
  assert.match(integration, /document\.getElementById\('gacCommandCenterPro'\)/);
  assert.doesNotMatch(integration, /\/api\/gac\//);
  assert.doesNotMatch(integration, /localStorage\.setItem/);
  assert.doesNotMatch(integration, /fetch\(/);
});

test('main GAC shortcuts target existing War Room tabs', async () => {
  const integration = await source('public/gac-main-section.js');
  for (const tab of ['matchup', 'board', 'delta', 'history']) {
    assert.match(integration, new RegExp(`data-gac-main-open=\\"${tab}\\"`));
  }
  assert.match(integration, /button\.click\(\)/);
});

test('GitHub hosted workflows are manual-only so CI billing cannot block pushes', async () => {
  for (const workflow of [
    '.github/workflows/node-test.yml',
    '.github/workflows/test.yml',
    '.github/workflows/cloudflare-worker-verify.yml',
  ]) {
    const yaml = await source(workflow);
    assert.match(yaml, /workflow_dispatch:/);
    assert.doesNotMatch(yaml, /^\s{2}(push|pull_request):/m);
  }
});
