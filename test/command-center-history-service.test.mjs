import assert from "node:assert/strict";
import test from "node:test";
import { createCommandCenterHistoryService } from "../command-center-history-service.mjs";

function fakeStore(seed) {
  return {
    status: () => ({ configured: true }),
    async select(table, query = {}) {
      const limit = Number(query.limit || 1000);
      if (table === "players" && query.ally_code) {
        const code = query.ally_code.replace(/^eq\./, "");
        return seed.players.filter((row) => row.ally_code === code).slice(0, limit);
      }
      if (table === "players" && query.current_guild_id) {
        const guildId = query.current_guild_id.replace(/^eq\./, "");
        return seed.players.filter((row) => row.current_guild_id === guildId).slice(0, limit);
      }
      if (table === "guilds") {
        const guildId = query.id.replace(/^eq\./, "");
        return seed.guilds.filter((row) => row.id === guildId).slice(0, limit);
      }
      if (table === "player_snapshots") {
        const playerId = query.player_id.replace(/^eq\./, "");
        return seed.playerSnapshots.filter((row) => row.player_id === playerId).slice(0, limit);
      }
      if (table === "guild_snapshots") {
        const guildId = query.guild_id.replace(/^eq\./, "");
        return seed.guildSnapshots.filter((row) => row.guild_id === guildId).slice(0, limit);
      }
      if (table === "player_unit_progression_history") {
        if (query.player_id) {
          const playerId = query.player_id.replace(/^eq\./, "");
          return seed.progression.filter((row) => row.player_id === playerId).slice(0, limit);
        }
        const guildId = query.guild_id.replace(/^eq\./, "");
        return seed.progression.filter((row) => row.guild_id === guildId).slice(0, limit);
      }
      if (table === "guild_membership_history") {
        const guildId = query.guild_id.replace(/^eq\./, "");
        return seed.membership.filter((row) => row.guild_id === guildId).slice(0, limit);
      }
      if (table === "game_units") return seed.catalog.slice(0, limit);
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function fixture() {
  const guildId = "guild-db-1";
  const playerId = "player-db-1";
  return {
    players: [
      { id: playerId, ally_code: "732764286", swgoh_player_id: "swgoh-warm-bacon", name: "Warm Bacon", current_guild_id: guildId, galactic_power: 12655455, character_power: 8146249, ship_power: 4515899, last_synced_at: "2026-08-17T17:55:08.229Z" },
      { id: "player-db-2", ally_code: "700000002", swgoh_player_id: "swgoh-other", name: "Other Member", current_guild_id: guildId, galactic_power: 11000000, last_synced_at: "2026-08-17T17:55:08.229Z" },
    ],
    guilds: [{ id: guildId, swgoh_guild_id: "swgoh-guild-1", name: "Ludus Venatus", member_count: 50, galactic_power: 574397661, character_power: 368491019, ship_power: 206238998, last_synced_at: "2026-08-17T17:55:08.229Z" }],
    catalog: [
      { base_id: "RACCOON", name: "Rotta the Hutt", combat_type: "character", image_url: "rotta.png", metadata: {} },
      { base_id: "DASHRENDAR", name: "Dash Rendar", combat_type: "character", image_url: "dash.png", metadata: {} },
    ],
    playerSnapshots: [
      { player_id: playerId, captured_at: "2026-08-17T17:55:08.229Z", galactic_power: 12655455, character_power: 8146249, ship_power: 4515899, character_count: 325, ship_count: 69, gl_count: 8, gear_13_count: 250, relic_5_plus_count: 180, relic_7_plus_count: 90, relic_9_count: 9, seven_star_ship_count: 60, zeta_count: 282, omicron_count: 28, ultimate_count: 8, omega_upgrade_count: null, source_sync_run_id: "run-2" },
      { player_id: playerId, captured_at: "2026-08-16T17:55:08.229Z", galactic_power: 12600000, character_power: 8100000, ship_power: 4500000, character_count: 324, ship_count: 69, gl_count: 8, gear_13_count: 249, relic_5_plus_count: 179, relic_7_plus_count: 89, relic_9_count: 9, seven_star_ship_count: 60, zeta_count: 281, omicron_count: 27, ultimate_count: 8, omega_upgrade_count: null, source_sync_run_id: "run-1" },
    ],
    guildSnapshots: [
      { guild_id: guildId, captured_at: "2026-08-17T17:55:08.229Z", member_count: 50, hydrated_member_count: 50, galactic_power: 574397661, character_power: 368491019, ship_power: 206238998, gl_count: 331, gear_13_count: 11741, relic_5_plus_count: 8970, relic_7_plus_count: 4325, relic_9_count: 437, seven_star_ship_count: 2885, zeta_count: 14174, omicron_count: 2050, ultimate_count: 323, omega_upgrade_count: null, source_sync_run_id: "run-2" },
      { guild_id: guildId, captured_at: "2026-08-16T17:55:08.229Z", member_count: 50, hydrated_member_count: 50, galactic_power: 573000000, character_power: 367500000, ship_power: 205500000, gl_count: 330, gear_13_count: 11700, relic_5_plus_count: 8950, relic_7_plus_count: 4300, relic_9_count: 435, seven_star_ship_count: 2880, zeta_count: 14150, omicron_count: 2040, ultimate_count: 322, omega_upgrade_count: null, source_sync_run_id: "run-1" },
    ],
    progression: [
      { id: 1, player_id: playerId, guild_id: guildId, base_id: "RACCOON", event_type: "progression_change", changed_at: "2026-08-17T17:51:27.949Z", changed_fields: ["omicronCount", "metadata"], previous_state: { level: 85, rarity: 5, gearLevel: 13, relicTier: 4, galacticPower: 25999, zetaCount: 3, omicronCount: 1, ultimateUnlocked: false }, new_state: { level: 85, rarity: 5, gearLevel: 13, relicTier: 4, galacticPower: 25999, zetaCount: 3, omicronCount: 2, ultimateUnlocked: false }, source: "guild_sync", metadata: {} },
      { id: 2, player_id: "player-db-2", guild_id: guildId, base_id: "DASHRENDAR", event_type: "progression_change", changed_at: "2026-08-17T17:51:27.949Z", changed_fields: ["relicTier", "galacticPower"], previous_state: { level: 85, rarity: 7, gearLevel: 13, relicTier: 6, galacticPower: 27732, zetaCount: 1, omicronCount: 1, ultimateUnlocked: false }, new_state: { level: 85, rarity: 7, gearLevel: 13, relicTier: 7, galacticPower: 29629, zetaCount: 1, omicronCount: 1, ultimateUnlocked: false }, source: "guild_sync", metadata: {} },
    ],
    membership: [
      { id: 1, guild_id: guildId, player_id: "player-db-2", event_type: "joined", occurred_at: "2026-08-17T12:00:00Z", previous_value: "", new_value: "active", metadata: {} },
    ],
  };
}

test("player history exposes real progression deltas and snapshot trend", async () => {
  const service = createCommandCenterHistoryService({ store: fakeStore(fixture()) });
  const body = await service.getPlayerHistory("732764286");
  assert.equal(body.source, "canonical-history");
  assert.equal(body.player.name, "Warm Bacon");
  assert.equal(body.progression.length, 1);
  assert.equal(body.progression[0].unitName, "Rotta the Hutt");
  assert.deepEqual(body.progression[0].changedFields, ["omicronCount"]);
  assert.equal(body.progression[0].delta.omicronCount, 1);
  assert.equal(body.summary.omicronsAdded, 1);
  assert.equal(body.trend.comparable, true);
  assert.equal(body.trend.galacticPower, 55455);
  assert.equal(body.trend.zetas, 1);
  assert.equal(body.trend.omicrons, 1);
  assert.equal(body.snapshots[0].omegaUpgradeCount, null);
});

test("Guild history combines snapshot trend, membership, member progression, and officer activity intelligence", async () => {
  const service = createCommandCenterHistoryService({ store: fakeStore(fixture()) });
  const body = await service.getGuildHistoryByPlayer("732764286");
  assert.equal(body.guild.name, "Ludus Venatus");
  assert.equal(body.currentMembers.length, 2);
  assert.equal(body.currentMembers[0].galacticPower, 11000000);
  assert.equal(body.progression.length, 2);
  assert.equal(body.progressionSummary.relicLevelsGained, 1);
  assert.equal(body.progressionSummary.omicronsAdded, 1);
  assert.equal(body.membership.length, 1);
  assert.equal(body.membership[0].playerName, "Other Member");
  assert.equal(body.trend.galacticPower, 1397661);
  assert.equal(body.trend.galacticLegends, 1);
  assert.equal(body.trend.omicrons, 10);
  assert.equal(body.activityCommand.summary.currentMembers, 2);
  assert.equal(body.activityCommand.summary.membersWithCapturedProgression, 2);
  assert.equal(body.activityCommand.summary.membersWithoutCapturedProgression, 0);
  assert.equal(body.activityCommand.summary.abilityInvestments, 1);
  assert.equal(body.activityCommand.summary.membershipChanges, 1);
  assert.equal(body.activityCommand.momentumLeaders[0].name, "Warm Bacon");
  assert.equal(body.activityCommand.recentAbilityInvestments[0].unitName, "Rotta the Hutt");
});
