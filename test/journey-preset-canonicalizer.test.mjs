import test from 'node:test';
import assert from 'node:assert/strict';

import { JOURNEY_PRESETS } from '../public/farm-presets.js';
import {
  BASE_ID_ALIASES,
  auditJourneyPresetsAgainstCatalog,
  canonicalJourneyBaseId,
  canonicalizeJourneyPresets,
} from '../public/journey-preset-canonicalizer.js';

test('confirmed Asajj typo maps to the canonical game Base ID', () => {
  assert.equal(BASE_ID_ALIASES.ASAJJVENTRESS, 'ASAJVENTRESS');
  assert.equal(canonicalJourneyBaseId('ASAJJVENTRESS'), 'ASAJVENTRESS');
});

test('GL Ahsoka keeps all 16 requirements and resolves Asajj at Relic 5', () => {
  canonicalizeJourneyPresets();
  const event = JOURNEY_PRESETS.find((row) => row.id === 'JOURNEY_GLAHSOKATANO');
  assert.ok(event);
  assert.equal(event.requirements.length, 16);
  const asajj = event.requirements.find((row) => row.baseId === 'ASAJVENTRESS');
  assert.ok(asajj, 'canonical Asajj requirement should remain present');
  assert.equal(asajj.type, 'RELIC');
  assert.equal(asajj.tier, 5);
  assert.equal(asajj.sourceBaseId, 'ASAJJVENTRESS');
});

test('catalog audit reports unresolved requirements instead of dropping them', () => {
  const presets = [{
    id: 'TEST_EVENT',
    name: 'Test Event',
    targetBaseId: 'TARGET',
    requirements: [
      { baseId: 'KNOWN', type: 'RELIC', tier: 5 },
      { baseId: 'MISSING', type: 'RELIC', tier: 7 },
    ],
  }];
  const audit = auditJourneyPresetsAgainstCatalog(presets, [
    { baseId: 'TARGET' },
    { baseId: 'KNOWN' },
  ]);
  assert.equal(audit.valid, false);
  assert.equal(audit.unresolvedCount, 1);
  assert.equal(audit.unresolved[0].baseId, 'MISSING');
  assert.equal(presets[0].requirements.length, 2, 'audit must not mutate/drop unresolved requirements');
});
