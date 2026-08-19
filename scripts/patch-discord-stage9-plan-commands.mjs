import { discordTbConfig } from '../discord-tb.mjs';
import {
  applyDiscordStage9TbCommandSchema,
  DISCORD_STAGE9_PLAN_SCHEMA_VERSION,
  DISCORD_STAGE9_TB_SUBCOMMANDS,
} from '../discord-stage9-command-schema.mjs';

const API_VERSION = 'v10';
const TIMEOUT_MS = 15_000;
const config = discordTbConfig(process.env);
const ifConfigured = process.argv.includes('--if-configured');
const softFail = process.argv.includes('--soft-fail');

function retryable(status) { return status === 429 || status >= 500; }
async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function discordRequest(pathname, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://discord.com/api/${API_VERSION}${pathname}`, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bot ${config.botToken}`,
          'Content-Type': 'application/json',
          'User-Agent': `SWGOH-Command-Center (stage9-plan-schema; ${DISCORD_STAGE9_PLAN_SCHEMA_VERSION})`,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const responseText = await response.text();
      let body = null;
      try { body = responseText ? JSON.parse(responseText) : null; } catch { body = responseText; }
      if (response.ok) return { body, attempt };
      const error = new Error(`Discord Stage 9 schema request failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.body = body;
      lastError = error;
      if (!retryable(response.status) || attempt === 3) break;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    }
    await sleep(500 * attempt);
  }
  throw lastError || new Error('Discord Stage 9 schema request failed.');
}

function missingStage9Subcommands(options = []) {
  const returned = new Set((Array.isArray(options) ? options : []).map((option) => String(option?.name || '').toLowerCase()));
  return DISCORD_STAGE9_TB_SUBCOMMANDS.map((row) => row.name).filter((name) => !returned.has(name));
}

async function patchStage9Schema() {
  const base = `/applications/${config.applicationId}/guilds/${config.pilotGuildId}/commands`;
  const listed = await discordRequest(base);
  const commands = Array.isArray(listed.body) ? listed.body : [];
  const tb = commands.find((command) => String(command?.name || '').toLowerCase() === 'tb');
  if (!tb?.id) throw new Error('Registered guild-scoped /tb command was not found after base command registration.');

  const patch = applyDiscordStage9TbCommandSchema(tb);
  if (!patch.changed) {
    const missing = missingStage9Subcommands(tb.options);
    if (missing.length) throw new Error(`Stage 9 schema reported unchanged but is missing: ${missing.join(', ')}.`);
    console.log(`Discord Stage 9 schema ${patch.schemaVersion} already present; all ${DISCORD_STAGE9_TB_SUBCOMMANDS.length} plan commands verified.`);
    return;
  }

  const updated = await discordRequest(`${base}/${tb.id}`, {
    method: 'PATCH',
    body: {
      name: patch.command.name,
      description: patch.command.description,
      options: patch.command.options,
    },
  });
  const options = Array.isArray(updated.body?.options) ? updated.body.options : [];
  const missing = missingStage9Subcommands(options);
  if (missing.length) {
    throw new Error(`Discord accepted the Stage 9 command update but returned a schema missing: ${missing.join(', ')}.`);
  }
  if (options.length > 25) throw new Error(`Discord /tb schema exceeds the 25-subcommand limit (${options.length}).`);
  console.log(`Discord Stage 9 schema ${patch.schemaVersion} patched on attempt ${updated.attempt}: ${patch.added.join(', ')}.`);
  console.log(`Verified all ${DISCORD_STAGE9_TB_SUBCOMMANDS.length} Stage 9 commands; /tb uses ${options.length}/25 subcommand slots.`);
}

if (!config.commandRegistrationConfigured) {
  const message = 'Stage 9 Discord schema patch requires DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, and DISCORD_DEFAULT_GUILD_ID.';
  if (ifConfigured) console.log(`Skipping Stage 9 Discord schema patch: ${message}`);
  else {
    console.error(message);
    process.exitCode = 1;
  }
} else {
  try {
    await patchStage9Schema();
  } catch (error) {
    const message = error?.message || 'Discord Stage 9 schema patch failed.';
    console.error(message);
    if (error?.body != null) console.error(typeof error.body === 'string' ? error.body : JSON.stringify(error.body, null, 2));
    if (!softFail) process.exitCode = 1;
    else console.error('Continuing startup with the last successfully registered Discord schema.');
  }
}
