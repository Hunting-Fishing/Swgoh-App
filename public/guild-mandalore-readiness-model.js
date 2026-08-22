import { normalizeZeffoUnitState } from "./guild-zeffo-readiness-model.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value ?? "").trim();

export const MANDALORE_UNLOCK_TARGET = 25;
export const MANDALORE_GET2_PER_CLEAR = 50;
export const MANDALORE_UNLOCK_UNITS = Object.freeze({
  boKatanMandalor: "MANDALORBOKATAN",
  beskarMando: "THEMANDALORIANBESKARARMOR",
});

function memberId(member = {}, index = 0) {
  return text(member.playerId || member.id || member.allyCode || member.name || `member-${index + 1}`);
}

function tagText(value) {
  if (value && typeof value === "object") {
    return text(value.name || value.label || value.displayName || value.id || value.categoryId || value.tag);
  }
  return text(value);
}

function normalizedTag(value) {
  return tagText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stripFactionPrefix(value) {
  let key = normalizedTag(value);
  for (const prefix of ["affiliation", "faction", "category", "tag"]) {
    if (key.startsWith(prefix)) {
      key = key.slice(prefix.length);
      break;
    }
  }
  return key;
}

function unitTags(unit = {}) {
  return [
    ...asArray(unit.factions),
    ...asArray(unit.tags),
    ...asArray(unit.categories),
  ].map(tagText).filter(Boolean);
}

function isMandalorian(unit = {}) {
  return unitTags(unit).some((tag) => stripFactionPrefix(tag) === "mandalorian");
}

function catalogIndex(catalog = []) {
  return new Map(asArray(catalog).filter((row) => row?.baseId).map((row) => [String(row.baseId).toUpperCase(), row]));
}

function unitMap(member = {}, catalog = []) {
  const index = catalogIndex(catalog);
  return new Map(asArray(member.units)
    .filter((row) => row?.baseId)
    .map((owned) => {
      const baseId = String(owned.baseId).toUpperCase();
      const staticUnit = index.get(baseId) || {};
      return [baseId, {
        ...staticUnit,
        ...owned,
        baseId,
        name: text(owned.name || staticUnit.name || baseId),
        categories: asArray(owned.categories).length ? owned.categories : asArray(staticUnit.categories),
        factions: asArray(owned.factions).length ? owned.factions : asArray(staticUnit.factions),
        tags: asArray(owned.tags).length ? owned.tags : asArray(staticUnit.tags),
      }];
    }));
}

function relicSteps(state = {}) {
  if (finite(state.relic, -1) >= 7) return 0;
  if (finite(state.relic, -1) >= 0) return 7 - finite(state.relic, 0);
  if (state.owned) return 8 + Math.max(0, 13 - finite(state.gear, 0));
  return 25;
}

function bestAdditionalMandalorian(units = new Map()) {
  const excluded = new Set(Object.values(MANDALORE_UNLOCK_UNITS));
  const candidates = [...units.values()]
    .filter((unit) => !excluded.has(String(unit.baseId || "").toUpperCase()) && isMandalorian(unit))
    .map((unit) => ({
      baseId: String(unit.baseId || "").toUpperCase(),
      name: text(unit.name || unit.baseId || "Additional Mandalorian"),
      state: normalizeZeffoUnitState(unit),
      power: finite(unit.power, 0),
    }))
    .sort((a, b) => b.state.relic - a.state.relic || b.state.gear - a.state.gear || b.power - a.power || a.name.localeCompare(b.name));

  return candidates[0] || Object.freeze({
    baseId: "",
    name: "Additional Mandalorian",
    state: Object.freeze({ owned: false, gear: 0, relic: -1, label: "NONE", tone: "far" }),
    power: 0,
  });
}

function readinessStatus(boKatanMandalor, beskarMando, thirdMando) {
  if (boKatanMandalor.relic >= 7 && beskarMando.relic >= 7 && thirdMando.state.relic >= 7) return "READY";
  if (boKatanMandalor.relic >= 5 && beskarMando.relic >= 5 && thirdMando.state.relic >= 5) return "ALMOST";
  return "FAR";
}

function upgradeText(boKatanMandalor, beskarMando, thirdMando, status) {
  if (status === "READY") return `Ready with ${thirdMando.name}`;
  const needs = [];
  if (boKatanMandalor.relic < 7) needs.push(`Bo-Katan ${boKatanMandalor.label} → R7`);
  if (beskarMando.relic < 7) needs.push(`BAM ${beskarMando.label} → R7`);
  if (thirdMando.state.relic < 7) needs.push(`${thirdMando.name} ${thirdMando.state.label} → R7`);
  return needs.join(" + ") || "Ready";
}

export function buildMandaloreMemberReadiness(member = {}, catalog = [], index = 0) {
  const units = unitMap(member, catalog);
  const boKatanMandalor = normalizeZeffoUnitState(units.get(MANDALORE_UNLOCK_UNITS.boKatanMandalor));
  const beskarMando = normalizeZeffoUnitState(units.get(MANDALORE_UNLOCK_UNITS.beskarMando));
  const thirdMando = bestAdditionalMandalorian(units);
  const status = readinessStatus(boKatanMandalor, beskarMando, thirdMando);
  const priorityScore = relicSteps(boKatanMandalor) + relicSteps(beskarMando) + relicSteps(thirdMando.state);

  return Object.freeze({
    id: memberId(member, index),
    playerId: text(member.playerId || member.id),
    allyCode: text(member.allyCode).replace(/\D/g, "").slice(0, 9),
    name: text(member.name || member.playerName || memberId(member, index)),
    galacticPower: finite(member.galacticPower, 0),
    rosterAvailable: member.rosterAvailable === true || asArray(member.units).length > 0,
    profileTitle: text(member.profileTitle || member.title || member.playerTitle),
    playerPortrait: text(member.playerPortrait || member.profilePortrait),
    memberLevel: finite(member.memberLevel, 0),
    memberRole: text(member.memberRole || member.guildRole || member.role),
    boKatanMandalor,
    beskarMando,
    thirdMando,
    status,
    upgradeText: upgradeText(boKatanMandalor, beskarMando, thirdMando, status),
    priorityScore,
  });
}

export function buildGuildMandaloreReadiness(guildBody = {}, catalog = []) {
  const members = asArray(guildBody.members).map((member, index) => buildMandaloreMemberReadiness(member, catalog, index));
  const statusRank = { READY: 0, ALMOST: 1, FAR: 2 };
  const sorted = members.slice().sort((a, b) =>
    statusRank[a.status] - statusRank[b.status]
      || (a.status === "READY" ? (b.boKatanMandalor.relic - a.boKatanMandalor.relic) : (a.priorityScore - b.priorityScore))
      || b.galacticPower - a.galacticPower
      || a.name.localeCompare(b.name));
  const ready = sorted.filter((row) => row.status === "READY");
  const almost = sorted.filter((row) => row.status === "ALMOST");
  const far = sorted.filter((row) => row.status === "FAR");
  const rosterUnavailable = sorted.filter((row) => !row.rosterAvailable).length;
  const potentialSuccessfulClears = ready.length;
  const unlockShortfall = Math.max(0, MANDALORE_UNLOCK_TARGET - potentialSuccessfulClears);

  return Object.freeze({
    missionId: "mandalore",
    missionName: "Mandalore Unlock",
    planetName: "Tatooine · Krayt Dragon",
    unlockTarget: MANDALORE_UNLOCK_TARGET,
    rewardPerSuccessfulClear: Object.freeze({ currency: "GET2", amount: MANDALORE_GET2_PER_CLEAR }),
    gateText: "Bo-Katan (Mand'alor) R7 + The Mandalorian (Beskar Armor) R7 + any additional Mandalorian R7. 25 successful guild clears unlock Mandalore for that Territory Battle instance.",
    guild: Object.freeze({
      id: text(guildBody?.guild?.id),
      name: text(guildBody?.guild?.name || "Guild"),
      galacticPower: finite(guildBody?.guild?.galacticPower, 0),
      memberCount: finite(guildBody?.guild?.memberCount, sorted.length),
    }),
    fetchedAt: text(guildBody.fetchedAt),
    members: Object.freeze(sorted),
    actionMembers: Object.freeze([...almost, ...far]),
    summary: Object.freeze({
      total: sorted.length,
      ready: ready.length,
      almost: almost.length,
      far: far.length,
      rosterUnavailable,
      buffer: ready.length - MANDALORE_UNLOCK_TARGET,
      unlockShortfall,
      potentialSuccessfulClears,
      potentialGet2: potentialSuccessfulClears * MANDALORE_GET2_PER_CLEAR,
      canFieldUnlockCount: ready.length >= MANDALORE_UNLOCK_TARGET,
    }),
  });
}

export function filterGuildMandaloreRows(rows = [], options = {}) {
  const query = text(options.search).toLowerCase().replace(/-/g, "");
  const status = text(options.status || "ALL").toUpperCase();
  return Object.freeze(asArray(rows).filter((row) => {
    if (status !== "ALL" && row.status !== status) return false;
    if (!query) return true;
    return [row.name, row.allyCode, row.status, row.thirdMando?.name, row.upgradeText]
      .join(" ").toLowerCase().replace(/-/g, "").includes(query);
  }));
}

export { bestAdditionalMandalorian, isMandalorian, normalizedTag, stripFactionPrefix, unitTags };
