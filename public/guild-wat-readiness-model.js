import { guildMemberRole, playerPortraitId, playerPortraitUrl, playerProfileTitle } from './guild-member-identity.js';

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value ?? "").trim();

export const WAT_REQUIRED_POWER = 16500;
export const WAT_REQUIRED_STARS = 7;
export const WAT_CLOSE_POWER = 14000;
export const WAT_CLOSE_STARS = 6;

export const WAT_GEONOSIANS = Object.freeze([
  { baseId: "GEONOSIANBROODALPHA", name: "Geonosian Brood Alpha" },
  { baseId: "GEONOSIANSOLDIER", name: "Geonosian Soldier" },
  { baseId: "GEONOSIANSPY", name: "Geonosian Spy" },
  { baseId: "POGGLETHELESSER", name: "Poggle the Lesser" },
  { baseId: "SUNFAC", name: "Sun Fac" },
]);

function compactPower(value) {
  const power = finite(value, 0);
  if (power >= 1000) return `${(power / 1000).toFixed(power >= 10000 ? 1 : 2).replace(/\.0$/, "")}K`;
  return String(Math.round(power));
}

function ownedUnitMap(member = {}) {
  return new Map(asArray(member.units).filter((row) => row?.baseId).map((row) => [String(row.baseId).toUpperCase(), row]));
}

export function normalizeWatUnitState(unit = null, requirement = {}) {
  if (!unit) return Object.freeze({ owned: false, stars: 0, power: 0, label: "LOCKED", tone: "far", ready: false, close: false });
  const stars = Math.max(0, Math.floor(finite(unit.stars ?? unit.rarity, 0)));
  const power = Math.max(0, Math.floor(finite(unit.power ?? unit.gp, 0)));
  const ready = stars >= WAT_REQUIRED_STARS && power >= WAT_REQUIRED_POWER;
  const close = !ready && stars >= WAT_CLOSE_STARS && power >= WAT_CLOSE_POWER;
  const label = `${stars}★ · ${compactPower(power)} GP`;
  return Object.freeze({
    owned: true,
    baseId: text(unit.baseId || requirement.baseId),
    name: text(unit.name || requirement.name),
    stars,
    power,
    label,
    tone: ready ? "good" : close ? "close" : "far",
    ready,
    close,
  });
}

function statusFor(states = []) {
  if (states.every((state) => state.ready)) return "READY";
  if (states.every((state) => state.ready || state.close)) return "ALMOST";
  return "FAR";
}

function upgradeText(states = [], status = "FAR") {
  if (status === "READY") return "Ready for the Wat Tambor Special Mission";
  const needs = states.filter((state) => !state.ready).map((state) => {
    const starNeed = state.stars < WAT_REQUIRED_STARS ? ` ${state.stars || 0}★ → 7★` : "";
    const powerNeed = state.power < WAT_REQUIRED_POWER ? ` ${compactPower(state.power)} → 16.5K GP` : "";
    return `${state.name || "Geonosian"}:${starNeed}${powerNeed}`.trim();
  });
  return needs.join(" + ");
}

function deficitScore(state = {}) {
  if (state.ready) return 0;
  if (!state.owned) return 100000;
  const starDeficit = Math.max(0, WAT_REQUIRED_STARS - finite(state.stars, 0)) * 20000;
  const powerDeficit = Math.max(0, WAT_REQUIRED_POWER - finite(state.power, 0));
  return starDeficit + powerDeficit;
}

export function buildWatMemberReadiness(member = {}, index = 0) {
  const units = ownedUnitMap(member);
  const geonosians = WAT_GEONOSIANS.map((requirement) => {
    const state = normalizeWatUnitState(units.get(requirement.baseId), requirement);
    return Object.freeze({ ...requirement, state });
  });
  const states = geonosians.map((row) => row.state);
  const status = statusFor(states);
  return Object.freeze({
    id: text(member.playerId || member.id || member.allyCode || member.name || `member-${index + 1}`),
    allyCode: text(member.allyCode).replace(/\D/g, "").slice(0, 9),
    name: text(member.name || member.playerName || `Member ${index + 1}`),
    galacticPower: finite(member.galacticPower, 0),
    rosterAvailable: member.rosterAvailable === true || asArray(member.units).length > 0,
    profileTitle: playerProfileTitle(member),
    memberLevel: finite(member.memberLevel, 0),
    memberRole: guildMemberRole(member),
    playerPortrait: playerPortraitId(member),
    playerPortraitUrl: playerPortraitUrl(member),
    geonosians: Object.freeze(geonosians),
    status,
    upgradeText: upgradeText(states, status),
    priorityScore: states.reduce((sum, state) => sum + deficitScore(state), 0),
  });
}

export function buildGuildWatReadiness(guildBody = {}) {
  const members = asArray(guildBody.members).map(buildWatMemberReadiness);
  const rank = { READY: 0, ALMOST: 1, FAR: 2 };
  const sorted = members.slice().sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "READY" ? b.galacticPower - a.galacticPower : a.priorityScore - b.priorityScore) || a.name.localeCompare(b.name));
  const ready = sorted.filter((row) => row.status === "READY");
  const almost = sorted.filter((row) => row.status === "ALMOST");
  const far = sorted.filter((row) => row.status === "FAR");
  return Object.freeze({
    missionId: "wat",
    missionName: "Wat Tambor Shard Mission",
    planetName: "Geonosis: Separatist Might · Phase 3",
    rewardMode: "shards",
    gateText: "Five Geonosians at 7★ and at least 16,500 character power each, with Geonosian Brood Alpha required. Each successful guild member earns 1 Wat Tambor shard for the guild reward; up to 50 shards can be earned per Territory Battle.",
    closeText: "Yellow ALMOST is an officer-planning heuristic only: every required Geonosian is at least 6★ and 14,000 GP. The actual game gate remains 7★ and 16,500 GP on all five.",
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
      rosterUnavailable: sorted.filter((row) => !row.rosterAvailable).length,
      gbaReady: sorted.filter((row) => row.geonosians[0]?.state?.ready).length,
      allSevenStar: sorted.filter((row) => row.geonosians.every((geo) => geo.state.stars >= WAT_REQUIRED_STARS)).length,
    }),
  });
}

export function filterGuildWatRows(rows = [], options = {}) {
  const query = text(options.search).toLowerCase().replace(/-/g, "");
  const status = text(options.status || "ALL").toUpperCase();
  return Object.freeze(asArray(rows).filter((row) => {
    if (status !== "ALL" && row.status !== status) return false;
    if (!query) return true;
    return [row.name, row.allyCode, row.status, row.upgradeText, row.profileTitle, row.memberRole, ...row.geonosians.map((geo) => geo.name)].join(" ").toLowerCase().replace(/-/g, "").includes(query);
  }));
}
