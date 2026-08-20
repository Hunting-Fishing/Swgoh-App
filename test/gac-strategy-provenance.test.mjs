import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findExactProvenance, provenanceState } from '../public/gac-strategy-provenance-model.js';

const candidates = JSON.parse(fs.readFileSync(new URL('../public/data/gac-strategy-source-candidates.json', import.meta.url), 'utf8'));
const index = JSON.parse(fs.readFileSync(new URL('../public/data/gac-strategy-provenance-index.json', import.meta.url), 'utf8'));
const production = JSON.parse(fs.readFileSync(new URL('../public/data/gac-strategy-records.json', import.meta.url), 'utf8'));
const inspector = fs.readFileSync(new URL('../public/gac-war-room-provenance-inspector.js', import.meta.url), 'utf8');
const v3 = fs.readFileSync(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');

test('B03 source pack contains multiple exact 3v3 research records and stays quarantined', () => {
  assert.equal(candidates.schemaVersion, 1);
  assert.ok(candidates.candidates.length >= 3);
  assert.ok(candidates.candidates.every((row) => row.proposedRecord?.format === '3v3'));
  assert.ok(candidates.candidates.every((row) => row.review?.status === 'quarantined'));
  assert.ok(candidates.candidates.every((row) => Array.isArray(row.research?.validationRefs) && row.research.validationRefs.length >= 1));
  assert.equal(production.records.length, 0, 'B03 research must not silently promote tactics into runtime');
});

test('runtime provenance index is sanitized and contains no quarantined execution guidance', () => {
  const text = JSON.stringify(index);
  for (const forbidden of ['"guidance"', '"opening"', '"targets"', '"mechanics"', '"avoid"']) {
    assert.doesNotMatch(text, new RegExp(forbidden));
  }
  assert.ok(index.entries.length >= 3);
  assert.ok(index.entries.every((row) => row.review?.promotionReady === false));
});

test('exact composition selects the Baylan/JML quarantine record and changed membership does not', () => {
  const exact = findExactProvenance(index.entries, {
    format: '3v3',
    defenderMembers: ['MARROK','BAYLANSKOLL','SHINHATI'],
    attackerMembers: ['HERMITYODA','GRANDMASTERLUKE','JEDIKNIGHTLUKE'],
  });
  assert.equal(exact?.candidateId, 'research:baylan-shin-marrok:jml-jkl-hyoda:3v3:2026-01');
  const wrong = findExactProvenance(index.entries, {
    format: '3v3',
    defenderMembers: ['MARROK','BAYLANSKOLL','SHINHATI'],
    attackerMembers: ['HERMITYODA','GRANDMASTERLUKE','GRANDMASTERYODA'],
  });
  assert.equal(wrong, null);
});

test('quarantined provenance explains blockers but does not unlock execution', () => {
  const candidate = findExactProvenance(index.entries, {
    format: '3v3',
    defenderMembers: ['BAYLANSKOLL','SHINHATI','MARROK'],
    attackerMembers: ['GRANDMASTERLUKE','JEDIKNIGHTLUKE','HERMITYODA'],
  });
  const state = provenanceState({ candidate });
  assert.equal(state.status, 'locked');
  assert.match(state.label, /EXECUTION LOCKED/);
  assert.ok(state.blockers.some((row) => /Datacron scope/i.test(row)));
  assert.ok(state.blockers.some((row) => /Current-version validity/i.test(row)));
});

test('B05 inspector reads only sanitized provenance metadata and saved-board truth', () => {
  assert.match(v3, /import '\.\/gac-war-room-provenance-inspector\.js'/);
  assert.match(inspector, /gac-strategy-provenance\.js/);
  assert.match(inspector, /\/api\/gac\/current-board\/\$\{current\.mine\}\/defense/);
  assert.match(inspector, /recommendedAttackerMembers/);
  assert.doesNotMatch(inspector, /gac-strategy-source-candidates\.json/);
  assert.match(inspector, /Unapproved opening moves, target order, and tactical instructions are not loaded into runtime/);
});
