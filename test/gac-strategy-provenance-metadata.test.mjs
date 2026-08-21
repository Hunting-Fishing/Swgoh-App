import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildProvenanceIndex } from '../gac-strategy-provenance-index.mjs';
import { provenanceState } from '../public/gac-strategy-provenance-model.js';
import { strategyGuidance, validateRecord } from '../public/gac-strategy-record-model.js';
import {
  renderDatacronScope,
  renderPanel,
  renderValidity,
  renderV2Chip,
  scopeConstraintSummary,
  scopePresenceLabel,
  sourceMetaLine,
} from '../public/gac-war-room-provenance-inspector.js';

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('sanitized provenance index carries Datacron constraints but never execution instructions', async () => {
  const candidates = await readJson(new URL('../public/data/gac-strategy-source-candidates.json', import.meta.url));
  const index = buildProvenanceIndex(candidates);
  assert.equal(index.entries.length, candidates.candidates.length);
  for (const entry of index.entries) {
    assert.ok(entry.datacron);
    assert.ok(entry.datacron.attacker);
    assert.ok(entry.datacron.defender);
  }
  const text = JSON.stringify(index);
  for (const forbidden of ['"guidance"', '"opening"', '"targets"', '"mechanics"', '"avoid"']) {
    assert.equal(text.includes(forbidden), false, `sanitized index leaked ${forbidden}`);
  }
});

test('Mace provenance exposes source family and explicit unverified scope without inventing Datacron state', async () => {
  const index = await readJson(new URL('../public/data/gac-strategy-provenance-index.json', import.meta.url));
  const candidate = index.entries.find((entry) => entry.candidateId === 'research:jmmw-aayla-depa:traya-nihilus-savage:3v3:2026-01');
  assert.ok(candidate);

  const state = provenanceState({ candidate });
  assert.equal(state.status, 'locked');
  assert.equal(state.sourceType, 'tool');
  assert.equal(state.datacronScopeVerified, false);
  assert.equal(state.versionValidityVerified, false);
  assert.equal(state.datacronScope.attacker.presence, '');
  assert.equal(state.datacronScope.defender.presence, '');
  assert.deepEqual(state.datacronScope.attacker.setIds, []);
  assert.deepEqual(state.datacronScope.defender.mechanicIds, []);
  assert.equal(state.validity.gameDataVersion, '');
});

test('provenance rendering says NOT DECLARED and UNVERIFIED instead of coercing blank scope to any or none', async () => {
  const index = await readJson(new URL('../public/data/gac-strategy-provenance-index.json', import.meta.url));
  const candidate = index.entries.find((entry) => entry.candidateId === 'research:jmmw-aayla-depa:traya-nihilus-savage:3v3:2026-01');
  const state = provenanceState({ candidate });

  assert.equal(scopePresenceLabel(''), 'NOT DECLARED');
  assert.equal(scopePresenceLabel('any'), 'ANY');
  assert.equal(scopePresenceLabel('none'), 'CONFIRMED NONE');
  assert.equal(scopePresenceLabel('assigned'), 'ASSIGNED');
  assert.equal(scopeConstraintSummary({ presence: '', required: false, setIds: [], mechanicIds: [] }), 'NOT DECLARED');

  const dc = renderDatacronScope(state);
  const validity = renderValidity(state);
  const panel = renderPanel(state, false);
  const chip = renderV2Chip(state);

  assert.match(dc, /DATACRON SCOPE/);
  assert.match(dc, /UNVERIFIED/);
  assert.match(dc, /NOT DECLARED/);
  assert.match(dc, /not treated as “any” or “none”/i);
  assert.match(validity, /VALIDITY/);
  assert.match(validity, /WINDOW NOT DECLARED/);
  assert.match(validity, /GAME DATA/);
  assert.match(panel, /Source family tool/);
  assert.match(panel, /WHY EXECUTION IS LOCKED/);
  assert.match(chip, /Datacron unverified/);
  assert.match(chip, /Validity unverified/);
  assert.doesNotMatch(panel, /Open with|target order|kill order/i);
});

test('source metadata line carries family author and capture dates without execution content', () => {
  const line = sourceMetaLine({
    sourceType: 'video',
    sourceAuthor: 'Fixture Creator',
    sourceUpdatedAt: '2026-08-20T00:00:00Z',
    capturedAt: '2026-08-21T00:00:00Z',
  });
  assert.match(line, /Source family video/);
  assert.match(line, /author Fixture Creator/);
  assert.match(line, /updated Aug 20, 2026/);
  assert.match(line, /captured Aug 21, 2026/);
});

test('approved strategy guidance preserves provenance validity and Datacron metadata for unlocked audit state', () => {
  const result = validateRecord({
    schemaVersion: 1,
    id: 'strategy:fixture:metadata:3v3',
    status: 'active',
    format: '3v3',
    defender: { leaderBaseId: 'DEF1', members: ['DEF1', 'DEF2', 'DEF3'] },
    attacker: { leaderBaseId: 'ATT1', members: ['ATT1', 'ATT2'] },
    attackerDatacron: { presence: 'assigned', required: true, setIds: ['SET_30'], mechanicIds: ['MECH_ATT'] },
    defenderDatacron: { presence: 'none', required: false, setIds: [], mechanicIds: [] },
    guidance: { opening: [{ text: 'Reviewed fixture opener.' }], targets: [], mechanics: [], avoid: [] },
    provenance: {
      sourceName: 'Fixture Tactical Video',
      sourceRef: 'https://example.com/tactic',
      sourceType: 'video',
      author: 'Fixture Creator',
      sourcePublishedAt: '2026-08-10T00:00:00Z',
      sourceUpdatedAt: '2026-08-20T00:00:00Z',
      capturedAt: '2026-08-21T00:00:00Z',
    },
    validity: {
      validFrom: '2026-08-01T00:00:00Z',
      validUntil: '2026-09-01T00:00:00Z',
      gameDataVersion: 'fixture-gamedata-v2',
      notes: 'Fixture validity scope.',
    },
  });
  assert.equal(result.valid, true);

  const guidance = strategyGuidance(result.record);
  assert.equal(guidance.sourceType, 'video');
  assert.equal(guidance.sourceAuthor, 'Fixture Creator');
  assert.equal(guidance.validFrom, '2026-08-01T00:00:00.000Z');
  assert.equal(guidance.validUntil, '2026-09-01T00:00:00.000Z');
  assert.equal(guidance.gameDataVersion, 'fixture-gamedata-v2');
  assert.equal(guidance.attackerDatacron.presence, 'assigned');
  assert.deepEqual(guidance.attackerDatacron.setIds, ['SET_30']);
  assert.equal(guidance.defenderDatacron.presence, 'none');

  const state = provenanceState({ productionGuidance: guidance });
  assert.equal(state.status, 'unlocked');
  assert.equal(state.datacronScopeVerified, true);
  assert.equal(state.versionValidityVerified, true);
  assert.equal(state.datacronScope.attacker.presence, 'assigned');
  assert.deepEqual(state.datacronScope.attacker.mechanicIds, ['MECH_ATT']);
  assert.equal(state.validity.gameDataVersion, 'fixture-gamedata-v2');
});
