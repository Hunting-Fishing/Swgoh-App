import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardRule, LEAGUES } from '../public/gac-league-board-rules.js';
import { mergeRows, storageKey } from '../public/gac-manual-board-context-bridge.js';

const workspace = fs.readFileSync(new URL('../public/gac-manual-board-workspace.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/gac-manual-board-workspace.css', import.meta.url), 'utf8');
const v3 = fs.readFileSync(new URL('../public/gac-war-room-v3.js', import.meta.url), 'utf8');

const expected = {
  Kyber: { '5v5':[11,3], '3v3':[15,3] },
  Aurodium: { '5v5':[9,2], '3v3':[13,2] },
  Chromium: { '5v5':[7,2], '3v3':[10,2] },
  Bronzium: { '5v5':[5,1], '3v3':[7,1] },
  Carbonite: { '5v5':[3,1], '3v3':[3,1] },
};

test('league-aware board rules expose current maximum squad and fleet defense counts', () => {
  assert.deepEqual(LEAGUES, ['Kyber','Aurodium','Chromium','Bronzium','Carbonite']);
  for (const [league, formats] of Object.entries(expected)) {
    for (const [format, [squads, fleets]] of Object.entries(formats)) {
      const rule = boardRule(league, format);
      assert.equal(rule.squadTeams, squads, `${league} ${format} squads`);
      assert.equal(rule.fleetTeams, fleets, `${league} ${format} fleets`);
      assert.equal(rule.totalDefenses, squads + fleets);
    }
  }
});

test('manual board is the primary v3 Board and Counters workflow with quick sandbox preserved', () => {
  assert.match(v3, /import '\.\/gac-manual-board-workspace\.js'/);
  assert.match(workspace, /data-gac-board-workspace/);
  assert.match(workspace, /MANUAL CURRENT-BOARD INPUT/);
  assert.match(workspace, /Enter the opponent lineup you actually see/);
  assert.match(workspace, /data-gac-board-quick-sandbox/);
  assert.match(workspace, /Quick single-squad sandbox/);
  assert.match(styles, /\.gac-visible-zones/);
});

test('manual board can use public opponent roster or static unit catalog fallback', () => {
  assert.match(workspace, /\/api\/player\/\$\{code\}/);
  assert.match(workspace, /\/data\/catalog\.json\?manual-gac-board=1/);
  assert.match(workspace, /STATIC CATALOG FALLBACK/);
  assert.match(workspace, /IDENTITY-ONLY HEURISTIC/);
  assert.match(workspace, /opponent stat deltas stay unknown/);
});

test('visible defenses feed evidence-first non-overlapping whole-board allocation', () => {
  assert.match(workspace, /hybridBoardPlan/);
  assert.match(workspace, /\/api\/gac\/counters\/batch\?format=/);
  assert.match(workspace, /ownDefenseReserve/);
  assert.match(workspace, /HISTORICAL EVIDENCE/);
  assert.match(workspace, /ROSTER-FIT HEURISTIC/);
});

test('manual lineup can persist canonically or remain a local draft', () => {
  assert.match(workspace, /\/api\/gac\/current-board\/\$\{owner\}\/defense/);
  assert.match(workspace, /user-entered-manual-board/);
  assert.match(workspace, /localStorage\.setItem/);
  assert.match(workspace, /Confirm Opponent \+ Sync/);
  assert.match(workspace, /\/api\/gac\/current-opponent\/\$\{owner\}\/confirm/);
});

test('four existing board zones remain the explicit placement model', () => {
  for (const zone of ['FRONT-TOP','FRONT-BOTTOM','BACK-TOP','BACK-BOTTOM']) {
    const source = fs.readFileSync(new URL('../public/gac-board-position.js', import.meta.url), 'utf8');
    assert.match(source, new RegExp(zone));
  }
  assert.match(workspace, /ZONES\.map\(zoneCard\)/);
  assert.match(workspace, /data-gac-board-add-zone/);
  assert.match(workspace, /Slot \$\{Number\(defense\.slot\)\+1\}/);
});

test('draft context merge keeps zone-slot identity and supports round migration keys', () => {
  const merged = mergeRows(
    [{zone:'FRONT-TOP',slot:0,members:['A','B','C']},{zone:'BACK-TOP',slot:0,members:['D','E','F']}],
    [{zone:'FRONT-TOP',slot:0,members:['X','Y','Z']}],
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((row)=>row.zone==='FRONT-TOP').members, ['X','Y','Z']);
  assert.match(storageKey({owner:'732764286',opponent:'123456789',round:0,formatName:'3v3'}), /:0:3v3$/);
  assert.match(storageKey({owner:'732764286',opponent:'123456789',round:2,formatName:'3v3'}), /:2:3v3$/);
});

test('tactical HUD prefers manual board progress over quick-sandbox selection', () => {
  assert.match(v3, /manualRaw = text\('\.gac-board-progress b'/);
  assert.match(v3, /source: 'manual-board'/);
  assert.match(v3, /Visible board partially entered/);
  assert.match(v3, /Non-overlapping smart counters allocated/);
});
