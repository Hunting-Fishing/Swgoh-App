import { normalizeZeffoUnitState } from "./guild-zeffo-readiness-model.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value ?? "").trim();

export const REVA_UNITS = Object.freeze({ grandInquisitor: "GRANDINQUISITOR" });
export const REVA_REQUIRED_SUPPORTS = 4;

function categoryNames(unit = {}) {
  return asArray(unit.categories)
    .map((row) => typeof row === "string" ? row : row?.name || row?.id || row?.categoryId || "")
    .map(text)
    .filter(Boolean);
}

function isInquisitorius(unit = {}) {
  return categoryNames(unit).some((name) => name.toLowerCase().replace(/[_-]+/g, " ") === "inquisitorius");
}

function catalogIndex(catalog = []) {
  return new Map(asArray(catalog).filter((row) => row?.baseId).map((row) => [String(row.baseId).toUpperCase(), row]));
}

function enrichedUnits(member = {}, catalog = []) {
  const index = catalogIndex(catalog);
  return asArray(member.units).filter((row) => row?.baseId).map((owned) => {
    const baseId = String(owned.baseId).toUpperCase();
    const staticUnit = index.get(baseId) || {};
    return {
      ...staticUnit,
      ...owned,
      baseId,
      name: text(owned.name || staticUnit.name || baseId),
      categories: asArray(owned.categories).length ? owned.categories : asArray(staticUnit.categories),
    };
  });
}

function relicSteps(state = {}) {
  if (finite(state.relic, -1) >= 7) return 0;
  if (finite(state.relic, -1) >= 0) return 7 - finite(state.relic, 0);
  if (state.owned) return 8 + Math.max(0, 13 - finite(state.gear, 0));
  return 25;
}

function supportSlots(units = []) {
  const candidates = units
    .filter((unit) => unit.baseId !== REVA_UNITS.grandInquisitor && isInquisitorius(unit))
    .map((unit) => ({
      baseId: unit.baseId,
      name: unit.name,
      state: normalizeZeffoUnitState(unit),
      power: finite(unit.power, 0),
    }))
    .sort((a, b) => b.state.relic - a.state.relic || b.state.gear - a.state.gear || b.power - a.power || a.name.localeCompare(b.name));

  const selected = candidates.slice(0, REVA_REQUIRED_SUPPORTS);
  while (selected.length < REVA_REQUIRED_SUPPORTS) {
    selected.push(Object.freeze({
      baseId: "",
      name: `Inquisitorius Slot ${selected.length + 1}`,
      state: Object.freeze({ owned: false, gear: 0, relic: -1, label: "MISSING", tone: "far" }),
      power: 0,
    }));
  }
  return selected;
}

function statusFor(gi, supports) {
  if (gi.relic >= 7 && supports.every((row) => row.state.relic >= 7)) return "READY";
  if (gi.relic >= 5 && supports.every((row) => row.state.relic >= 5)) return "ALMOST";
  return "FAR";
}

function upgradeText(gi, supports, status) {
  if (status === "READY") return "Ready for the Reva Special Mission";
  const needs = [];
  if (gi.relic < 7) needs.push(`Grand Inquisitor ${gi.label} → R7`);
  for (const row of supports) if (row.state.relic < 7) needs.push(`${row.name} ${row.state.label} → R7`);
  return needs.join(" + ");
}

export function buildRevaMemberReadiness(member = {}, catalog = [], index = 0) {
  const units = enrichedUnits(member, catalog);
  const giUnit = units.find((row) => row.baseId === REVA_UNITS.grandInquisitor) || null;
  const grandInquisitor = normalizeZeffoUnitState(giUnit);
  const supports = supportSlots(units);
  const status = statusFor(grandInquisitor, supports);
  return Object.freeze({
    id: text(member.playerId || member.id || member.allyCode || member.name || `member-${index + 1}`),
    allyCode: text(member.allyCode).replace(/\D/g, "").slice(0, 9),
    name: text(member.name || member.playerName || `Member ${index + 1}`),
    galacticPower: finite(member.galacticPower, 0),
    rosterAvailable: member.rosterAvailable === true || asArray(member.units).length > 0,
    profileTitle: text(member.profileTitle || member.title || member.playerTitle),
    memberRole: text(member.memberRole || member.guildRole || member.role),
    grandInquisitor,
    supports: Object.freeze(supports),
    status,
    upgradeText: upgradeText(grandInquisitor, supports, status),
    priorityScore: relicSteps(grandInquisitor) + supports.reduce((sum, row) => sum + relicSteps(row.state), 0),
  });
}

export function buildGuildRevaReadiness(guildBody = {}, catalog = []) {
  const members = asArray(guildBody.members).map((member, index) => buildRevaMemberReadiness(member, catalog, index));
  const rank = { READY: 0, ALMOST: 1, FAR: 2 };
  const sorted = members.slice().sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "READY" ? b.galacticPower - a.galacticPower : a.priorityScore - b.priorityScore) || a.name.localeCompare(b.name));
  const ready = sorted.filter((row) => row.status === "READY");
  const almost = sorted.filter((row) => row.status === "ALMOST");
  const far = sorted.filter((row) => row.status === "FAR");
  return Object.freeze({
    missionId: "reva",
    missionName: "Third Sister Reva Shard Mission",
    planetName: "Tatooine · ROTE Phase 3",
    rewardMode: "shards",
    gateText: "Grand Inquisitor R7+ plus four additional Inquisitorius R7+. Each successful guild member earns 1 Third Sister shard for the guild reward; up to 50 shards can be earned per Territory Battle.",
    guild: Object.freeze({
      id: text(guildBody?.guild?.id),
      name: text(guildBody?.guild?.name || "Guild"),
      galacticPower: finite(guildBody?.guild?.galacticPower, 0),
      memberCount: finite(guildBody?.guild?.memberCount, sorted.length),
    }),
    members: Object.freeze(sorted),
    actionMembers: Object.freeze([...almost, ...far]),
    summary: Object.freeze({
      total: sorted.length,
      ready: ready.length,
      almost: almost.length,
      far: far.length,
      potentialShards: ready.length,
      grandInquisitorReady: sorted.filter((row) => row.grandInquisitor.relic >= 7).length,
      fourSupportsReady: sorted.filter((row) => row.supports.every((slot) => slot.state.relic >= 7)).length,
      rosterUnavailable: sorted.filter((row) => !row.rosterAvailable).length,
    }),
  });
}

export function filterGuildRevaRows(rows = [], options = {}) {
  const query = text(options.search).toLowerCase().replace(/-/g, "");
  const status = text(options.status || "ALL").toUpperCase();
  return Object.freeze(asArray(rows).filter((row) => {
    if (status !== "ALL" && row.status !== status) return false;
    if (!query) return true;
    return [row.name, row.allyCode, row.status, row.upgradeText, ...row.supports.map((slot) => slot.name)].join(" ").toLowerCase().replace(/-/g, "").includes(query);
  }));
}
