import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGuildRoteTacticalMissionRow,
  classifyGuildRoteTacticalReadiness,
  GUILD_ROTE_TACTICAL_STATE,
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

test('Guild ROTE tactical summary counts the five matrix states without coercing unknown evidence', () => {
  const cells = [
    { state: GUILD_ROTE_TACTICAL_STATE.SAFER_READY },
    { state: GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY },
    { state: GUILD_ROTE_TACTICAL_STATE.ENTRY_READY },
    { state: GUILD_ROTE_TACTICAL_STATE.BLOCKED },
    { state: GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE },
  ];
  const summary = summarizeGuildRoteTacticalCells(cells);

  assert.equal(summary.total, 5);
  assert.equal(summary.known, 4);
  assert.equal(summary.battleReady, 2);
  for (const state of Object.values(GUILD_ROTE_TACTICAL_STATE)) assert.equal(summary.counts[state], 1);
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
});
