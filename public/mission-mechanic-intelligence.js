import { extractAbilitySemantics, summarizeUnitKit } from "./kit-semantics.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const normalized = (value) => String(value || "").trim().toLowerCase();

const REQUIREMENTS = Object.freeze([
  { id: "stun", label: "Reliable Stun", patterns: [/\bstun\b/i], evidence: { debuff: "Stun" } },
  { id: "ability_block", label: "Ability Block", patterns: [/\bability block\b/i], evidence: { debuff: "Ability Block" } },
  { id: "daze", label: "Daze", patterns: [/\bdaze\b/i], evidence: { debuff: "Daze" } },
  { id: "shock", label: "Shock", patterns: [/\bshock\b/i], evidence: { debuff: "Shock" } },
  { id: "buff_immunity", label: "Buff Immunity", patterns: [/\bbuff immunity\b/i], evidence: { debuff: "Buff Immunity" } },
  { id: "healing_immunity", label: "Healing Immunity", patterns: [/\bhealing immunity\b/i], evidence: { debuff: "Healing Immunity" } },
  { id: "dispel_enemy", label: "Enemy Buff Dispel", patterns: [/\bdispel\b[^.]{0,40}\b(enemy|buff)/i, /\bremove all buffs\b/i], evidence: { mechanic: "dispel_enemy" } },
  { id: "cleanse", label: "Ally Cleanse", patterns: [/\bcleanse\b/i, /\bremove (?:all )?debuffs?\b/i], evidence: { mechanic: "dispel_ally" } },
  { id: "tm_remove", label: "Turn Meter Removal", patterns: [/\b(remove|reduce|drain)\b[^.]{0,50}\bturn meter\b/i], evidence: { mechanic: "turn_meter_remove" } },
  { id: "revive", label: "Revive", patterns: [/\brevive\b/i], evidence: { mechanic: "revive" } },
  { id: "prevent_revive", label: "Prevent Revive", patterns: [/\bprevent[^.]{0,30}reviv/i, /\bcannot be revived\b/i], evidence: { mechanic: "prevent_revive" } },
  { id: "heal", label: "Healing", patterns: [/\b(heal|recover health|restore health)\b/i], evidence: { mechanic: "heal" } },
  { id: "protection_recovery", label: "Protection Recovery", patterns: [/\b(recover|restore|regain)[^.]{0,40}\bprotection\b/i], evidence: { mechanic: "protection_recovery" } },
  { id: "assist", label: "Assist Engine", patterns: [/\bassist\b/i], evidence: { mechanic: "assist" } },
  { id: "counter", label: "Counterattacks", patterns: [/\bcounter(?:attack| chance)?\b/i], evidence: { mechanic: "counter" } },
]);

const STRONG_REQUIREMENT = /\b(must|required|requires|need|needed|important|materially important|cannot be defeated unless|necessary|key to|essential)\b/i;
const HAZARDS = Object.freeze([
  { id: "avoid_crit", label: "Critical-hit hazard", patterns: [/\bavoid[^.]{0,40}crit/i, /\bpunish(?:es|ed)?[^.]{0,40}critical/i, /\bwhen (?:an enemy|enemies|they) (?:score|scores|deal|deals|receive|receives) a critical hit/i] },
  { id: "avoid_tm_gain", label: "Turn Meter gain hazard", patterns: [/\bpunish(?:es|ed)?[^.]{0,50}turn meter/i, /\bwhen[^.]{0,40}gain(?:s)? turn meter/i] },
  { id: "revive_hazard", label: "Enemy revive mechanic", patterns: [/\benem(?:y|ies)[^.]{0,50}\brevive/i, /\brevives?[^.]{0,40}\benem/i] },
]);

function allMissionMechanicText(mission = {}) {
  return [...(mission.mechanics || []), ...(mission.strategy || [])].map(String).filter(Boolean);
}

export function parseMissionMechanicContract(mission = {}) {
  const notes = allMissionMechanicText(mission);
  const requirements = [];
  const hazards = [];
  const informational = [];

  for (const note of notes) {
    let classified = false;
    for (const hazard of HAZARDS) {
      if (!hazard.patterns.some((pattern) => pattern.test(note))) continue;
      hazards.push({ id: hazard.id, label: hazard.label, note, evidence: "mission-note-explicit" });
      classified = true;
    }
    for (const requirement of REQUIREMENTS) {
      if (!requirement.patterns.some((pattern) => pattern.test(note))) continue;
      if (!STRONG_REQUIREMENT.test(note)) continue;
      requirements.push({ id: requirement.id, label: requirement.label, note, evidence: requirement.evidence, source: "mission-note-explicit" });
      classified = true;
    }
    if (!classified) informational.push(note);
  }

  const byId = new Map();
  for (const requirement of requirements) if (!byId.has(requirement.id)) byId.set(requirement.id, requirement);
  const hazardById = new Map();
  for (const hazard of hazards) if (!hazardById.has(hazard.id)) hazardById.set(hazard.id, hazard);
  return { requirements: [...byId.values()], hazards: [...hazardById.values()], informational };
}

function semanticAbility(unit, ability) {
  const semantics = ability?.semantics || extractAbilitySemantics(ability);
  return { unit, ability, semantics };
}

export function buildTeamCapabilityIndex(members = []) {
  const rows = [];
  for (const member of members) {
    const unit = member?.staticUnit || member?.unit || member;
    if (!unit) continue;
    const abilities = Array.isArray(unit.abilities) ? unit.abilities : [];
    for (const ability of abilities) rows.push(semanticAbility(unit, ability));
  }

  const mechanics = new Map();
  const buffs = new Map();
  const debuffs = new Map();
  const add = (map, key, row) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ baseId: row.unit?.baseId || "", unitName: row.unit?.name || "Unknown", abilityId: row.ability?.id || "", abilityName: row.ability?.name || row.ability?.id || "Ability" });
  };

  for (const row of rows) {
    for (const mechanic of row.semantics?.mechanicKinds || []) add(mechanics, mechanic, row);
    for (const buff of row.semantics?.buffs || []) add(buffs, buff, row);
    for (const debuff of row.semantics?.debuffs || []) add(debuffs, debuff, row);
  }

  return { mechanics, buffs, debuffs };
}

function requirementSources(requirement, capabilities) {
  if (requirement.evidence?.mechanic) return capabilities.mechanics.get(requirement.evidence.mechanic) || [];
  if (requirement.evidence?.buff) return capabilities.buffs.get(requirement.evidence.buff) || [];
  if (requirement.evidence?.debuff) return capabilities.debuffs.get(requirement.evidence.debuff) || [];
  return [];
}

function enemyLookup(enemyKitIndex) {
  const byDefinition = new Map();
  const byBase = new Map();
  const byName = new Map();
  for (const archetype of enemyKitIndex?.archetypes || []) {
    for (const id of archetype.definitionIds || []) byDefinition.set(String(id), archetype);
    if (!byBase.has(normalized(archetype.baseId))) byBase.set(normalized(archetype.baseId), archetype);
    if (!byName.has(normalized(archetype.name))) byName.set(normalized(archetype.name), archetype);
  }
  return { byDefinition, byBase, byName };
}

export function resolveMissionEnemies(mission = {}, enemyKitIndex = null) {
  const refs = Array.isArray(mission.enemies) ? mission.enemies : [];
  if (!enemyKitIndex?.archetypes?.length || !refs.length) return { resolved: [], unresolved: refs.map(String) };
  const lookup = enemyLookup(enemyKitIndex);
  const resolved = [];
  const unresolved = [];
  for (const raw of refs) {
    const token = typeof raw === "string" ? raw : String(raw?.definitionId || raw?.baseId || raw?.name || "");
    const match = lookup.byDefinition.get(token) || lookup.byBase.get(normalized(token)) || lookup.byName.get(normalized(token));
    if (match) resolved.push(match);
    else if (token) unresolved.push(token);
  }
  return { resolved: [...new Map(resolved.map((item) => [item.archetypeId, item])).values()], unresolved };
}

function enemySignals(archetypes = []) {
  const signals = new Map();
  for (const enemy of archetypes) {
    const kit = enemy.kit || summarizeUnitKit(enemy);
    for (const mechanic of kit.mechanicKinds || []) {
      if (!signals.has(mechanic)) signals.set(mechanic, []);
      signals.get(mechanic).push(enemy.name);
    }
    for (const debuff of kit.debuffs || []) {
      const key = `debuff:${debuff}`;
      if (!signals.has(key)) signals.set(key, []);
      signals.get(key).push(enemy.name);
    }
  }
  return [...signals.entries()].map(([mechanic, enemies]) => ({ mechanic, enemies: unique(enemies) }));
}

export function analyzeMissionMechanicCoverage(mission, members, enemyKitIndex = null) {
  const contract = parseMissionMechanicContract(mission);
  const capabilities = buildTeamCapabilityIndex(members);
  const coverage = contract.requirements.map((requirement) => {
    const sources = requirementSources(requirement, capabilities);
    return { ...requirement, covered: sources.length > 0, sources };
  });
  const enemyResolution = resolveMissionEnemies(mission, enemyKitIndex);
  return {
    requirements: coverage,
    covered: coverage.filter((item) => item.covered),
    missing: coverage.filter((item) => !item.covered),
    hazards: contract.hazards,
    informational: contract.informational,
    enemies: {
      resolved: enemyResolution.resolved.map((enemy) => ({ archetypeId: enemy.archetypeId, name: enemy.name, baseId: enemy.baseId, mechanics: enemy.kit?.mechanicKinds || [], debuffs: enemy.kit?.debuffs || [] })),
      unresolved: enemyResolution.unresolved,
      signals: enemySignals(enemyResolution.resolved),
    },
    evidenceBoundary: "Coverage means the listed team has an explicit kit mechanic matching a verified mission note. It is not a win probability or proof the mechanic is sufficient by itself.",
  };
}
