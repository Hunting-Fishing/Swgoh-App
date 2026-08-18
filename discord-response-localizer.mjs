import { t } from './discord-i18n.mjs';

const text = (value) => String(value ?? '');

function replaceAllSafe(source, from, to) {
  return source.includes(from) ? source.split(from).join(to) : source;
}

function translateCommon(source, locale) {
  let out = text(source);
  out = replaceAllSafe(out, 'SWGOH Command Center', t(locale, 'common.commandCenter'));
  const replacements = [
    ['Guild GP:', `${t(locale, 'guild.gp')}:`],
    ['Members:', `${t(locale, 'guild.members')}:`],
    ['Canonical sync:', `${t(locale, 'guild.canonicalSync')}:`],
    ['Discord links:', `${t(locale, 'guild.discordLinks')}:`],
    ['Unregistered:', `${t(locale, 'guild.unregistered')}:`],
    ['Ignored now:', `${t(locale, 'guild.ignoredNow')}:`],
    ['Verified channels:', `${t(locale, 'guild.verifiedChannels')}:`],
    ['**Ignored / unavailable**', `**${t(locale, 'guild.ignoredUnavailable')}**`],
    ['**Unregistered Discord links**', `**${t(locale, 'guild.unregisteredLinks')}**`],
    ['**Registration:** all current Guild members are linked to Discord.', `**${t(locale, 'guild.registrationComplete')}**`],
    ['_Read-only status. Mentions are suppressed._', `_${t(locale, 'guild.readOnly')}_`],
    ['Channel Verified', t(locale, 'guild.channelVerified')],
    ['Channel Unverified', t(locale, 'guild.channelUnverified')],
    ['Guild-Mate Registration', t(locale, 'guild.registrationTitle')],
    ['Mode:', `${t(locale, 'guild.mode')}:`],
    ['Exact unique:', `${t(locale, 'guild.exactUnique')}:`],
    ['Ambiguous:', `${t(locale, 'guild.ambiguous')}:`],
    ['Unmatched Discord:', `${t(locale, 'guild.unmatchedDiscord')}:`],
    ['Applied:', `${t(locale, 'guild.applied')}:`],
    ['No new exact-name matches were found.', t(locale, 'guild.noExactMatches')],
    ['_Only one exact normalized name match is eligible. Fuzzy and ambiguous matches are never auto-linked._', `_${t(locale, 'guild.matchSafety')}_`],
    ['Timed Ignore Set', t(locale, 'guild.timedIgnoreSet')],
    ['Ignore Cleared', t(locale, 'guild.ignoreCleared')],
    ['Expiry:', `${t(locale, 'guild.expiry')}:`],
    ['Donation Preferences', t(locale, 'guild.donationTitle', { guild: '' }).trim()],
    ['Members with preferences:', `${t(locale, 'guild.preferenceMembers')}:`],
    ['Unit overrides:', `${t(locale, 'guild.unitOverrides')}:`],
    ['No explicit GIVE/KEEP preferences are currently stored.', t(locale, 'guild.noPreferences')],
    ['_Report merges canonical Command Center preferences with durable Discord preferences; duplicate member/unit overrides are counted once._', `_${t(locale, 'guild.preferenceReportNote')}_`],
    ['Guild Sync Complete', t(locale, 'guild.syncComplete')],
    ['Source:', `${t(locale, 'guild.source')}:`],
    ['binding:', `${t(locale, 'guild.binding')}:`],
    ['Platoon Report', t(locale, 'guild.platoonReport', { guild: '' }).trim()],
    ['Assignments:', `${t(locale, 'guild.assignments')}:`],
    ['Unfilled:', `${t(locale, 'guild.unfilled')}:`],
    ['Protected units:', `${t(locale, 'guild.protectedUnits')}:`],
    ['Planner controls:', `${t(locale, 'guild.plannerControls')}:`],
    [' preferences', ` ${t(locale, 'guild.preferences')}`],
    [' unavailable', ` ${t(locale, 'guild.unavailable')}`],
    [' hard reserves', ` ${t(locale, 'guild.hardReserves')}`],
    ['**Officer attention — unfilled requirements**', `**${t(locale, 'guild.officerAttention')}**`],
    ['✅ All currently scoped Operation requirements have legal donor assignments.', `✅ ${t(locale, 'guild.allLegal')}`],
    ['_Mission protections and hard reserves remain authoritative._', `_${t(locale, 'guild.safetyAuthoritative')}_`],
    ['Verified destinations disabled:', `${t(locale, 'guild.destinationsDisabled')}:`],
    ['Scheduled Operations paused:', `${t(locale, 'guild.schedulesPaused')}:`],
    ['Discord player links cleared:', `${t(locale, 'guild.linksCleared')}:`],
    ['Discord hard reserves cleared:', `${t(locale, 'guild.reservesCleared')}:`],
    ['**Preserved:** canonical Guild Intelligence/history, saved TB/TW plans and assignment runs, delivery receipts, and Operations audit history.', `**${t(locale, 'guild.preserved')}**`],
    ['This Discord server is now fail-closed and cannot use the pilot Guild fallback.', t(locale, 'guild.fallbackBlocked')],
  ];
  for (const [from, to] of replacements) out = replaceAllSafe(out, from, to);
  return out;
}

export function localizeGuildOperationalText(source, locale) {
  let out = translateCommon(source, locale);
  out = out.replace(/\*\*(.+?) Guild Status\*\*/g, (_m, guild) => `**${t(locale, 'guild.statusTitle', { guild })}**`);
  out = out.replace(/\*\*(.+?) Donation Preferences\*\*/g, (_m, guild) => `**${t(locale, 'guild.donationTitle', { guild })}**`);
  out = out.replace(/\*\*(.+?) Platoon Report\*\*/g, (_m, guild) => `**${t(locale, 'guild.platoonReport', { guild })}**`);
  out = out.replace(/\*\*(.+?) Discord Integration Unregistered\*\*/g, (_m, guild) => `**${t(locale, 'guild.unregisterTitle', { guild })}**`);
  return out;
}

export function localizePlayerLifecycleText(source, locale) {
  let out = translateCommon(source, locale);
  const replacements = [
    ['Your Timed Ignore', t(locale, 'player.timedIgnoreTitle')],
    ['Your Ignore Cleared', t(locale, 'player.ignoreClearedTitle')],
    ['Officer Control Remains', t(locale, 'player.officerControlTitle')],
    ['Player Unregistered', t(locale, 'player.unregisterTitle')],
    ['Canonical Guild history and your Command Center account data were not deleted.', t(locale, 'player.unregisterPreserved')],
    ['An officer-managed Operations control for this player remains in force and was not removed.', t(locale, 'player.officerControlPreserved')],
    ['Contact an officer if the dates need to change.', t(locale, 'player.contactOfficer')],
  ];
  for (const [from, to] of replacements) out = replaceAllSafe(out, from, to);
  return out;
}
