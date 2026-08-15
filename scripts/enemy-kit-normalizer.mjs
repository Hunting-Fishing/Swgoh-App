import { extractAbilitySemantics, summarizeUnitKit } from "../public/kit-semantics.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const unique = (values) => [...new Set(values.filter(Boolean))];

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "items", "values", "entries"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

export function localizationMap(value, depth = 0) {
  if (!isRecord(value) || depth > 5) return {};
  const direct = Object.entries(value).filter(([, child]) => typeof child === "string");
  if (direct.length > 100) return Object.fromEntries(direct);
  for (const key of ["data", "items", "values", "localization", "strings", "entries"]) {
    if (!isRecord(value[key])) continue;
    const nested = localizationMap(value[key], depth + 1);
    if (Object.keys(nested).length) return nested;
  }
  for (const child of Object.values(value)) {
    if (!isRecord(child)) continue;
    const nested = localizationMap(child, depth + 1);
    if (Object.keys(nested).length) return nested;
  }
  return {};
}

function humanize(value) {
  return String(value || "")
    .replace(/^(unit|skill|ability|category|affiliation|profession|role|alignment)_/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localize(strings, key, fallback = "") {
  const value = strings[String(key || "")];
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback || humanize(key);
}

function skillRefs(unit) {
  return asArray(unit?.skillReference).concat(asArray(unit?.skillReferenceList)).concat(asArray(unit?.skills));
}

function skillId(reference) {
  if (typeof reference === "string") return reference;
  return String(reference?.skillId || reference?.id || "");
}

function categories(unit) {
  return unique(asArray(unit?.categoryId).concat(asArray(unit?.categoryIdList)).map(String));
}

function factions(categoryIds) {
  return unique(categoryIds.filter((category) => /^(affiliation|profession)_/i.test(category)).map(humanize));
}

function normalizeEnemyAbility(reference, skillMap, strings) {
  const id = skillId(reference);
  if (!id) return null;
  const skill = skillMap.get(id) || {};
  const ability = {
    id,
    name: localize(strings, skill?.nameKey || reference?.nameKey, humanize(id)),
    description: localize(strings, skill?.descKey || skill?.descriptionKey || reference?.descKey, String(skill?.description || "")),
    type: humanize(skill?.abilityType || skill?.skillType || id.split("_")[0]),
    omicronMode: Number(skill?.omicronMode || 0),
  };
  ability.semantics = extractAbilitySemantics(ability);
  return ability;
}

function definitionId(unit) {
  return String(unit?.id || unit?.definitionId || unit?.unitDefId || "");
}

function baseId(unit) {
  return String(unit?.baseId || unit?.baseID || definitionId(unit).split(":")[0] || "");
}

function signatureOf(base, abilities) {
  const skillIds = abilities.map((ability) => ability.id).sort();
  return `${base}|${skillIds.join("+")}`;
}

export function normalizeEnemyCatalog({ unitsPayload, skillsPayload, localizationPayload }) {
  const strings = localizationMap(localizationPayload);
  const skillMap = new Map(rows(skillsPayload).map((skill) => [String(skill?.id || skill?.skillId || ""), skill]).filter(([id]) => id));
  const grouped = new Map();
  const definitionToSignature = {};

  for (const rawUnit of rows(unitsPayload)) {
    const defId = definitionId(rawUnit);
    const base = baseId(rawUnit);
    const combatType = Number(rawUnit?.combatType || 0);
    if (!defId || !base || ![1, 2].includes(combatType)) continue;
    const abilities = skillRefs(rawUnit).map((reference) => normalizeEnemyAbility(reference, skillMap, strings)).filter(Boolean);
    const signature = signatureOf(base, abilities);
    const categoryIds = categories(rawUnit);
    definitionToSignature[defId] = signature;

    const existing = grouped.get(signature);
    if (existing) {
      existing.definitionIds.push(defId);
      existing.variantCount += 1;
      continue;
    }

    const unit = {
      baseId: base,
      name: localize(strings, rawUnit?.nameKey, humanize(base)),
      description: localize(strings, rawUnit?.descKey, ""),
      unitType: combatType === 2 ? "Ship" : "Character",
      combatType,
      role: humanize(categoryIds.find((category) => /^role_/i.test(category)) || (combatType === 2 ? "Ship" : "Character")),
      factions: factions(categoryIds),
      categories: categoryIds,
      abilities,
    };
    unit.kit = summarizeUnitKit(unit);
    grouped.set(signature, {
      signature,
      baseId: base,
      name: unit.name,
      unitType: unit.unitType,
      role: unit.role,
      factions: unit.factions,
      categories: unit.categories,
      definitionIds: [defId],
      variantCount: 1,
      abilities,
      kit: unit.kit,
    });
  }

  const archetypes = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name) || a.signature.localeCompare(b.signature));
  const signatureToArchetypeId = new Map();
  const countsByBase = new Map();
  for (const archetype of archetypes) {
    const next = (countsByBase.get(archetype.baseId) || 0) + 1;
    countsByBase.set(archetype.baseId, next);
    archetype.archetypeId = `${archetype.baseId}#${next}`;
    signatureToArchetypeId.set(archetype.signature, archetype.archetypeId);
  }

  const definitionToArchetype = Object.fromEntries(Object.entries(definitionToSignature).map(([defId, signature]) => [defId, signatureToArchetypeId.get(signature)]));
  return {
    schemaVersion: 1,
    gameVersion: String(unitsPayload?.version || skillsPayload?.version || ""),
    generatedAt: new Date().toISOString(),
    source: "swgoh-utils/gamedata units_pve + skill + localization",
    methodology: "PVE definitions grouped by Base ID plus exact skill signature; every definition ID retained as an alias",
    definitionCount: Object.keys(definitionToArchetype).length,
    archetypeCount: archetypes.length,
    archetypes,
    definitionToArchetype,
  };
}

export function enemyArchetypeCatalog(enemyIndex) {
  return {
    gameVersion: enemyIndex?.gameVersion || "",
    units: (enemyIndex?.archetypes || []).map((archetype) => ({
      baseId: archetype.archetypeId,
      name: archetype.name,
      unitType: archetype.unitType,
      role: archetype.role,
      factions: archetype.factions,
      categories: archetype.categories,
      abilities: archetype.abilities,
      kit: archetype.kit,
    })),
  };
}
