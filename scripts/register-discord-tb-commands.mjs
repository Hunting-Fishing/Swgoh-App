import { discordTbConfig } from "../discord-tb.mjs";

const API_VERSION = "v10";
const config = discordTbConfig(process.env);
const phaseChoices = ["P1", "P2", "P3", "P4", "P5", "P6"].map((phase) => ({ name: phase, value: phase }));
const preferenceChoices = [
  { name: "GIVE — favor this member as a donor", value: "give" },
  { name: "DEFAULT — clear the explicit override", value: "default" },
  { name: "KEEP — avoid this donor until necessary", value: "keep" },
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

if (!config.commandRegistrationConfigured) {
  console.error("Discord command registration requires DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, and DISCORD_DEFAULT_GUILD_ID.");
  process.exitCode = 1;
} else {
  const commands = [
    {
      type: 1,
      name: "tb",
      description: "SWGOH Territory Battle guild command",
      // Picker visibility stays broad in the pilot so a configured officer role can invoke the command.
      // Signed server-side authorization remains authoritative; role-specific Discord command overwrites
      // require a user OAuth Bearer token and are a later integration layer.
      options: [
        {
          type: 1,
          name: "status",
          description: "Show the SWGOH Command Center TB integration status",
        },
        {
          type: 1,
          name: "setup",
          description: "Durably bind this pilot server, channel, and optional officer role",
          options: [
            {
              type: 7,
              name: "channel",
              description: "Channel for future TB delivery; defaults to the current channel",
              required: false,
            },
            {
              type: 8,
              name: "officer_role",
              description: "Role allowed to use officer read commands",
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "link",
          description: "Officer-link a Discord member to a verified guild Ally Code",
          options: [
            {
              type: 6,
              name: "member",
              description: "Discord member to link",
              required: true,
            },
            {
              type: 3,
              name: "ally_code",
              description: "9-digit SWGOH Ally Code; guild membership is checked live",
              required: true,
              min_length: 9,
              max_length: 11,
            },
          ],
        },
        {
          type: 1,
          name: "unlink",
          description: "Remove a durable Discord-to-SWGOH player link",
          options: [
            {
              type: 6,
              name: "member",
              description: "Discord member whose player link should be removed",
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "links",
          description: "Show durable Discord-to-SWGOH player links for this server",
        },
        {
          type: 1,
          name: "preference",
          description: "Set a verified GIVE/DEFAULT/KEEP unit preference for a linked member",
          options: [
            {
              type: 6,
              name: "member",
              description: "Linked Discord member whose unit preference should change",
              required: true,
            },
            {
              type: 3,
              name: "unit",
              description: "SWGOH unit Base ID, for example JEDIKNIGHTCAL",
              required: true,
              min_length: 2,
              max_length: 80,
            },
            {
              type: 3,
              name: "preference",
              description: "Donation preference used by the mission-safe ROTE planner",
              required: true,
              choices: preferenceChoices,
            },
          ],
        },
        {
          type: 1,
          name: "preferences",
          description: "Show durable GIVE/KEEP overrides used by the ROTE planner",
          options: [
            {
              type: 6,
              name: "member",
              description: "Optional linked member scope",
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "sync",
          description: "Force-refresh the pilot guild roster from the live SWGOH gateway",
        },
        {
          type: 1,
          name: "phase",
          description: "Show the officer Phase Command Board summary for one ROTE phase",
          options: [requiredPhaseOption],
        },
        {
          type: 1,
          name: "assignments",
          description: "Preview the current mission-safe ROTE Operation assignment draft",
          options: [optionalPhaseOption],
        },
        {
          type: 1,
          name: "farms",
          description: "Show the highest-impact ROTE mission farms from the live guild roster",
          options: [optionalPhaseOption],
        },
      ],
    },
  ];

  const endpoint = `https://discord.com/api/${API_VERSION}/applications/${config.applicationId}/guilds/${config.pilotGuildId}/commands`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
      "User-Agent": "SWGOH-Command-Center (guild-tb-command-registration)",
    },
    body: JSON.stringify(commands),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    console.error(`Discord command registration failed with HTTP ${response.status}.`);
    console.error(body);
    process.exitCode = 1;
  } else {
    const registered = Array.isArray(body) ? body : [];
    console.log(`Registered ${registered.length} guild-scoped Discord command${registered.length === 1 ? "" : "s"} in ${config.pilotGuildId}.`);
    for (const command of registered) console.log(`- /${command.name} (${command.id})`);
  }
}
