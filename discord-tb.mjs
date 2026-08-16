import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_INTERACTION_BYTES = 1024 * 1024;
const EPHEMERAL_FLAG = 1 << 6;

export const DISCORD_INTERACTION_TYPES = Object.freeze({
  PING: 1,
  APPLICATION_COMMAND: 2,
});

export const DISCORD_RESPONSE_TYPES = Object.freeze({
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
});

function boolEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function clean(value) {
  return String(value || "").trim();
}

function snowflake(value) {
  const text = clean(value);
  return /^\d{16,22}$/.test(text) ? text : "";
}

export function discordTbConfig(env = process.env) {
  const applicationId = snowflake(env.DISCORD_APPLICATION_ID);
  const publicKey = clean(env.DISCORD_PUBLIC_KEY).toLowerCase();
  const botToken = clean(env.DISCORD_BOT_TOKEN);
  const pilotGuildId = snowflake(env.DISCORD_DEFAULT_GUILD_ID);
  const interactionsEnabled = boolEnv(env.DISCORD_TB_INTERACTIONS_ENABLED, false);
  const deliveryEnabled = boolEnv(env.DISCORD_TB_DELIVERY_ENABLED, false);
  const validPublicKey = /^[0-9a-f]{64}$/.test(publicKey);

  return Object.freeze({
    applicationId,
    publicKey: validPublicKey ? publicKey : "",
    botToken,
    pilotGuildId,
    interactionsEnabled,
    deliveryEnabled,
    configured: Boolean(applicationId && validPublicKey),
    commandRegistrationConfigured: Boolean(applicationId && botToken && pilotGuildId),
  });
}

export function discordTbPublicStatus(env = process.env) {
  const config = discordTbConfig(env);
  return Object.freeze({
    enabled: config.interactionsEnabled,
    configured: config.configured,
    applicationIdConfigured: Boolean(config.applicationId),
    publicKeyConfigured: Boolean(config.publicKey),
    botTokenConfigured: Boolean(config.botToken),
    pilotGuildConfigured: Boolean(config.pilotGuildId),
    commandRegistrationConfigured: config.commandRegistrationConfigured,
    deliveryEnabled: config.deliveryEnabled,
    interactionsPath: "/api/discord/interactions",
    mode: "http-interactions",
  });
}

export function discordEd25519PublicKey(publicKeyHex) {
  const raw = Buffer.from(String(publicKeyHex || ""), "hex");
  if (raw.length !== 32) throw new Error("Discord public key must be a 32-byte Ed25519 key.");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export function verifyDiscordInteraction({ publicKey, signature, timestamp, rawBody }) {
  const signatureBytes = Buffer.from(String(signature || ""), "hex");
  if (signatureBytes.length !== 64) return false;
  if (!String(timestamp || "")) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  try {
    const key = discordEd25519PublicKey(publicKey);
    return cryptoVerify(
      null,
      Buffer.concat([Buffer.from(String(timestamp), "utf8"), body]),
      key,
      signatureBytes,
    );
  } catch {
    return false;
  }
}

export async function readDiscordInteractionBody(request, maxBytes = MAX_INTERACTION_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) {
      const error = new Error("Discord interaction body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function commandOptions(interaction = {}) {
  return Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
}

export function discordTbSubcommand(interaction = {}) {
  const option = commandOptions(interaction).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return String(option?.name || "status").toLowerCase();
}

function ephemeral(content) {
  return {
    type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: String(content || ""),
      flags: EPHEMERAL_FLAG,
      allowed_mentions: { parse: [] },
    },
  };
}

function statusMessage(interaction, config) {
  const guild = String(interaction?.guild_id || "Direct message / unknown guild");
  const lines = [
    "**SWGOH Roster Command · TB**",
    `HTTP interactions: ${config.interactionsEnabled ? "enabled" : "disabled"}`,
    `Guild: ${guild}`,
    `Pilot guild restriction: ${config.pilotGuildId || "not configured"}`,
    `Outbound delivery: ${config.deliveryEnabled ? "enabled" : "disabled"}`,
    "Guild roster and ROTE planning remain read-only from Discord in this scaffold.",
  ];
  return lines.join("\n");
}

export function handleDiscordTbCommand(interaction, config = discordTbConfig()) {
  if (String(interaction?.data?.name || "").toLowerCase() !== "tb") {
    return ephemeral("Unknown command. This application currently exposes `/tb` only.");
  }

  if (config.pilotGuildId && String(interaction?.guild_id || "") !== config.pilotGuildId) {
    return ephemeral("This TB command is currently restricted to the configured pilot Discord server.");
  }

  const subcommand = discordTbSubcommand(interaction);
  if (subcommand === "status") return ephemeral(statusMessage(interaction, config));
  if (subcommand === "sync") {
    return ephemeral("Guild sync is scaffolded but not enabled from Discord yet. Use the web app's Guild / TB workspace to refresh the live guild roster.");
  }
  if (subcommand === "assignments") {
    return ephemeral("Guild-safe ROTE assignments are available in the web app. Discord publishing will be enabled after guild↔Discord identity and officer authorization are persisted server-side.");
  }
  return ephemeral(`Unknown /tb subcommand: ${subcommand}`);
}

export async function handleDiscordInteractionRequest(request, response, env = process.env) {
  const config = discordTbConfig(env);
  if (!config.interactionsEnabled) {
    jsonResponse(response, 503, { error: "Discord TB interactions are disabled." });
    return true;
  }
  if (!config.configured) {
    jsonResponse(response, 503, { error: "Discord TB interactions are not configured." });
    return true;
  }

  let rawBody;
  try {
    rawBody = await readDiscordInteractionBody(request);
  } catch (error) {
    jsonResponse(response, error?.status === 413 ? 413 : 400, { error: error?.message || "Invalid Discord interaction body." });
    return true;
  }

  const signature = request.headers["x-signature-ed25519"];
  const timestamp = request.headers["x-signature-timestamp"];
  const verified = verifyDiscordInteraction({
    publicKey: config.publicKey,
    signature,
    timestamp,
    rawBody,
  });
  if (!verified) {
    jsonResponse(response, 401, { error: "Invalid Discord interaction signature." });
    return true;
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    jsonResponse(response, 400, { error: "Discord interaction body is not valid JSON." });
    return true;
  }

  if (Number(interaction?.type) === DISCORD_INTERACTION_TYPES.PING) {
    jsonResponse(response, 200, { type: DISCORD_RESPONSE_TYPES.PONG });
    return true;
  }

  if (Number(interaction?.type) !== DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND) {
    jsonResponse(response, 200, ephemeral("Unsupported Discord interaction type."));
    return true;
  }

  jsonResponse(response, 200, handleDiscordTbCommand(interaction, config));
  return true;
}
