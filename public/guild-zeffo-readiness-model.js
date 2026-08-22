import { guildMemberRole, playerPortraitId, playerPortraitUrl, playerProfileTitle } from './guild-member-identity.js';
import { potentialMissionReward, tbSpecialMissionFact } from './tb-special-mission-facts.js';

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => String(value ?? "").trim();

const ZEFFO_FACT = tbSpecialMissionFact('zeffo');
export const ZEFFO_UNLOCK_TARGET = ZEFFO_FACT.unlockTarget;
export const ZEFFO_GET3_PER_CLEAR = ZEFFO_FACT.reward.perSuccessfulClear;
export const ZEFFO_UNITS = Object.freeze({
  cere: "CEREJUNDA",
  jkck: "JEDIKNIGHTCAL",
  babyCal: "CALKESTIS",
});

function memberId(member = {}, index = 0) {
  return text(member.playerId || member.id || member.allyCode || member.name || `member-${index + 1}`);
}

function unitMap(member = {}) {
  return new Map(asArray(member.units)
    .filter((row) => row?.baseId)
    .map((row) => [String(row.baseId).toUpperCase(), row]));
}

export function normalizeZeffoUnitState(unit = null) {
  if (!unit) return Object.freeze({ owned: false, gear: 0, relic: -1, label: "LOCKED", tone: "far" });
  const gear = Math.max(0, Math.floor(finite(unit.gear ?? unit.gearLevel, 0)));
  const relic = Math.max(0, Math.floor(finite(unit.relic ?? unit.relicTier, 0)));
  const reliced = gear >= 13;
  const label = reliced ? `R${relic}` : `G${Math.max(1, gear)}`;
  const tone = reliced && relic >= 7 ? "good" : reliced && relic >= 5 ? "close" : "far";
  return Object.freeze({ owned: true, gear, relic: reliced ? relic : -1, label, tone });
}

function relicSteps(state = {}) {
  if (finite(state.relic, -1) >= 7) return 0;
  if (finite(state.relic, -1) >= 0) return 7 - finite(state.relic, 0);
  if (state.owned) return 8 + Math.max(0, 13 - finite(state.gear, 0));
  return 25;
}

function preferredCal(jkck, babyCal) {
  if (jkck.relic >= 7) return Object.freeze({ id: "jkck", name: "JKCK", state: jkck });
  if (jkck.relic >= 5) return Object.freeze({ id: "jkck", name: "JKCK", state: jkck });
  if (babyCal.relic >= 7) return Object.freeze({ id: "babyCal", name: "Baby Cal", state: babyCal });
  if (babyCal.relic >= 5) return Object.freeze({ id: "babyCal", name: "Baby Cal", state: babyCal });
  if (jkck.owned) return Object.freeze({ id: "jkck", name: "JKCK", state: jkck });
  return Object.freeze({ id: "babyCal", name: "Baby Cal", state: babyCal });
}

function readinessStatus(cere, jkck, babyCal) {
  const bestCal = Math.max(jkck.relic, babyCal.relic);
  if (cere.relic >= 7 && bestCal >= 7) return "READY";
  if (cere.relic >= 5 && bestCal >= 5) return "ALMOST";
  return "FAR";
}

function upgradeText(cere, jkck, babyCal, status) {
  if (status === "READY") {
    if (jkck.relic >= 7 && babyCal.relic >= 7) return "Ready via JKCK + Baby Cal";
    if (jkck.relic >= 7) return "Ready via JKCK";
    return "Ready via Baby Cal";
  }
  const cal = preferredCal(jkck, babyCal);
  const needs = [];
  if (cere.relic < 7) needs.push(`Cere ${cere.label} → R7`);
  if (cal.state.relic < 7) needs.push(`${cal.name} ${cal.state.label} → R7`);
  return needs.join(" + ") || "Ready";
}

export function buildZeffoMemberReadiness(member = {}, index = 0) {
  const units = unitMap(member);
  const cere = normalizeZeffoUnitState(units.get(ZEFFO_UNITS.cere));
  const jkck = normalizeZeffoUnitState(units.get(ZEFFO_UNITS.jkck));
  const babyCal = normalizeZeffoUnitState(units.get(ZEFFO_UNITS.babyCal));
  const status = readinessStatus(cere, jkck, babyCal);
  const cal = preferredCal(jkck, babyCal);
  const priorityScore = relicSteps(cere) + relicSteps(cal.state);
  return Object.freeze({
    id: memberId(member, index),
    playerId: text(member.playerId || member.id),
    allyCode: text(member.allyCode).replace(/\D/g, "").slice(0, 9),
    name: text(member.name || member.playerName || memberId(member, index)),
    galacticPower: finite(member.galacticPower, 0),
    rosterAvailable: member.rosterAvailable === true || asArray(member.units).length > 0,
    profileTitle: playerProfileTitle(member),
    memberLevel: finite(member.memberLevel, 0),
    memberRole: guildMemberRole(member),
    playerPortrait: playerPortraitId(member),
    playerPortraitUrl: playerPortraitUrl(member),
    cere,
    jkck,
    babyCal,
    status,
    preferredPath: cal.name,
    upgradeText: upgradeText(cere, jkck, babyCal, status),
    priorityScore,
  });
}

export function buildGuildZeffoReadiness(guildBody = {}) {
  const members = asArray(guildBody.members).map(buildZeffoMemberReadiness);
  const statusRank = { READY: 0, ALMOST: 1, FAR: 2 };
  const sorted = members.slice().sort((a, b) =>
    statusRank[a.status] - statusRank[b.status]
      || (a.status === "READY" ? (b.jkck.relic - a.jkck.relic) : (a.priorityScore - b.priorityScore))
      || b.galacticPower - a.galacticPower
      || a.name.localeCompare(b.name));
  const ready = sorted.filter((row) => row.status === "READY");
  const almost = sorted.filter((row) => row.status === "ALMOST");
  const far = sorted.filter((row) => row.status === "FAR");
  const jkckReady = ready.filter((row) => row.cere.relic >= 7 && row.jkck.relic >= 7).length;
  const babyFallback = ready.filter((row) => row.cere.relic >= 7 && row.jkck.relic < 7 && row.babyCal.relic >= 7).length;
  const rosterUnavailable = sorted.filter((row) => !row.rosterAvailable).length;
  const potentialSuccessfulClears = ready.length;
  const rewardOpportunity = potentialMissionReward('zeffo', potentialSuccessfulClears);
  return Object.freeze({
    missionId: 'zeffo',
    missionName: 'Bracca / Zeffo Unlock',
    rewardMode: 'unlock-with-mission-reward',
    rewardCurrency: ZEFFO_FACT.reward.currency,
    rewardPerSuccessfulClear: ZEFFO_FACT.reward,
    source: ZEFFO_FACT.source,
    guild: Object.freeze({
      id: text(guildBody?.guild?.id),
      name: text(guildBody?.guild?.name || "Guild"),
      galacticPower: finite(guildBody?.guild?.galacticPower, 0),
      memberCount: finite(guildBody?.guild?.memberCount, sorted.length),
    }),
    fetchedAt: text(guildBody.fetchedAt),
    unlockTarget: ZEFFO_UNLOCK_TARGET,
    members: Object.freeze(sorted),
    actionMembers: Object.freeze([...almost, ...far]),
    summary: Object.freeze({
      total: sorted.length,
      ready: ready.length,
      almost: almost.length,
      far: far.length,
      jkckReady,
      babyFallback,
      rosterUnavailable,
      potentialSuccessfulClears,
      potentialGet3: rewardOpportunity?.amount || 0,
      theoreticalGet3Maximum: rewardOpportunity?.theoreticalGuildMaximum || 0,
      unlockShortfall: Math.max(0, ZEFFO_UNLOCK_TARGET - potentialSuccessfulClears),
      buffer: ready.length - ZEFFO_UNLOCK_TARGET,
      canFieldUnlockCount: ready.length >= ZEFFO_UNLOCK_TARGET,
    }),
  });
}

export function filterGuildZeffoRows(rows = [], options = {}) {
  const query = text(options.search).toLowerCase().replace(/-/g, "");
  const status = text(options.status || "ALL").toUpperCase();
  return Object.freeze(asArray(rows).filter((row) => {
    if (status !== "ALL" && row.status !== status) return false;
    if (!query) return true;
    return [row.name, row.allyCode, row.status, row.preferredPath, row.upgradeText, row.profileTitle, row.memberRole]
      .join(" ").toLowerCase().replace(/-/g, "").includes(query);
  }));
}
