import test from 'node:test';
import assert from 'node:assert/strict';
import { createGacRelicEvidenceEnricher, historicalRelicContext, teamRelicSnapshot, unitInvestment } from '../gac-relic-evidence-enricher.mjs';

test('unit investment distinguishes gear and relic while exposing effective relic for delta math', () => {
  assert.deepEqual(unitInvestment({ gear:12, relic:0 }), { gear:12, relic:0, effectiveRelic:0 });
  assert.deepEqual(unitInvestment({ gear:13, relic:7 }), { gear:13, relic:7, effectiveRelic:7 });
});

test('team relic snapshot requires every battle member to resolve', () => {
  const complete = teamRelicSnapshot(['A','B'], { units:[{baseId:'A',gear:13,relic:7},{baseId:'B',gear:13,relic:5}] });
  assert.equal(complete.complete, true);
  assert.equal(complete.averageRelic, 6);
  const partial = teamRelicSnapshot(['A','MISSING'], { units:[{baseId:'A',gear:13,relic:7}] });
  assert.equal(partial.complete, false);
  assert.equal(partial.averageRelic, null);
  assert.equal(partial.members.find((row) => row.baseId === 'MISSING')?.effectiveRelic, null);
});

test('historical relic context computes attacker minus defender average relic', () => {
  const battle = { attacker_members:['A','B'], defender_members:['D','E'] };
  const context = historicalRelicContext(
    battle,
    { units:[{baseId:'A',gear:13,relic:7},{baseId:'B',gear:13,relic:5}] },
    { units:[{baseId:'D',gear:13,relic:5},{baseId:'E',gear:13,relic:5}] },
  );
  assert.equal(context.complete, true);
  assert.equal(context.attacker.averageRelic, 6);
  assert.equal(context.defender.averageRelic, 5);
  assert.equal(context.relicDelta, 1);
});

test('incomplete roster snapshots cannot generate historical relic delta evidence', () => {
  const context = historicalRelicContext(
    { attacker_members:['A','MISSING'], defender_members:['D'] },
    { units:[{baseId:'A',gear:13,relic:7}] },
    { units:[{baseId:'D',gear:13,relic:5}] },
  );
  assert.equal(context.attacker.complete, false);
  assert.equal(context.complete, false);
  assert.equal(context.attacker.averageRelic, null);
  assert.equal(context.relicDelta, null);
});

test('enricher patches the already-saved battle and supplemental DC evidence metadata', async () => {
  const updates = [];
  const store = {
    async select(table) {
      if (table === 'gac_battles') return [{ id:9, battle_key:'battle-1', attacker_members:['A'], defender_members:['D'], metadata:{ existing:true } }];
      if (table === 'gac_datacron_battle_evidence') return [{ id:11, metadata:{ dc:true } }];
      return [];
    },
    async update(table, query, values) { updates.push({ table, query, values }); return []; },
  };
  const service = createGacRelicEvidenceEnricher({ store });
  const result = await service.enrichBattle({
    battleKey:'battle-1',
    ownerRosterSnapshot:{ units:[{baseId:'A',gear:13,relic:7}] },
    opponentRosterSnapshot:{ units:[{baseId:'D',gear:13,relic:5}] },
  });
  assert.equal(result.enriched, true);
  assert.equal(result.relicDelta, 2);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].table, 'gac_battles');
  assert.equal(updates[0].values.metadata.existing, true);
  assert.equal(updates[0].values.metadata.historicalRelicDelta, 2);
  assert.equal(updates[1].table, 'gac_datacron_battle_evidence');
  assert.equal(updates[1].values.metadata.dc, true);
});

test('enricher returns a soft no-op when the primary battle cannot be resolved', async () => {
  const service = createGacRelicEvidenceEnricher({ store:{ select:async()=>[], update:async()=>{ throw new Error('should not update'); } } });
  const result = await service.enrichBattle({ battleKey:'missing' });
  assert.equal(result.enriched, false);
  assert.equal(result.reason, 'battle-not-found');
});
