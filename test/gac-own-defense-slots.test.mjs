import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public/gac-own-defense-slots.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/gac-own-defense-slots.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');

test('own battlefield mirrors opponent territory capacities and persists exact placements', () => {
  assert.match(source, /function zoneCapacity\(map, zone\)/);
  assert.match(source, /querySelectorAll\('\.gac-league-placement'\)/);
  assert.match(source, /swgoh:gac-own-defenses:v1:/);
  assert.match(source, /data-gac-own-defense-slot/);
  assert.match(source, /badgeText = `\$\{filled\}\/\$\{capacity\}`/);
});

test('professional own defense workflow selects roster units directly into a chosen slot', () => {
  assert.match(source, /function toggleBuilderUnit\(idInput\)/);
  assert.match(source, /ownState\.selectedBaseIds/);
  assert.match(source, /\.gac-manual-roster-grid \[data-gac-manual-own-toggle\]/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /SUBMIT DEFENSE/);
  assert.match(source, /data-gac-own-defense-leader/);
});

test('submit automatically reserves assigned units while preserving pre-existing manual reservations', () => {
  assert.match(source, /managedReservationKey/);
  assert.match(source, /readManagedReservations/);
  assert.match(source, /syncReservation\(id, true\)/);
  assert.match(source, /releaseManagedReservations/);
  assert.match(source, /if \(!managed\.has\(normalized\) \|\| stillAssigned\.has\(normalized\)\) continue/);
});

test('builder enforces 5v5 3v3 and fleet completion rules', () => {
  assert.match(source, /function squadSize\(\).*3v3' \? 3 : 5/);
  assert.match(source, /function builderMinimum\(\).*fleet' \? 4 : squadSize\(\)/);
  assert.match(source, /function builderLimit\(\).*fleet' \? 8 : squadSize\(\)/);
  assert.match(source, /ids\.length === squadSize\(\)/);
});

test('assigned defense renders leader and supporting portraits on battlefield', () => {
  assert.match(source, /gac-own-defense-portrait.*is-leader/s);
  assert.match(source, /gac-own-defense-pips/);
  assert.match(css, /\.gac-own-defense-portrait\.is-leader/);
  assert.match(css, /\.gac-own-defense-pips/);
});

test('legacy reserved portrait pile is hidden and replaced with compact status summary', () => {
  assert.match(css, />\.gac-manual-reserved\{display:none!important\}/);
  assert.match(source, /gac-own-defense-summary-stats/);
  assert.match(source, /DEFENSES ASSIGNED/);
  assert.match(source, /UNASSIGNED RESERVED/);
  assert.match(source, /VIEW RESERVED/);
});

test('professional workspace uses dedicated roster and sticky builder columns', () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(270px,320px\)/);
  assert.match(css, /grid-area:builder/);
  assert.match(css, /position:sticky;top:76px/);
  assert.match(css, /data-gac-defense-state="selected"/);
  assert.match(css, /data-gac-defense-state="assigned"/);
  assert.match(css, /data-gac-defense-state="reserved"/);
});

test('renderer updates only when signatures change to avoid mutation observer loops', () => {
  assert.match(source, /gacOwnDefenseSignature/);
  assert.match(source, /if \(host\.dataset\.gacOwnDefenseSignature === signature\) continue/);
  assert.match(source, /if \(node\.dataset\.signature === signature\) return/);
});

test('professional controller loads after full battlefield and is cache-versioned', () => {
  const fullIndex = loader.indexOf("import './gac-full-battlefield.js';");
  const ownIndex = loader.indexOf("import './gac-own-defense-slots.js?v=20260822-pro1';");
  assert.ok(fullIndex >= 0);
  assert.ok(ownIndex > fullIndex);
});
