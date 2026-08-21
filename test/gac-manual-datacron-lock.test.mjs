import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coverageSummary } from '../public/gac-manual-datacron-lock.js';

const uiUrl=new URL('../public/gac-manual-datacron-lock.js',import.meta.url);
const loaderUrl=new URL('../public/asset-resilience.js',import.meta.url);
const apiUrl=new URL('../gac-attack-plan-api.mjs',import.meta.url);
const executionUrl=new URL('../public/gac-battle-execution-model.js',import.meta.url);

test('manual Datacron recommendation fails safely to no Datacron when coverage is unresolved',()=>{
  const summary=coverageSummary(null);
  assert.equal(summary.id,'');
  assert.equal(summary.label,'NO DATACRON RECOMMENDED');
});

test('manual lock reuses the canonical Datacron eligibility and coverage engine',async()=>{
  const ui=await readFile(uiUrl,'utf8');
  assert.match(ui,/bestCoverage/);
  assert.match(ui,/datacronLabel/);
  assert.match(ui,/loadEligibilityContext/);
  assert.match(ui,/coverageForMembers/);
  assert.doesNotMatch(ui,/Math\.random|mock datacron|fake datacron/i);
});

test('manual Lock Counter is normalized away from the legacy empty-Datacron bridge action',async()=>{
  const ui=await readFile(uiUrl,'utf8');
  assert.match(ui,/data-gac-manual-war-action=\\?"lock\\?"/);
  assert.match(ui,/dataset\.gacManualDcLock='true'/);
  assert.match(ui,/delete button\.dataset\.gacManualWarAction/);
  assert.match(ui,/stopImmediatePropagation\(\)/);
});

test('manual counter lock sends the exact recommended live Datacron ID through the existing attack-plan API',async()=>{
  const [ui,api]=await Promise.all([readFile(uiUrl,'utf8'),readFile(apiUrl,'utf8')]);
  assert.match(ui,/datacronId=clean\(coverage\?\.datacron\?\.id\)/);
  assert.match(ui,/JSON\.stringify\(\{round:current\.round,defenseId,leaderBaseId,members,datacronId\}\)/);
  assert.match(ui,/credentials:'same-origin'/);
  assert.match(api,/const datacronId = clean\(body\?\.datacronId\)/);
  assert.match(api,/datacronById\(liveRoster, datacronId, "player"\)/);
});

test('locked Datacron remains part of the B08 exact execution fingerprint',async()=>{
  const execution=await readFile(executionUrl,'utf8');
  assert.match(execution,/attackerDatacronId/);
  assert.match(execution,/assignment\?\.datacron\?\.id/);
});

test('manual Datacron module is loaded after the War Room bridge',async()=>{
  const loader=await readFile(loaderUrl,'utf8');
  const bridge=loader.indexOf("import './gac-manual-war-room-bridge.js';");
  const datacron=loader.indexOf("import './gac-manual-datacron-lock.js';");
  assert.ok(bridge>=0);
  assert.ok(datacron>bridge);
});
