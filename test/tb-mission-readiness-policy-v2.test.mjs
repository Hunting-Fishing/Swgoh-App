import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTbMissionReadinessPolicyV2,
  TB_TACTICAL_READINESS_V2,
} from '../public/tb-mission-readiness-policy-v2.js';

const member = (baseId) => ({ name: baseId, baseId });
const unit = (baseId, overrides = {}) => ({
  baseId,
  name: baseId,
  unitType: 'Character',
  alignment: 'Light',
  stars: 7,
  level: 85,
  gear: 13,
  relic: 5,
  speed: 310,
  abilities: [],
  ...overrides,
});

function fixture(overrides = {}) {
  const members = ['U1', 'U2', 'U3', 'U4', 'U5'].map(member);
  const mission = {
    id: 'mission-policy',
    missionType: 'combat',
    entry: {
      verified: true,
      unitType: 'Character',
      allowedAlignments: ['Light', 'Dark'],
      starsMin: 7,
      relicMin: 5,
      squadSize: 5,
      mandatoryMembers: members,
      requiredBaseIds: [],
      allowedBaseIds: [],
      requiredCategories: [],
      categoryMode: 'all',
    },
  };
  const recommendation = {
    id: 'team-policy',
    members,
    minimum: {},
    saferTarget: {},
    abilities: [],
    zetas: [],
    omicrons: [],
    modTargets: [],
    ...overrides.recommendation,
  };
  const body = {
    units: ['U1', 'U2', 'U3', 'U4', 'U5'].map((baseId) => unit(baseId)),
    ...overrides.body,
  };
  return { mission, recommendation, body };
}

test('official entry can remain ready while Level 85 is separately flagged as a tactical progression gap', () => {
  const { mission, recommendation, body } = fixture();
  body.units[0] = unit('U1', { level: 84 });

  const result = evaluateTbMissionReadinessPolicyV2(body, mission, recommendation, {});

  assert.equal(result.officialEntryReady, true);
  assert.equal(result.verdict, TB_TACTICAL_READINESS_V2.NEEDS_LEVEL);
  assert.equal(result.progressionFailures.some((row) => row.baseId === 'U1' && row.key === 'level'), true);
});

test('a safer/minimum relic target above the official mission gate is a tactical gear/relic gap, not ENTRY BLOCKED', () => {
  const { mission, recommendation, body } = fixture({ recommendation: { minimum: { relic: 7 } } });

  const result = evaluateTbMissionReadinessPolicyV2(body, mission, recommendation, {});

  assert.equal(result.entry.ready, true);
  assert.equal(result.verdict, TB_TACTICAL_READINESS_V2.NEEDS_GEAR_RELICS);
  assert.equal(result.progressionFailures.filter((row) => row.key === 'relic').length, 5);
});

test('an actual official mission-entry failure remains BLOCKED ENTRY', () => {
  const { mission, recommendation } = fixture();
  const body = { units: ['U2', 'U3', 'U4', 'U5', 'U6'].map((baseId) => unit(baseId)) };

  const result = evaluateTbMissionReadinessPolicyV2(body, mission, recommendation, {});

  assert.equal(result.officialEntryReady, false);
  assert.equal(result.verdict, TB_TACTICAL_READINESS_V2.BLOCKED_ENTRY);
});
