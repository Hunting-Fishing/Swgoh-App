import { squadAbilityReadiness } from "./gac-ability-intelligence.js";
import "./gac-war-room-counter-inspector.js";
import "./gac-war-room-attack-brief.js";

const state = {
  requestId: 0,
  timer: null,
  key: "",
  context: null,
};

const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function characterUnits(body = {}) {
  return (Array.isArray(body?.units) ? body.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() !== "ship");
}
function rosterIndex(body = {}) {
  return new Map(characterUnits(body)
    .map((unit) => [normalizeBaseId(unit?.baseId), unit])
    .filter(([id]) => Boolean(id)));
}
function sumMetric(units, key) {
  return (Array.isArray(units) ? units : []).reduce((sum, unit) => sum + finite(unit?.[key]), 0);
}
function fastestSpeed(units) {
  return (Array.isArray(units) ? units : []).reduce((max, unit) => Math.max(max, finite(unit?.speed)), 0);
}
function formatSigned(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  if (!numeric) return "0";
  return `${numeric > 0 ? "+" : "−"}${number.format(Math.abs(numeric))}`;
}
function abilityScore(readiness) {
  return readiness?.known === true && Number.isFinite(Number(readiness?.score)) ? Number(readiness.score) : null;
}

function matchupDelta(attackerUnits = [], defenderUnits = []) {
  const attackers = Array.isArray(attackerUnits) ? attackerUnits.filter(Boolean) : [];
  const defenders = Array.isArray(defenderUnits) ? defenderUnits.filter(Boolean) : [];
  if (!attackers.length || !defenders.length) {
    return Object.freeze({
      known: false,
      relicDelta: null,
      zetaDelta: null,
      omicronDelta: null,
      speedDelta: null,
      abilityDelta: null,
      attackerAbilityScore: null,
      defenderAbilityScore: null,
    });
  }

  const attackerAbility = squadAbilityReadiness(attackers);
  const defenderAbility = squadAbilityReadiness(defenders);
  const attackerAbilityScore = abilityScore(attackerAbility);
  const defenderAbilityScore = abilityScore(defenderAbility);
  const attackerFastest = fastestSpeed(attackers);
  const defenderFastest = fastestSpeed(defenders);
  const speedKnown = attackerFastest > 0 && defenderFastest > 0;

  return Object.freeze({
    known: true,
    relicDelta: sumMetric(attackers, "relic") - sumMetric(defenders, "relic"),
    zetaDelta: sumMetric(attackers, "zetas") - sumMetric(defenders, "zetas"),
    omicronDelta: sumMetric(attackers, "omicrons") - sumMetric(defenders, "omicrons"),
    speedDelta: speedKnown ? attackerFastest - defenderFastest : null,
    abilityDelta: attackerAbilityScore !== null && defenderAbilityScore !== null
      ? attackerAbilityScore - defenderAbilityScore
      : null,
    attackerAbilityScore,
    defenderAbilityScore,
    attackerAbilityKnown: attackerAbility?.known === true,
    defenderAbilityKnown: defenderAbility?.known === true,
    attackerAbilityCoverage: attackerAbility?.known === true ? finite(attackerAbility.coverage) : null,
    defenderAbilityCoverage: defenderAbility?.known === true ? finite(defenderAbility.coverage) : null,
  });
}

function identity() {
  if (typeof document === "undefined") return null;
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  if (!/^\d{9}$/.test(mine) || !/^\d{9}$/.test(opponent) || !round) return null;
  return Object.freeze({ mine, opponent, round, key: `${mine}|${opponent}|${round}` });
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function loadContext(current, force = false) {
  if (!force && state.key === current.key && state.context) return state.context;
  const [mineRoster, opponentRoster, board] = await Promise.all([
    fetchJson(`/api/player/${current.mine}`),
    fetchJson(`/api/player/${current.opponent}`),
    fetchJson(`/api/gac/current-board/${current.mine}/defense?round=${current.round}`),
  ]);
  if (allyCode(board?.opponent?.allyCode) !== current.opponent) {
    const error = new Error("Saved enemy board does not match the selected opponent.");
    error.status = 409;
    throw error;
  }
  const context = Object.freeze({
    mineIndex: rosterIndex(mineRoster),
    opponentIndex: rosterIndex(opponentRoster),
    defenses: new Map((Array.isArray(board?.defenses) ? board.defenses : [])
      .map((defense) => [Number(defense?.id || 0), defense])
      .filter(([id]) => id > 0)),
  });
  state.key = current.key;
  state.context = context;
  return context;
}

function unitsForIds(index, ids) {
  return (Array.isArray(ids) ? ids : [])
    .map(normalizeBaseId)
    .filter(Boolean)
    .map((id) => index.get(id))
    .filter(Boolean);
}
function cardAttackerIds(card) {
  return clean(card?.dataset?.recommendedAttackerMembers)
    .split(",")
    .map(normalizeBaseId)
    .filter(Boolean);
}
function metricCell(label, value, title = "") {
  return `<b${title ? ` title="${title}"` : ""}><small>${label}</small><strong>${value}</strong></b>`;
}
function renderCard(card, context) {
  card.querySelector(".gac-war-room-matchup-deltas")?.remove();
  const defenseId = Number(card?.dataset?.defenseId || 0);
  const defense = context.defenses.get(defenseId);
  const attackerIds = cardAttackerIds(card);
  if (!defense || !attackerIds.length) return;

  const attackers = unitsForIds(context.mineIndex, attackerIds);
  const defenderIds = Array.isArray(defense?.members) ? defense.members : [];
  const defenders = unitsForIds(context.opponentIndex, defenderIds);
  if (attackers.length !== attackerIds.length || defenders.length !== defenderIds.length) return;

  const metrics = matchupDelta(attackers, defenders);
  if (!metrics.known) return;
  const abilityTitle = metrics.attackerAbilityScore !== null && metrics.defenderAbilityScore !== null
    ? `Attacker ability readiness ${metrics.attackerAbilityScore} vs defense ${metrics.defenderAbilityScore}. Readiness is a roster heuristic, not a claimed counter-specific minimum.`
    : "Ability readiness is unknown because one or more ability profiles are unresolved.";
  const strip = document.createElement("div");
  strip.className = "gac-war-room-matchup-deltas";
  strip.innerHTML = `<span>ATTACK ↔ DEFENSE DELTA</span>${metricCell("Relic Δ", formatSigned(metrics.relicDelta))}${metricCell("Zeta Δ", formatSigned(metrics.zetaDelta))}${metricCell("Omicron Δ", formatSigned(metrics.omicronDelta))}${metricCell("Fastest Δ", formatSigned(metrics.speedDelta), "Fastest known attacker speed minus fastest known defender speed.")}${metricCell("Ability Δ", formatSigned(metrics.abilityDelta), abilityTitle)}<small>Roster evidence only · unknown values remain — · historical win evidence stays separate.</small>`;
  const strategy = card.querySelector(".gac-board-strategy");
  if (strategy) strategy.insertAdjacentElement("beforebegin", strip);
  else card.append(strip);
}

function injectStyles() {
  if (typeof document === "undefined" || document.querySelector('link[data-gac-war-room-deltas="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-war-room-matchup-deltas.css?v=20260820-gacdeltas1";
  link.dataset.gacWarRoomDeltas = "true";
  document.head.append(link);
}

async function refresh({ force = false } = {}) {
  const current = identity();
  if (!current) return;
  const cards = [...document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")];
  if (!cards.length) return;
  const requestId = ++state.requestId;
  try {
    const context = await loadContext(current, force);
    if (requestId !== state.requestId) return;
    for (const card of cards) renderCard(card, context);
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (![401, 409].includes(Number(error?.status))) console.warn("GAC War Room matchup deltas unavailable", error);
  }
}
function schedule(delay = 160, options = {}) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(options), Math.max(0, delay));
}
function invalidate() {
  state.key = "";
  state.context = null;
}
function bind() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (document.documentElement.dataset.gacWarRoomDeltasBound === "true") return;
  document.documentElement.dataset.gacWarRoomDeltasBound = "true";
  injectStyles();
  window.addEventListener("gac-saved-board-rendered", () => schedule(220));
  window.addEventListener("gac-war-room-updated", () => schedule(160));
  window.addEventListener("gac-board-evidence-updated", () => {
    invalidate();
    schedule(200, { force: true });
  });
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacOpponentCode", "gacBracketRound", "gacMode"].includes(event.target?.id)) {
      invalidate();
      schedule(220, { force: true });
    }
  });
  window.addEventListener("hashchange", invalidate);
  document.addEventListener("DOMContentLoaded", () => schedule(300), { once: true });
  schedule(420);
}

if (typeof window !== "undefined" && typeof document !== "undefined") bind();

export {
  abilityScore,
  cardAttackerIds,
  characterUnits,
  fastestSpeed,
  formatSigned,
  matchupDelta,
  normalizeBaseId,
  rosterIndex,
  sumMetric,
  unitsForIds,
};
