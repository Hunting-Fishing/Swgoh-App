import { discordTbConfig } from "../discord-tb.mjs";

const API_VERSION = "v10";
const config = discordTbConfig(process.env);

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
          description: "Show the Roster Command TB integration status",
        },
        {
          type: 1,
          name: "sync",
          description: "Request a guild roster refresh (scaffolded; not enabled yet)",
        },
        {
          type: 1,
          name: "assignments",
          description: "Show the current guild-safe ROTE assignment state (publishing next stage)",
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
      "User-Agent": "SWGOH-Roster-Command (guild-tb-command-registration)",
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
