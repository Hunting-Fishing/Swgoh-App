const SLOT_ORDER = [2, 3, 4, 5, 6, 7];

export const MOD_SET_COUNTS = Object.freeze({
  Health: 2,
  Offense: 4,
  Defense: 2,
  Speed: 4,
  "Critical Chance": 2,
  "Critical Damage": 4,
  Potency: 2,
  Tenacity: 2,
});

export const MOD_OPTIMIZER_PRESETS = Object.freeze({
  "Max Speed": {
    label: "Max Speed",
    weights: { speed: 100, healthPct: 5, protectionPct: 5, tenacity: 3 },
    desiredSets: ["Speed", "Health"],
    primaries: { Arrow: ["Speed"] },
  },
  "Fast Support": {
    label: "Fast Support",
    weights: { speed: 100, healthPct: 20, protectionPct: 25, tenacity: 10, potency: 8 },
    desiredSets: ["Speed", "Health", "Tenacity"],
    primaries: { Arrow: ["Speed"], Circle: ["Protection", "Health"] },
  },
  "Fast Debuffer": {
    label: "Fast Debuffer",
    weights: { speed: 100, potency: 50, healthPct: 12, protectionPct: 12, tenacity: 5 },
    desiredSets: ["Speed", "Potency"],
    primaries: { Arrow: ["Speed"], Cross: ["Potency"] },
  },
  "Physical Attacker": {
    label: "Physical Attacker",
    weights: { speed: 55, offenseFlat: 30, offensePct: 65, critChance: 40, critDamage: 80, healthPct: 5, protectionPct: 5 },
    desiredSets: ["Offense", "Critical Damage", "Critical Chance"],
    primaries: { Arrow: ["Speed", "Offense"], Triangle: ["Critical Damage", "Offense", "Critical Chance"], Cross: ["Offense"] },
  },
  "Special Attacker": {
    label: "Special Attacker",
    weights: { speed: 60, offenseFlat: 25, offensePct: 70, critChance: 30, critDamage: 70, potency: 15, healthPct: 5 },
    desiredSets: ["Offense", "Critical Damage", "Speed"],
    primaries: { Arrow: ["Speed", "Offense"], Triangle: ["Critical Damage", "Offense"], Cross: ["Offense", "Potency"] },
  },
  "Durable Tank": {
    label: "Durable Tank",
    weights: { speed: 25, healthFlat: 20, healthPct: 65, protectionFlat: 25, protectionPct: 80, defenseFlat: 10, defensePct: 45, tenacity: 25, critAvoidance: 15 },
    desiredSets: ["Health", "Defense", "Tenacity"],
    primaries: { Arrow: ["Speed", "Defense"], Triangle: ["Health", "Protection", "Defense", "Critical Avoidance"], Circle: ["Protection", "Health"], Cross: ["Protection", "Health", "Defense", "Tenacity"] },
  },
  "Durable Healer": {
    label: "Durable Healer",
    weights: { speed: 65, healthFlat: 15, healthPct: 65, protectionFlat: 15, protectionPct: 50, tenacity: 20 },
    desiredSets: ["Health", "Speed", "Tenacity"],
    primaries: { Arrow: ["Speed"], Triangle: ["Health", "Protection"], Circle: ["Health", "Protection"], Cross: ["Health", "Protection", "Tenacity"] },
  },
  Balanced: {
    label: "Balanced",
    weights: { speed: 60, healthPct: 20, protectionPct: 20, offensePct: 20, defensePct: 10, potency: 8, tenacity: 8, critChance: 8, critDamage: 10 },
    desiredSets: [],
    primaries: { Arrow: ["Speed"] },
  },
});

const STAT_KEY = new Map([
  ["1:flat", "healthFlat"],
  ["55:pct", "healthPct"],
  ["28:flat", "protectionFlat"],
  ["56:pct", "protectionPct"],
  ["5:flat", "speed"],
  ["41:flat", "offenseFlat"],
  ["48:pct", "offensePct"],
  ["42:flat", "defenseFlat"],
  ["49:pct", "defensePct"],
  ["16:pct", "critDamage"],
  ["17:pct", "potency"],
  ["18:pct", "tenacity"],
  ["52:pct", "accuracy"],
  ["53:pct", "critChance"],
  ["54:pct", "critAvoidance"],
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentile(values, ratio = 0.9) {
  const list = values.map((value) => Math.abs(finite(value))).filter((value) => value > 0).sort((a, b) => a - b);
  if (!list.length) return 0;
  const index = Math.min(list.length - 1, Math.max(0, Math.ceil(list.length * ratio) - 1));
  return list[index];
}

function statKey(stat) {
  if (!stat) return "";
  const unitStatId = String(finite(stat.unitStatId));
  return STAT_KEY.get(`${unitStatId}:${stat.percent ? "pct" : "flat"}`) || "";
}

export function modStatVector(mod = {}) {
  const vector = {};
  const add = (stat) => {
    const key = statKey(stat);
    if (!key) return;
    vector[key] = finite(vector[key]) + finite(stat.displayValue);
  };
  add(mod.primaryStat);
  for (const stat of asArray(mod.secondaryStats)) add(stat);
  return vector;
}

export function buildAdaptiveScales(mods = []) {
  const values = new Map();
  for (const mod of asArray(mods)) {
    const vector = modStatVector(mod);
    for (const [key, value] of Object.entries(vector)) {
      if (!values.has(key)) values.set(key, []);
      values.get(key).push(value);
    }
  }
  const floors = {
    speed: 10,
    healthFlat: 1500,
    healthPct: 5,
    protectionFlat: 3000,
    protectionPct: 8,
    offenseFlat: 100,
    offensePct: 3,
    defenseFlat: 30,
    defensePct: 5,
    critDamage: 12,
    potency: 5,
    tenacity: 5,
    accuracy: 5,
    critChance: 5,
    critAvoidance: 8,
  };
  const output = {};
  for (const key of Object.keys(floors)) output[key] = Math.max(floors[key], percentile(values.get(key) || [], 0.9));
  return output;
}

export function defaultPresetForUnit(unit = {}) {
  const role = String(unit.role || "").toLowerCase();
  if (role.includes("tank")) return "Durable Tank";
  if (role.includes("healer")) return "Durable Healer";
  if (role.includes("support")) return "Fast Support";
  if (role.includes("attacker")) return "Physical Attacker";
  return "Balanced";
}

function normalizedProfile(target = {}, unit = {}) {
  const presetName = target.preset && MOD_OPTIMIZER_PRESETS[target.preset] ? target.preset : defaultPresetForUnit(unit);
  const preset = MOD_OPTIMIZER_PRESETS[presetName] || MOD_OPTIMIZER_PRESETS.Balanced;
  return {
    preset: presetName,
    weights: { ...preset.weights, ...(target.weights || {}) },
    desiredSets: asArray(target.desiredSets).length ? [...target.desiredSets] : [...preset.desiredSets],
    primaries: { ...preset.primaries, ...(target.primaries || {}) },
    minSpeed: Math.max(0, finite(target.minSpeed)),
  };
}

function primaryMatch(mod, profile) {
  const names = asArray(profile.primaries?.[mod.slotName]);
  if (!names.length) return 0;
  return names.includes(String(mod.primaryStat?.name || "")) ? 18 : -7;
}

function rawModScore(mod, profile, scales, targetBaseId, stayBonus) {
  const vector = modStatVector(mod);
  let score = 0;
  for (const [key, weight] of Object.entries(profile.weights || {})) {
    if (!weight) continue;
    score += finite(weight) * finite(vector[key]) / Math.max(0.0001, finite(scales[key], 1));
  }
  score += primaryMatch(mod, profile);
  if (profile.desiredSets.includes(mod.setName)) score += 4;
  if (String(mod.characterBaseId || "") === String(targetBaseId || "")) score += stayBonus;
  return score;
}

function setCompletionScore(mods, profile) {
  const counts = new Map();
  for (const mod of mods) counts.set(mod.setName, (counts.get(mod.setName) || 0) + 1);
  let score = 0;
  for (const [setName, count] of counts) {
    const required = MOD_SET_COUNTS[setName];
    if (!required) continue;
    const completed = Math.floor(count / required);
    if (!completed) continue;
    score += completed * (profile.desiredSets.includes(setName) ? 50 : 10);
  }
  return score;
}

function speedFromMods(mods) {
  return mods.reduce((sum, mod) => sum + finite(modStatVector(mod).speed), 0);
}

function comboScore(mods, baseScore, profile) {
  let score = baseScore + setCompletionScore(mods, profile);
  if (profile.minSpeed > 0) {
    const speed = speedFromMods(mods);
    if (speed < profile.minSpeed) score -= (profile.minSpeed - speed) * 4;
    else score += Math.min(30, (speed - profile.minSpeed) * 0.5);
  }
  return score;
}

function eligibleModForUnit(mod, unit) {
  if (finite(mod.pips ?? mod.rarity) < 6) return true;
  return finite(unit.gear) >= 12 || finite(unit.relic) > 0;
}

function bestSetForCharacter(unit, target, availableMods, scales, options = {}) {
  const profile = normalizedProfile(target, unit);
  const stayBonus = options.moveMode === "minimal" ? 25 : options.moveMode === "aggressive" ? 0 : 8;
  const candidatesPerSlot = Math.max(8, Math.min(40, Math.floor(finite(options.candidatesPerSlot, 20))));
  const beamWidth = Math.max(50, Math.min(1200, Math.floor(finite(options.beamWidth, 350))));
  let beam = [{ mods: [], baseScore: 0, score: 0 }];

  for (const slot of SLOT_ORDER) {
    const candidates = availableMods
      .filter((mod) => finite(mod.slot) === slot && eligibleModForUnit(mod, unit))
      .map((mod) => ({ mod, score: rawModScore(mod, profile, scales, unit.baseId, stayBonus) }))
      .sort((a, b) => b.score - a.score || finite(b.mod.speedSecondary) - finite(a.mod.speedSecondary) || String(a.mod.id).localeCompare(String(b.mod.id)))
      .slice(0, candidatesPerSlot);
    if (!candidates.length) continue;

    const next = [];
    for (const entry of beam) {
      for (const candidate of candidates) {
        const mods = entry.mods.concat(candidate.mod);
        const baseScore = entry.baseScore + candidate.score;
        next.push({ mods, baseScore, score: comboScore(mods, baseScore, profile) });
      }
    }
    next.sort((a, b) => b.score - a.score || speedFromMods(b.mods) - speedFromMods(a.mods));
    beam = next.slice(0, beamWidth);
  }

  const best = beam[0] || { mods: [], score: 0, baseScore: 0 };
  return {
    baseId: unit.baseId,
    name: unit.name || unit.baseId,
    profile,
    mods: best.mods,
    score: Math.round(best.score * 100) / 100,
    modSpeed: Math.round(speedFromMods(best.mods) * 100) / 100,
  };
}

function targetState(targets, liveUnits) {
  const liveMap = new Map(asArray(liveUnits).map((unit) => [String(unit.baseId), unit]));
  return asArray(targets)
    .filter((target) => target?.included && liveMap.has(String(target.baseId)))
    .map((target, index) => ({
      ...target,
      priority: Math.max(1, Math.floor(finite(target.priority, index + 1))),
      unit: liveMap.get(String(target.baseId)),
    }))
    .sort((a, b) => a.priority - b.priority || finite(b.unit.power) - finite(a.unit.power) || String(a.unit.name || "").localeCompare(String(b.unit.name || "")));
}

function modIdentity(mod) {
  return String(mod?.id || `${mod?.definitionId || "mod"}|${mod?.characterBaseId || ""}|${mod?.slot || ""}`);
}

function currentModsByOwner(mods) {
  const map = new Map();
  for (const mod of asArray(mods)) {
    const key = String(mod.characterBaseId || "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(mod);
  }
  return map;
}

export function optimizeEquippedMods({ liveUnits = [], mods = [], targets = [], options = {} } = {}) {
  const selected = targetState(targets, liveUnits);
  const liveMap = new Map(asArray(liveUnits).map((unit) => [String(unit.baseId), unit]));
  const lockedIds = new Set(asArray(targets).filter((target) => target?.locked).map((target) => String(target.baseId)));
  const currentByOwner = currentModsByOwner(mods);
  const donorScope = options.donorScope === "included" ? "included" : "all";
  const selectedIds = new Set(selected.map((entry) => String(entry.baseId)));
  const scales = buildAdaptiveScales(mods);

  let pool = asArray(mods).filter((mod) => {
    const owner = String(mod.characterBaseId || "");
    if (lockedIds.has(owner)) return false;
    if (donorScope === "included" && !selectedIds.has(owner)) return false;
    return true;
  });

  const assignments = [];
  const warnings = [];
  for (const target of selected) {
    const id = String(target.baseId);
    if (target.locked) {
      const lockedMods = asArray(currentByOwner.get(id));
      assignments.push({
        baseId: id,
        name: target.unit.name || id,
        profile: normalizedProfile(target, target.unit),
        mods: lockedMods,
        score: null,
        modSpeed: Math.round(speedFromMods(lockedMods) * 100) / 100,
        locked: true,
      });
      continue;
    }
    const best = bestSetForCharacter(target.unit, target, pool, scales, options);
    if (best.mods.length < 6) warnings.push(`${best.name}: only ${best.mods.length}/6 eligible equipped mods were available in the selected donor scope.`);
    assignments.push({ ...best, locked: false });
    const used = new Set(best.mods.map(modIdentity));
    pool = pool.filter((mod) => !used.has(modIdentity(mod)));
  }

  const desiredOwner = new Map();
  for (const assignment of assignments) for (const mod of assignment.mods) desiredOwner.set(modIdentity(mod), assignment.baseId);

  const moves = [];
  for (const assignment of assignments) {
    for (const mod of assignment.mods) {
      const fromBaseId = String(mod.characterBaseId || "");
      const toBaseId = String(assignment.baseId);
      if (fromBaseId === toBaseId) continue;
      moves.push({
        modId: modIdentity(mod),
        definitionId: mod.definitionId || "",
        slot: finite(mod.slot),
        slotName: mod.slotName || `Slot ${finite(mod.slot)}`,
        setName: mod.setName || "Unknown",
        pips: finite(mod.pips ?? mod.rarity),
        level: finite(mod.level),
        speedSecondary: finite(mod.speedSecondary),
        primaryStat: mod.primaryStat || null,
        fromBaseId,
        fromName: liveMap.get(fromBaseId)?.name || mod.characterName || fromBaseId || "Unknown",
        toBaseId,
        toName: assignment.name,
        displacedModId: asArray(currentByOwner.get(toBaseId)).find((current) => finite(current.slot) === finite(mod.slot))?.id || "",
      });
    }
  }

  const donors = new Map();
  for (const move of moves) {
    if (!donors.has(move.fromBaseId)) donors.set(move.fromBaseId, { baseId: move.fromBaseId, name: move.fromName, out: 0, speedOut: 0, selected: selectedIds.has(move.fromBaseId) });
    const donor = donors.get(move.fromBaseId);
    donor.out += 1;
    donor.speedOut += move.speedSecondary;
  }

  const highSpeedMoves = moves.filter((move) => move.speedSecondary >= 20).length;
  const preserved = assignments.reduce((sum, assignment) => sum + assignment.mods.filter((mod) => String(mod.characterBaseId || "") === String(assignment.baseId)).length, 0);
  const assignedMods = assignments.reduce((sum, assignment) => sum + assignment.mods.length, 0);

  return {
    method: "priority-weighted-equipped-only",
    donorScope,
    moveMode: options.moveMode || "balanced",
    scales,
    targets: selected.length,
    assignments,
    moves: moves.sort((a, b) => selected.findIndex((target) => target.baseId === a.toBaseId) - selected.findIndex((target) => target.baseId === b.toBaseId) || a.slot - b.slot),
    donors: [...donors.values()].sort((a, b) => b.out - a.out || b.speedOut - a.speedOut || a.name.localeCompare(b.name)),
    summary: {
      selectedCharacters: selected.length,
      lockedCharacters: selected.filter((target) => target.locked).length,
      assignedMods,
      preservedMods: preserved,
      movedMods: moves.length,
      highSpeedMoves,
      donorCharacters: donors.size,
      remainingCandidateMods: pool.length,
    },
    warnings,
  };
}

export function buildDefaultOptimizerTargets(liveUnits = [], limit = 12) {
  return asArray(liveUnits)
    .slice()
    .sort((a, b) => finite(b.power) - finite(a.power) || String(a.name || "").localeCompare(String(b.name || "")))
    .map((unit, index) => ({
      baseId: String(unit.baseId || ""),
      included: index < Math.max(0, Math.floor(limit)),
      locked: false,
      priority: index + 1,
      preset: defaultPresetForUnit(unit),
      minSpeed: 0,
    }));
}
