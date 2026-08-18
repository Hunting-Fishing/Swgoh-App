import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGuildTbFarmingGuide,
  filterGuildTbFarmingRows,
  tbFarmTargetProgress,
} from '../public/guild-tb-farming-guide-model.js';

const memberA = { id:'player-a', allyCode:'111222333', name:'Alpha', galacticPower:10_000_000 };
const memberB = { id:'player-b', allyCode:'444555666', name:'Beta', galacticPower:9_000_000 };
const mission = (key, phase='P3') => ({ key, phase, planetName:'Test Planet', mission:{ name:`Mission ${key}` } });

const coverage = {
  summary:{ exactCoveragePercent:75, redundancyCoveragePercent:50 },
  farms:[
    {
      key:'player-a|AAYLA', member:memberA, baseId:'AAYLA', unitName:'Aayla Secura',
      unit:{ baseId:'AAYLA', name:'Aayla Secura', unitType:'Character', stars:7, gear:13, relic:2, power:20000 },
      mandatoryImpact:2, poolImpact:0, missionImpact:2, gapLabel:'+5 relic', maxGap:{missing:false,relic:5,gear:0,stars:0,power:0,score:50000}, minGap:{score:30000}, missionRefs:[mission('A'),mission('B')],
    },
    {
      key:'player-b|PLO', member:memberB, baseId:'PLO', unitName:'Plo Koon',
      unit:{ baseId:'PLO', name:'Plo Koon', unitType:'Character', stars:7, gear:13, relic:3, power:19000 },
      mandatoryImpact:0, poolImpact:1, missionImpact:1, gapLabel:'+2 relic', maxGap:{missing:false,relic:2,gear:0,stars:0,power:0,score:20000}, minGap:{score:20000}, missionRefs:[mission('C','P4')],
    },
    {
      key:'player-b|MISSING', member:memberB, baseId:'MISSING', unitName:'Missing Unit', unit:null,
      mandatoryImpact:1, poolImpact:0, missionImpact:1, gapLabel:'Acquire unit', maxGap:{missing:true,relic:5,gear:13,stars:7,power:0,score:1000000}, minGap:{score:1000000}, missionRefs:[mission('D','P5')],
    },
  ],
};

const presets = [
  { id:'J1', name:'Journey One', shortName:'J1', category:'Journey Guide', targetBaseId:'TARGET1', requirements:[{baseId:'AAYLA',type:'RELIC',tier:3}] },
  { id:'J2', name:'Journey Two', shortName:'J2', category:'Galactic Legends', targetBaseId:'TARGET2', requirements:[{baseId:'AAYLA',type:'RELIC',tier:8}] },
  { id:'J3', name:'Journey Three', shortName:'J3', category:'Galactic Legends', targetBaseId:'TARGET3', requirements:[{baseId:'PLO',type:'RELIC',tier:8}] },
  { id:'J4', name:'Journey Four', shortName:'J4', category:'Journey Guide', targetBaseId:'TARGET4', requirements:[{baseId:'PLO',type:'RELIC',tier:2}] },
  { id:'J5', name:'Journey Five', shortName:'J5', category:'Journey Guide', targetBaseId:'TARGET5', requirements:[{baseId:'MISSING',type:'RELIC',tier:5}] },
];

test('TB target progression treats owned gaps as deltas and missing-unit gaps as absolute requirements', () => {
  assert.equal(tbFarmTargetProgress(coverage.farms[0]).relic, 7);
  const missing = tbFarmTargetProgress(coverage.farms[2]);
  assert.equal(missing.relic, 5);
  assert.equal(missing.gear, 13);
  assert.equal(missing.stars, 7);
});

test('guide classifies direct, partial, multi-unlock and already-satisfied prerequisite semantics', () => {
  const guide = buildGuildTbFarmingGuide(coverage, presets);
  const aayla = guide.rows.find((row) => row.baseId === 'AAYLA');
  const plo = guide.rows.find((row) => row.baseId === 'PLO');
  const missing = guide.rows.find((row) => row.baseId === 'MISSING');

  assert.equal(aayla.directCount, 1);
  assert.equal(aayla.partialCount, 1);
  assert.equal(aayla.classification, 'multi-unlock');
  assert.deepEqual(aayla.journeyOverlaps.map((row) => [row.eventId,row.status]), [['J1','direct'],['J2','partial']]);

  assert.equal(plo.directCount, 0);
  assert.equal(plo.partialCount, 1);
  assert.equal(plo.alreadyCount, 1);
  assert.equal(plo.classification, 'partial');
  assert.equal(plo.activeJourneyOverlaps, 1, 'already-satisfied prerequisites are not counted as new double-use value');

  assert.equal(missing.directCount, 1);
  assert.equal(missing.classification, 'direct');
  assert.equal(guide.summary.rowsWithJourneyOverlap, 3);
  assert.equal(guide.summary.journeyTargets, 4);
});

test('member, phase and Journey-overlap filters preserve member-specific farm rows', () => {
  const guide = buildGuildTbFarmingGuide(coverage, presets);
  const memberRows = filterGuildTbFarmingRows(guide.rows,{member:'player-a'});
  assert.deepEqual(memberRows.map((row) => row.baseId),['AAYLA']);

  const phaseRows = filterGuildTbFarmingRows(guide.rows,{phase:'P4'});
  assert.deepEqual(phaseRows.map((row) => row.baseId),['PLO']);

  const multiRows = filterGuildTbFarmingRows(guide.rows,{overlap:'multi'});
  assert.deepEqual(multiRows.map((row) => row.baseId),['AAYLA']);

  const directRows = filterGuildTbFarmingRows(guide.rows,{overlap:'direct'});
  assert.deepEqual(new Set(directRows.map((row) => row.baseId)),new Set(['AAYLA','MISSING']));
});

test('Journey-overlap sort is explainable and separate from TB-impact sort', () => {
  const guide = buildGuildTbFarmingGuide(coverage, presets);
  const journey = filterGuildTbFarmingRows(guide.rows,{sort:'journey-overlap'});
  const tb = filterGuildTbFarmingRows(guide.rows,{sort:'tb-impact'});
  assert.equal(journey[0].baseId,'AAYLA');
  assert.equal(tb[0].baseId,'AAYLA');
  assert.equal(guide.rows.every((row) => row.compositeScore === undefined),true,'the model must not invent an opaque universal farm score');
});
