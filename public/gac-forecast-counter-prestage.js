import { hybridBoardPlan } from "./gac-hybrid-board-plan.js";
import { formatSigned as formatMatchupSigned, matchupDelta } from "./gac-war-room-matchup-deltas.js";
import {
  allocationByForecastIndex,
  defenderUnits,
  evidenceMapFromBatch,
  forecastEntries,
  leadersForEntries,
  modeFormat,
  modeSize,
  planningContextLabel,
  planningExclusions,
  validRound,
} from "./gac-forecast-counter-prestage-model.js";

const state = {
  requestId: 0,
  timer: null,
  scoutingKey: "",
  scoutingReport: null,
  opponentRoster: null,
  mineRosterKey: "",
  mineRoster: null,
  grid: null,
  gridObserver: null,
};
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  }[char]));
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

async function fetchOptional(pathname) {
  try {
    return Object.freeze({ known: true, body: await fetchJson(pathname), error: null });
  } catch (error) {
    return Object.freeze({ known: false, body: null, error });
  }
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-forecast-prestage="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-forecast-counter-prestage.css?v=20260820-gacprestage1";
  link.dataset.gacForecastPrestage = "true";
  document.head.append(link);
}

function ensureStatus() {
  const meta = byId("gacScoutPredictionMeta");
  if (!meta) return null;
  let output = byId("gacForecastCounterStatus");
  if (output) return output;
  output = document.createElement("div");
  output.id = "gacForecastCounterStatus";
  output.className = "gac-forecast-counter-status is-idle";
  output.textContent = "COUNTER PRE-STAGE · waiting for forecast evidence";
  meta.insertAdjacentElement("afterend", output);
  return output;
}

function setStatus(kind, text) {
  const output = ensureStatus();
  if (!output) return;
  output.className = `gac-forecast-counter-status is-${kind}`;
  output.textContent = text;
}

function clearRendered() {
  document.querySelectorAll(".gac-scout-prediction-card .gac-forecast-prestage").forEach((node) => node.remove());
}

function cardForEntry(entry) {
  const cards = [...document.querySelectorAll("#gacScoutPredictionGrid .gac-scout-prediction-card")];
  return cards[Number(entry?.forecastIndex)] || null;
}

function portrait(unit = {}) {
  const name = clean(unit?.name || unit?.baseId) || "Unknown";
  const image = clean(unit?.image);
  if (image) {
    return `<span class="gac-prestage-unit" title="${escapeHtml(name)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`;
  }
  return `<span class="gac-prestage-unit" title="${escapeHtml(name)}"><span>${escapeHtml(name.slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}

function deltaPills(recommendation, defenders) {
  const metrics = matchupDelta(recommendation?.squad || [], defenders || []);
  if (!metrics?.known) return "";
  return `<div class="gac-prestage-deltas">
    <span>Relic Δ <strong>${escapeHtml(formatMatchupSigned(metrics.relicDelta))}</strong></span>
    <span>Zeta Δ <strong>${escapeHtml(formatMatchupSigned(metrics.zetaDelta))}</strong></span>
    <span>Omicron Δ <strong>${escapeHtml(formatMatchupSigned(metrics.omicronDelta))}</strong></span>
    <span>Fastest Δ <strong>${escapeHtml(formatMatchupSigned(metrics.speedDelta))}</strong></span>
    <span>Ability Δ <strong>${escapeHtml(formatMatchupSigned(metrics.abilityDelta))}</strong></span>
  </div>`;
}

function evidenceLine(assignment, recommendation) {
  const battles = Math.max(0, Number(recommendation?.battles || 0));
  const wins = Math.max(0, Number(recommendation?.wins || 0));
  const rate = recommendation?.observedWinRate == null
    ? ""
    : ` · ${number.format(Math.round(Number(recommendation.observedWinRate) * 1000) / 10)}% observed wins`;
  return `<strong>HISTORICAL COUNTER EVIDENCE · EXACT FORECAST TEAM</strong><span>${number.format(wins)}/${number.format(battles)} observed wins${rate} · ${escapeHtml(assignment?.reliability?.label || "historical sample")}</span>`;
}

function heuristicLine(recommendation) {
  return `<strong>ROSTER-FIT FALLBACK</strong><span>${escapeHtml(recommendation?.confidence || "Roster-fit recommendation")} · Fit ${number.format(Number(recommendation?.score || 0))}</span>`;
}

function renderAssignment(entry, assignment, context) {
  const card = cardForEntry(entry);
  if (!card) return;
  card.querySelector(".gac-forecast-prestage")?.remove();
  const box = document.createElement("section");
  box.className = "gac-forecast-prestage";
  const recommendation = assignment?.recommendation || null;
  if (!recommendation?.squad?.length) {
    box.classList.add("is-empty");
    box.innerHTML = `<div class="gac-prestage-heading"><span>ADVISORY COUNTER PRE-STAGE</span><strong>No non-overlapping squad remained</strong></div><small>This is forecast planning only. No attack squad was locked or written to the War Room.</small>`;
    card.append(box);
    return;
  }

  const evidenceBacked = assignment?.source === "historical-counter-evidence" || recommendation?.source === "historical-counter-evidence";
  const defenders = defenderUnits(entry, context.opponentRoster);
  const explanation = evidenceBacked ? evidenceLine(assignment, recommendation) : heuristicLine(recommendation);
  box.dataset.source = evidenceBacked ? "evidence" : "heuristic";
  box.innerHTML = `
    <div class="gac-prestage-heading"><span>ADVISORY COUNTER PRE-STAGE</span>${explanation}</div>
    <div class="gac-prestage-units">${recommendation.squad.map(portrait).join("")}</div>
    ${deltaPills(recommendation, defenders)}
    <div class="gac-prestage-allocation"><strong>Board-wide allocation:</strong> ${escapeHtml(assignment?.allocationReason || "non-overlapping forecast allocation")} · ${number.format(Number(assignment?.alternativesRemaining || 0))} alternate${Number(assignment?.alternativesRemaining || 0) === 1 ? "" : "s"} remained.</div>
    <small>Forecast advisory only · this squad is not locked · verified current-board evidence remains authoritative.</small>`;
  card.append(box);
}

async function planningContext(mine, round) {
  if (!round) {
    return Object.freeze({ round: null, ownDefenseKnown: false, attackPlanKnown: false, ownDefenses: [], assignments: [], exclusions: [] });
  }
  const [ownDefense, attackPlan] = await Promise.all([
    fetchOptional(`/api/gac/current-board/${mine}/my-defense?round=${round}`),
    fetchOptional(`/api/gac/attack-plan/${mine}?round=${round}`),
  ]);
  const ownDefenses = ownDefense.known && Array.isArray(ownDefense.body?.defenses) ? ownDefense.body.defenses : [];
  const assignments = attackPlan.known && Array.isArray(attackPlan.body?.assignments) ? attackPlan.body.assignments : [];
  return Object.freeze({
    round,
    ownDefenseKnown: ownDefense.known,
    attackPlanKnown: attackPlan.known,
    ownDefenses: Object.freeze(ownDefenses),
    assignments: Object.freeze(assignments),
    exclusions: Object.freeze(planningExclusions(ownDefenses, assignments)),
  });
}

async function loadEvidence(entries, format) {
  const leaders = leadersForEntries(entries);
  if (!leaders.length || !format) return Object.freeze({ known: true, map: new Map() });
  try {
    const body = await fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(format)}&leaders=${encodeURIComponent(leaders.join(","))}&limit=40`);
    return Object.freeze({ known: true, map: evidenceMapFromBatch(body) });
  } catch {
    return Object.freeze({ known: false, map: new Map() });
  }
}

function clearForecastCache() {
  state.scoutingKey = "";
  state.scoutingReport = null;
  state.opponentRoster = null;
}

async function loadForecastData(opponent) {
  if (state.scoutingKey === opponent && state.scoutingReport && state.opponentRoster) {
    return Object.freeze({ report: state.scoutingReport, opponentRoster: state.opponentRoster });
  }
  const [report, opponentRoster] = await Promise.all([
    fetchJson(`/api/gac/scouting/${opponent}?limit=2500&import=0`),
    fetchJson(`/api/player/${opponent}`),
  ]);
  state.scoutingKey = opponent;
  state.scoutingReport = report;
  state.opponentRoster = opponentRoster;
  return Object.freeze({ report, opponentRoster });
}

async function loadMineRoster(mine) {
  if (state.mineRosterKey === mine && state.mineRoster) return state.mineRoster;
  const roster = await fetchJson(`/api/player/${mine}`);
  state.mineRosterKey = mine;
  state.mineRoster = roster;
  return roster;
}

async function refresh() {
  const cards = document.querySelectorAll("#gacScoutPredictionGrid .gac-scout-prediction-card");
  if (!cards.length) {
    clearRendered();
    return;
  }
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(mine) || !/^\d{9}$/.test(opponent)) {
    clearRendered();
    setStatus("idle", "COUNTER PRE-STAGE · load your Ally Code and opponent first");
    return;
  }
  const mode = byId("gacMode")?.value || "5";
  const size = modeSize(mode);
  const format = modeFormat(mode) || (size === 3 ? "3v3" : "5v5");
  const round = validRound(byId("gacBracketRound")?.value);
  const requestId = ++state.requestId;
  setStatus("checking", "COUNTER PRE-STAGE · allocating scarce squads across forecast defenses…");
  try {
    const [{ report, opponentRoster }, mineRoster, context] = await Promise.all([
      loadForecastData(opponent),
      loadMineRoster(mine),
      planningContext(mine, round),
    ]);
    if (requestId !== state.requestId) return;
    const prediction = report?.defensePrediction;
    if (!prediction || prediction?.unavailable || prediction?.truth !== "historical-prediction-not-current-board") {
      clearRendered();
      setStatus("idle", "COUNTER PRE-STAGE · historical defense prediction evidence unavailable");
      return;
    }
    const entries = forecastEntries(prediction, mode, 8);
    if (!entries.length) {
      clearRendered();
      setStatus("idle", `COUNTER PRE-STAGE · no ${format} forecast teams to allocate`);
      return;
    }
    const evidence = await loadEvidence(entries, format);
    if (requestId !== state.requestId) return;
    const plan = hybridBoardPlan(mineRoster, opponentRoster, entries, evidence.map, {
      size,
      excludeBaseIds: context.exclusions,
    });
    const assignments = allocationByForecastIndex(plan);
    clearRendered();
    for (const entry of entries) renderAssignment(entry, assignments.get(entry.forecastIndex), { opponentRoster });
    const evidenceCount = Number(plan?.evidenceDefenseCount || 0);
    const heuristicCount = Number(plan?.heuristicDefenseCount || 0);
    const evidenceText = evidence.known ? `${evidenceCount} evidence-backed` : "counter evidence unavailable; heuristic fallback active";
    setStatus(
      context.ownDefenseKnown && context.attackPlanKnown ? "ready" : "partial",
      `COUNTER PRE-STAGE · ${planningContextLabel(context)} · ${evidenceText}${evidence.known ? ` · ${heuristicCount} heuristic` : ""}`,
    );
  } catch (error) {
    if (requestId !== state.requestId) return;
    clearRendered();
    setStatus("error", `COUNTER PRE-STAGE · unavailable: ${clean(error?.message || "roster planning failed")}`);
  }
}

function schedule(delay = 140) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(), Math.max(0, delay));
}

function watchForecastGrid() {
  const grid = byId("gacScoutPredictionGrid");
  if (!grid || state.grid === grid) return;
  state.gridObserver?.disconnect();
  state.grid = grid;
  state.gridObserver = new MutationObserver(() => schedule(120));
  state.gridObserver.observe(grid, { childList: true });
  schedule(180);
}

function bindControls() {
  const opponent = byId("gacOpponentCode");
  if (opponent && opponent.dataset.gacForecastPrestageBound !== "true") {
    opponent.dataset.gacForecastPrestageBound = "true";
    opponent.addEventListener("input", () => {
      clearForecastCache();
      clearRendered();
    });
  }
  const mine = byId("allyCode");
  if (mine && mine.dataset.gacForecastPrestageBound !== "true") {
    mine.dataset.gacForecastPrestageBound = "true";
    mine.addEventListener("change", () => {
      state.mineRosterKey = "";
      state.mineRoster = null;
      schedule(180);
    });
  }
  const round = byId("gacBracketRound");
  if (round && round.dataset.gacForecastPrestageBound !== "true") {
    round.dataset.gacForecastPrestageBound = "true";
    round.addEventListener("change", () => schedule(160));
  }
}

function ensureMounted() {
  injectStylesheet();
  ensureStatus();
  watchForecastGrid();
  bindControls();
}

function bind() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (document.documentElement.dataset.gacForecastPrestageBound === "true") return;
  document.documentElement.dataset.gacForecastPrestageBound = "true";
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
  window.addEventListener("gac-board-evidence-updated", () => {
    clearForecastCache();
    schedule(160);
  });
  window.addEventListener("gac-war-room-updated", () => schedule(140));
  window.addEventListener("gac-current-opponent-auto-resolved", () => {
    clearForecastCache();
    schedule(220);
  });
  new MutationObserver(() => ensureMounted()).observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof window !== "undefined" && typeof document !== "undefined") bind();

export {
  clearForecastCache,
  fetchOptional,
  loadEvidence,
  loadForecastData,
  planningContext,
};
