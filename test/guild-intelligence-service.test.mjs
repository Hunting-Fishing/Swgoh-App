import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuildIntelligenceService } from '../guild-intelligence-service.mjs';

function fakeStore(payload, configured = true) {
  const calls = [];
  return {
    calls,
    status() { return { configured }; },
    async rpc(name, args) {
      calls.push({ name, args });
      return payload;
    },
  };
}

test('Guild Intelligence reads the persisted 29-page registry by Ally Code', async () => {
  const pages = [
    { pageKey: 'gr_dashboard', captureStatus: 'partial' },
    { pageKey: 'gl_report', captureStatus: 'captured' },
    { pageKey: 'raid_data', captureStatus: 'source_pending' },
    { pageKey: 'endor_perf_data', captureStatus: 'not_applicable' },
    { pageKey: 'relationships', captureStatus: 'captured' },
  ];
  while (pages.length < 29) pages.push({ pageKey: `page_${pages.length + 1}`, captureStatus: 'partial' });
  const store = fakeStore({
    guild: { id: 'guild-1', name: 'Ludus Venatus' },
    settings: { report_timezone: 'America/Phoenix', report_local_time: '00:00:00' },
    latestReport: { report_date: '2026-08-17', status: 'partial' },
    returnedTotal: 3,
    pages,
  });
  const service = createGuildIntelligenceService({ store });
  const body = await service.getByPlayer('732-764-286');
  assert.deepEqual(store.calls, [{ name: 'read_guild_intelligence_status', args: { p_ally_code: '732764286' } }]);
  assert.equal(body.guild.name, 'Ludus Venatus');
  assert.equal(body.summary.totalPages, 29);
  assert.equal(body.summary.captured, 2);
  assert.equal(body.summary.sourcePending, 1);
  assert.equal(body.summary.notApplicable, 1);
  assert.equal(body.summary.returnedTotal, 3);
});

test('Guild Intelligence rejects invalid Ally Codes before persistence access', async () => {
  const store = fakeStore(null);
  const service = createGuildIntelligenceService({ store });
  await assert.rejects(() => service.getByPlayer('123'), /valid 9-digit Ally Code/i);
  assert.equal(store.calls.length, 0);
});

test('Guild Intelligence reports persistence configuration explicitly', () => {
  const enabled = createGuildIntelligenceService({ store: fakeStore(null, true) }).status();
  assert.equal(enabled.configured, true);
  assert.equal(enabled.dailyPageRegistry, 29);
  assert.equal(enabled.midnightScheduling, 'guild-local-timezone');
  const disabled = createGuildIntelligenceService({ store: fakeStore(null, false) }).status();
  assert.equal(disabled.configured, false);
  assert.equal(disabled.mode, 'disabled');
});
