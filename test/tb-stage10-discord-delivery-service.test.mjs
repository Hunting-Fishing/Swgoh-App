import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbStage10DiscordDeliveryService } from '../tb-stage10-discord-delivery-service.mjs';

const linkedDiscordUserId = '111111111111111111';
const defaultChannelId = '123456789012345679';
const alternateChannelId = '123456789012345680';
const unverifiedChannelId = '123456789012345681';

const assignments = Array.from({ length: 42 }, (_, index) => {
  const linked = index % 2 === 0;
  return {
    phase: 'P6',
    squadId: `platoon-${Math.floor(index / 7) + 1}`,
    baseId: linked ? `LINKED_UNIT_${index}` : `UNLINKED_UNIT_${index}`,
    name: linked ? `Linked Unit ${index}` : `Unlinked Unit ${index}`,
    member: linked
      ? { name: 'Warm Bacon', playerId: 'player-wb', allyCode: '732764286' }
      : { name: 'Officer Two', playerId: 'player-two', allyCode: '123456789' },
    safety: { help: index === 0 },
  };
});

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
  assignments,
  unfilled: [{ phase: 'P6', squadId: 'platoon-7', baseId: 'UNIT_X', name: 'Unit X' }],
});

const context = Object.freeze({
  guild: { id: 'guild-1', name: 'Ludus Venatus' },
  userId: 'officer-1',
  role: 'officer',
  discordGuildId: '1422643338586099745',
  discordUserId: '123456789012345678',
});

function interaction(action = 'preview', { hash = null, confirm = null, mentions = null, channel = null } = {}) {
  const options = [
    { name: 'action', type: 3, value: action },
    { name: 'phase', type: 3, value: 'P6' },
    { name: 'version', type: 4, value: 3 },
  ];
  if (channel !== null) options.push({ name: 'channel', type: 7, value: channel });
  if (mentions !== null) options.push({ name: 'mentions', type: 3, value: mentions });
  if (hash !== null) options.push({ name: 'hash', type: 3, value: hash });
  if (confirm !== null) options.push({ name: 'confirm', type: 3, value: confirm });
  return { guild_id: context.discordGuildId, data: { options: [{ type: 1, name: 'plan-delivery', options }] } };
}

function makeHarness({ enabled = false } = {}) {
  const receipts = [];
  const audits = [];
  const decisions = [];
  const requests = [];
  let fetchCalls = 0;
  let publishabilityCalls = 0;

  const destination = {
    id: 'destination-1',
    guild_id: 'guild-1',
    verified: true,
    destination_kind: 'channel',
    external_id: defaultChannelId,
    display_name: '#all-bots',
    metadata: { discordGuildId: context.discordGuildId, channelType: 0 },
  };
  const alternateDestination = {
    id: 'destination-2',
    guild_id: 'guild-1',
    verified: true,
    destination_kind: 'channel',
    external_id: alternateChannelId,
    display_name: '#tb-assignments',
    metadata: { discordGuildId: context.discordGuildId, channelType: 0 },
  };
  const destinations = [destination, alternateDestination];

  const store = {
    async select(table, query) {
      if (table === 'guild_tb_plans') return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'ROTE Plan', status: 'draft' }];
      if (table === 'guild_discord_destinations') {
        return destinations.filter((row) => {
          if (query.guild_id && row.guild_id !== String(query.guild_id).replace(/^eq\./, '')) return false;
          if (query.destination_kind && row.destination_kind !== String(query.destination_kind).replace(/^eq\./, '')) return false;
          if (query.external_id && row.external_id !== String(query.external_id).replace(/^eq\./, '')) return false;
          if (query.verified && row.verified !== (String(query.verified).replace(/^eq\./, '') === 'true')) return false;
          return true;
        });
      }
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
  const binding = {
    discordGuildId: context.discordGuildId,
    guildState: {
      commandChannelId: destination.external_id,
      userLinks: {
        [linkedDiscordUserId]: {
          discordUserId: linkedDiscordUserId,
          playerId: 'player-wb',
          swgohAllyCode: '732764286',
        },
      },
    },
  };
  const destinationService = {
    async syncVerifiedDestinations() {
      return { binding, destinations: [destination] };
    },
  };
  const fetchImpl = async (url, options = {}) => {
    fetchCalls += 1;
    const body = JSON.parse(options.body || '{}');
    requests.push({ url: String(url), body });
    const channelId = String(url).match(/\/channels\/(\d+)\/messages/)?.[1] || destination.external_id;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() { return { id: `message-${fetchCalls}`, channel_id: channelId, type: 0, flags: 0 }; },
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
  return {
    service,
    receipts,
    audits,
    decisions,
    requests,
    destinations,
    binding,
    get fetchCalls() { return fetchCalls; },
    get publishabilityCalls() { return publishabilityCalls; },
  };
}

test('delivery preview defaults linked-member mentions ON and reports coverage without network send', async () => {
  const harness = makeHarness({ enabled: false });
  const result = await harness.service.preview(interaction('preview'));
  assert.equal(result.artifact.versionNumber, 3);
  assert.equal(result.destination.display_name, '#all-bots');
  assert.equal(result.includeMentions, true);
  assert.equal(result.mentionCoverage.assignedMembers, 2);
  assert.equal(result.mentionCoverage.linkedMembers, 1);
  assert.equal(result.mentionCoverage.unlinkedMembers, 1);
  assert.match(result.mentionCoverage.audienceFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.deliveryEnabled, false);
  assert.equal(result.delivered, 0);
  assert.ok(result.chunks.length > 1);
  assert.match(result.chunks.map((row) => row.content).join('\n'), new RegExp(`<@${linkedDiscordUserId}>`));
  assert.match(result.chunks.map((row) => row.content).join('\n'), /\*\*Officer Two\*\*/);
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 0);
  assert.equal(harness.publishabilityCalls, 1);
});

test('officer can select a separately verified TB assignment channel', async () => {
  const harness = makeHarness({ enabled: false });
  const result = await harness.service.preview(interaction('preview', { channel: alternateChannelId }));
  assert.equal(result.channelId, alternateChannelId);
  assert.equal(result.destination.display_name, '#tb-assignments');
});

test('unverified selected channel fails closed before any Discord request', async () => {
  const harness = makeHarness({ enabled: true });
  await assert.rejects(
    () => harness.service.preview(interaction('preview', { channel: unverifiedChannelId })),
    (error) => error?.code === 'VERIFIED_DESTINATION_REQUIRED',
  );
  assert.equal(harness.fetchCalls, 0);
});

test('mentions OFF produces names-only content and a distinct idempotency identity', async () => {
  const harness = makeHarness({ enabled: false });
  const on = await harness.service.preview(interaction('preview'));
  const off = await harness.service.preview(interaction('preview', { mentions: 'off' }));
  assert.equal(off.includeMentions, false);
  assert.notEqual(on.idempotencyKey, off.idempotencyKey);
  const content = off.chunks.map((row) => row.content).join('\n');
  assert.doesNotMatch(content, /<@\d+>/);
  assert.match(content, /\*\*Warm Bacon\*\*/);
  assert.equal(off.chunks.every((row) => row.allowedUsers.length === 0), true);
});

test('publish remains locked behind a dedicated Stage 10 environment gate', async () => {
  const harness = makeHarness({ enabled: false });
  await assert.rejects(
    () => harness.service.publish(interaction('publish', { hash: 'a'.repeat(12), confirm: 'PUBLISH' })),
    (error) => error?.code === 'STAGE10_CHANNEL_DELIVERY_DISABLED',
  );
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 0);
});

test('wrong hash is durably rejected before any Discord request', async () => {
  const harness = makeHarness({ enabled: true });
  await assert.rejects(
    () => harness.service.publish(interaction('publish', { hash: '0'.repeat(12), confirm: 'PUBLISH' })),
    (error) => error?.code === 'STAGE10_HASH_CONFIRMATION_MISMATCH',
  );
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 0);
  assert.equal(harness.decisions.at(-1).decision, 'publishability_rejected');
});

test('exact approved mention delivery allowlists only linked users and identical replay sends no duplicates', async () => {
  const harness = makeHarness({ enabled: true });
  const first = await harness.service.publish(interaction('publish', { hash: 'a'.repeat(12), confirm: 'PUBLISH' }));
  assert.ok(first.chunks > 1);
  assert.equal(first.newMessages, first.chunks);
  assert.equal(first.reusedChunks, 0);
  assert.equal(first.includeMentions, true);
  assert.equal(first.mentionCoverage.linkedMembers, 1);
  assert.equal(first.memberDms, 0);
  assert.equal(harness.fetchCalls, first.chunks);
  assert.equal(harness.receipts.every((row) => row.status === 'delivered'), true);
  assert.equal(harness.receipts.every((row) => row.external_message_id), true);
  assert.equal(harness.receipts.every((row) => row.request_metadata.mentions === true), true);
  assert.equal(harness.receipts.every((row) => /^[0-9a-f]{64}$/.test(row.request_metadata.contentHash)), true);
  assert.equal(harness.receipts.every((row) => row.request_metadata.audienceFingerprint === first.mentionCoverage.audienceFingerprint), true);

  const bodies = harness.requests.map((row) => row.body);
  assert.equal(bodies.every((body) => Array.isArray(body.allowed_mentions?.parse) && body.allowed_mentions.parse.length === 0), true);
  assert.equal(bodies.every((body) => body.allowed_mentions?.replied_user === false), true);
  assert.equal(bodies.some((body) => body.allowed_mentions?.users?.includes(linkedDiscordUserId)), true);
  assert.equal(bodies.flatMap((body) => body.allowed_mentions?.users || []).filter((id) => id === linkedDiscordUserId).length, 1);
  assert.equal(bodies.every((body) => !Object.hasOwn(body.allowed_mentions || {}, 'roles')), true);

  const sendsAfterFirst = harness.fetchCalls;
  const replay = await harness.service.publish(interaction('publish', { hash: 'a'.repeat(12), confirm: 'PUBLISH' }));
  assert.equal(replay.newMessages, 0);
  assert.equal(replay.reusedChunks, replay.chunks);
  assert.equal(harness.fetchCalls, sendsAfterFirst);
  assert.equal(harness.audits.filter((row) => row.action === 'tb-immutable.publish').length, 2);
  assert.equal(harness.audits.at(-1).metadata.includeMentions, true);
});

test('partial mention delivery refuses resume if the Discord link registry changed', async () => {
  const harness = makeHarness({ enabled: true });
  const preview = await harness.service.preview(interaction('preview'));
  harness.receipts.push({
    id: 'receipt-partial',
    guild_id: 'guild-1',
    run_type: 'tb',
    run_id: artifact.id,
    destination_id: 'destination-1',
    delivery_kind: 'discord_channel',
    recipient_key: 'public',
    chunk_index: 0,
    idempotency_key: preview.idempotencyKey,
    status: 'delivered',
    external_message_id: 'already-delivered-message',
    request_metadata: {
      mentions: true,
      audienceFingerprint: preview.mentionCoverage.audienceFingerprint,
      contentHash: preview.chunks[0].contentHash,
    },
  });
  delete harness.binding.guildState.userLinks[linkedDiscordUserId];

  await assert.rejects(
    () => harness.service.publish(interaction('publish', { hash: 'a'.repeat(12), confirm: 'PUBLISH' })),
    (error) => error?.code === 'STAGE10_MENTION_AUDIENCE_CHANGED',
  );
  assert.equal(harness.fetchCalls, 0);
  assert.equal(harness.receipts.length, 1);
});

test('mentions OFF and ON have independent receipt identities for the same approved artifact', async () => {
  const harness = makeHarness({ enabled: true });
  const on = await harness.service.publish(interaction('publish', { hash: 'a'.repeat(12), confirm: 'PUBLISH' }));
  const sendsAfterOn = harness.fetchCalls;
  const off = await harness.service.publish(interaction('publish', { hash: 'a'.repeat(12), confirm: 'PUBLISH', mentions: 'off' }));
  assert.notEqual(on.idempotencyKey, off.idempotencyKey);
  assert.ok(harness.fetchCalls > sendsAfterOn);
  assert.equal(off.includeMentions, false);
  assert.equal(harness.requests.slice(sendsAfterOn).every((row) => (row.body.allowed_mentions?.users || []).length === 0), true);
});
