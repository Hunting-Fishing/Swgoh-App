import { discordTbConfig } from "../discord-tb.mjs";

const API_VERSION = "v10";
const config = discordTbConfig(process.env);

const phaseOption = {
  type: 3,
  name: "phase",
  description: "Optional ROTE phase scope",
  required: false,
  choices: ["P1", "P2", "P3", "P4", "P5", "P6"].map((phase) => ({ name: phase, value: phase })),
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
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "status",
          description: "Show the SWGOH Command Center TB integration status",
        },
        {
          type: 1,
          name: "sync",
          description: "Force-refresh the pilot guild roster from the live SWGOH gateway",
        },
        {
          type: 1,
          name: "assignments",
          description: "Preview the current mission-safe ROTE Operation assignment draft",
          options: [phaseOption],
        },
        {
          type: 1,
          name: "farms",
          description: "Show the highest-impact ROTE mission farms from the live guild roster",
          options: [phaseOption],
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
