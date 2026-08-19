import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbStage10DiscordDeliveryService } from '../tb-stage10-discord-delivery-service.mjs';

const artifact = Object.freeze({
  id: 'run-v3',
  guildId: 'guild-1',
  planId: 'plan-1',
  rotePhase: 'P6',
  versionNumber: 3,
  planHash: 'a'.repeat(64),
  approvedAt: '2026-08-20T00:34:34.000+08:00',
  approvedByUserId: 'officer-1',
  approvedPlanHash: 'a'.repeat(64),
  assignments: [
    { phase: 'P6', squadId: 'platoon-1', baseId: 'RAVENSCLAW', name: 'Ravens Claw', member: { name: 'Warm Bacon' }, safety: { help: false } },
    { phase: 'P6', squadId: 'platoon-2', baseId: 'LORDVADER', name: 'Lord Vader', member: { name: 'Officer Two' }, safety: { help: true } },
  ],
  unfilled: [{ phase: 'P6', squadId: 'platoon-3', baseId: 'UNIT_X', name: 'Unit X' }],
});

const context = Object.freeze({
  guild: { id: 'guild-1', name: 'Ludus Venatus' },
  userId: 'officer-1',
  role: 'officer',
  discordGuildId: '1422643338586099745',
  discordUserId: '123456789012345678',
});

function interaction(action = 'preview', hash = null, confirm = null) {
  const options = [
    { name: 'action', type: 3, value: action },
    { name: 'phase', type: 3, value: 'P6' },
    { name: 'version', type: 4, value: 3 },
  ];
  if (hash !== null) options.push({ name: 'hash', type: 3, value: hash });
  if (confirm !== null) options.push({ name: 'confirm', type: 3, value: confirm });
  return { guild_id: context.discordGuildId, data: { options: [{ type: 1, name: 'plan-delivery', options }] } };
}

function makeHarness({ enabled = false } = {}) {
  const receipts = [];
  const audits = [];
  const decisions = [];
  let fetchCalls = 0;
  let publishabilityCalls = 0;

  const store = {
    async select(table, query) {
      if (table === 'guild_tb_plans') return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'ROTE Plan', status: 'draft' }];
      if (table === 'guild_operations_delivery_receipts') {
        return receipts.filter((row) => {
          if (query.idempotency_key && row.idempotency_key !== String(query.idempotency_key).replace(/^eq\./, '')) return false;
          if (query.delivery_kind && row.delivery_kind !== String(query.delivery_kind).replace(/^eq\./, '')) return false;
          if (query.recipient_key && row.recipient_key !== String(query.recipient_key).replace(/^eq\./, '')) return false;
          if (query.chunk_index && row.chunk_index !== Number(String(query.chunk_index).replace(/^eq\./, ''))) return false;
          return true;
        }).sort((a, b) => a.chunk_index - b.chunk_index);
      }
      throw new Error(`Unexpected select table ${table}`);
    },
    async insert(table, rows) {
      if (table === 'guild_operations_delivery_receipts') {
        const created = rows.map((row) => ({ id: `receipt-${receipts.length + 1}`, ...row }));
        for (const row of created) {
          const duplicate = receipts.find((existing) => existing.idempotency_key === row.idempotency_key
            && existing.delivery_kind === row.delivery_kind
            && existing.recipient_key === row.recipient_key
            && existing.chunk_index === row.chunk_index);
          if (duplicate) throw new Error('duplicate receipt');
          receipts.push(row);
        }
        return created;
      }
      if (table === 'guild_operations_audit_log') { audits.push(...rows); return rows; }
      if (table === 'guild_tb_assignment_decisions') { decisions.push(...rows); return rows; }
      throw new Error(`Unexpected insert table ${table}`);
    },
    async update(table, filter, changes) {
      if (table !== 'guild_operations_delivery_receipts') throw new Error(`Unexpected update table ${table}`);
      const id = String(filter.id).replace(/^eq\./, '');
      const row = receipts.find((entry) => entry.id === id);
      if (!row) return [];
      Object.assign(row, changes);
      return [row];
    },
  };

  const versionService = {
    async listVersions() {
      return { versions: [{ version: artifact, verification: { valid: true } }] };
    },
  };
  const publishability = {
    async assertPublishable() {
      publishabilityCalls += 1;
      return { publishable: true, artifact, verification: { valid: true }, sourcePlan: { id: 'plan-1' } };
    },
  };
  const destination = {
    id: 'destination-1',
    verified: true,
    destination_kind: 'channel',
    external_id: '123456789012345679',
    display_name: '#all-bots',
    metadata: { discordGuildId: context.discordGuildId },
  };
  const destinationService = {
    async syncVerifiedDestinations() {
      return {
        binding: { discordGuildId: context.discordGuildId, guildState: { commandChannelId: destination.external_id } },
        destinations: [destination],
      };
    },
  };
  const fetchImpl = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() { return { id: `message-${fetchCalls}`, channel_id: destination.external_id, type: 0, flags: 0 }; },
    };
  };
  const service = createTbStage10DiscordDeliveryService({
    store,
    versionService,
    publishability,
    destinationService,
    contextResolver: { resolve: async () => context },
    fetch: fetchImpl,
    env: {
      DISCORD_STAGE10_TB_CHANNEL_ENABLED: enabled ? 'true' : 'false',
      DISCORD_BOT_TOKEN: 'test-token',
    },
    now: () => new Date('2026-08-20T00:40:00+08:00'),
  });
  return { service, receipts, audits, decisions, get fetchCalls() { return fetchCalls; }, get publishabilityCalls() { return publishabilityCalls; } };
}

test('delivery preview verifies approved artifact and destination without network send', async () => {
  const harness = makeHarness({ enabled: false });
  const result = await harness.service.preview(interaction('preview'));
  assert.equal(result.artifact.versionNumber, 3);
  assert.equal(result.destination.display_name, '#all-bots');
  assert.equal(result.deliveryEnabled, false);
  assert.equal(result.delivered, 0);
  assert.ok(result.chunks.length >= 1);
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 0);
  assert.equal(harness.publishabilityCalls, 1);
});

test('publish remains locked behind a dedicated Stage 10 environment gate', async () => {
  const harness = makeHarness({ enabled: false });
  await assert.rejects(
    () => harness.service.publish(interaction('publish', 'a'.repeat(12), 'PUBLISH')),
    (error) => error?.code === 'STAGE10_CHANNEL_DELIVERY_DISABLED',
  );
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 0);
});

test('wrong hash is durably rejected before any Discord request', async () => {
  const harness = makeHarness({ enabled: true });
  await assert.rejects(
    () => harness.service.publish(interaction('publish', '0'.repeat(12), 'PUBLISH')),
    (error) => error?.code === 'STAGE10_HASH_CONFIRMATION_MISMATCH',
  );
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 0);
  assert.equal(harness.decisions.at(-1).decision, 'publishability_rejected');
});

test('exact approved channel delivery is receipt-backed and identical replay sends no duplicates', async () => {
  const harness = makeHarness({ enabled: true });
  const first = await harness.service.publish(interaction('publish', 'a'.repeat(12), 'PUBLISH'));
  assert.ok(first.chunks >= 1);
  assert.equal(first.newMessages, first.chunks);
  assert.equal(first.reusedChunks, 0);
  assert.equal(first.memberDms, 0);
  assert.equal(harness.fetchCalls, first.chunks);
  assert.equal(harness.receipts.every((row) => row.status === 'delivered'), true);
  assert.equal(harness.receipts.every((row) => row.external_message_id), true);
  const sendsAfterFirst = harness.fetchCalls;

  const replay = await harness.service.publish(interaction('publish', 'a'.repeat(12), 'PUBLISH'));
  assert.equal(replay.newMessages, 0);
  assert.equal(replay.reusedChunks, replay.chunks);
  assert.equal(harness.fetchCalls, sendsAfterFirst);
  assert.equal(harness.audits.filter((row) => row.action === 'tb-immutable.publish').length, 2);
});
