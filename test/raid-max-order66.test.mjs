import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrder66RaidMax, ORDER66_DIFFICULTIES } from '../public/raid-max-order66.js';

function unit(name, baseId, { stars = 7, gear = 13, relic = 9, power = 40000, tags = [] } = {}) {
  return { name, baseId, stars, gear, relic, power, tags };
}

const roster = {
  fetchedAt: '2026-08-18T15:00:00Z',
  player: { allyCode: '732764286', name: 'Warm Bacon', galacticPower: 12000000 },
  units: [
    unit('Grand Moff Tarkin','TARKIN'), unit('RC-1262 “Scorch”','SCORCH'),
    unit('Jedi Master Mace Windu','MACE_NEW'), unit('Depa Bilaba','DEPA'), unit('Jedi Temple Guard','JTG'),
    unit('CX-2','CX2'), unit('Disguised Clone Trooper','DCT'), unit('CC-1119 “Appo”','APPO'),
    unit('Kelleran Beq','KELLERAN'), unit('Jocasta Nu','JOCASTA'), unit('Plo Koon','PLO'), unit('Barriss Offee','BARRISS'),
    unit('Omega (Fugitive)','OMEGA_FUGITIVE'), unit('Batcher','BATCHER'), unit('Hunter (Mercenary)','HUNTER_MERC'), unit('Wrecker (Mercenary)','WRECKER_MERC'), unit('Crosshair (Scarred)','CROSSHAIR_SCARRED'),
  ],
};

test('difficulty table preserves current Order 66 entry bands and maximum score ceilings', () => {
  assert.deepEqual(ORDER66_DIFFICULTIES.map((row) => [row.requirement,row.maxScore]), [
    ['5★',300000],['G12',450000],['R1',600000],['R3',900000],['R5',1200000],['R7',1800000],['R8',2700000],['R9',3600000],
  ]);
});

test('Raid Max builds up to five non-overlapping validated routes and prefers stronger route use over conflicting solo use', () => {
  const result = buildOrder66RaidMax(roster, { maxAttempts: 5 });
  assert.equal(result.action, 'raid-max');
  assert.equal(result.raid.attemptsAllowed, 5);
  assert.equal(result.summary.validatedRoutes, 5);
  assert.equal(result.summary.fallbackRoutes, 0);
  assert.equal(result.summary.recommendedMaxScoreCeiling, 16_200_000);
  assert.equal(result.summary.scoreSemantics, 'difficulty-ceiling-not-damage-prediction');
  assert.deepEqual(result.attempts.map((row) => row.name), [
    'Tarkin + Scorch','Mace + Depa + Jedi Temple Guard','CX-2 + DCT + Appo','Kelleran + Jocasta + Plo + Barriss','Bad Batch Mercenary',
  ]);
  const used = result.attempts.flatMap((attempt) => attempt.units.map((row) => row.baseId));
  assert.equal(new Set(used).size, used.length, 'a unit cannot be reused across attempts');
  assert.equal(result.attempts.some((row) => row.name === 'Tarkin Solo'), false, 'Tarkin solo must not compete with the stronger Tarkin+Scorch route when attempt slots are full');
});

test('route difficulty is capped by both roster progression and documented route ceiling', () => {
  const lower = {
    player: roster.player,
    units: [unit('Grand Moff Tarkin','TARKIN',{relic:9}), unit('RC-1262 “Scorch”','SCORCH',{relic:7})],
  };
  const result = buildOrder66RaidMax(lower, { maxAttempts: 1 });
  assert.equal(result.attempts[0].name, 'Tarkin + Scorch');
  assert.equal(result.attempts[0].difficulty.requirement, 'R7');
  assert.equal(result.attempts[0].maxScoreCeiling, 1_800_000);

  const full = buildOrder66RaidMax(roster, { maxAttempts: 5 });
  const kelleran = full.attempts.find((row) => row.id === 'kelleran-jocasta-core');
  assert.equal(kelleran.difficulty.requirement, 'R8', 'this encoded route is intentionally capped at its documented route ceiling even with an R9 roster');
});

test('sub-5-star eligible characters do not qualify for the base raid tier', () => {
  const result = buildOrder66RaidMax({ player: { allyCode:'732764286', name:'Test' }, units: [unit('Hondo Ohnaka','HONDO',{stars:4,gear:11,relic:0,tags:['Pirate']})] });
  assert.equal(result.summary.eligibleOwned, 0);
  assert.equal(result.summary.attemptsBuilt, 0);
  assert.equal(result.summary.recommendedMaxScoreCeiling, 0);
});

test('unvalidated roster-only fallbacks are clearly separated from the validated recommended score ceiling', () => {
  const result = buildOrder66RaidMax({
    player: { allyCode:'732764286', name:'Fallback' },
    units: [
      unit('Aayla Secura','AAYLA',{relic:7}), unit('Eeth Koth','EETH',{relic:7}), unit('Ima-Gun Di','IMAGUNDI',{relic:7}), unit('Kit Fisto','KIT',{relic:7}), unit('Luminara Unduli','LUMI',{relic:7}),
    ],
  }, { maxAttempts: 1 });
  assert.equal(result.summary.validatedRoutes, 0);
  assert.equal(result.summary.fallbackRoutes, 1);
  assert.equal(result.summary.recommendedMaxScoreCeiling, 0);
  assert.equal(result.attempts[0].source, 'roster-only-fallback');
  assert.match(result.attempts[0].note, /not validated/i);
});
