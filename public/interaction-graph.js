import { extractAbilitySemantics, summarizeUnitKit } from "./kit-semantics.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sentenceList(text) {
  return String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
}

function mentionPattern(label) {
  const escaped = escapeRegExp(label);
  if (String(label).length <= 4) return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`);
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
}

function audienceOf(sentence) {
  const lower = sentence.toLowerCase();
  const ally = /\b(ally|allies|friendly|team)\b/.test(lower);
  const enemy = /\b(enemy|enemies|opponent|opponents)\b/.test(lower);
  if (ally && !enemy) return "ally";
  if (enemy && !ally) return "enemy";
  if (ally && enemy) return "mixed";
  return "unknown";
}

function semanticAbility(ability) {
  return ability?.semantics ? ability : { ...ability, semantics: extractAbilitySemantics(ability) };
}

function relationKinds(ability, sentence) {
  const semantic = semanticAbility(ability);
  const semantics = semantic.semantics || {};
  const kinds = semantics.mechanics?.filter((item) => item?.sentence === sentence).map((item) => item.kind) || [];
  const output = [];
  if (kinds.includes("assist")) output.push("assist");
  if (kinds.includes("buff")) output.push("buff");
  if (kinds.includes("debuff")) output.push("debuff");
  if (kinds.includes("turn_meter_gain") || kinds.includes("turn_meter_remove") || kinds.includes("turn_meter_swap")) output.push("turn_meter");
  if (kinds.includes("revive")) output.push("revive");
  if (kinds.includes("cooldown_reduce") || kinds.includes("cooldown_increase")) output.push("cooldown");
  if (kinds.includes("summon")) output.push("summon");
  if (kinds.includes("dispel_enemy") || kinds.includes("dispel_ally")) output.push("dispel");
  if (kinds.includes("counter")) output.push("counter");
  if (kinds.includes("bonus_turn") || kinds.includes("bonus_attack")) output.push("bonus_action");
  if (semantics.abilityType === "leader") output.push("leader_scope");
  return unique(output);
}

export function buildMentionIndexes(catalog = {}) {
  const units = Array.isArray(catalog.units) ? catalog.units : [];
  const unitNames = units
    .filter((unit) => unit?.baseId && unit?.name)
    .map((unit) => ({ baseId: String(unit.baseId), name: String(unit.name), pattern: mentionPattern(unit.name) }))
    .sort((a, b) => b.name.length - a.name.length);

  const factionNames = unique(units.flatMap((unit) => unit?.factions || []))
    .map((name) => ({ name: String(name), pattern: mentionPattern(name) }))
    .sort((a, b) => b.name.length - a.name.length);

  return { unitNames, factionNames };
}

export function extractUnitInteractions(unit, indexes) {
  const interactions = [];
  for (const rawAbility of unit?.abilities || []) {
    const ability = semanticAbility(rawAbility);
    const description = String(ability?.description || "");
    for (const sentence of sentenceList(description)) {
      const audience = audienceOf(sentence);
      const relationTypes = relationKinds(ability, sentence);

      for (const candidate of indexes.unitNames) {
        if (candidate.baseId === String(unit.baseId)) continue;
        if (!candidate.pattern.test(sentence)) continue;
        interactions.push({
          sourceBaseId: String(unit.baseId),
          targetType: "unit",
          targetId: candidate.baseId,
          targetName: candidate.name,
          abilityId: String(ability?.id || ""),
          abilityName: String(ability?.name || ability?.id || ""),
          abilityType: String(ability?.semantics?.abilityType || "other"),
          audience,
          relationTypes,
          sentence,
          evidence: "localized-description",
        });
      }

      for (const faction of indexes.factionNames) {
        if (!faction.pattern.test(sentence)) continue;
        interactions.push({
          sourceBaseId: String(unit.baseId),
          targetType: "faction",
          targetId: faction.name,
          targetName: faction.name,
          abilityId: String(ability?.id || ""),
          abilityName: String(ability?.name || ability?.id || ""),
          abilityType: String(ability?.semantics?.abilityType || "other"),
          audience,
          relationTypes,
          sentence,
          evidence: "localized-description",
        });
      }
    }
  }

  const key = (item) => [item.targetType, item.targetId, item.abilityId, item.sentence].join("|");
  return [...new Map(interactions.map((item) => [key(item), item])).values()];
}

function interactionNode(unit, indexes, rawByBaseId = new Map()) {
  const kit = unit?.kit || summarizeUnitKit(unit);
  return {
    baseId: unit.baseId,
    name: unit.name,
    unitType: unit.unitType,
    factions: unit.factions || [],
    role: unit.role || "",
    mechanics: kit?.mechanicKinds || [],
    buffs: kit?.buffs || [],
    debuffs: kit?.debuffs || [],
    interactions: extractUnitInteractions(unit, indexes),
    rawGraphAvailable: Boolean(rawByBaseId.get(String(unit.baseId))?.abilities?.some((ability) => ability.status === "linked")),
  };
}

export function buildInteractionIndex(catalog = {}, rawEffectIndex = null, mentionCatalog = catalog) {
  const indexes = buildMentionIndexes(mentionCatalog);
  const rawByBaseId = new Map((rawEffectIndex?.units || []).map((unit) => [String(unit.baseId), unit]));
  const units = (catalog.units || []).map((unit) => interactionNode(unit, indexes, rawByBaseId));

  return {
    schemaVersion: 1,
    gameVersion: catalog.gameVersion || "",
    generatedAt: new Date().toISOString(),
    source: "localized kit semantics + optional raw effect graph evidence",
    unitCount: units.length,
    interactionCount: units.reduce((sum, unit) => sum + unit.interactions.length, 0),
    units,
  };
}

export function teamInteractionProfile(baseIds, interactionIndex) {
  const selected = new Set((baseIds || []).map(String));
  const unitMap = new Map((interactionIndex?.units || []).map((unit) => [String(unit.baseId), unit]));
  const team = [...selected].map((baseId) => unitMap.get(baseId)).filter(Boolean);
  const teamFactions = new Set(team.flatMap((unit) => unit.factions || []));
  const mechanicSources = new Map();
  const activeInteractions = [];

  for (const unit of team) {
    for (const mechanic of unit.mechanics || []) {
      if (!mechanicSources.has(mechanic)) mechanicSources.set(mechanic, []);
      mechanicSources.get(mechanic).push(unit.baseId);
    }
    for (const interaction of unit.interactions || []) {
      const active = interaction.targetType === "unit"
        ? selected.has(String(interaction.targetId))
        : interaction.targetType === "faction"
          ? teamFactions.has(interaction.targetId)
          : false;
      if (active) activeInteractions.push(interaction);
    }
  }

  return {
    baseIds: [...selected],
    foundUnitCount: team.length,
    mechanics: [...mechanicSources.entries()].map(([mechanic, sources]) => ({ mechanic, sources: unique(sources) })),
    activeInteractions,
    namedUnitLinks: activeInteractions.filter((item) => item.targetType === "unit"),
    factionLinks: activeInteractions.filter((item) => item.targetType === "faction"),
    evidenceBoundary: "Interaction links are explicit text references; counts are not a universal synergy or win score.",
  };
}

export function teamInteractionProfileFromCatalog(baseIds, catalog = {}) {
  const selected = new Set((baseIds || []).map(String));
  const indexes = buildMentionIndexes(catalog);
  const nodes = (catalog.units || []).filter((unit) => selected.has(String(unit.baseId))).map((unit) => interactionNode(unit, indexes));
  return teamInteractionProfile([...selected], { units: nodes });
}
