import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { supabaseCoreStore } from "../supabase-core-store.mjs";

const SOURCE = "lv-unit-tracker-workbook";
const SWGOH_GUILD_ID = "3xa5z9KySv25kY3GH9FNvg";
const DEFAULT_DIR = "data/ludus-history";
const DEFAULT_BATCH = 500;

const DATASETS = Object.freeze([
  { key: "member_snapshots", file: "member_snapshots.jsonl", table: "guild_member_historical_snapshots", conflict: "guild_id,captured_at,ally_code,source" },
  { key: "raid_tickets", file: "raid_tickets.jsonl", table: "guild_raid_ticket_history", conflict: "guild_id,captured_at,ally_code,source" },
  { key: "raid_results", file: "raid_results.jsonl", table: "guild_raid_member_results", conflict: "guild_id,raid_date,raid_name,player_name,source" },
  { key: "rote_performance", file: "rote_performance.jsonl", table: "guild_rote_member_performance", conflict: "guild_id,start_date,player_name,source" },
  { key: "reva_shards", file: "reva_shards.jsonl", table: "guild_reva_shard_history", conflict: "guild_id,rote_start_date,ally_code,source" },
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = { dir: DEFAULT_DIR, batchSize: DEFAULT_BATCH, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir") options.dir = argv[++i];
    else if (argv[i] === "--batch-size") options.batchSize = Math.max(25, Math.min(1000, Number(argv[++i]) || DEFAULT_BATCH));
    else if (argv[i] === "--dry-run") options.dryRun = true;
  }
  return options;
}

async function resolveGuildId(store) {
  const rows = await store.select("guilds", { select: "id,swgoh_guild_id,name", swgoh_guild_id: `eq.${SWGOH_GUILD_ID}`, limit: 1 });
  const guild = Array.isArray(rows) ? rows[0] : null;
  if (!guild?.id) throw new Error(`Ludus Venatus (${SWGOH_GUILD_ID}) is not persisted in Supabase.`);
  return guild.id;
}

async function* readJsonLines(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${lineNumber}: invalid JSON (${error.message})`);
    }
  }
}

async function importDataset(store, guildId, config, directory, batchSize, dryRun) {
  const filePath = path.resolve(directory, config.file);
  if (!fs.existsSync(filePath)) throw new Error(`Missing extracted dataset: ${filePath}`);
  let batch = [];
  let imported = 0;
  const flush = async () => {
    if (!batch.length) return;
    if (!dryRun) await store.upsert(config.table, batch, { onConflict: config.conflict, returning: false });
    imported += batch.length;
    batch = [];
  };
  for await (const row of readJsonLines(filePath)) {
    if (row.source !== SOURCE) throw new Error(`${filePath}: unexpected source ${row.source}.`);
    batch.push({ ...row, guild_id: guildId });
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  if (!dryRun) {
    await store.update("guild_historical_dataset_coverage", {
      guild_id: `eq.${guildId}`,
      dataset_key: `eq.${config.key}`,
      source: `eq.${SOURCE}`,
    }, { import_status: "imported", updated_at: new Date().toISOString() }, { returning: false });
  }
  return imported;
}

async function main() {
  const options = parseArgs();
  const status = supabaseCoreStore.status();
  if (!options.dryRun && !status.configured) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for import. Use --dry-run to validate files without writing.");
  }
  const guildId = options.dryRun ? "00000000-0000-0000-0000-000000000000" : await resolveGuildId(supabaseCoreStore);
  let total = 0;
  for (const dataset of DATASETS) {
    const count = await importDataset(supabaseCoreStore, guildId, dataset, options.dir, options.batchSize, options.dryRun);
    total += count;
    console.log(`${dataset.key}: ${count.toLocaleString()} ${options.dryRun ? "validated" : "upserted"}`);
  }
  console.log(`Guild Intelligence historical observations: ${total.toLocaleString()} ${options.dryRun ? "validated" : "upserted"}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

export { DATASETS, importDataset, parseArgs };
