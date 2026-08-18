const CATALOG_URLS = Object.freeze({
  sets: "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/datacronSet.json",
  templates: "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/datacronTemplate.json",
  affixes: "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/datacronAffixTemplateSet.json",
  targeting: "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/battleTargetingRule.json",
});

let catalogPromise = null;

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function dataOf(payload) { return Array.isArray(payload) ? payload : asArray(payload?.data); }

function humanize(value) {
  return clean(value)
    .replace(/^DATACRON_SET_/i, "Set ")
    .replace(/_NAME$/i, "")
    .replace(/^icon_stat_/i, "")
    .replace(/^alignment_/i, "")
    .replace(/^role_/i, "")
    .replace(/^profession_/i, "")
    .replace(/^affiliation_/i, "")
    .replace(/^category_/i, "")
    .replace(/maxhealth/gi, "max health")
    .replace(/criticalchance/gi, "critical chance")
    .replace(/criticaldamage/gi, "critical damage")
    .replace(/armorpenetration/gi, "armor penetration")
    .replace(/specialpenetration/gi, "special penetration")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isoTime(value) {
  const numeric = finite(value);
  if (numeric === null || numeric <= 0) return null;
  const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function targetCategories(rule = {}) {
  const entries = [];
  const add = (entry, defaultExclude = false) => {
    if (typeof entry === "string") {
      if (clean(entry)) entries.push({ categoryId: clean(entry), exclude: defaultExclude });
      return;
    }
    const categoryId = clean(entry?.categoryId || entry?.id);
    if (categoryId) entries.push({ categoryId, exclude: entry?.exclude === true || defaultExclude });
  };
  for (const entry of asArray(rule?.category?.category)) add(entry);
  for (const entry of asArray(rule?.category?.categoryId)) add(entry);
  for (const entry of asArray(rule?.requiredCategory?.category)) add(entry);
  for (const entry of asArray(rule?.requiredCategory?.categoryId)) add(entry);

  const unique = new Map();
  for (const entry of entries) unique.set(`${entry.exclude ? "-" : "+"}${entry.categoryId}`, entry);
  return [...unique.values()];
}

function normalizeTargetRule(rule = {}) {
  const id = clean(rule?.id);
  if (!id) return null;
  const categories = targetCategories(rule);
  return Object.freeze({
    id,
    battleSide: finite(rule?.battleSide),
    unitSelect: finite(rule?.unitSelect),
    forceAlignments: Object.freeze(asArray(rule?.forceAlignment).map(Number).filter(Number.isFinite)),
    unitClasses: Object.freeze(asArray(rule?.unitClass).map(Number).filter(Number.isFinite)),
    includeCategories: Object.freeze(categories.filter((entry) => !entry.exclude).map((entry) => entry.categoryId)),
    excludeCategories: Object.freeze(categories.filter((entry) => entry.exclude).map((entry) => entry.categoryId)),
    includeLabels: Object.freeze(categories.filter((entry) => !entry.exclude).map((entry) => humanize(entry.categoryId))),
    excludeLabels: Object.freeze(categories.filter((entry) => entry.exclude).map((entry) => humanize(entry.categoryId))),
    excludeSelf: rule?.excludeSelf === true,
  });
}

function normalizeSet(set = {}) {
  const id = finite(set?.id);
  if (id === null) return null;
  const displayNameKey = clean(set?.displayName);
  return Object.freeze({
    id,
    displayNameKey,
    displayName: displayNameKey ? humanize(displayNameKey) : `Set ${id}`,
    expirationTime: isoTime(set?.expirationTimeMs),
    icon: clean(set?.icon),
    maxTier: asArray(set?.tier).reduce((max, tier) => Math.max(max, Number(tier?.id) || 0), 0),
  });
}

function normalizeAffix(templateSet = {}, affix = {}) {
  const abilityId = clean(affix?.abilityId);
  const targetRule = clean(affix?.targetRule);
  const statType = finite(affix?.statType);
  const statValueMin = finite(affix?.statValueMin);
  const statValueMax = finite(affix?.statValueMax);
  const scopeIcon = clean(affix?.scopeIcon);
  return Object.freeze({
    templateSetId: clean(templateSet?.id),
    tags: Object.freeze(asArray(affix?.tag).map((entry) => typeof entry === "string" ? clean(entry) : clean(entry?.id || entry?.tag)).filter(Boolean)),
    abilityId,
    targetRule,
    statType,
    statValueMin,
    statValueMax,
    minTier: finite(affix?.minTier),
    maxTier: finite(affix?.maxTier),
    scopeIcon,
    scopeLabel: scopeIcon ? humanize(scopeIcon) : "",
  });
}

function buildCatalog(payloads = {}) {
  const setPayload = payloads.sets || {};
  const templatePayload = payloads.templates || {};
  const affixPayload = payloads.affixes || {};
  const targetingPayload = payloads.targeting || {};

  const sets = new Map();
  for (const raw of dataOf(setPayload)) {
    const set = normalizeSet(raw);
    if (set) sets.set(String(set.id), set);
  }

  const templates = new Map();
  for (const raw of dataOf(templatePayload)) {
    const id = clean(raw?.id);
    if (!id) continue;
    templates.set(id, Object.freeze({
      id,
      setId: finite(raw?.setId),
      level: finite(raw?.level),
      affixTemplateSetId: clean(raw?.affixTemplateSetId),
      requiredUnitTier: finite(raw?.requiredUnitTier),
      requiredRelicTier: finite(raw?.requiredRelicTier),
    }));
  }

  const targetingRules = new Map();
  for (const raw of dataOf(targetingPayload)) {
    const rule = normalizeTargetRule(raw);
    if (rule) targetingRules.set(rule.id, rule);
  }

  const affixes = [];
  const abilityAffixes = new Map();
  for (const templateSet of dataOf(affixPayload)) {
    for (const raw of asArray(templateSet?.affix)) {
      const affix = normalizeAffix(templateSet, raw);
      affixes.push(affix);
      if (affix.abilityId) {
        if (!abilityAffixes.has(affix.abilityId)) abilityAffixes.set(affix.abilityId, []);
        abilityAffixes.get(affix.abilityId).push(affix);
      }
    }
  }

  const versions = Object.freeze({
    sets: clean(setPayload?.version),
    templates: clean(templatePayload?.version),
    affixes: clean(affixPayload?.version),
    targeting: clean(targetingPayload?.version),
  });
  const uniqueVersions = [...new Set(Object.values(versions).filter(Boolean))];
  return Object.freeze({
    versions,
    versionAligned: uniqueVersions.length <= 1,
    sets,
    templates,
    targetingRules,
    affixes: Object.freeze(affixes),
    abilityAffixes,
  });
}

function inPublishedRange(value, candidate) {
  if (value === null) return false;
  if (candidate?.statValueMin === null || candidate?.statValueMax === null) return false;
  return value >= candidate.statValueMin && value <= candidate.statValueMax;
}

function bestAffixMatch(raw = {}, catalog) {
  if (!catalog) return null;
  const abilityId = clean(raw?.abilityId);
  const targetRule = clean(raw?.targetRule);
  const statType = finite(raw?.statType);
  const statValue = finite(raw?.statValue);
  const tags = new Set(asArray(raw?.tags || raw?.tag).map(clean).filter(Boolean));
  let candidates;
  if (abilityId) {
    candidates = asArray(catalog?.abilityAffixes?.get(abilityId));
  } else {
    if (statType === null || statValue === null) return null;
    candidates = catalog.affixes.filter((entry) => entry.statType === statType && inPublishedRange(statValue, entry));
  }
  if (!candidates.length) return null;

  const scored = candidates.map((candidate) => {
    let score = 0;
    if (abilityId && candidate.abilityId === abilityId) score += 100;
    if (targetRule && candidate.targetRule === targetRule) score += 30;
    if (statType !== null && candidate.statType === statType) score += 20;
    if (statValue !== null && inPublishedRange(statValue, candidate)) score += 20;
    for (const tag of candidate.tags) if (tags.has(tag)) score += 4;
    return { candidate, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

function resolveAffix(raw = {}, catalog) {
  const match = bestAffixMatch(raw, catalog);
  const targetRuleId = clean(raw?.targetRule || match?.targetRule);
  const targetRule = targetRuleId ? catalog?.targetingRules?.get(targetRuleId) || null : null;
  return Object.freeze({
    match,
    targetRule,
    scopeLabel: clean(match?.scopeLabel),
    scopeIcon: clean(match?.scopeIcon),
    abilityDescriptionResolved: false,
  });
}

function resolveDatacron(raw = {}, catalog) {
  const set = catalog?.sets?.get(clean(raw?.setId)) || null;
  const template = catalog?.templates?.get(clean(raw?.templateId)) || null;
  return Object.freeze({ set, template });
}

async function fetchCatalogJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" }, cache: "force-cache" });
  if (!response.ok) throw new Error(`Datacron catalog returned HTTP ${response.status}.`);
  return response.json();
}

async function loadDatacronCatalog(fetchImpl = fetch) {
  if (!catalogPromise) {
    catalogPromise = Promise.all(Object.entries(CATALOG_URLS).map(async ([key, url]) => [key, await fetchCatalogJson(fetchImpl, url)]))
      .then((entries) => buildCatalog(Object.fromEntries(entries)))
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export {
  CATALOG_URLS,
  bestAffixMatch,
  buildCatalog,
  humanize,
  loadDatacronCatalog,
  normalizeTargetRule,
  resolveAffix,
  resolveDatacron,
};
