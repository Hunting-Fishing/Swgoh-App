import test from 'node:test';
import assert from 'node:assert/strict';
import {
  datacronEvidenceSignature,
  datacronMatchupSignature,
  normalizeDatacronEvidence,
} from '../public/gac-datacron-evidence-signature.js';

test('equivalent Datacron rolls share a signature even when instance IDs differ', () => {
  const left = {
    id: 'instance-a', setId: 'set-12', templateId: 'tpl-a', level: 9,
    affixes: [
      { tier: 9, abilityId: 'ABILITY_X', targetRule: 'RULE_A', requiredRelicTier: 7 },
      { tier: 3, statId: 'STAT_SPEED', statValue: 15 },
    ],
  };
  const right = {
    id: 'instance-b', set_id: 'set-12', template_id: 'tpl-a', level: 9,
    affixes: [
      { tier: 3, stat_id: 'STAT_SPEED', value: 15 },
      { tier: 9, ability_id: 'ABILITY_X', target_rule: 'RULE_A', required_relic_tier: 7 },
    ],
  };
  assert.equal(datacronEvidenceSignature(left, 'assigned'), datacronEvidenceSignature(right, 'assigned'));
});

test('different ability rolls produce different evidence signatures', () => {
  const base = { setId: 'set-12', level: 9, affixes: [{ tier: 9, abilityId: 'ABILITY_X' }] };
  const changed = { setId: 'set-12', level: 9, affixes: [{ tier: 9, abilityId: 'ABILITY_Y' }] };
  assert.notEqual(datacronEvidenceSignature(base, 'assigned'), datacronEvidenceSignature(changed, 'assigned'));
});

test('confirmed none and unknown are distinct evidence states', () => {
  assert.equal(datacronEvidenceSignature(null, 'none'), 'DC:NONE');
  assert.equal(datacronEvidenceSignature(null, 'unknown'), 'DC:UNKNOWN');
  assert.notEqual(datacronEvidenceSignature(null, 'none'), datacronEvidenceSignature(null, 'unknown'));
});

test('assigned without a usable Datacron object is downgraded to unknown', () => {
  assert.equal(normalizeDatacronEvidence(null, 'assigned').state, 'unknown');
});

test('matchup signatures preserve defender and attacker Datacron dimensions independently', () => {
  const defender = { setId: 'D', level: 9, affixes: [{ tier: 9, abilityId: 'DEF' }] };
  const attacker = { setId: 'A', level: 6, affixes: [{ tier: 6, abilityId: 'ATK' }] };
  const signature = datacronMatchupSignature({ defenderDatacron: defender, defenderState: 'assigned', attackerDatacron: attacker, attackerState: 'assigned' });
  assert.match(signature, /^DC:SET=D/);
  assert.match(signature, />>DC:SET=A/);
});
