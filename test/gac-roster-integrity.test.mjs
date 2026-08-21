import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  capabilityCoverage,
  combinedRosterIntegrity,
  expectedCounts,
  responseAgeSeconds,
  rosterArrayCoverage,
  rosterIntegrity,
} from '../public/gac-roster-integrity-model.js';
import {
  ageLabel,
  cardHtml,
  combinedLabel,
  countLabel,
} from '../public/gac-roster-integrity.js';

function liveBody(allyCode = '123456789', overrides = {}) {
  const base = {
    source: 'live',
    fetchedAt: '2026-08-21T04:59:30Z',
    player: {
      allyCode,
      name: allyCode === '123456789' ? 'Commander Alpha' : 'Commander Beta',
      galacticPower: 12_000_000,
      characterGalacticPower: 7_000_000,
      shipGalacticPower: 5_000_000,
    },
    units: [
      { baseId: 'CHAR_A', power: 40000 },
      { baseId: 'CHAR_B', power: 39000 },
      { baseId: 'CHAR_C', power: 38000 },
    ],
    ships: [
      { baseId: 'SHIP_A', power: 90000 },
      { baseId: 'SHIP_B', power: 85000 },
    ],
    summary: {
      characters: 3,
      ships: 2,
      rosterUnits: 5,
      zetas: 100,
      omicrons: 20,
    },
    capabilities: {
      liveRoster: true,
      profileGp: true,
      characterRoster: true,
      shipRoster: true,
      unitGp: true,
      zetas: true,
      omicrons: true,
      abilityProgression: true,
    },
  };
  return {
    ...base,
    ...overrides,
    player: { ...base.player, ...(overrides.player || {}) },
    summary: overrides.summary === null ? undefined : { ...base.summary, ...(overrides.summary || {}) },
    capabilities: overrides.capabilities === null ? undefined : { ...base.capabilities, ...(overrides.capabilities || {}) },
  };
}

const freshHeaders = Object.freeze({
  'X-Roster-Source': 'comlink-live',
  'X-Roster-Cache': 'fresh',
  Age: '12',
});

test('fresh exact live roster with explicit complete coverage passes the truth gate', () => {
  const result = rosterIntegrity(liveBody(), freshHeaders, { expectedAllyCode: '123-456-789' });
  assert.equal(result.status, 'good');
  assert.equal(result.identityMatches, true);
  assert.equal(result.source.live, true);
  assert.equal(result.freshness.state, 'fresh');
  assert.equal(result.freshness.ageSeconds, 12);
  assert.deepEqual(result.counts, { characters: 3, ships: 2 });
  assert.deepEqual(result.expectedCounts, { characters: 3, ships: 2, total: 5 });
  assert.deepEqual(result.coverage, {
    characters: 'known',
    ships: 'known',
    profileGp: 'known',
    unitGp: 'known',
    zetas: 'known',
    omicrons: 'known',
  });
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.warnings, []);
});

test('stale server cache remains usable only as an explicit warning state', () => {
  const result = rosterIntegrity(liveBody(), {
    ...freshHeaders,
    'X-Roster-Cache': 'stale',
    Age: '143',
  }, { expectedAllyCode: '123456789' });
  assert.equal(result.status, 'warn');
  assert.equal(result.freshness.state, 'stale');
  assert.equal(result.freshness.stale, true);
  assert.equal(result.freshness.ageSeconds, 143);
  assert.ok(result.warnings.some((row) => /stale-while-revalidate/i.test(row)));
  assert.deepEqual(result.blocking, []);
});

test('identity mismatch blocks roster truth even when the payload otherwise looks live', () => {
  const result = rosterIntegrity(liveBody('987654321'), freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.identityMatches, false);
  assert.ok(result.blocking.some((row) => /identity mismatch/i.test(row)));
});

test('non-live body or contradictory live capability blocks roster truth', () => {
  const canonical = rosterIntegrity(liveBody('123456789', { source: 'canonical' }), freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(canonical.status, 'blocked');
  assert.ok(canonical.blocking.some((row) => /not marked as live/i.test(row)));

  const contradicted = rosterIntegrity(liveBody('123456789', {
    capabilities: { liveRoster: false },
  }), freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(contradicted.status, 'blocked');
  assert.ok(contradicted.blocking.some((row) => /explicitly unavailable/i.test(row)));
});

test('character count mismatch blocks while a ship-only count mismatch stays visible as a fleet warning', () => {
  const characterMismatch = rosterIntegrity(liveBody('123456789', {
    summary: { characters: 4 },
  }), freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(characterMismatch.status, 'blocked');
  assert.equal(characterMismatch.coverage.characters, 'partial');
  assert.ok(characterMismatch.blocking.some((row) => /character roster count mismatch/i.test(row)));

  const shipMismatch = rosterIntegrity(liveBody('123456789', {
    summary: { ships: 3, rosterUnits: 6 },
  }), freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(shipMismatch.status, 'warn');
  assert.equal(shipMismatch.coverage.characters, 'known');
  assert.equal(shipMismatch.coverage.ships, 'partial');
  assert.ok(shipMismatch.warnings.some((row) => /ship roster count mismatch/i.test(row)));
});

test('missing expected counts and missing capability declarations remain observed or unverified, never known by default', () => {
  const noExpected = liveBody('123456789', { summary: null });
  const observed = rosterIntegrity(noExpected, freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(observed.status, 'warn');
  assert.deepEqual(expectedCounts(noExpected), { characters: null, ships: null, total: null });
  assert.equal(observed.coverage.characters, 'observed');
  assert.equal(observed.coverage.ships, 'observed');
  assert.ok(observed.warnings.some((row) => /logical character completeness/i.test(row)));

  const noCapabilities = liveBody('123456789', { capabilities: null });
  const unverified = rosterIntegrity(noCapabilities, freshHeaders, { expectedAllyCode: '123456789' });
  assert.equal(unverified.status, 'warn');
  assert.equal(unverified.coverage.profileGp, 'unverified');
  assert.equal(unverified.coverage.unitGp, 'unverified');
  assert.equal(unverified.coverage.zetas, 'unverified');
  assert.equal(unverified.coverage.omicrons, 'unverified');
  assert.equal(capabilityCoverage(null), 'unverified');
  assert.equal(rosterArrayCoverage(true, null, false, 3), 'known');
});

test('missing response/cache provenance headers are warnings instead of silent success', () => {
  const result = rosterIntegrity(liveBody(), { Age: '5' }, { expectedAllyCode: '123456789' });
  assert.equal(result.status, 'warn');
  assert.equal(result.source.response, 'not-exposed');
  assert.equal(result.freshness.cacheState, 'not-exposed');
  assert.ok(result.warnings.some((row) => /source header is not exposed/i.test(row)));
  assert.ok(result.warnings.some((row) => /cache state is not exposed/i.test(row)));
});

test('response age prefers authoritative Age header and otherwise preserves unknown/fetchedAt semantics', () => {
  assert.equal(responseAgeSeconds(liveBody(), { Age: '37' }, Date.parse('2026-08-21T05:00:00Z')), 37);
  assert.equal(responseAgeSeconds(liveBody(), {}, Date.parse('2026-08-21T05:00:00Z')), 30);
  assert.equal(responseAgeSeconds({ source: 'live' }, {}, Date.parse('2026-08-21T05:00:00Z')), null);
  assert.equal(ageLabel(null), 'age not exposed');
  assert.equal(ageLabel(3665), '1h 1m old');
});

test('combined truth state fails closed across both player snapshots', () => {
  const good = rosterIntegrity(liveBody('123456789'), freshHeaders, { expectedAllyCode: '123456789' });
  const stale = rosterIntegrity(liveBody('987654321'), { ...freshHeaders, 'X-Roster-Cache': 'stale' }, { expectedAllyCode: '987654321' });
  const blocked = rosterIntegrity(liveBody('987654321'), freshHeaders, { expectedAllyCode: '111222333' });
  assert.equal(combinedRosterIntegrity(good, good), 'good');
  assert.equal(combinedRosterIntegrity(good, stale), 'warn');
  assert.equal(combinedRosterIntegrity(good, blocked), 'blocked');
  assert.equal(combinedRosterIntegrity(good, null), 'waiting');
  assert.equal(combinedLabel('blocked'), 'ROSTER TRUTH BLOCKED');
});

test('truth-gate UI keeps unknown counts visibly unknown and labels blocked state', () => {
  assert.equal(countLabel(null, null), '—');
  assert.equal(countLabel(3, null), '3');
  assert.equal(countLabel(3, 4), '3 / 4 expected');
  const blocked = rosterIntegrity(liveBody('987654321'), freshHeaders, { expectedAllyCode: '123456789' });
  const html = cardHtml('OPPONENT', blocked, liveBody('987654321'));
  assert.match(html, /TRUTH BLOCKED/);
  assert.match(html, /Roster identity mismatch/);
  assert.doesNotMatch(html, /LIVE · VERIFIED/);
});

test('B06 is loaded by War Room v3 and the server exposes the roster provenance headers it audits', async () => {
  const bootstrap = await readFile(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const fetchCache = await readFile(new URL('../public/live-fetch-cache.js', import.meta.url), 'utf8');

  assert.match(bootstrap, /import '\.\/gac-roster-integrity\.js';/);
  assert.match(server, /"X-Roster-Source": "comlink-live"/);
  assert.match(server, /"X-Roster-Cache": cached\.cache/);
  assert.match(server, /Age: String\(Math\.max\(0, Math\.floor\(\(cached\.ageMs \|\| 0\) \/ 1000\)\)\)/);
  assert.match(fetchCache, /headers: entry\.headers/);
});
