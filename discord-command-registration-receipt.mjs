import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

export const DISCORD_TB_COMMAND_SCHEMA_VERSION = "2026-08-18-lifecycle-reports-v3";
const RECEIPT_VERSION = 1;
const RECEIPT_FILE = "discord-command-registration-v1.json";
const PUBLIC_RECEIPT_PATH = "/data/discord-command-registration.json";

function clean(value) {
  return String(value ?? "").trim();
}

function boolEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function isInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function receiptConfig(env = process.env) {
  const explicitDir = clean(env.SWGOH_STATE_DIR);
  const railwayMount = clean(env.RAILWAY_VOLUME_MOUNT_PATH);
  const railwayMountValid = Boolean(railwayMount && path.isAbsolute(railwayMount));
  const candidate = explicitDir || (railwayMountValid ? path.join(railwayMount, "swgoh-command-center") : "");
  const directory = candidate && path.isAbsolute(candidate) ? path.normalize(candidate) : "";
  const insideRailwayVolume = Boolean(directory && railwayMountValid && isInside(railwayMount, directory));
  const explicitlyConfirmedDurable = Boolean(explicitDir && boolEnv(env.SWGOH_STATE_STORAGE_CONFIRMED_DURABLE, false));
  const durable = Boolean(directory && (insideRailwayVolume || explicitlyConfirmedDurable));
  return Object.freeze({
    enabled: Boolean(directory),
    durable,
    directory,
    file: directory ? path.join(directory, RECEIPT_FILE) : "",
    source: explicitDir ? "SWGOH_STATE_DIR" : railwayMountValid ? "RAILWAY_VOLUME_MOUNT_PATH" : "none",
  });
}

function normalizeCommands(commands = []) {
  return (Array.isArray(commands) ? commands : [])
    .map((command) => ({
      id: clean(command?.id),
      name: clean(command?.name),
      version: clean(command?.version),
    }))
    .filter((command) => command.name)
    .slice(0, 20);
}

function validateReceipt(receipt = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Discord command registration receipt is invalid.");
  if (Number(receipt.receiptVersion) !== RECEIPT_VERSION) throw new Error("Unsupported Discord command registration receipt version.");
  if (clean(receipt.schemaVersion) !== DISCORD_TB_COMMAND_SCHEMA_VERSION) throw new Error("Discord command registration receipt schema version is stale.");
  if (!/^\d{16,22}$/.test(clean(receipt.guildId))) throw new Error("Discord command registration receipt Guild ID is invalid.");
  if (!/^\d{16,22}$/.test(clean(receipt.applicationId))) throw new Error("Discord command registration receipt application ID is invalid.");
  if (!Number.isFinite(Date.parse(receipt.registeredAt))) throw new Error("Discord command registration receipt timestamp is invalid.");
  if (!Array.isArray(receipt.commands) || !receipt.commands.length) throw new Error("Discord command registration receipt has no commands.");
  return receipt;
}

function buildReceipt(input = {}) {
  return validateReceipt({
    receiptVersion: RECEIPT_VERSION,
    schemaVersion: DISCORD_TB_COMMAND_SCHEMA_VERSION,
    registeredAt: new Date().toISOString(),
    guildId: clean(input.guildId),
    applicationId: clean(input.applicationId),
    attempt: Math.max(1, Number(input.attempt || 1)),
    commands: normalizeCommands(input.commands),
  });
}

export async function writeDiscordCommandRegistrationReceipt(input, env = process.env) {
  const config = receiptConfig(env);
  const receipt = buildReceipt(input);
  if (!config.enabled) return Object.freeze({ written: false, durable: false, reason: "state-directory-unavailable", receipt });
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await mkdir(config.directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(config.directory, `.discord-command-registration-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporary, payload, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, config.file);
  } finally {
    await unlink(temporary).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  }
  return Object.freeze({ written: true, durable: config.durable, file: RECEIPT_FILE, receipt });
}

export async function writePublicDiscordCommandRegistrationReceipt(receipt, options = {}) {
  const validated = validateReceipt(receipt);
  const publicRoot = path.resolve(options.publicRoot || path.join(process.cwd(), "public"));
  const target = path.resolve(publicRoot, `.${PUBLIC_RECEIPT_PATH}`);
  if (!isInside(publicRoot, target)) throw new Error("Discord registration public receipt path escaped the public root.");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const publicReceipt = {
    schemaVersion: validated.schemaVersion,
    registeredAt: validated.registeredAt,
    guildId: validated.guildId,
    applicationId: validated.applicationId,
    attempt: validated.attempt,
    commands: validated.commands.map((command) => ({ id: command.id, name: command.name, version: command.version })),
  };
  await writeFile(target, `${JSON.stringify(publicReceipt, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
  return Object.freeze({ written: true, path: PUBLIC_RECEIPT_PATH, receipt: publicReceipt });
}

export async function readDiscordCommandRegistrationReceipt(env = process.env) {
  const config = receiptConfig(env);
  if (!config.enabled) return null;
  try { return validateReceipt(JSON.parse(await readFile(config.file, "utf8"))); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

export function discordCommandRegistrationStatus(env = process.env) {
  const config = receiptConfig(env);
  const base = {
    expectedSchemaVersion: DISCORD_TB_COMMAND_SCHEMA_VERSION,
    receiptConfigured: config.enabled,
    receiptDurable: config.durable,
    receiptSource: config.source,
    registered: false,
    registeredAt: "",
    guildId: "",
    commandNames: [],
    publicReceiptPath: PUBLIC_RECEIPT_PATH,
  };
  if (!config.enabled) return Object.freeze(base);
  try {
    const receipt = validateReceipt(JSON.parse(readFileSync(config.file, "utf8")));
    return Object.freeze({ ...base, registered: true, registeredAt: receipt.registeredAt, guildId: receipt.guildId, commandNames: Object.freeze(receipt.commands.map((command) => command.name)), attempt: receipt.attempt });
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze(base);
    return Object.freeze({ ...base, error: clean(error?.message || "registration receipt unreadable") });
  }
}
