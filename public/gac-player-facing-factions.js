const PLAYER_FACTIONS = Object.freeze([
  '501st',
  'Bad Batch',
  'Bounty Hunter',
  'Clone Trooper',
  'Constable',
  'Droid',
  'Empire',
  'Ewok',
  'First Order',
  'Fleet Commander',
  'Galactic Legend',
  'Galactic Republic',
  'Geonosian',
  'Gungan',
  'Hutt Cartel',
  'Imperial Remnant',
  'Imperial Trooper',
  'Inquisitorius',
  'Jawa',
  'Jedi',
  'Jedi Vanguard',
  'Mandalorian',
  'Mercenary',
  'New Republic',
  'Nightsister',
  'Old Republic',
  'Phoenix',
  'Pirate',
  'Rebel',
  'Rebel Fighter',
  'Resistance',
  'Rogue One',
  'Scoundrel',
  'Separatist',
  'Sith',
  'Sith Empire',
  'Smuggler',
  'Spectre',
  'Tusken',
  'Unaligned Force User',
  'Wookiee',
]);

const INTERNAL_PREFIXES = Object.freeze([
  'conq',
  'specialmission',
  'teamup',
  'combatquest',
  'challenge',
  'tutorial',
  'datacron',
  'eventonly',
]);

const NORMALIZED_FACTIONS = new Map(
  PLAYER_FACTIONS.map((label) => [normalizeTag(label), label]),
);

const ALIASES = new Map([
  ['jawas', 'Jawa'],
  ['droids', 'Droid'],
  ['ewoks', 'Ewok'],
  ['geonosians', 'Geonosian'],
  ['gungans', 'Gungan'],
  ['tuskens', 'Tusken'],
  ['wookiees', 'Wookiee'],
  ['bountyhunters', 'Bounty Hunter'],
  ['clonetroopers', 'Clone Trooper'],
  ['imperialtroopers', 'Imperial Trooper'],
  ['rebelfighters', 'Rebel Fighter'],
  ['unalignedforceusers', 'Unaligned Force User'],
]);

function clean(value) {
  return String(value ?? '').trim();
}

function tagText(value) {
  if (value && typeof value === 'object') {
    return clean(value.name || value.label || value.displayName || value.id || value.categoryId || value.tag);
  }
  return clean(value);
}

function normalizeTag(value) {
  return tagText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stripKnownPrefix(key) {
  let value = key;
  for (const prefix of ['species', 'affiliation', 'profession', 'faction', 'category', 'tag']) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }
  if (key.startsWith('species')) value = value.replace(/(?:ls|ds)$/i, '');
  return value;
}

function canonicalFaction(value) {
  const key = normalizeTag(value);
  if (!key) return '';
  if (INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix))) return '';
  if (['lightside', 'darkside', 'neutral', 'human', 'leader', 'attacker', 'support', 'tank', 'healer'].includes(key)) return '';

  if (NORMALIZED_FACTIONS.has(key)) return NORMALIZED_FACTIONS.get(key);
  if (ALIASES.has(key)) return ALIASES.get(key);

  const stripped = stripKnownPrefix(key);
  if (NORMALIZED_FACTIONS.has(stripped)) return NORMALIZED_FACTIONS.get(stripped);
  if (ALIASES.has(stripped)) return ALIASES.get(stripped);
  return '';
}

function unitPlayerFactions(unit = {}) {
  const raw = [
    ...(Array.isArray(unit?.factions) ? unit.factions : []),
    ...(Array.isArray(unit?.tags) ? unit.tags : []),
    ...(Array.isArray(unit?.categories) ? unit.categories : []),
  ];
  return [...new Set(raw.map(canonicalFaction).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export { PLAYER_FACTIONS, canonicalFaction, unitPlayerFactions };
