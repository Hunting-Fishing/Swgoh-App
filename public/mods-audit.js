export const MOD_SLOT_NAMES = new Map([
  [2, "Square"],
  [3, "Arrow"],
  [4, "Diamond"],
  [5, "Triangle"],
  [6, "Circle"],
  [7, "Cross"],
]);

export const MOD_SET_NAMES = new Map([
  ["1", "Health"],
  ["2", "Offense"],
  ["3", "Defense"],
  ["4", "Speed"],
  ["5", "Critical Chance"],
  ["6", "Critical Damage"],
  ["7", "Potency"],
  ["8", "Tenacity"],
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function modSlotName(slot) {
  return MOD_SLOT_NAMES.get(finite(slot)) || `Slot ${finite(slot) || "?"}`;
}

export function modSetName(setId) {
  return MOD_SET_NAMES.get(String(setId || "")) || `Set ${String(setId || "?")}`;
}

export function statDisplay(stat) {
  if (!stat) return "N/A";
  const value = finite(stat.displayValue);
  const rounded = Math.round(value * 100) / 100;
  return `${stat.name || `Stat ${stat.unitStatId || "?"}`} ${rounded}${stat.percent ? "%" : ""}`;
}

export function characterModAudit(liveUnit = {}, modUnit = {}) {
  const mods = asArray(modUnit?.mods);
  const byRarity = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalSpeedSecondary = 0;
  let bestSpeedSecondary = 0;
  let speedSecondaryMods = 0;
  let maxLevel = 0;
  let underSixDot = 0;
  let sixDot = 0;
  let oneToFourDot = 0;
  let fiveDot = 0;
  let speed10Plus = 0;
  let speed15Plus = 0;
  let speed20Plus = 0;
  let speed25Plus = 0;

  for (const mod of mods) {
    const rarity = Math.max(0, Math.floor(finite(mod?.rarity ?? mod?.pips)));
    if (rarity >= 1 && rarity <= 6) byRarity[rarity] += 1;
    if (rarity >= 1 && rarity < 6) underSixDot += 1;
    if (rarity >= 6) sixDot += 1;
    if (rarity >= 1 && rarity <= 4) oneToFourDot += 1;
    if (rarity === 5) fiveDot += 1;
    if (finite(mod?.level) >= 15) maxLevel += 1;

    const speed = finite(mod?.speedSecondary);
    if (speed > 0) {
      speedSecondaryMods += 1;
      totalSpeedSecondary += speed;
      bestSpeedSecondary = Math.max(bestSpeedSecondary, speed);
      if (speed >= 10) speed10Plus += 1;
      if (speed >= 15) speed15Plus += 1;
      if (speed >= 20) speed20Plus += 1;
      if (speed >= 25) speed25Plus += 1;
    }
  }

  const equipped = mods.length;
  return {
    baseId: liveUnit?.baseId || modUnit?.baseId || "",
    name: liveUnit?.name || liveUnit?.baseId || modUnit?.baseId || "Unknown",
    power: finite(liveUnit?.power),
    characterSpeed: finite(liveUnit?.speed),
    relic: finite(liveUnit?.relic),
    gear: finite(liveUnit?.gear),
    equipped,
    openSlots: Math.max(0, 6 - equipped),
    maxLevel,
    underSixDot,
    sixDot,
    oneToFourDot,
    fiveDot,
    speedSecondaryMods,
    totalSpeedSecondary: Math.round(totalSpeedSecondary * 100) / 100,
    bestSpeedSecondary: Math.round(bestSpeedSecondary * 100) / 100,
    speed10Plus,
    speed15Plus,
    speed20Plus,
    speed25Plus,
    noSpeedSecondary: Math.max(0, equipped - speedSecondaryMods),
    byRarity,
    mods,
  };
}

export function buildCharacterModRows(liveBody = {}, modBody = {}) {
  const modMap = new Map(asArray(modBody?.units).map((unit) => [String(unit?.baseId || ""), unit]));
  return asArray(liveBody?.units)
    .filter((unit) => String(unit?.unitType || "Character") !== "Ship")
    .map((unit) => characterModAudit(unit, modMap.get(String(unit?.baseId || "")) || {}));
}

export function flattenEquippedMods(characterRows = []) {
  const rows = [];
  for (const character of asArray(characterRows)) {
    for (const mod of asArray(character?.mods)) {
      rows.push({
        characterBaseId: character.baseId,
        characterName: character.name,
        characterPower: finite(character.power),
        characterRelic: finite(character.relic),
        characterGear: finite(character.gear),
        ...mod,
        pips: finite(mod?.pips ?? mod?.rarity),
        rarity: finite(mod?.rarity ?? mod?.pips),
        slotName: modSlotName(mod?.slot),
        setName: modSetName(mod?.setId),
      });
    }
  }
  return rows;
}

export function equippedModAuditSummary(characterRows = [], modBody = {}) {
  const characters = asArray(characterRows);
  const mods = flattenEquippedMods(characters);
  const source = modBody?.summary || {};
  return {
    totalMods: Number.isFinite(Number(source.totalMods)) ? Number(source.totalMods) : mods.length,
    underSixDot: Number.isFinite(Number(source.underSixDot)) ? Number(source.underSixDot) : mods.filter((mod) => mod.pips > 0 && mod.pips < 6).length,
    sixDot: Number.isFinite(Number(source.sixDot)) ? Number(source.sixDot) : mods.filter((mod) => mod.pips >= 6).length,
    maxLevel: Number.isFinite(Number(source.maxLevel)) ? Number(source.maxLevel) : mods.filter((mod) => finite(mod.level) >= 15).length,
    speedSecondaryMods: Number.isFinite(Number(source.speedSecondaryMods)) ? Number(source.speedSecondaryMods) : mods.filter((mod) => finite(mod.speedSecondary) > 0).length,
    speed10Plus: Number.isFinite(Number(source.speed10Plus)) ? Number(source.speed10Plus) : mods.filter((mod) => finite(mod.speedSecondary) >= 10).length,
    speed15Plus: Number.isFinite(Number(source.speed15Plus)) ? Number(source.speed15Plus) : mods.filter((mod) => finite(mod.speedSecondary) >= 15).length,
    speed20Plus: Number.isFinite(Number(source.speed20Plus)) ? Number(source.speed20Plus) : mods.filter((mod) => finite(mod.speedSecondary) >= 20).length,
    speed25Plus: Number.isFinite(Number(source.speed25Plus)) ? Number(source.speed25Plus) : mods.filter((mod) => finite(mod.speedSecondary) >= 25).length,
    charactersWithOpenSlots: characters.filter((row) => row.openSlots > 0).length,
    charactersWithOneToFourDot: characters.filter((row) => row.oneToFourDot > 0).length,
    charactersWithUnderSixDot: characters.filter((row) => row.underSixDot > 0).length,
    byRarity: source.byRarity || mods.reduce((counts, mod) => {
      const pip = String(Math.max(0, Math.floor(finite(mod.pips))));
      if (Object.hasOwn(counts, pip)) counts[pip] += 1;
      return counts;
    }, { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 }),
  };
}
