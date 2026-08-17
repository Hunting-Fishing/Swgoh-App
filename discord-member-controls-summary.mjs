function clean(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function snowflake(value) {
  const text = clean(value);
  return /^\d{16,22}$/.test(text) ? text : "";
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function displayAllyCode(value) {
  const digits = allyCode(value);
  return digits ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : "unknown";
}

function preferencesFor(guild = {}, discordUserId = "") {
  return Object.values(guild?.memberPreferences && typeof guild.memberPreferences === "object" ? guild.memberPreferences : {})
    .filter((row) => snowflake(row?.discordUserId) === discordUserId)
    .filter((row) => ["give", "keep"].includes(clean(row?.preference).toLowerCase()))
    .map((row) => Object.freeze({
      baseId: clean(row.baseId).toUpperCase(),
      preference: clean(row.preference).toUpperCase(),
    }))
    .filter((row) => row.baseId)
    .sort((a, b) => a.preference.localeCompare(b.preference) || a.baseId.localeCompare(b.baseId));
}

export function buildDiscordMemberControlsSummary(guild = {}, options = {}) {
  const requestedDiscordUserId = snowflake(options.discordUserId);
  const links = Object.values(guild?.userLinks && typeof guild.userLinks === "object" ? guild.userLinks : {})
    .filter((row) => snowflake(row?.discordUserId) && allyCode(row?.swgohAllyCode))
    .filter((row) => !requestedDiscordUserId || snowflake(row.discordUserId) === requestedDiscordUserId)
    .sort((a, b) => String(a.discordUserId).localeCompare(String(b.discordUserId)));

  const members = links.map((link) => {
    const discordUserId = snowflake(link.discordUserId);
    const availabilityRow = guild?.memberAvailability?.[discordUserId];
    const unavailable = clean(availabilityRow?.availability).toLowerCase() === "unavailable";
    const preferences = preferencesFor(guild, discordUserId);
    return Object.freeze({
      discordUserId,
      allyCode: allyCode(link.swgohAllyCode),
      playerId: clean(link.playerId),
      availability: unavailable ? "UNAVAILABLE" : "AVAILABLE",
      preferences: Object.freeze(preferences),
      giveCount: preferences.filter((row) => row.preference === "GIVE").length,
      keepCount: preferences.filter((row) => row.preference === "KEEP").length,
    });
  });

  return Object.freeze({
    discordGuildId: snowflake(guild?.discordGuildId),
    scopedDiscordUserId: requestedDiscordUserId,
    linkedMembers: members.length,
    unavailableMembers: members.filter((row) => row.availability === "UNAVAILABLE").length,
    preferenceCount: members.reduce((sum, row) => sum + row.preferences.length, 0),
    giveCount: members.reduce((sum, row) => sum + row.giveCount, 0),
    keepCount: members.reduce((sum, row) => sum + row.keepCount, 0),
    members: Object.freeze(members),
  });
}

export function formatDiscordMemberControlsSummary(summary = {}) {
  const members = Array.isArray(summary.members) ? summary.members : [];
  const scope = summary.scopedDiscordUserId ? `<@${summary.scopedDiscordUserId}>` : "all linked members";
  const lines = [
    "**SWGOH Command Center · Member TB Controls**",
    `Scope: ${scope}`,
    `Linked: **${Number(summary.linkedMembers || 0)}** · Unavailable: **${Number(summary.unavailableMembers || 0)}** · Overrides: **${Number(summary.preferenceCount || 0)}** (${Number(summary.giveCount || 0)} GIVE / ${Number(summary.keepCount || 0)} KEEP)`,
  ];

  if (!members.length) {
    lines.push("", summary.scopedDiscordUserId
      ? "That Discord member does not have a durable SWGOH link in this server."
      : "No durable Discord ↔ SWGOH member links are configured yet.");
  } else {
    lines.push("");
    for (const member of members.slice(0, 20)) {
      const availability = member.availability === "UNAVAILABLE" ? "⛔ UNAVAILABLE" : "✅ AVAILABLE";
      lines.push(`**<@${member.discordUserId}> · ${displayAllyCode(member.allyCode)}** · ${availability}`);
      if (!member.preferences.length) {
        lines.push("↳ No GIVE/KEEP overrides");
      } else {
        const controls = member.preferences.slice(0, 8).map((row) => `${row.preference} ${row.baseId}`).join(" · ");
        lines.push(`↳ ${controls}${member.preferences.length > 8 ? ` · +${member.preferences.length - 8} more` : ""}`);
      }
    }
    if (members.length > 20) lines.push(`+${members.length - 20} more linked members`);
  }

  lines.push("", "_Officer read-only view. Mentions are suppressed; no member state was changed and no DMs were sent._");
  return lines.join("\n").slice(0, 1900);
}
