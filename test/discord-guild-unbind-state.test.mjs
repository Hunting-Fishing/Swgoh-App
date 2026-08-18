import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDiscordStateStore } from '../discord-state-store.mjs';
import { createDiscordHardReservationStore } from '../discord-hard-reservation-store.mjs';

const GUILD = '123456789012345678';
const USER = '223456789012345678';
const ACTOR = '323456789012345678';

async function withState(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'swgoh-unbind-'));
  const env = { SWGOH_STATE_DIR: dir, SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: 'true' };
  try { await run({ dir, env }); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('Guild unbind clears Discord integration state but keeps a durable tombstone object and audit', async () => {
  await withState(async ({ env }) => {
    let counter = 0;
    const store = createDiscordStateStore(env, { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}` });
    await store.bootstrapGuild({ discordGuildId: GUILD, swgohAllyCode: '732764286', commandChannelId: '423456789012345678', officerRoleIds: ['523456789012345678'], actorDiscordUserId: ACTOR });
    await store.linkPlayer({ discordGuildId: GUILD, discordUserId: USER, swgohAllyCode: '732764286', playerId: 'swgoh-warm', actorDiscordUserId: ACTOR });
    await store.setDonationPreference({ discordGuildId: GUILD, discordUserId: USER, unitBaseId: 'UNIT_A', preference: 'give', actorDiscordUserId: ACTOR });
    await store.setMemberAvailability({ discordGuildId: GUILD, discordUserId: USER, availability: 'unavailable', actorDiscordUserId: ACTOR });
    await store.savePlanVersion({ discordGuildId: GUILD, rotePhase: 'P1', summary: { assignments: 1 }, actorDiscordUserId: ACTOR });

    const previous = await store.unbindGuild({ discordGuildId: GUILD, actorDiscordUserId: ACTOR });
    assert.equal(previous.swgohAllyCode, '732764286');
    assert.equal(previous.linkedPlayers, 1);
    assert.equal(previous.donationPreferences, 1);
    assert.equal(previous.unavailableMembers, 1);
    assert.equal(previous.planVersions, 1);

    const guild = await store.readGuild(GUILD);
    assert.ok(guild, 'durable Guild object must remain as an explicit unbound tombstone');
    assert.equal(guild.swgohAllyCode, '');
    assert.equal(guild.commandChannelId, '');
    assert.deepEqual(guild.officerRoleIds, []);
    assert.deepEqual(guild.userLinks, {});
    assert.deepEqual(guild.memberPreferences, {});
    assert.deepEqual(guild.memberAvailability, {});
    assert.deepEqual(guild.planVersions, []);

    const state = await store.readState();
    assert.equal(state.audit.at(-1).action, 'guild-unbound');
    assert.equal(state.audit.at(-1).details.destructiveScope, 'discord-integration-only');

    await store.bootstrapGuild({ discordGuildId: GUILD, swgohAllyCode: '732764286', commandChannelId: '423456789012345678', actorDiscordUserId: ACTOR });
    assert.equal((await store.readGuild(GUILD)).swgohAllyCode, '732764286', 'normal /tb setup rebind remains supported');
  });
});

test('hard-reservation Guild clear removes reservations but preserves hard-reservation audit history', async () => {
  await withState(async ({ env }) => {
    let counter = 100;
    const store = createDiscordHardReservationStore(env, { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}` });
    await store.setReservation({
      discordGuildId: GUILD,
      discordUserId: USER,
      swgohAllyCode: '732764286',
      playerId: 'swgoh-warm',
      unitBaseId: 'UNIT_A',
      unitName: 'Unit A',
      rotePhase: 'P1',
      reserved: true,
      actorDiscordUserId: ACTOR,
    });
    const cleared = await store.clearGuild({ discordGuildId: GUILD, actorDiscordUserId: ACTOR });
    assert.equal(cleared.cleared, 1);
    const guild = await store.readGuild(GUILD);
    assert.deepEqual(guild.reservations, {});
  });
});
