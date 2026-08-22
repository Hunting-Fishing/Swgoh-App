import test from 'node:test';
import assert from 'node:assert/strict';

import {
  guildRoteTacticalCellDetailMarkup,
  guildRoteTacticalMatrixMarkup,
} from '../public/guild-rote-tactical-readiness-matrix-ui.js';
import { GUILD_ROTE_TACTICAL_STATE } from '../public/guild-rote-tactical-readiness-matrix.js';

function member(id, name, allyCode) {
  return { id, name, allyCode, rosterAvailable: true };
}

const alpha = member('m1', 'Alpha Pilot', '111222333');
const bravo = member('m2', 'Bravo Pilot', '444555666');

const hondoReadiness = {
  verdict: 'NEEDS ZETA',
  officialEntryReady: true,
  battleEvidenceComplete: true,
  progressionFailures: [],
  unknownEvidence: [],
  progression: [],
  abilities: [],
  zetas: [{ state: 'FAIL', required: true, name: 'I Smell Profit!', installed: false }],
  omicrons: [],
  stats: [],
  evidenceBoundary: 'Official entry remains separate from battle preparation.',
};

const matrix = {
  evidenceBoundary: 'Official entry legality, tactical battle preparation, and unknown evidence remain separate.',
  members: [alpha, bravo],
  summary: {
    total: 4,
    known: 3,
    battleReady: 1,
    officialEntryReady: 3,
    minimumReady: 1,
    saferReady: 1,
    blocked: 1,
    unknownEvidence: 1,
    counts: {
      [GUILD_ROTE_TACTICAL_STATE.SAFER_READY]: 1,
      [GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY]: 0,
      [GUILD_ROTE_TACTICAL_STATE.ENTRY_READY]: 1,
      [GUILD_ROTE_TACTICAL_STATE.BLOCKED]: 1,
      [GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE]: 1,
    },
  },
  missions: [
    {
      key: 'felucia:felucia-hondo',
      planetId: 'felucia',
      planetName: 'Felucia',
      phase: 'P2',
      lane: 'Mixed',
      evidence: 'exact',
      mission: { id: 'felucia-hondo', name: 'Hondo Combat Mission' },
      missionSummary: {
        officialEntryReady: 2,
        minimumReady: 1,
        saferReady: 1,
        blocked: 0,
        unknownEvidence: 0,
        outstandingAvailable: true,
        outstanding: 1,
        attemptsRecorded: 1,
      },
      cells: [
        {
          member: alpha,
          state: GUILD_ROTE_TACTICAL_STATE.ENTRY_READY,
          officialEntryReady: true,
          verdict: 'NEEDS ZETA',
          tacticalGap: 'NEEDS ZETA',
          unknownEvidenceCount: 0,
          progressionFailureCount: 0,
          readiness: hondoReadiness,
        },
        {
          member: bravo,
          state: GUILD_ROTE_TACTICAL_STATE.SAFER_READY,
          officialEntryReady: true,
          verdict: 'SAFER TARGET READY',
          tacticalGap: 'Safer target met',
          unknownEvidenceCount: 0,
          progressionFailureCount: 0,
          readiness: null,
        },
      ],
    },
    {
      key: 'tatooine:tatooine-reva',
      planetId: 'tatooine',
      planetName: 'Tatooine',
      phase: 'P3',
      lane: 'Dark',
      evidence: 'exact',
      mission: { id: 'tatooine-reva', name: 'Third Sister Shard Mission' },
      missionSummary: {
        officialEntryReady: 0,
        minimumReady: 0,
        saferReady: 0,
        blocked: 1,
        unknownEvidence: 1,
        outstandingAvailable: false,
        outstanding: null,
        attemptsRecorded: null,
      },
      cells: [
        {
          member: alpha,
          state: GUILD_ROTE_TACTICAL_STATE.BLOCKED,
          officialEntryReady: false,
          verdict: 'BLOCKED — ENTRY',
          tacticalGap: 'BLOCKED — ENTRY',
          unknownEvidenceCount: 0,
          progressionFailureCount: 1,
          readiness: null,
        },
        {
          member: bravo,
          state: GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE,
          officialEntryReady: null,
          verdict: '',
          tacticalGap: 'Guild member roster is unavailable',
          unknownEvidenceCount: 1,
          progressionFailureCount: 0,
          readiness: null,
        },
      ],
    },
  ],
};

test('matrix UI renders mission × member readiness cells and evidence summary', () => {
  const markup = guildRoteTacticalMatrixMarkup(matrix, { guildAllyCode: '999888777' });

  assert.match(markup, /Mission × Member Readiness/);
  assert.match(markup, /Alpha Pilot/);
  assert.match(markup, /Bravo Pilot/);
  assert.match(markup, /Hondo Combat Mission/);
  assert.match(markup, /Third Sister Shard Mission/);
  assert.match(markup, /ENTRY READY/);
  assert.match(markup, /SAFER READY/);
  assert.match(markup, /BLOCKED/);
  assert.match(markup, /UNKNOWN/);
  assert.match(markup, /UNKNOWN EVIDENCE/);
  assert.match(markup, /OFFICIAL ENTRY READY/);
  assert.match(markup, /ENTRY 2 · MIN 1 · SAFER 1 · BLOCKED 0 · UNKNOWN 0 · OUTSTANDING 1/);
  assert.match(markup, /ENTRY 0 · MIN 0 · SAFER 0 · BLOCKED 1 · UNKNOWN 1/);
});

test('readiness filter keeps only missions containing the selected state', () => {
  const markup = guildRoteTacticalMatrixMarkup(matrix, {
    tacticalState: GUILD_ROTE_TACTICAL_STATE.SAFER_READY,
    guildAllyCode: '999888777',
  });

  assert.match(markup, /Hondo Combat Mission/);
  assert.doesNotMatch(markup, /Third Sister Shard Mission/);
});

test('member search narrows matrix columns without losing mission rows', () => {
  const markup = guildRoteTacticalMatrixMarkup(matrix, { search: '444555666' });

  assert.match(markup, /Bravo Pilot/);
  assert.doesNotMatch(markup, /<th><strong>Alpha Pilot<\/strong>/);
  assert.match(markup, /Hondo Combat Mission/);
  assert.match(markup, /Third Sister Shard Mission/);
});

test('cell drill-down links to the existing Guild member command profile and exposes mission-level Guild intelligence', () => {
  const selectedKey = 'felucia:felucia-hondo|m1';
  const markup = guildRoteTacticalCellDetailMarkup(matrix, selectedKey, '999888777');

  assert.match(markup, /Alpha Pilot/);
  assert.match(markup, /Hondo Combat Mission/);
  assert.match(markup, /Guild entry-ready<\/span><strong>2/);
  assert.match(markup, /Minimum-ready<\/span><strong>1/);
  assert.match(markup, /Safer-ready<\/span><strong>1/);
  assert.match(markup, /Active-event outstanding<\/span><strong>1/);
  assert.match(markup, /Recorded attempts<\/span><strong>1/);
  assert.match(markup, /Official entry<\/span><strong>PASS/);
  assert.match(markup, /NEEDS ZETA/);
  assert.match(markup, /I Smell Profit!/);
  assert.match(markup, /data-guild-mission-planet="felucia"/);
  assert.match(markup, /href="\/guild\/members\/111222333\?allyCode=999888777"/);
});

test('mission detail keeps outstanding UNKNOWN when active-event participation evidence is absent', () => {
  const selectedKey = 'tatooine:tatooine-reva|m1';
  const markup = guildRoteTacticalCellDetailMarkup(matrix, selectedKey, '999888777');

  assert.match(markup, /Active-event outstanding<\/span><strong>UNKNOWN/);
  assert.match(markup, /Participation evidence<\/span><strong>NOT LOADED/);
});
