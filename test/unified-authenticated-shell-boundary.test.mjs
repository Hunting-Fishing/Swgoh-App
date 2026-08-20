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

test('Guild route fails closed behind a Guild loading surface instead of exposing Roster Command', () => {
  assert.match(navigation, /installGuildBootVeil/);
  assert.match(navigation, /Opening Guild Command Center/);
  assert.match(navigation, /legacy Player\/Roster interface has been blocked/);
  assert.match(navigation, /guildRouteRoot/);
});

test('Guild route module is started early from the shell guard', () => {
  assert.match(navigation, /GUILD_ROUTE_MODULE/);
  assert.match(navigation, /import\(GUILD_ROUTE_MODULE\)/);
  assert.match(navigation, /startGuildRouteEarly\(\)/);
});

test('verified account identity is shown and roster form becomes account-aware', () => {
  assert.match(navigation, /updateUnifiedIdentity\(account, code\)/);
  assert.match(navigation, /Verified Ally Code/);
  assert.match(navigation, /Refresh My Roster/);
  assert.match(navigation, /guildMemberships/);
});
