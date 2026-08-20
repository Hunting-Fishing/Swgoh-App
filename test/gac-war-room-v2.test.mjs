import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const warRoom = fs.readFileSync(new URL('../public/gac-war-room-v2.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/gac-war-room-v2.css', import.meta.url), 'utf8');
const auto = fs.readFileSync(new URL('../public/gac-auto-current-opponent.js', import.meta.url), 'utf8');
const assets = fs.readFileSync(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');

test('GAC War Room v2 accepts canonical/persisted full rosters for direct comparison', () => {
  assert.match(warRoom, /if \(!body\?\.player \|\| !Array\.isArray\(body\?\.units\)\)/);
  assert.doesNotMatch(warRoom, /body\?\.source\s*!==\s*["']live["']/);
  assert.match(warRoom, /\/api\/player\/\$\{allyCode\(code\)\}/);
});

test('verified account Ally Code is a first-class fallback for GAC auto detection', () => {
  assert.match(warRoom, /window\.__swgohAccountAllyCode/);
  assert.match(auto, /window\.__swgohAccountAllyCode/);
  assert.match(auto, /currentOwnerAllyCode/);
});

test('manual exact opponent confirmation stays explicit and round-scoped', () => {
  assert.match(warRoom, /\/api\/gac\/current-opponent\/\$\{owner\}\/confirm/);
  assert.match(warRoom, /opponentAllyCode:opponent,round/);
  assert.match(warRoom, /<option value="">Round<\/option>/);
  assert.doesNotMatch(warRoom, /697738349/);
});

test('War Room uses compact primary tabs instead of one long report', () => {
  for (const tab of ['matchup','board','delta','history','diagnostics']) {
    assert.match(warRoom, new RegExp(`data-gacv2-tab=\\"${tab}\\"`));
  }
  assert.match(styles, /\.gacv2-tabs/);
  assert.match(styles, /\.gacv2-panel\[hidden\]/);
});

test('GAC v2 uses light cards while preserving legacy diagnostics', () => {
  assert.match(styles, /background:\s*#fff/);
  assert.match(styles, /\.gacv2-diagnostics \.gac-command-center/);
  assert.match(warRoom, /data-gacv2-legacy-host/);
  assert.match(warRoom, /host\.appendChild\(legacy\)/);
});

test('auto opponent module loads the War Room and global asset resilience layer', () => {
  assert.match(auto, /import '\.\/asset-resilience\.js'/);
  assert.match(auto, /import '\.\/gac-war-room-v2\.js'/);
  assert.match(auto, /gac-war-room-v2\.css/);
});

test('asset resilience retries canonical catalog portraits before showing fallback', () => {
  for (const key of ['unit.image','unit.imageUrl','unit.portrait','unit.portraitUrl','unit.thumbnail','unit.icon']) {
    assert.match(assets, new RegExp(key.replace('.', '\\.')));
  }
  assert.match(assets, /state\.byId\.get\(baseId\)/);
  assert.match(assets, /state\.byName\.get\(nameKey\(name\)\)/);
  assert.match(assets, /asset-resilience-fallback/);
});
