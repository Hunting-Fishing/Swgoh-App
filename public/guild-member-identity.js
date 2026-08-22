const clean = (value) => String(value ?? '').trim();

const GUILD_ROLE_BY_LEVEL = Object.freeze({
  2: 'Member',
  3: 'Officer',
  4: 'Guild Leader',
});

function normalizedRoleText(value) {
  const raw = clean(value);
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) return '';
  if (key.includes('leader')) return 'Guild Leader';
  if (key.includes('officer')) return 'Officer';
  if (key === 'member' || key.endsWith('member')) return 'Member';
  return '';
}

function guildMemberRole(member = {}) {
  const direct = normalizedRoleText(member.memberRole || member.guildRole || member.role);
  if (direct) return direct;
  const level = Number(member.memberLevel ?? member.guildMemberLevel);
  return Number.isInteger(level) ? (GUILD_ROLE_BY_LEVEL[level] || `Rank ${level}`) : 'Member';
}

function guildRoleRank(role) {
  const normalized = normalizedRoleText(role) || clean(role);
  if (normalized === 'Guild Leader') return 0;
  if (normalized === 'Officer') return 1;
  if (normalized === 'Member') return 2;
  return 3;
}

function isGuildLeadership(member = {}) {
  const role = guildMemberRole(member);
  return role === 'Guild Leader' || role === 'Officer';
}

function playerPortraitId(member = {}) {
  return clean(member.playerPortrait || member.profilePortrait || member.portraitId || member.selectedPlayerPortrait?.id);
}

function playerPortraitUrl(member = {}) {
  const direct = clean(member.playerPortraitUrl || member.profilePortraitUrl || member.portraitUrl || member.selectedPlayerPortrait?.icon);
  if (!direct) return '';
  if (direct.startsWith('/')) return direct;
  return '';
}

function playerProfileTitle(member = {}) {
  return clean(member.profileTitle || member.playerTitle || member.title || member.selectedPlayerTitle?.name);
}

export {
  GUILD_ROLE_BY_LEVEL,
  guildMemberRole,
  guildRoleRank,
  isGuildLeadership,
  normalizedRoleText,
  playerPortraitId,
  playerPortraitUrl,
  playerProfileTitle,
};
