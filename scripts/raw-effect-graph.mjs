const EFFECT_SEMANTIC_MAP = new Map([
  ["DAMAGE", "damage"],
  ["RECOVER", "recover"],
  ["PARALYSIS", "control_effect"],
  ["CURSE", "negative_effect"],
  ["DISPELL", "dispel"],
  ["IMMUNITY", "immunity"],
  ["BONUS_MOVE", "bonus_move"],
  ["MODIFY_STAT", "stat_modify"],
  ["APPLY_EFFECT", "apply_effect"],
  ["DISTRIBUTE_RECOVERY", "recovery_distribution"],
  ["REVIVE_UNIT", "revive"],
  ["FLEE", "flee"],
  ["DESTROY", "instant_defeat"],
  ["REINFORCE", "reinforce"],
  ["GRANT_SHIELD", "shield"],
  ["GRANT_ABILITY", "grant_ability"],
  ["HEALTH_LIMIT", "health_limit"],
  ["BLACKBOARD_MODIFY", "state_modify"],
  ["STAT_LIMIT", "stat_limit"],
  ["SUMMON_UNIT", "summon"],
  ["MODIFY_ULTIMATE_CHARGE", "ultimate_charge"],
  ["MODIFY_DAMAGE", "damage_modify"],
  ["FORCE_ABILITY", "force_ability"],
  ["MODIFY_RECOVER", "recover_modify"],
  ["MODIFY_COOLDOWN", "cooldown_modify"],
  ["MODIFY_CATEGORY", "category_modify"],
  ["MODIFY_OWNERSHIP", "ownership_modify"],
  ["COPY_EFFECT", "copy_effect"],
  ["REPLACE_EFFECT", "replace_effect"],
]);

const DESCRIPTION_TO_RAW = new Map([
  ["damage", ["damage", "damage_modify"]],
  ["heal", ["recover", "recovery_distribution", "recover_modify"]],
  ["protection_recovery", ["recover", "recovery_distribution", "recover_modify", "shield"]],
  ["dispel_enemy", ["dispel"]],
  ["dispel_ally", ["dispel"]],
  ["revive", ["revive"]],
  ["instakill", ["instant_defeat"]],
  ["summon", ["summon"]],
  ["cooldown_reduce", ["cooldown_modify"]],
  ["cooldown_increase", ["cooldown_modify"]],
  ["bonus_turn", ["bonus_move"]],
]);

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const unique = (values) => [...new Set(values.filter((value) => value !== "" && value != null))];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function datasetRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "items", "values", "entries"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function idMap(payload, keys = ["id"]) {
  const map = new Map();
  for (const row of datasetRows(payload)) {
    const id = keys.map((key) => row?.[key]).find((value) => typeof value === "string" && value.trim());
    if (id) map.set(String(id), row);
  }
  return map;
}

export function invertEnums(payload) {
  const groups = payload?.data && isRecord(payload.data) ? payload.data : payload;
  const output = new Map();
  for (const [groupName, values] of Object.entries(groups || {})) {
    if (!isRecord(values)) continue;
    const reverse = new Map();
    for (const [name, rawValue] of Object.entries(values)) {
      const numeric = Number(rawValue);
      if (Number.isFinite(numeric)) reverse.set(numeric, name);
    }
    output.set(groupName, reverse);
  }
  return output;
}

export function enumName(enumIndex, group, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return typeof value === "string" ? value : "";
  return enumIndex.get(group)?.get(numeric) || String(numeric);
}

function refId(value) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return String(value.id || value.effectId || value.abilityId || value.skillId || value.referenceId || value.definitionId || "");
}

function explicitEffectRefs(ability) {
  return unique([
    ...asArray(ability?.effectReference).map(refId),
    ...asArray(ability?.effectReferenceList).map(refId),
    ...asArray(ability?.effects).map(refId),
  ]);
}

function knownReferenceStrings(value, knownIds, output = [], depth = 0) {
  if (depth > 8 || value == null) return output;
  if (typeof value === "string") {
    if (knownIds.has(value)) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const child of value) knownReferenceStrings(child, knownIds, output, depth + 1);
    return output;
  }
  if (!isRecord(value)) return output;
  for (const child of Object.values(value)) knownReferenceStrings(child, knownIds, output, depth + 1);
  return output;
}

function enumField(record, candidates) {
  for (const key of candidates) {
    if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
  }
  return null;
}

function compactScalarFields(record) {
  const allowed = /^(value|amount|chance|duration|max|min|multiplier|percent|priority|stack|limit|count|cooldown|stat|statId|categoryId|unitId|abilityId|targetRuleId|conditionType|effectType|type|applyType|damageType)$/i;
  const output = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (!allowed.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) output[key] = value;
  }
  return output;
}

export function normalizeRawEffect(effect, enumIndex, effectIds = new Set()) {
  const id = String(effect?.id || "");
  const effectType = enumName(enumIndex, "EffectType", enumField(effect, ["type", "effectType"]));
  const applyType = enumName(enumIndex, "EffectApplyType", enumField(effect, ["applyType", "effectApplyType"]));
  const damageType = enumName(enumIndex, "EffectDamageType", enumField(effect, ["damageType", "effectDamageType"]));
  const targetSide = enumName(enumIndex, "EffectTargetBattleSide", enumField(effect?.target || effect, ["battleSide", "targetBattleSide", "effectTargetBattleSide"]));
  const targetSelect = enumName(enumIndex, "EffectTargetUnitSelect", enumField(effect?.target || effect, ["unitSelect", "targetUnitSelect", "effectTargetUnitSelect"]));
  const conditionType = enumName(enumIndex, "ConditionType", enumField(effect?.trigger || effect?.condition || effect, ["conditionType", "triggerType"]));
  const semantic = EFFECT_SEMANTIC_MAP.get(effectType.replace(/^EffectType_/, "")) || "";
  const references = unique(knownReferenceStrings(effect, effectIds).filter((candidate) => candidate !== id));

  return {
    id,
    effectType,
    ...(semantic ? { semantic } : {}),
    ...(applyType && applyType !== "0" ? { applyType } : {}),
    ...(damageType && damageType !== "0" ? { damageType } : {}),
    ...(targetSide && targetSide !== "0" ? { targetSide } : {}),
    ...(targetSelect && targetSelect !== "0" ? { targetSelect } : {}),
    ...(conditionType && conditionType !== "0" ? { conditionType } : {}),
    ...(references.length ? { references } : {}),
    params: compactScalarFields(effect),
    source: "raw-effect-definition",
  };
}

function skillAbilityId(skill) {
  const value = skill?.abilityReference ?? skill?.abilityId ?? skill?.ability;
  return refId(value);
}

function resolveEffectGraph(rootEffectIds, effectMap, enumIndex, maxDepth = 12) {
  const effectIds = new Set(effectMap.keys());
  const visited = new Set();
  const queue = rootEffectIds.map((id) => ({ id, depth: 0 }));
  const nodes = [];
  const missing = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current?.id || visited.has(current.id)) continue;
    visited.add(current.id);
    const raw = effectMap.get(current.id);
    if (!raw) {
      missing.push(current.id);
      continue;
    }
    const node = normalizeRawEffect(raw, enumIndex, effectIds);
    nodes.push({ ...node, depth: current.depth });
    if (current.depth >= maxDepth) continue;
    for (const next of node.references || []) queue.push({ id: next, depth: current.depth + 1 });
  }

  return { nodes, missing: unique(missing), truncated: nodes.some((node) => node.depth >= maxDepth) };
}

function rawSemanticKinds(nodes) {
  return unique(nodes.map((node) => node.semantic));
}

export function crossValidateDescriptionSemantics(descriptionSemantics, nodes) {
  const rawKinds = rawSemanticKinds(nodes);
  const descriptionKinds = unique(descriptionSemantics?.mechanicKinds || []);
  const confirmedDescriptionKinds = [];
  const descriptionOnly = [];

  for (const kind of descriptionKinds) {
    const compatible = DESCRIPTION_TO_RAW.get(kind) || [];
    if (compatible.length && compatible.some((candidate) => rawKinds.includes(candidate))) confirmedDescriptionKinds.push(kind);
    else descriptionOnly.push(kind);
  }

  return {
    rawSemanticKinds: rawKinds,
    descriptionKinds,
    confirmedDescriptionKinds,
    descriptionOnly,
    rawOnly: rawKinds.filter((kind) => ![...DESCRIPTION_TO_RAW.values()].flat().includes(kind) || !confirmedDescriptionKinds.some((descriptionKind) => (DESCRIPTION_TO_RAW.get(descriptionKind) || []).includes(kind))),
    evidenceLevel: nodes.length ? "raw-graph-present" : "description-only",
  };
}

export function buildRawEffectIndex({ catalog, skillsPayload, abilitiesPayload, effectsPayload, enumsPayload }) {
  const skillMap = idMap(skillsPayload, ["id", "skillId"]);
  const abilityMap = idMap(abilitiesPayload, ["id", "abilityId"]);
  const effectMap = idMap(effectsPayload, ["id", "effectId"]);
  const enumIndex = invertEnums(enumsPayload);
  const units = [];
  let missingSkillCount = 0;
  let missingAbilityCount = 0;
  let missingEffectCount = 0;

  for (const unit of catalog?.units || []) {
    const abilities = [];
    for (const catalogAbility of unit?.abilities || []) {
      const skillId = String(catalogAbility?.id || "");
      const skill = skillMap.get(skillId);
      if (!skill) {
        missingSkillCount += 1;
        abilities.push({ skillId, abilityName: catalogAbility?.name || skillId, status: "missing-skill" });
        continue;
      }
      const abilityId = skillAbilityId(skill);
      const ability = abilityMap.get(abilityId);
      if (!ability) {
        missingAbilityCount += 1;
        abilities.push({ skillId, abilityId, abilityName: catalogAbility?.name || skillId, status: "missing-ability" });
        continue;
      }
      const roots = explicitEffectRefs(ability);
      const graph = resolveEffectGraph(roots, effectMap, enumIndex);
      missingEffectCount += graph.missing.length;
      const validation = crossValidateDescriptionSemantics(catalogAbility?.semantics || {}, graph.nodes);
      abilities.push({
        skillId,
        abilityId,
        abilityName: catalogAbility?.name || abilityId,
        abilityType: catalogAbility?.semantics?.abilityType || "other",
        rootEffectIds: roots,
        effects: graph.nodes,
        missingEffectIds: graph.missing,
        graphTruncated: graph.truncated,
        validation,
        status: graph.nodes.length ? "linked" : roots.length ? "missing-effects" : "no-effect-roots",
      });
    }
    units.push({ baseId: unit.baseId, name: unit.name, unitType: unit.unitType, abilities });
  }

  const linkedAbilities = units.flatMap((unit) => unit.abilities).filter((ability) => ability.status === "linked").length;
  const totalAbilities = units.reduce((sum, unit) => sum + unit.abilities.length, 0);
  return {
    schemaVersion: 1,
    gameVersion: catalog?.gameVersion || "",
    generatedAt: new Date().toISOString(),
    source: "swgoh-utils/gamedata skill→ability→effect graph",
    methodology: "explicit references plus raw enum decoding; no win-rate inference",
    coverage: {
      unitCount: units.length,
      totalAbilities,
      linkedAbilities,
      linkedPercent: totalAbilities ? Math.round((linkedAbilities / totalAbilities) * 10000) / 100 : 0,
      missingSkillCount,
      missingAbilityCount,
      missingEffectCount,
    },
    units,
  };
}
