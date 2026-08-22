import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGuildRoteTacticalMissionRow,
  classifyGuildRoteTacticalReadiness,
  GUILD_ROTE_TACTICAL_STATE,
  summarizeGuildRoteMissionReadiness,
  summarizeGuildRoteTacticalCells,
} from '../public/guild-rote-tactical-readiness-matrix.js';
import { TB_TACTICAL_READINESS } from '../public/tb-mission-readiness-v2.js';

function readiness(overrides = {}) {
  return {
    officialEntryReady: true,
    verdict: TB_TACTICAL_READINESS.ENTRY_READY_BATTLE_UNKNOWN,
    unknownEvidence: [],
    progressionFailures: [],
    ...overrides,
  };
}

test('Guild ROTE tactical states preserve entry legality as the floor and do not promote tactical gaps into entry blockers', () => {
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: false }), GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE);
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: true, entryEvidence: 'gate-only', readiness: readiness() }), GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE);
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: true, entryEvidence: 'exact', readiness: readiness({ officialEntryReady: false, verdict: TB_TACTICAL_READINESS.BLOCKED_ENTRY }) }), GUILD_ROTE_TACTICAL_STATE.BLOCKED);
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: true, entryEvidence: 'exact', readiness: readiness({ unknownEvidence: [{ type: 'stat' }] }) }), GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE);
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: true, entryEvidence: 'exact', readiness: readiness({ verdict: TB_TACTICAL_READINESS.SAFER_TARGET_READY }) }), GUILD_ROTE_TACTICAL_STATE.SAFER_READY);
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: true, entryEvidence: 'exact', readiness: readiness({ verdict: TB_TACTICAL_READINESS.MINIMUM_READY }) }), GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY);

  // A known missing Zeta is a tactical gap, not an official-entry blocker.
  assert.equal(classifyGuildRoteTacticalReadiness({ rosterAvailable: true, entryEvidence: 'exact', readiness: readiness({ verdict: TB_TACTICAL_READINESS.NEEDS_ZETA }) }), GUILD_ROTE_TACTICAL_STATE.ENTRY_READY);
});

test('Guild ROTE tactical summary counts exclusive states plus cumulative official/minimum/safer readiness', () => {
  const cells = [
    { state: GUILD_ROTE_TACTICAL_STATE.SAFER_READY, officialEntryReady: true },
    { state: GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY, officialEntryReady: true },
    { state: GUILD_ROTE_TACTICAL_STATE.ENTRY_READY, officialEntryReady: true },
    { state: GUILD_ROTE_TACTICAL_STATE.BLOCKED, officialEntryReady: false },
    { state: GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE, officialEntryReady: true },
  ];
  const summary = summarizeGuildRoteTacticalCells(cells);

  assert.equal(summary.total, 5);
  assert.equal(summary.known, 4);
  assert.equal(summary.officialEntryReady, 4);
  assert.equal(summary.minimumReady, 2);
  assert.equal(summary.saferReady, 1);
  assert.equal(summary.battleReady, 2);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.unknownEvidence, 1);
  for (const state of Object.values(GUILD_ROTE_TACTICAL_STATE)) assert.equal(summary.counts[state], 1);
});

test('active-event outstanding counts only entry-ready members without a matching mission attempt', () => {
  const cells = [
    { member: { id: 'player-1', allyCode: '111222333' }, state: GUILD_ROTE_TACTICAL_STATE.SAFER_READY, officialEntryReady: true },
    { member: { id: 'player-2', allyCode: '444555666' }, state: GUILD_ROTE_TACTICAL_STATE.ENTRY_READY, officialEntryReady: true },
    { member: { id: 'player-3', allyCode: '777888999' }, state: GUILD_ROTE_TACTICAL_STATE.BLOCKED, officialEntryReady: false },
    { member: { id: 'player-4', allyCode: '123123123' }, state: GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE, officialEntryReady: null },
  ];
  const missionRow = {
    key: 'felucia:felucia-hondo',
    mission: { id: 'felucia-hondo' },
  };
  const summary = summarizeGuildRoteMissionReadiness(cells, missionRow, {
    activeEvent: { id: 'rote-2026-08' },
    attempts: [
      { eventId: 'rote-2026-08', missionId: 'felucia-hondo', allyCode: '111222333' },
      { eventId: 'old-event', missionId: 'felucia-hondo', allyCode: '444555666' },
      { eventId: 'rote-2026-08', missionId: 'different-mission', allyCode: '444555666' },
    ],
  });

  assert.equal(summary.outstandingAvailable, true);
  assert.equal(summary.attemptsRecorded, 1);
  assert.equal(summary.attemptedEntryReady, 1);
  assert.equal(summary.outstanding, 1);
  assert.deepEqual(summary.outstandingMemberIds, ['player-2']);
});

test('outstanding remains unavailable when active event attempt evidence is not loaded', () => {
  const summary = summarizeGuildRoteMissionReadiness([
    { member: { id: 'player-1' }, state: GUILD_ROTE_TACTICAL_STATE.ENTRY_READY, officialEntryReady: true },
  ], {
    key: 'mission-1',
    mission: { id: 'mission-1' },
  }, {});

  assert.equal(summary.outstandingAvailable, false);
  assert.equal(summary.outstanding, null);
  assert.equal(summary.attemptsRecorded, null);
  assert.match(summary.participationEvidence, /unavailable/i);
});

test('gate-only mission evidence produces UNKNOWN EVIDENCE cells rather than false ready or blocked claims', () => {
  const member = Object.freeze({
    id: 'member-1',
    name: 'Pilot One',
    rosterAvailable: true,
    units: Object.freeze([]),
    ships: Object.freeze([]),
  });
  const row = buildGuildRoteTacticalMissionRow({
    key: 'fleet-partial',
    planetId: 'test-planet',
    phase: 'P1',
    evidence: 'gate-only',
    mission: { id: 'fleet-partial', missionType: 'fleet' },
  }, [member], []);

  assert.equal(row.cells.length, 1);
  assert.equal(row.cells[0].state, GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE);
  assert.match(row.cells[0].tacticalGap, /entry evidence is incomplete/i);
  assert.equal(row.summary.counts[GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE], 1);
  assert.equal(row.missionSummary.outstandingAvailable, false);
});
