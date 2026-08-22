import test from 'node:test';
import assert from 'node:assert/strict';

import { roteTacticalReadinessMarkup } from '../public/rote-tactical-readiness-ui.js';
import { TB_READINESS_EVIDENCE } from '../public/tb-mission-readiness-v2.js';

test('readiness panel exposes official entry separately from tactical Level/Zeta/Omicron/stat evidence', () => {
  const markup = roteTacticalReadinessMarkup({
    verdict: 'NEEDS ZETA',
    officialEntryReady: true,
    battleEvidenceComplete: false,
    progressionFailures: [{ key: 'level' }],
    unknownEvidence: [{ type: 'battle-evidence' }],
    progression: [{
      baseId: 'HONDO',
      name: 'Hondo Ohnaka',
      level: { state: TB_READINESS_EVIDENCE.FAIL, current: 84, target: 85 },
      stars: { state: TB_READINESS_EVIDENCE.PASS, current: 7, target: 7 },
      gear: { state: TB_READINESS_EVIDENCE.PASS, current: 13, target: 13 },
      relic: { state: TB_READINESS_EVIDENCE.PASS, current: 6, target: 6 },
    }],
    abilities: [{ state: TB_READINESS_EVIDENCE.UNKNOWN, required: true, name: 'Special 2', reason: 'ability tier unavailable' }],
    zetas: [{ state: TB_READINESS_EVIDENCE.FAIL, required: true, name: 'I Smell Profit!', installed: false }],
    omicrons: [{ state: TB_READINESS_EVIDENCE.PASS, required: true, name: 'Territory Business', installed: true, activeHere: true }],
    stats: [{ state: TB_READINESS_EVIDENCE.UNKNOWN, required: true, baseId: 'HONDO', name: 'Hondo Ohnaka', stat: 'health', minimum: 100000, reason: 'health evidence unavailable' }],
    evidenceBoundary: 'Official entry remains separate from battle preparation.',
  });

  assert.match(markup, /ENTRY LEGAL/);
  assert.match(markup, /NEEDS ZETA/);
  assert.match(markup, /84 \/ 85/);
  assert.match(markup, /I Smell Profit!/);
  assert.match(markup, /Territory Business/);
  assert.match(markup, /health evidence unavailable/);
  assert.match(markup, /Unknown evidence <b>1<\/b>/);
});

test('no roster produces an explicit unloaded state rather than fabricated readiness', () => {
  const markup = roteTacticalReadinessMarkup(null);
  assert.match(markup, /ROSTER NOT LOADED/);
  assert.match(markup, /Load a player roster/);
});
