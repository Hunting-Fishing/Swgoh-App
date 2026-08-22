const asArray = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

function tagText(value) {
  if (value && typeof value === 'object') {
    return clean(value.name || value.label || value.displayName || value.id || value.categoryId || value.tag);
  }
  return clean(value);
}

function normalizedTag(value) {
  return tagText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stripFactionDecorators(value) {
  let key = normalizedTag(value);
  for (const prefix of ['affiliation', 'faction', 'category', 'tag']) {
    if (key.startsWith(prefix)) {
      key = key.slice(prefix.length);
      break;
    }
  }
  if (key.startsWith('ls') || key.startsWith('ds')) key = key.slice(2);
  return key;
}

function unitTags(unit = {}) {
  return [
    ...asArray(unit.factions),
    ...asArray(unit.tags),
    ...asArray(unit.categories),
  ].map(tagText).filter(Boolean);
}

function unitFactionKeys(unit = {}) {
  return [...new Set(unitTags(unit).map(stripFactionDecorators).filter(Boolean))];
}

function unitHasFaction(unit = {}, faction = '') {
  const target = stripFactionDecorators(faction);
  return Boolean(target) && unitFactionKeys(unit).includes(target);
}

export {
  normalizedTag,
  stripFactionDecorators,
  tagText,
  unitFactionKeys,
  unitHasFaction,
  unitTags,
};
