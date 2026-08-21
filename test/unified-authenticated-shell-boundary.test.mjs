import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const navigation = await readFile(new URL('public/navigation-guard.js', root), 'utf8');

test('legacy Player workspace is branded inside one authenticated Command Center shell', () => {
  assert.match(navigation, /command-global-topbar/);
  assert.match(navigation, /SWGOH <span>Command Center<\/span>/);
  assert.match(navigation, /Player Command Center/);
  assert.match(navigation, /href="\/guild"/);
  assert.match(navigation, /href="\/actions"/);
  assert.match(navigation, /data-command-signout/);
});

test('Guild route fails closed without trapping the operator behind the loading surface', () => {
  assert.match(navigation, /installGuildBootVeil/);
  assert.match(navigation, /Opening Guild Command Center/);
  assert.match(navigation, /legacy Player\/Roster interface remains blocked/);
  assert.match(navigation, /guildRouteRoot/);
  assert.match(navigation, /Player Center/);
  assert.match(navigation, /Action Center/);
  assert.match(navigation, /\/onboarding/);
});

test('Guild route module is started early with immediate failure reporting and a mount watchdog', () => {
  assert.match(navigation, /GUILD_ROUTE_MODULE/);
  assert.match(navigation, /import\(GUILD_ROUTE_MODULE\)/);
  assert.match(navigation, /startGuildRouteEarly\(\)/);
  assert.match(navigation, /renderGuildBootError/);
  assert.match(navigation, /Guild module loaded but did not mount its route shell/);
  assert.match(navigation, /Bootstrap error/);
});

test('Guild top-level navigation is installed before route bootstrap can block the page', () => {
  assert.match(navigation, /function startGuildRouteEarly\(\) \{[\s\S]*installUnifiedTopbar\(\);[\s\S]*installGuildBootVeil\(\);/);
  assert.match(navigation, /z-index:10000/);
  assert.match(navigation, /z-index:9999/);
});

test('verified account identity is shown and roster form becomes account-aware', () => {
  assert.match(navigation, /updateUnifiedIdentity\(account, code\)/);
  assert.match(navigation, /Verified Ally Code/);
  assert.match(navigation, /Refresh My Roster/);
  assert.match(navigation, /guildMemberships/);
});
