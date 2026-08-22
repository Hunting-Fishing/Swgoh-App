import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTbMissionReadinessV2,
  omicronActiveForTbMission,
  TB_READINESS_EVIDENCE,
  TB_TACTICAL_READINESS,
} from '../public/tb-mission-readiness-v2.js';

const member = (baseId) => ({ name: baseId, baseId });

function unit(baseId, overrides = {}) {
  return {
    baseId,
    name: baseId,
    unitType: 'Character',
    alignment: 'Light',
    stars: 7,
    level: 85,
    gear: 13,
    relic: 5,
    power: 30000,
    speed: 310,
    abilities: [],
    ...overrides,
  };
}

function exactMission(overrides = {}) {
  const mandatoryMembers = ['U1', 'U2', 'U3', 'U4', 'U5'].map(member);
  return {
    id: 'mission-test',
    missionType: 'combat',
    entry: {
      verified: true,
      unitType: 'Character',
      allowedAlignments: ['Light', 'Dark'],
      starsMin: 7,
      relicMin: 5,
      squadSize: 5,
      mandatoryMembers,
      requiredBaseIds: [],
      allowedBaseIds: [],
      requiredCategories: [],
      categoryMode: 'all',
      ...overrides.entry,
    },
    recommendations: [],
    ...overrides,
  };
}

function recommendation(overrides = {}) {
  return {
    id: 'team-test',
    name: 'Test Team',
    members: ['U1', 'U2', 'U3', 'U4', 'U5'].map(member),
    minimum: {},
    saferTarget: {},
    abilities: [],
    zetas: [],
    omicrons: [],
    modTargets: [],
    ...overrides,
  };
}

function readyBody(overrides = {}) {
  const units = ['U1', 'U2', 'U3', 'U4', 'U5'].map((baseId) => unit(baseId));
  return { units, ...overrides };
}

function catalogWithAbility(baseId, ability) {
  return { units: [{ baseId, abilities: [ability] }] };
}

test('keeps official entry readiness separate while exposing character level as its own evidence track', () => {
  const mission = exactMission();
  const team = recommendation();
  const body = readyBody();
  body.units[0] = unit('U1', { level: 84 });

  const result = evaluateTbMissionReadinessV2(body, mission, team, {});

  assert.equal(result.entry.ready, true, 'legacy official entry legality does not use the new battle-prep Level track');
  const u1 = result.progression.find((row) => row.baseId === 'U1');
  assert.equal(u1.level.state, TB_READINESS_EVIDENCE.FAIL);
  assert.equal(u1.level.current, 84);
  assert.equal(u1.level.target, 85);
});

test('a sourced required Zeta is a battle-readiness blocker when the exact ability is known but not installed', () => {
  const mission = exactMission();
  const team = recommendation({ zetas: [{ baseId: 'U1', abilityId: 'unique01', required: true }] });
  const body = readyBody();
  body.units[0] = unit('U1', { abilities: [{ id: 'unique01', displayTier: 7 }] });
  const catalog = catalogWithAbility('U1', {
    id: 'unique01',
    name: 'Critical Unique',
    upgradeTiers: [{ tier: 8, zeta: true }],
  });

  const result = evaluateTbMissionReadinessV2(body, mission, team, catalog);

  assert.equal(result.entry.ready, true);
  assert.equal(result.zetas[0].state, TB_READINESS_EVIDENCE.FAIL);
  assert.equal(result.verdict, TB_TACTICAL_READINESS.NEEDS_ZETA);
});

test('required TB Omicron checks mission activation mode instead of treating every installed Omicron as relevant', () => {
  assert.equal(omicronActiveForTbMission(5, 'combat'), true);
  assert.equal(omicronActiveForTbMission(5, 'special'), false);
  assert.equal(omicronActiveForTbMission(6, 'special'), true);
  assert.equal(omicronActiveForTbMission(7, 'combat'), true);

  const mission = exactMission({ missionType: 'combat' });
  const team = recommendation({ omicrons: [{ baseId: 'U1', abilityId: 'uniqueOmi', required: true }] });
  const body = readyBody();
  body.units[0] = unit('U1', { abilities: [{ id: 'uniqueOmi', displayTier: 8 }] });
  const catalog = catalogWithAbility('U1', {
    id: 'uniqueOmi',
    name: 'Territory Battle Unique',
    omicron: true,
    omicronMode: 5,
    upgradeTiers: [{ tier: 9, omicron: true }],
  });

  const result = evaluateTbMissionReadinessV2(body, mission, team, catalog);

  assert.equal(result.omicrons[0].activeHere, true);
  assert.equal(result.omicrons[0].state, TB_READINESS_EVIDENCE.FAIL);
  assert.equal(result.verdict, TB_TACTICAL_READINESS.NEEDS_TB_OMICRON);
});

test('an Omicron that is not active for this mission type is NOT_APPLICABLE and cannot create a false blocker', () => {
  const mission = exactMission({ missionType: 'special' });
  const team = recommendation({ omicrons: [{ baseId: 'U1', abilityId: 'combatOmi', required: true }] });
  const body = readyBody();
  body.units[0] = unit('U1', { abilities: [{ id: 'combatOmi', displayTier: 9 }] });
  const catalog = catalogWithAbility('U1', {
    id: 'combatOmi',
    name: 'Combat Only Omicron',
    omicron: true,
    omicronMode: 5,
    upgradeTiers: [{ tier: 9, omicron: true }],
  });

  const result = evaluateTbMissionReadinessV2(body, mission, team, catalog);

  assert.equal(result.omicrons[0].state, TB_READINESS_EVIDENCE.NOT_APPLICABLE);
  assert.equal(result.omicrons[0].activeHere, false);
  assert.notEqual(result.verdict, TB_TACTICAL_READINESS.NEEDS_TB_OMICRON);
});

test('missing sourced mod/stat evidence remains UNKNOWN instead of becoming a fake zero or failure', () => {
  const mission = exactMission();
  const team = recommendation({ modTargets: [{ baseId: 'U1', stat: 'health', min: 100000, required: true }] });
  const body = readyBody();

  const result = evaluateTbMissionReadinessV2(body, mission, team, {});

  assert.equal(result.stats[0].state, TB_READINESS_EVIDENCE.UNKNOWN);
  assert.match(result.stats[0].reason, /health evidence unavailable/i);
  assert.equal(result.verdict, TB_TACTICAL_READINESS.ENTRY_READY_BATTLE_UNKNOWN);
});

test('team-wide sourced minimum Speed creates a NEEDS MODS verdict when one listed member is below target', () => {
  const mission = exactMission();
  const team = recommendation({ minimum: { speed: 300 } });
  const body = readyBody();
  body.units[0] = unit('U1', { speed: 275 });

  const result = evaluateTbMissionReadinessV2(body, mission, team, {});

  const u1Speed = result.stats.find((row) => row.baseId === 'U1' && row.stat === 'speed');
  assert.equal(u1Speed.state, TB_READINESS_EVIDENCE.FAIL);
  assert.equal(u1Speed.gap, 25);
  assert.equal(result.verdict, TB_TACTICAL_READINESS.NEEDS_MODS);
});

test('missing a recommended character is a team-composition gap when the mission itself still has five legal entrants', () => {
  const mission = {
    ...exactMission(),
    entry: {
      ...exactMission().entry,
      mandatoryMembers: [],
    },
  };
  const team = recommendation({ members: ['U1', 'U2', 'U3', 'U4', 'U6'].map(member) });
  const body = readyBody();

  const result = evaluateTbMissionReadinessV2(body, mission, team, {});

  assert.equal(result.entry.ready, true);
  assert.equal(result.team.complete, false);
  assert.equal(result.verdict, TB_TACTICAL_READINESS.NEEDS_TEAM);
});

test('missing an official mandatory mission unit remains an ENTRY blocker', () => {
  const mission = exactMission();
  const team = recommendation();
  const body = readyBody({ units: ['U2', 'U3', 'U4', 'U5', 'U6'].map((baseId) => unit(baseId)) });

  const result = evaluateTbMissionReadinessV2(body, mission, team, {});

  assert.equal(result.entry.ready, false);
  assert.equal(result.mandatory.complete, false);
  assert.equal(result.verdict, TB_TACTICAL_READINESS.BLOCKED_ENTRY);
});
