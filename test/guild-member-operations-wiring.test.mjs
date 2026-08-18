import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const router = await readFile(new URL('public/guild-tw-router.js', root), 'utf8');
const ui = await readFile(new URL('public/guild-member-operations-drawer.js', root), 'utf8');
const css = await readFile(new URL('public/guild-member-operations-drawer.css', root), 'utf8');
const api = await readFile(new URL('guild-discord-admin-api.mjs', root), 'utf8');
const service = await readFile(new URL('guild-member-operations-service.mjs', root), 'utf8');

test('Guild Operations route loads member control drawer', () => {
  assert.match(router, /guild-member-operations-drawer\.js/);
  assert.match(ui, /guild-member-operations-drawer\.css/);
  assert.match(ui, /MEMBER OPERATIONS CONTROL/);
  assert.match(ui, /Guild Member Command Drawer/);
});

test('drawer writes availability and GIVE KEEP through the existing canonical Guild Operations endpoints', () => {
  assert.match(ui, /writeApi\('\/member-control'\)/);
  assert.match(ui, /writeApi\('\/donation-preference'\)/);
  assert.match(ui, /Save Availability/);
  assert.match(ui, /Save Preference/);
  assert.match(ui, /DEFAULT \/ CLEAR/);
});

test('hard reserves remain read-only and schedule language does not promise future assignments', () => {
  assert.match(ui, /Read-only here/);
  assert.match(ui, /live ownership verification gate/);
  assert.match(ui, /future planner executions, not guaranteed assignments/i);
  assert.doesNotMatch(ui, /setDiscordHardReservation|hard-reservation.*method:\s*['"]POST/i);
  assert.match(service, /not guaranteed member assignments/i);
});

test('drawer is keyboard and mobile conscious', () => {
  assert.match(ui, /event\.key === 'Escape'/);
  assert.match(ui, /state\.opener\?\.focus/);
  assert.match(ui, /aria-modal/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /width:100vw/);
  assert.match(css, /prefers-reduced-motion/);
});

test('member read endpoints remain authenticated read-only routes inside the existing account namespace', () => {
  assert.match(api, /member-operations/);
  assert.match(api, /request\.method !== 'GET'/);
  assert.match(api, /session\.currentUser/);
  assert.match(service, /operations\.requireOfficer/);
});
