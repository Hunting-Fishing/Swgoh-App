export const WEB_ACTION_REGISTRY = Object.freeze([
  Object.freeze({
    key: 'raid-max',
    label: 'Raid Max',
    commandAliases: Object.freeze(['/raid max', '/raidmax']),
    category: 'Raids',
    scope: 'player',
    description: 'Build up to five non-overlapping Order 66 raid attempts from your verified canonical roster using documented max-score team routes plus clearly labeled roster-only fallbacks.',
    execution: 'website-native',
    discordRequired: false,
    implemented: true,
    resultType: 'raid-team-plan',
    permissions: Object.freeze({ execute: 'verified-player', sharePlayerPage: 'verified-player', shareGuildPage: 'active-guild-member', shareDiscord: 'guild-officer' }),
    shareTargets: Object.freeze(['player-page', 'guild-page', 'discord']),
    inputs: Object.freeze([
      Object.freeze({ key: 'maxAttempts', label: 'Attempts', type: 'integer', min: 1, max: 5, default: 5 }),
    ]),
  }),
]);

export function publicWebActionCatalog() {
  return Object.freeze(WEB_ACTION_REGISTRY.filter((action) => action.implemented).map((action) => Object.freeze({ ...action })));
}

export function findWebAction(keyOrAlias) {
  const key = String(keyOrAlias ?? '').trim().toLowerCase();
  return WEB_ACTION_REGISTRY.find((action) => action.key === key || action.commandAliases.some((alias) => alias.toLowerCase() === key)) || null;
}
