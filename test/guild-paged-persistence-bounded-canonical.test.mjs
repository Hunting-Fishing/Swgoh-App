import assert from 'node:assert/strict';
import test from 'node:test';
import { createPagedGuildPersistence } from '../guild-paged-persistence.mjs';

const USER = '4aefcc23-5f50-41b0-b94f-d6ff0e66fdaf';
const GUILD_UUID = '284efcdb-01ef-4ae9-989a-ca6a94952df4';

function pageMember({ playerId, allyCode, name, baseId, gp }) {
  return {
    playerId,
    allyCode,
    name,
    level: 85,
    galacticPower: gp,
    characterGalacticPower: gp,
    shipGalacticPower: 0,
    rosterAvailable: true,
    memberLevel: 2,
    guildXp: 10,
    squadPower: 100000,
    units: [{
      id: `${playerId}-unit`,
      baseId,
      definitionId: `${baseId}:SEVEN_STAR`,
      combatType: 1,
      unitType: 'Character',
      stars: 7,
      level: 85,
      gear: 13,
      relic: 7,
      power: gp,
      speed: 300,
      purchasedAbilityIds: [`${baseId}_ABILITY`],
    }],
  };
}

function response(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function page(offset) {
  const members = [
    pageMember({ playerId: 'swgoh-a', allyCode: '782764286', name: 'Warm Bacon', baseId: 'UNIT_A', gp: 50000 }),
    pageMember({ playerId: 'swgoh-b', allyCode: '123456789', name: 'Bravo', baseId: 'UNIT_B', gp: 45000 }),
  ];
  const member = members[offset];
  return {
    source: 'live',
    rosterDetail: 'durable-baseline-page',
    guild: { id: 'swgoh-guild', name: 'Ludus Venatus', memberCount: 2, galacticPower: 95000, memberMax: 50 },
    members: [member],
    page: { offset, limit: 1, returned: 1, totalMembers: 2, nextOffset: offset === 0 ? 1 : null, complete: offset === 1, projection: 'durable-baseline-v1' },
    hydration: { requested: 1, hydrated: 1, failed: 0, complete: true },
    calculation: { source: 'SWGOH Stats', configured: true, requested: 1, calculated: 0, failed: 1, complete: false, error: 'partial' },
    activity: { raidLaunchConfig: [], guildEventTracker: [], recentRaidResult: [], recentTerritoryWarResult: [], territoryBattleResult: [] },
    fetchedAt: '2026-08-17T17:10:00Z',
  };
}

test('paged persistence stages lean pages then uses bounded canonical RPCs before completion', async () => {
  const calls = [];
  let ingestCalls = 0;
  const store = {
    status() { return { configured: true }; },
    async delete(table, query) { calls.push({ op: 'delete', table, query }); },
    async upsert(table, rows, options) { calls.push({ op: 'upsert', table, rows: structuredClone(rows), options }); },
    async select(table, query) {
      calls.push({ op: 'select', table, query });
      return [{ ally_code: '782764286', swgoh_player_id: 'swgoh-a' }];
    },
    async rpc(name, args) {
      calls.push({ op: 'rpc', name, args: structuredClone(args) });
      if (name === 'prepare_bounded_guild_sync') return { ok: true, syncRunId: 'sync-1', activitySnapshotId: 10, capturedAt: '2026-08-17T17:10:00Z' };
      if (name === 'ingest_bounded_guild_sync_members') {
        ingestCalls += 1;
        return { ok: true, processedMembers: 1, unitsProcessed: 1, remainingMembers: ingestCalls === 1 ? 1 : 0, complete: ingestCalls === 2 };
      }
      if (name === 'complete_bounded_guild_sync') return { ok: true, syncRunId: 'sync-1', membersStored: 2, unitsStored: 2, activitySnapshotId: 10, capturedAt: '2026-08-17T17:10:00Z' };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const service = createPagedGuildPersistence({
    SWGOH_GATEWAY_URL: 'https://gateway.example',
    SWGOH_GATEWAY_API_KEY: 'secret',
    GUILD_SYNC_PAGE_SIZE: '1',
    GUILD_SYNC_INGEST_BATCH_SIZE: '1',
  }, {
    store,
    contextResolver: {
      async verifiedContext() {
        return {
          player: { id: 'player-uuid', ally_code: '782764286', swgoh_player_id: 'swgoh-a' },
          guild: { id: GUILD_UUID, swgoh_guild_id: 'swgoh-guild', name: 'Ludus Venatus' },
        };
      },
    },
    fetch: async (url) => response(page(Number(new URL(url).searchParams.get('offset') || 0))),
    now: () => new Date('2026-08-17T17:10:00Z'),
  });

  const result = await service.sync({ id: USER }, { jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert.equal(result.ok, true);
  assert.equal(result.membersStored, 2);
  assert.equal(result.unitsStored, 2);
  assert.equal(result.canonicalIngest, 'bounded-member-rpc-v1');
  assert.equal(result.integrity.dataQuality, 'hydrated-raw-stats-partial');

  const rpcNames = calls.filter((call) => call.op === 'rpc').map((call) => call.name);
  assert.deepEqual(rpcNames, [
    'prepare_bounded_guild_sync',
    'ingest_bounded_guild_sync_members',
    'ingest_bounded_guild_sync_members',
    'complete_bounded_guild_sync',
  ]);
  assert.equal(rpcNames.includes('finalize_staged_guild_sync'), false);

  const stages = calls.filter((call) => call.op === 'upsert' && call.table === 'guild_sync_stage_members');
  assert.equal(stages.length, 2);
  assert.equal(stages[0].rows[0].payload.units[0].metadata.abilityClassificationPendingCatalog, true);
  assert.deepEqual(stages[0].rows[0].payload.units[0].metadata.purchasedAbilityIds, ['UNIT_A_ABILITY']);

  const prepare = calls.find((call) => call.op === 'rpc' && call.name === 'prepare_bounded_guild_sync');
  assert.equal(prepare.args.p_header.rosterDetail, 'durable-baseline');
  assert.equal(prepare.args.p_header.guild.metadata.persistenceProjection, 'durable-baseline-v1');
  assert.equal(prepare.args.p_header.guild.metadata.ingestBatchSize, 1);
});
