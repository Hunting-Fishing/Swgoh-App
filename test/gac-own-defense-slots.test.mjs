import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public/gac-own-defense-slots.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/gac-own-defense-slots.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');

test('own battlefield mirrors opponent territory capacities instead of using placeholder territories', () => {
  assert.match(source, /function zoneCapacity\(map, zone\)/);
  assert.match(source, /querySelectorAll\('\.gac-league-placement'\)/);
  assert.match(source, /data-gac-own-defense-slot/);
  assert.match(source, /badgeText = `\$\{filled\}\/\$\{capacity\}`/);
});

test('own defense workflow assigns reserved units into an exact round slot', () => {
  assert.match(source, /swgoh:gac-own-defenses:v1:/);
  assert.match(source, /function eligiblePending/);
  assert.match(source, /ROUND DEFENSE SLOT/);
  assert.match(source, /SUBMIT DEFENSE/);
  assert.match(source, /data-gac-own-defense-leader/);
  assert.match(source, /writeAssignments\(next\)/);
});

test('5v5 and 3v3 submissions enforce their squad sizes while fleets require capital plus starters', () => {
  assert.match(source, /function squadSize\(\).*3v3' \? 3 : 5/);
  assert.match(source, /pending\.length >= 4 && pending\.length <= 8/);
  assert.match(source, /pending\.length === squadSize\(\)/);
});

test('submitted own defense renders leader plus member formation on the battlefield', () => {
  assert.match(source, /gac-own-defense-portrait.*is-leader/s);
  assert.match(source, /gac-own-defense-pips/);
  assert.match(css, /\.gac-own-defense-portrait\.is-leader/);
  assert.match(css, /\.gac-own-defense-pips/);
});

test('own defense renderer is idempotent and cannot rewrite the same DOM on every observer pass', () => {
  assert.match(source, /gacOwnDefenseSignature/);
  assert.match(source, /if \(host\.dataset\.gacOwnDefenseSignature === signature\) continue/);
  assert.match(source, /if \(existing && existing\.dataset\.gacOwnDefenseSignature === signature\) return/);
});

test('own defense controller is loaded after the full battlefield layer', () => {
  const fullIndex = loader.indexOf("import './gac-full-battlefield.js';");
  const ownIndex = loader.indexOf("import './gac-own-defense-slots.js';");
  assert.ok(fullIndex >= 0);
  assert.ok(ownIndex > fullIndex);
});
