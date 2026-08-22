import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateEvidence,
  groupKey,
  teamSignature,
} from '../gac-datacron-counter-evidence-service.mjs';

const base = {
  format: '5v5',
  enemy_leader_base_id: 'ENEMY_LEAD',
  enemy_members: ['ENEMY_LEAD', 'E2', 'E3', 'E4', 'E5'],
  defender_datacron_state: 'assigned',
  defender_datacron_signature: 'DC:SET=10|TPL=A|L=9|AFF=3:DEF:::;6:FOO::7:',
  defender_datacron: { setId: '10', templateId: 'A', level: 9 },
  counter_leader_base_id: 'COUNTER_LEAD',
  counter_members: ['COUNTER_LEAD', 'C2', 'C3', 'C4', 'C5'],
  attacker_datacron_state: 'assigned',
  attacker_datacron_signature: 'DC:SET=11|TPL=B|L=9|AFF=3:OFF:::;6:BAR::7:',
  attacker_datacron: { setId: '11', templateId: 'B', level: 9 },
  source: 'verified-owner-war-room',
};

test('team signatures retain leader identity and normalize duplicate members', () => {
  assert.equal(teamSignature('LEAD', ['B', 'LEAD', 'A', 'A']), 'LEAD|B,LEAD,A');
  assert.notEqual(teamSignature('OTHER', ['B', 'LEAD', 'A']), teamSignature('LEAD', ['B', 'LEAD', 'A']));
});

test('Datacron evidence aggregates equivalent exact matchup signatures', () => {
  const rows = aggregateEvidence([
    { ...base, battle_key: '1', battle_outcome: 'win', banners: 55, season_id: 'S1', observed_at: '2026-08-20T00:00:00Z' },
    { ...base, battle_key: '2', battle_outcome: 'loss', banners: 40, season_id: 'S1', observed_at: '2026-08-21T00:00:00Z' },
    { ...base, battle_key: '3', battle_outcome: 'win', banners: 53, season_id: 'S2', observed_at: '2026-08-22T00:00:00Z' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].battles, 3);
  assert.equal(rows[0].wins, 2);
  assert.equal(rows[0].losses, 1);
  assert.equal(rows[0].winRate, 2 / 3);
  assert.equal(rows[0].averageBanners, (55 + 40 + 53) / 3);
  assert.equal(rows[0].seasons, 2);
  assert.equal(rows[0].lastObservedAt, '2026-08-22T00:00:00Z');
});

test('confirmed NONE and UNKNOWN defender Datacron states remain different evidence groups', () => {
  const none = { ...base, battle_key: 'none', defender_datacron_state: 'none', defender_datacron_signature: 'DC:NONE', defender_datacron: null, battle_outcome: 'win' };
  const unknown = { ...base, battle_key: 'unknown', defender_datacron_state: 'unknown', defender_datacron_signature: 'DC:UNKNOWN', defender_datacron: null, battle_outcome: 'win' };
  const rows = aggregateEvidence([none, unknown]);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((row) => row.defenderDatacronSignature)), new Set(['DC:NONE', 'DC:UNKNOWN']));
});

test('different attacker Datacron signatures remain separate evidence groups', () => {
  const rows = aggregateEvidence([
    { ...base, battle_key: '1', battle_outcome: 'win' },
    { ...base, battle_key: '2', attacker_datacron_signature: 'DC:NONE', attacker_datacron_state: 'none', attacker_datacron: null, battle_outcome: 'loss' },
  ]);
  assert.equal(rows.length, 2);
});

test('group key includes both team signatures and both Datacron signatures', () => {
  const key = groupKey(base);
  assert.match(key, /ENEMY_LEAD/);
  assert.match(key, /COUNTER_LEAD/);
  assert.match(key, /DC:SET=10/);
  assert.match(key, /DC:SET=11/);
});
