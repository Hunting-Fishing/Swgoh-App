import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuildHistoryArchiveService } from '../guild-history-archive-service.mjs';

function storeWithRpc(handler) {
  return {
    status() { return { configured: true }; },
    rpc: handler,
  };
}

test('Guild history coverage returns persisted archive metadata', async () => {
  let call;
  const service = createGuildHistoryArchiveService({ store: storeWithRpc(async (name, args) => {
    call = { name, args };
    return { available: true, counts: { guildSnapshots: 666, returns: 16 }, source: 'LV Unit Tracker (new)' };
  }) });
  const body = await service.getCoverage('732-764-286');
  assert.deepEqual(call, { name: 'read_guild_history_coverage', args: { p_ally_code: '732764286' } });
  assert.equal(body.available, true);
  assert.equal(body.counts.guildSnapshots, 666);
  assert.equal(body.counts.returns, 16);
});

test('Guild history section is server allow-listed', async () => {
  let calls = 0;
  const service = createGuildHistoryArchiveService({ store: storeWithRpc(async () => { calls += 1; return []; }) });
  await assert.rejects(() => service.getSection('732764286', 'anything'), /Unsupported Guild history section/i);
  assert.equal(calls, 0);
});

test('Guild history section delegates to section RPC', async () => {
  const service = createGuildHistoryArchiveService({ store: storeWithRpc(async (name, args) => {
    assert.equal(name, 'read_guild_history_section');
    assert.deepEqual(args, { p_ally_code: '732764286', p_section: 'returns' });
    return [[70, '2026-06-15T00:11:06Z']];
  }) });
  const body = await service.getSection('732764286', 'returns');
  assert.equal(body.source, 'historical-guild-archive');
  assert.equal(body.section, 'returns');
  assert.equal(body.data.length, 1);
});
