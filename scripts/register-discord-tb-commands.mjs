import { discordTbConfig } from "../discord-tb.mjs";
import {
  DISCORD_TB_COMMAND_SCHEMA_VERSION,
  writeDiscordCommandRegistrationReceipt,
  writePublicDiscordCommandRegistrationReceipt,
} from "../discord-command-registration-receipt.mjs";

const API_VERSION = "v10";
const SCHEMA_VERSION = DISCORD_TB_COMMAND_SCHEMA_VERSION;
const REGISTRATION_TIMEOUT_MS = 15_000;
const config = discordTbConfig(process.env);
const ifConfigured = process.argv.includes("--if-configured");
const softFail = process.argv.includes("--soft-fail");
const phaseChoices = ["P1", "P2", "P3", "P4", "P5", "P6"].map((phase) => ({ name: phase, value: phase }));
const preferenceChoices = [
  { name: "GIVE — favor this member as a donor", value: "give" },
  { name: "DEFAULT — clear the explicit override", value: "default" },
  { name: "KEEP — avoid this donor until necessary", value: "keep" },
];
const availabilityChoices = [
  { name: "AVAILABLE — include in normal ROTE planning", value: "available" },
  { name: "UNAVAILABLE — exclude from Operation donor candidates", value: "unavailable" },
];
const reservationChoices = [
  { name: "RESERVE — absolute Operation donor exclusion", value: "reserve" },
  { name: "CLEAR — remove the hard reservation", value: "clear" },
];

const optionalPhaseOption = {
  type: 3,
  name: "phase",
  description: "Optional ROTE phase scope",
  required: false,
  choices: phaseChoices,
};

const requiredPhaseOption = {
  type: 3,
  name: "phase",
  description: "ROTE phase to inspect",
  required: true,
  choices: phaseChoices,
};

function assertRequiredOptionsBeforeOptional(options = [], path = "command") {
  let sawOptionalParameter = false;
  for (const option of options) {
    const isSubcommand = option?.type === 1 || option?.type === 2;
    if (!isSubcommand) {
      if (option?.required === true) {
        if (sawOptionalParameter) {
          throw new Error(`Invalid Discord command schema at ${path}: required option '${option.name}' appears after an optional option.`);
        }
      } else sawOptionalParameter = true;
    }
    if (Array.isArray(option?.options)) assertRequiredOptionsBeforeOptional(option.options, `${path} ${option.name}`);
  }
}

function retryableStatus(status) { return status === 429 || status >= 500; }
async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function registerCommands(commands) {
  const endpoint = `https://discord.com/api/${API_VERSION}/applications/${config.applicationId}/guilds/${config.pilotGuildId}/commands`;
  let lastFailure = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${config.botToken}`,
          "Content-Type": "application/json",
          "User-Agent": `SWGOH-Command-Center (guild-tb-command-registration; ${SCHEMA_VERSION})`,
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(REGISTRATION_TIMEOUT_MS),
      });
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (response.ok) return { body, attempt };
      lastFailure = { status: response.status, body, message: `Discord command registration failed with HTTP ${response.status}.` };
      if (!retryableStatus(response.status) || attempt === 3) break;
    } catch (error) {
      lastFailure = {
        status: 0,
        body: null,
        message: error?.name === "TimeoutError" ? `Discord command registration timed out after ${REGISTRATION_TIMEOUT_MS}ms.` : error?.message || "Discord command registration request failed.",
      };
      if (attempt === 3) break;
    }
    await sleep(500 * attempt);
  }
  const error = new Error(lastFailure?.message || "Discord command registration failed.");
  error.status = lastFailure?.status || 0;
  error.body = lastFailure?.body;
  throw error;
}

function markRegistrationFailure(message) {
  if (softFail) {
    console.error(`Discord schema registration did not complete: ${message}`);
    console.error("Continuing web startup with the last successfully registered Discord schema.");
    return;
  }
  process.exitCode = 1;
}

const commands = [
  {
    type: 1,
    name: "tb",
    description: "SWGOH Territory Battle guild command",
    options: [
      { type: 1, name: "status", description: "Show the SWGOH Command Center TB integration status" },
      { type: 1, name: "me", description: "Show your own linked SWGOH player from the bound live guild roster" },
      {
        type: 1,
        name: "availability",
        description: "Read or change TB availability for your linked player or a guildmate",
        options: [
          { type: 6, name: "member", description: "Optional member target; normal members may target only themselves", required: false },
          { type: 3, name: "state", description: "Optional availability change; omit to read current status", required: false, choices: availabilityChoices },
        ],
      },
      {
        type: 1,
        name: "setup",
        description: "Durably bind this pilot server, channel, and optional officer role",
        options: [
          { type: 7, name: "channel", description: "Channel for future TB delivery; defaults to the current channel", required: false },
          { type: 8, name: "officer_role", description: "Role allowed to use officer read commands", required: false },
        ],
      },
      {
        type: 1,
        name: "link",
        description: "Officer-link a Discord member to a verified guild Ally Code",
        options: [
          { type: 6, name: "member", description: "Discord member to link", required: true },
          { type: 3, name: "ally_code", description: "9-digit SWGOH Ally Code; guild membership is checked against the bound roster", required: true, min_length: 9, max_length: 11 },
        ],
      },
      { type: 1, name: "unlink", description: "Remove a durable Discord-to-SWGOH player link", options: [{ type: 6, name: "member", description: "Discord member whose player link should be removed", required: true }] },
      { type: 1, name: "links", description: "Show durable Discord-to-SWGOH player links for this server" },
      {
        type: 1,
        name: "preference",
        description: "Set a GIVE/DEFAULT/KEEP unit preference for your linked player or a guildmate",
        options: [
          { type: 3, name: "unit", description: "Search SWGOH unit name or Base ID", required: true, autocomplete: true, min_length: 1, max_length: 80 },
          { type: 3, name: "preference", description: "Donation preference used by the mission-safe ROTE planner", required: true, choices: preferenceChoices },
          { type: 6, name: "member", description: "Optional member target; normal members may target only themselves", required: false },
        ],
      },
      { type: 1, name: "preferences", description: "Show durable GIVE/KEEP overrides used by the ROTE planner", options: [{ type: 6, name: "member", description: "Optional member scope; normal members may view only themselves", required: false }] },
      {
        type: 1,
        name: "ignore",
        description: "Self-service timed Operations ignore; use 0 days to unignore yourself",
        options: [
          { type: 4, name: "days", description: "Days to ignore yourself; use 0 to clear", required: true, min_value: 0, max_value: 365 },
          { type: 3, name: "reason", description: "Optional note for your Guild officers", required: false, max_length: 200 },
        ],
      },
      { type: 1, name: "unregister", description: "Unlink your own Discord account from your SWGOH player in this server" },
      { type: 1, name: "controls", description: "Officer summary of linked member availability and GIVE/KEEP controls", options: [{ type: 6, name: "member", description: "Optional linked member scope", required: false }] },
      {
        type: 1,
        name: "reserve",
        description: "Officer-set an absolute ROTE Operation donor reservation",
        options: [
          { type: 6, name: "member", description: "Linked Discord member whose unit should be reserved", required: true },
          { type: 3, name: "unit", description: "Search SWGOH unit name or Base ID", required: true, autocomplete: true, min_length: 1, max_length: 80 },
          requiredPhaseOption,
          { type: 3, name: "state", description: "Set or clear the hard reservation", required: true, choices: reservationChoices },
        ],
      },
      { type: 1, name: "reserves", description: "Officer-read active hard Operation donor reservations", options: [{ type: 6, name: "member", description: "Optional linked-member scope", required: false }, optionalPhaseOption] },
      { type: 1, name: "sync", description: "Force-refresh the pilot guild roster from the live SWGOH gateway" },
      { type: 1, name: "activity", description: "Show the persisted Guild Activity Command officer summary" },
      { type: 1, name: "phase", description: "Show the officer Phase Command Board summary for one ROTE phase", options: [requiredPhaseOption] },
      { type: 1, name: "assignments", description: "Preview the current mission-safe ROTE Operation assignment draft", options: [optionalPhaseOption] },
      { type: 1, name: "farms", description: "Show the highest-impact ROTE mission farms from the live guild roster", options: [optionalPhaseOption] },
    ],
  },
  {
    type: 1,
    name: "guild",
    description: "Officer Guild operations, registration, Discord delivery, and ROTE readiness",
    options: [
      { type: 1, name: "status", description: "Show Guild registration, ignored members, verified channels, and roster status" },
      {
        type: 1,
        name: "verify-channel",
        description: "Verify a Discord channel for Guild assignment delivery",
        options: [{ type: 7, name: "channel", description: "Channel to verify; defaults to the current channel", required: false }],
      },
      {
        type: 1,
        name: "unverify-channel",
        description: "Remove a Discord channel from Guild assignment delivery",
        options: [{ type: 7, name: "channel", description: "Channel to unverify; defaults to the current channel", required: false }],
      },
      {
        type: 1,
        name: "register-mates",
        description: "Preview or apply exact-safe Discord to SWGOH Guild-member matches",
        options: [{
          type: 3,
          name: "action",
          description: "Preview first, or apply only exact unique matches",
          required: false,
          choices: [
            { name: "Preview exact matches", value: "preview" },
            { name: "Apply exact unique matches", value: "apply" },
          ],
        }],
      },
      {
        type: 1,
        name: "ignore",
        description: "Officer-set timed ignore for a linked Guild member",
        options: [
          { type: 4, name: "days", description: "Days to ignore; use 0 to unignore", required: true, min_value: 0, max_value: 365 },
          { type: 6, name: "member", description: "Linked Discord member; defaults to yourself", required: false },
          { type: 3, name: "reason", description: "Optional officer note", required: false, max_length: 200 },
        ],
      },
      { type: 1, name: "donation-report", description: "Show Guild-wide GIVE/KEEP donation preference counts by member" },
      { type: 1, name: "sync", description: "Force-refresh the bound Guild from the live SWGOH gateway" },
      { type: 1, name: "platoon-report", description: "Show current ROTE Operations assignment coverage and shortages" },
    ],
  },
];

for (const command of commands) assertRequiredOptionsBeforeOptional(command.options, `/${command.name}`);

if (!config.commandRegistrationConfigured) {
  const message = "Discord command registration requires DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, and DISCORD_DEFAULT_GUILD_ID.";
  if (ifConfigured && !config.interactionsEnabled) console.log(`Skipping Discord schema registration because Discord interactions are disabled: ${message}`);
  else {
    console.error(message);
    markRegistrationFailure(message);
  }
} else {
  try {
    const result = await registerCommands(commands);
    const registered = Array.isArray(result.body) ? result.body : [];
    const receipt = await writeDiscordCommandRegistrationReceipt({ guildId: config.pilotGuildId, applicationId: config.applicationId, attempt: result.attempt, commands: registered });
    let publicReceipt = { written: false };
    if (ifConfigured) publicReceipt = await writePublicDiscordCommandRegistrationReceipt(receipt.receipt);
    console.log(`Discord schema ${SCHEMA_VERSION} registered in ${config.pilotGuildId} on attempt ${result.attempt}.`);
    console.log(`Registered ${registered.length} guild-scoped Discord command${registered.length === 1 ? "" : "s"}.`);
    console.log(receipt.written ? `Registration receipt persisted (${receipt.durable ? "durable" : "configured"} state).` : `Registration receipt not persisted (${receipt.reason}).`);
    if (publicReceipt.written) console.log(`Sanitized registration receipt exposed at ${publicReceipt.path}.`);
    for (const command of registered) console.log(`- /${command.name} (${command.id})`);
  } catch (error) {
    const message = error?.message || "Discord command registration failed.";
    console.error(message);
    if (error?.body != null) console.error(typeof error.body === "string" ? error.body : JSON.stringify(error.body, null, 2));
    markRegistrationFailure(message);
  }
}
