import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalRosterService } from "../canonical-roster-service.mjs";

function page(rows, query = {}) {
  const offset = Number(query.offset || 0);
  const limit = Number(query.limit || rows.length || 1);
  return rows.slice(offset, offset + limit);
}

function fakeStore(seed) {
  return {
    status: () => ({ configured: true }),
    async select(table, query = {}) {
      if (table === "players" && query.ally_code) return seed.players.filter((row) => row.ally_code === query.ally_code.replace(/^eq\./, "")).slice(0, Number(query.limit || 1));
      if (table === "players" && query.current_guild_id) return page(seed.players.filter((row) => row.current_guild_id === query.current_guild_id.replace(/^eq\./, "")), query);
      if (table === "player_units_current") return page(seed.units.filter((row) => row.player_id === query.player_id.replace(/^eq\./, "")), query);
      if (table === "player_snapshots" && query.player_id) return seed.playerSnapshots.filter((row) => row.player_id === query.player_id.replace(/^eq\./, "")).slice(0, Number(query.limit || 1));
      if (table === "player_snapshots" && query.source_sync_run_id) return page(seed.playerSnapshots.filter((row) => row.source_sync_run_id === query.source_sync_run_id.replace(/^eq\./, "")), query);
      if (table === "guilds") return seed.guilds.filter((row) => row.id === query.id.replace(/^eq\./, "")).slice(0, Number(query.limit || 1));
      if (table === "guild_members_current") return page(seed.members.filter((row) => row.guild_id === query.guild_id.replace(/^eq\./, "")), query);
      if (table === "guild_snapshots") return seed.guildSnapshots.filter((row) => row.guild_id === query.guild_id.replace(/^eq\./, "")).slice(0, Number(query.limit || 1));
      if (table === "game_units") return page(seed.catalog, query);
      throw new Error(`Unexpected select ${table}`);
    },
  };
}

function seedFixture({ memberCount = 50, unitCount = 394 } = {}) {
  const guildId = "guild-db-1";
  const syncRunId = "sync-run-1";
  const players = Array.from({ length: memberCount }, (_, index) => ({
    id: `player-db-${index + 1}`,
    ally_code: String(700000000 + index),
    swgoh_player_id: `swgoh-player-${index + 1}`,
    name: index === 0 ? "Warm Bacon" : `Member ${index + 1}`,
    level: 85,
    galactic_power: 12_000_000 - index,
    character_power: 7_000_000 - index,
    ship_power: 5_000_000,
    current_guild_id: guildId,
    last_synced_at: "2026-08-17T17:55:08.229Z",
    metadata: index === 0
      ? { playerTitle: "The Warmest Bacon", playerPortrait: "PLAYERPORTRAIT_JEDIMASTER" }
      : {},
  }));
  players[0].ally_code = "732764286";
  const members = players.map((player, index) => ({
    guild_id: guildId, player_id: player.id, member_name: player.name,
    member_galactic_power: player.galactic_power, member_character_power: player.character_power,
    member_ship_power: player.ship_power, first_seen_in_guild_at: "2026-08-16T00:00:00Z",
    last_seen_in_guild_at: "2026-08-17T17:55:08.229Z", last_synced_at: "2026-08-17T17:55:08.229Z",
    metadata: { memberLevel: index === 0 ? 4 : index < 4 ? 3 : 2 },
  }));
  const playerSnapshots = players.map((player) => ({
    player_id: player.id, captured_at: "2026-08-17T17:55:08.229Z",
    galactic_power: player.galactic_power, character_power: player.character_power, ship_power: player.ship_power,
    character_count: 325, ship_count: 69, gl_count: 8, gear_13_count: 250,
    relic_5_plus_count: 180, relic_7_plus_count: 90, relic_9_count: 9, seven_star_ship_count: 60,
    zeta_count: 282, omicron_count: 28, ultimate_count: 8, omega_upgrade_count: null,
    metrics: {}, source_sync_run_id: syncRunId,
  }));
  const catalog = [
    { base_id: "UNITA", name: "Unit A", combat_type: "character", alignment: "Light", categories: ["affiliation_jedi"], image_url: "a.png", metadata: { unitType: "Character", role: "Attacker", factions: ["Jedi"] }, catalog_version: "1" },
    { base_id: "SHIPA", name: "Ship A", combat_type: "ship", alignment: "Light", categories: ["affiliation_rebels"], image_url: "s.png", metadata: { unitType: "Ship", role: "Support", factions: ["Rebels"] }, catalog_version: "1" },
  ];
  const units = Array.from({ length: unitCount }, (_, index) => ({
    player_id: players[0].id, base_id: index % 2 ? "SHIPA" : "UNITA", unit_name: index % 2 ? "Ship A" : "Unit A",
    combat_type: index % 2 ? "ship" : "character", rarity: 7, level: 85, gear_level: index % 2 ? 1 : 13,
    relic_tier: index % 2 ? 0 : 7, galactic_power: 30_000 + index, zeta_count: index % 2 ? 0 : 1,
    omicron_count: 0, ultimate_unlocked: false, last_synced_at: "2026-08-17T17:55:08.229Z",
    metadata: { speed: 300, skills: [], rawSkillTierOffset: 2, zetaClassificationComplete: true, omicronClassificationComplete: true, omegaClassificationComplete: false },
  }));
  return {
    players, members, units, catalog, playerSnapshots,
    guilds: [{ id: guildId, swgoh_guild_id: "swgoh-guild-1", name: "Ludus Venatus", member_count: memberCount, galactic_power: 574_000_000, character_power: 368_000_000, ship_power: 206_000_000, last_synced_at: "2026-08-17T17:55:08.229Z", metadata: {} }],
    guildSnapshots: [{ guild_id: guildId, captured_at: "2026-08-17T17:55:08.229Z", member_count: memberCount, hydrated_member_count: memberCount, galactic_power: 574_000_000, character_power: 368_000_000, ship_power: 206_000_000, gl_count: 331, gear_13_count: 11000, relic_5_plus_count: 8900, relic_7_plus_count: 4300, relic_9_count: 437, seven_star_ship_count: 2885, zeta_count: 14174, omicron_count: 2050, ultimate_count: 323, omega_upgrade_count: null, metrics: {}, source_sync_run_id: syncRunId }],
  };
}

test("canonical Guild read returns all current members without shipping every unit", async () => {
  const seed = seedFixture({ memberCount: 50 });
  const service = createCanonicalRosterService({ store: fakeStore(seed), pageSize: 10 });
  const body = await service.getGuildRosterByPlayer("732764286");
  assert.equal(body.source, "canonical");
  assert.equal(body.members.length, 50);
  assert.equal(body.guild.memberCount, 50);
  assert.equal(body.persistence.logicalMemberListComplete, true);
  assert.equal(body.hydration.complete, true);
  assert.equal(body.members[0].units.length, 0);
  assert.equal(body.members[0].characterCount, 325);
  assert.equal(body.members[0].shipCount, 69);
  assert.equal(body.members[0].zetaCount, 282);
  assert.equal(body.members[0].omicronCount, 28);
});

test("canonical Guild read preserves in-game rank, title and portrait identity metadata", async () => {
  const seed = seedFixture({ memberCount: 50 });
  const service = createCanonicalRosterService({ store: fakeStore(seed), pageSize: 10 });
  const body = await service.getGuildRosterByPlayer("732764286");
  const leader = body.members.find((row) => row.allyCode === "732764286");
  assert.equal(leader.memberLevel, 4);
  assert.equal(leader.profileTitle, "The Warmest Bacon");
  assert.equal(leader.playerPortrait, "PLAYERPORTRAIT_JEDIMASTER");
  assert.equal(body.members.filter((row) => row.memberLevel === 3).length, 3);
});

test("canonical player read preserves profile identity metadata", async () => {
  const seed = seedFixture({ unitCount: 394 });
  const service = createCanonicalRosterService({ store: fakeStore(seed), pageSize: 200 });
  const body = await service.getPlayerRoster("732764286");
  assert.equal(body.player.profileTitle, "The Warmest Bacon");
  assert.equal(body.player.playerPortrait, "PLAYERPORTRAIT_JEDIMASTER");
});

test("canonical player read pages internally but returns every owned unit", async () => {
  const seed = seedFixture({ unitCount: 1_205 });
  seed.playerSnapshots[0].character_count = 603;
  seed.playerSnapshots[0].ship_count = 602;
  const service = createCanonicalRosterService({ store: fakeStore(seed), pageSize: 200 });
  const body = await service.getPlayerRoster("732764286");
  assert.equal(body.persistence.logicalRosterComplete, true);
  assert.equal(body.persistence.expectedOwnedUnits, 1_205);
  assert.equal(body.persistence.returnedOwnedUnits, 1_205);
  assert.equal(body.units.length + body.ships.length, 1_205);
  assert.equal(body.units[0].factions[0], "Jedi");
  assert.equal(body.ships[0].unitType, "Ship");
  assert.equal(body.ships[0].omegas, null);
});

test("canonical player read refuses a silently truncated owned roster", async () => {
  const seed = seedFixture({ unitCount: 393 });
  const service = createCanonicalRosterService({ store: fakeStore(seed), pageSize: 100 });
  await assert.rejects(
    () => service.getPlayerRoster("732764286"),
    /expected 394 owned units but loaded 393/i
  );
});

test("canonical Guild read refuses a silently truncated member list", async () => {
  const seed = seedFixture({ memberCount: 50 });
  seed.members = seed.members.slice(0, 49);
  const service = createCanonicalRosterService({ store: fakeStore(seed), pageSize: 10 });
  await assert.rejects(() => service.getGuildRosterByPlayer("732764286"), /expected 50 members but loaded 49/i);
});
