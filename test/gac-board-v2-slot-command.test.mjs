import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardRule } from '../public/gac-league-board-rules.js';
import {
  boardTerritories,
  defaultRevealState,
  normalizeRevealState,
  proposedAttackOrder,
  rosterAvailability,
  territoryModel,
  validFleetDraft,
} from '../public/gac-board-v2-model.js';

const boardV2 = fs.readFileSync(new URL('../public/gac-board-v2-slot-command.js', import.meta.url), 'utf8');
const boardCss = fs.readFileSync(new URL('../public/gac-board-v2-slot-command.css', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../public/gac-manual-board-workspace.js', import.meta.url), 'utf8');
const v3 = fs.readFileSync(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');

test('front territories are visible by default and both rear territories fail closed', () => {
  assert.deepEqual(defaultRevealState(), {
    'FRONT-TOP': true,
    'FRONT-BOTTOM': true,
    'BACK-TOP': false,
    'BACK-BOTTOM': false,
  });
  assert.deepEqual(normalizeRevealState({'BACK-BOTTOM':true}), {
    'FRONT-TOP': true,
    'FRONT-BOTTOM': true,
    'BACK-TOP': false,
    'BACK-BOTTOM': true,
  });
});

test('Kyber 5v5 creates exact front/back squad slots and a 3-slot fleet territory', () => {
  const rule = boardRule('Kyber','5v5');
  const territories = boardTerritories(rule, [
    {zone:'FRONT-TOP',slot:0,members:['A','B','C','D','E']},
    {zone:'FRONT-BOTTOM',slot:3,members:['F','G','H','I','J']},
  ], [], defaultRevealState());
  const frontTop = territories.find((row)=>row.value==='FRONT-TOP');
  const frontBottom = territories.find((row)=>row.value==='FRONT-BOTTOM');
  const backBottom = territories.find((row)=>row.value==='BACK-BOTTOM');
  const fleet = territories.find((row)=>row.value==='BACK-TOP');
  assert.equal(frontTop.slots.length,4);
  assert.equal(frontTop.slots[0].occupied,true);
  assert.equal(frontTop.slots[1].occupied,false);
  assert.equal(frontBottom.slots.length,4);
  assert.equal(frontBottom.slots[3].occupied,true);
  assert.equal(backBottom.slots.length,3);
  assert.equal(backBottom.revealed,false);
  assert.equal(fleet.kind,'fleet');
  assert.equal(fleet.slots.length,3);
  assert.equal(fleet.revealed,false);
});

test('rear territory can be revealed explicitly without inventing defenses', () => {
  const rule = boardRule('Chromium','3v3');
  const territory = territoryModel(rule,'BACK-BOTTOM',[],{'BACK-BOTTOM':true});
  assert.equal(territory.revealed,true);
  assert.equal(territory.capacity,4);
  assert.equal(territory.entered,0);
  assert.equal(territory.complete,false);
  assert.ok(territory.slots.every((slot)=>slot.defense===null && slot.occupied===false));
});

test('fleet draft requires Back Top, a capital ship and exactly three visible starters', () => {
  const incomplete = validFleetDraft({
    zone:'BACK-TOP', slot:0, capitalShipBaseId:'CAPITALEXECUTOR', starters:['HOUNDSTOOTH','XANADUBLOOD'], reinforcements:[],
  });
  assert.equal(incomplete.complete,false);
  const valid = validFleetDraft({
    zone:'BACK-TOP', slot:0, capitalShipBaseId:'CAPITALEXECUTOR', starters:['HOUNDSTOOTH','XANADUBLOOD','RAZORCREST'], reinforcements:['SLAVE1','IG2000'],
  });
  assert.equal(valid.complete,true);
  assert.equal(valid.capitalShipBaseId,'CAPITALEXECUTOR');
  assert.deepEqual(valid.starters,['HOUNDSTOOTH','XANADUBLOOD','RAZORCREST']);
  assert.deepEqual(valid.reinforcements,['SLAVE1','IG2000']);
  const wrongZone = validFleetDraft({
    zone:'FRONT-TOP', slot:0, capitalShipBaseId:'CAPITALEXECUTOR', starters:['HOUNDSTOOTH','XANADUBLOOD','RAZORCREST'],
  });
  assert.equal(wrongZone.complete,false);
});

test('roster availability distinguishes allocated attack units, own-defense reserves and free roster', () => {
  const roster = { units: [
    {baseId:'ATTACK_A',name:'Attack A',unitType:'Character',power:30000},
    {baseId:'ATTACK_B',name:'Attack B',unitType:'Character',power:29000},
    {baseId:'DEFENSE_A',name:'Defense A',unitType:'Character',power:28000},
    {baseId:'FREE_A',name:'Free A',unitType:'Character',power:27000},
    {baseId:'SHIP_A',name:'Ship A',unitType:'Ship',power:60000},
  ]};
  const plan = { assignments:[{recommendation:{squad:[{baseId:'ATTACK_A'},{baseId:'ATTACK_B'}]}}] };
  const model = rosterAvailability(roster,plan,['DEFENSE_A']);
  assert.equal(model.counts.allocated,2);
  assert.equal(model.counts.reserved,1);
  assert.equal(model.counts.available,1);
  assert.equal(model.rows.find((row)=>row.baseId==='ATTACK_A').status,'allocated');
  assert.equal(model.rows.find((row)=>row.baseId==='DEFENSE_A').status,'reserved');
  assert.equal(model.rows.find((row)=>row.baseId==='FREE_A').status,'available');
  assert.equal(model.rows.some((row)=>row.baseId==='SHIP_A'),false);
});

test('suggested attack order excludes hidden rear defenses until the user reveals them', () => {
  const defenses = [
    {zone:'FRONT-TOP',slot:0,leaderBaseId:'FRONT_A',members:['FRONT_A','A2','A3']},
    {zone:'BACK-BOTTOM',slot:0,leaderBaseId:'BACK_A',members:['BACK_A','B2','B3']},
  ];
  const plan = { assignments:[
    {sourceIndex:0,source:'roster-fit-heuristic',alternativesRemaining:2,recommendation:{squad:[{baseId:'C1'},{baseId:'C2'},{baseId:'C3'}]},allocationReason:'front allocation'},
    {sourceIndex:1,source:'historical-counter-evidence',alternativesRemaining:1,recommendation:{squad:[{baseId:'D1'},{baseId:'D2'},{baseId:'D3'}]},allocationReason:'back evidence'},
  ]};
  const hidden = proposedAttackOrder(defenses,plan,defaultRevealState());
  assert.equal(hidden.length,1);
  assert.equal(hidden[0].zone,'FRONT-TOP');
  const revealed = proposedAttackOrder(defenses,plan,{'BACK-BOTTOM':true});
  assert.equal(revealed.length,2);
  assert.equal(revealed[0].zone,'FRONT-TOP');
  assert.equal(revealed[1].zone,'BACK-BOTTOM');
});

test('Enemy Board v2 UI exposes exact slot entry, rear reveal, fleet identity gate and roster status', () => {
  assert.match(v3,/import '\.\/gac-board-v2-slot-command\.js'/);
  assert.match(boardV2,/data-gac-board-v2-squad-slot/);
  assert.match(boardV2,/Mark Revealed From Game/);
  assert.match(boardV2,/data-gac-board-v2-fleet-slot/);
  assert.match(boardV2,/Capital \+ 3 starters/);
  assert.match(boardV2,/FLEET COUNTER INTELLIGENCE/);
  assert.match(boardV2,/source-gated until B12\/B13 fleet evidence is loaded/);
  assert.match(boardV2,/ATTACK ROSTER STATUS/);
  assert.match(boardV2,/DEFENSE RESERVED/);
  assert.match(boardV2,/SUGGESTED EXECUTION ORDER/);
  assert.match(boardCss,/grid-template-areas:'backtop fronttop' 'backbottom frontbottom'/);
});

test('legacy Back Top squad observations are surfaced for correction but excluded from squad allocation', () => {
  assert.match(workspace,/legacyFleetZoneSquads/);
  assert.match(workspace,/clean\(row\.zone\)\.toUpperCase\(\) !== 'BACK-TOP'/);
  assert.match(boardV2,/LEGACY BOARD POSITION NEEDS REVIEW/);
  assert.match(boardV2,/Back Top is the Fleet Territory/);
});