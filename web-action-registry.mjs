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
  Object.freeze({
    key: 'tb-farm-plan',
    label: 'TB Farm Plan',
    commandAliases: Object.freeze(['/tb farms', '/tb farm']),
    category: 'Territory Battles',
    scope: 'player-in-guild',
    description: 'Build your personal ROTE farm queue from the current canonical Guild roster, rank Guild-impact upgrades, and show which farms also advance Journey Guide, Galactic Legend, or fleet prerequisites.',
    execution: 'website-native',
    discordRequired: false,
    implemented: true,
    resultType: 'tb-farm-plan',
    permissions: Object.freeze({ execute: 'verified-active-guild-member', sharePlayerPage: 'verified-player', shareGuildPage: 'active-guild-member', shareDiscord: 'guild-officer' }),
    shareTargets: Object.freeze(['player-page', 'guild-page', 'discord']),
    inputs: Object.freeze([
      Object.freeze({
        key: 'priorityMode', label: 'Prioritize by', type: 'select', default: 'guild-impact',
        options: Object.freeze([
          Object.freeze({ value: 'guild-impact', label: 'Guild TB impact' }),
          Object.freeze({ value: 'journey-overlap', label: 'Journey overlap' }),
          Object.freeze({ value: 'closest-upgrade', label: 'Closest upgrade' }),
        ]),
      }),
      Object.freeze({ key: 'maxRecommendations', label: 'Recommendations', type: 'integer', min: 5, max: 25, default: 12 }),
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
