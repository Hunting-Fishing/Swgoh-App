import { ROTE_PLANETS, rotePlanetById } from "./rote-map-data.js";
import { ROTE_MISSION_SOURCES, roteMissionsForPlanet, ROTE_MISSION_COUNT } from "./rote-mission-data.js";
import { normalizeRoteMissions } from "./rote-mission-overrides.js";
import {
  allRosterUnits,
  legalRosterCandidates,
  mandatoryRosterStatus,
  missionRosterEntrySummary,
  recommendationLabel,
  recommendationRosterFit,
  recommendationUpgradeRows,
} from "./tb-mission-intelligence.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "—";
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const NAME_OVERRIDE = Object.freeze({ haven: "Medical Station", kafrene: "Ring of Kafrene" });

const state = {
  initialized: false,
  selectedPlanet: "mustafar",
  view: localStorage.getItem("swgoh:rote-command-view") === "operations" ? "operations" : "map",
  renderQueued: false,
};

function liveBody() {
  const allyCode = digits($("allyCode")?.value);
  const snapshot = window.__swgohLiveSnapshot;
  if (allyCode.length === 9 && snapshot?.allyCode === allyCode && snapshot?.body) return snapshot.body;
  return null;
}

function ensureCss() {
  const href = "/rote-mission-pro.css?v=20260815-rotemission1";
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function ensureHost() {
  const panel = $("workspace-rote");
  const board = $("roteMissionBoard");
  if (!panel || !board) return null;
  let host = $("roteExactMissionIntel");
  if (!host) {
    host = document.createElement("section");
    host.id = "roteExactMissionIntel";
    host.className = "rote-exact-intel";
    board.insertAdjacentElement("afterend", host);
  }
  panel.classList.add("rote-exact-enabled");
  return host;
}

function planetName(id) {
  const planet = rotePlanetById(id);
  return NAME_OVERRIDE[id] || planet?.name || id;
}

function requirementText(mission) {
  const entry = mission.entry || {};
  if (!entry.verified) return "Entry rule pending verification";
  const bits = [];
  if (entry.unitType === "Ship") bits.push(`${entry.starsMin || 7}★ ships`);
  else {
    if (entry.allowedAlignments?.length) bits.push(entry.allowedAlignments.join(" / "));
    else if (entry.alignment && entry.alignment !== "Mixed") bits.push(`${entry.alignment} Side`);
    if (entry.requiredCategories?.length) bits.push(entry.requiredCategories.join(entry.categoryMode === "any" ? " OR " : " + "));
    bits.push(`${entry.starsMin || 7}★`);
    if (entry.relicMin != null) bits.push(`R${entry.relicMin}+`);
  }
  if (entry.mandatoryMembers?.length) {
    bits.push(`Required: ${entry.mandatoryMembers.map((member) => {
      const threshold = member.relicMin != null ? ` R${member.relicMin}` : "";
      return `${member.name || member.baseId}${threshold}`;
    }).join(" + ")}`);
  }
  if (entry.squadSize && entry.squadSize !== 5) bits.push(`${entry.squadSize}-unit mission`);
  return bits.join(" · ");
}

function gapText(row) {
  if (row?.gap?.missing) return "Not owned";
  const gaps = [];
  if (row?.gap?.stars) gaps.push(`+${row.gap.stars}★`);
  if (row?.gap?.power) gaps.push(`+${number(row.gap.power)} GP`);
  if (row?.gap?.gear) gaps.push(`+${row.gap.gear} gear`);
  if (row?.gap?.relic) gaps.push(`+${row.gap.relic} relic`);
  return gaps.join(" · ") || "Entry ready";
}

function avatar(unit, fallbackName = "?") {
  if (unit?.image) return `<img src="${escapeAttr(unit.image)}" alt="" loading="lazy">`;
  const initials = String(unit?.name || fallbackName || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return `<span class="rote-exact-avatar">${escapeHtml(initials)}</span>`;
}

function mandatoryMarkup(body, mission) {
  if (!mission.entry?.mandatoryMembers?.length) return "";
  if (!body) return `<div class="rote-exact-notice">Load an Ally Code to evaluate required units.</div>`;
  const status = mandatoryRosterStatus(body, mission);
  return `<div class="rote-exact-section"><header><div><span>MANDATORY UNITS</span><h4>${status.ready}/${status.total} entry-ready</h4></div></header><div class="rote-exact-mandatory">${status.rows.map((row) => `<div class="rote-exact-unit ${row.legal ? "ready" : row.owned ? "under" : "missing"}">${avatar(row.unit, row.member?.name)}<span><strong>${escapeHtml(row.unit?.name || row.member?.name || row.member?.baseId || "Required unit")}</strong><small>${escapeHtml(row.legal ? "Entry ready" : gapText(row))}</small></span></div>`).join("")}</div></div>`;
}

function candidatesMarkup(body, mission) {
  if (!body) return `<div class="rote-exact-notice">Load an Ally Code to rank the legal roster pool.</div>`;
  if (!mission.entry?.verified) return `<div class="rote-exact-notice warning">Candidate ranking is disabled until this mission's entry rule is verified.</div>`;
  const candidates = legalRosterCandidates(body, mission, Math.max(5, Number(mission.entry.squadSize || 5)));
  if (!candidates.length) return `<div class="rote-exact-notice danger">No owned units currently clear this mission's verified entry gate.</div>`;
  return `<div class="rote-exact-candidates">${candidates.map((unit, index) => `<button type="button" class="rote-exact-unit ready" data-rote-exact-inspect="${escapeAttr(unit.baseId)}">${avatar(unit)}<span><strong>#${index + 1} ${escapeHtml(unit.name || unit.baseId)}</strong><small>${unit.unitType === "Ship" ? `${unit.stars || 0}★ · ${number(unit.power)} GP` : `R${Number(unit.relic || 0)} · ${number(unit.power)} GP · ${number(unit.speed)} SPD`}</small></span></button>`).join("")}</div>`;
}

function teamMarkup(body, mission, recommendation) {
  const fit = recommendationRosterFit(body || {}, mission, recommendation);
  const upgrades = body ? recommendationUpgradeRows(body, mission, recommendation) : [];
  const resolved = fit.rows.filter((row) => row.unit);
  const characterOnly = resolved.length > 0 && resolved.every((row) => String(row.unit.unitType || "Character") !== "Ship");
  const canLoad = Boolean(body && characterOnly && resolved.length === fit.rows.length && fit.rows.length <= 5);
  return `<article class="rote-exact-team"><header><div><span>${escapeHtml(recommendationLabel(mission, recommendation))}</span><strong>${escapeHtml(recommendation.name)}</strong></div><b>${body ? `${fit.legal}/${fit.rows.length}` : "—"}</b></header><div class="rote-exact-team-members">${fit.rows.map((row) => `<div class="rote-exact-unit ${row.legal ? "ready" : row.owned ? "under" : "missing"}">${avatar(row.unit, row.name)}<span><strong>${escapeHtml(row.unit?.name || row.name)}</strong><small>${body ? escapeHtml(row.legal ? "Entry ready" : gapText(row)) : "Load roster"}</small></span></div>`).join("")}</div>${upgrades.length ? `<div class="rote-exact-notice warning"><strong>${upgrades[0].mandatory ? "Mandatory gap" : "First entry gap"}:</strong> ${escapeHtml(upgrades[0].unit?.name || upgrades[0].name)} · ${escapeHtml(gapText(upgrades[0]))}</div>` : ""}<footer>${canLoad ? `<button type="button" data-rote-exact-team="${escapeAttr(recommendation.id)}" data-rote-exact-mission="${escapeAttr(mission.id)}">Load Core</button>` : ""}<small>Planning quality ≠ guaranteed mission success.</small></footer></article>`;
}

function missionStatus(body, mission) {
  if (!body) return { cls: "unloaded", text: "Load roster", summary: null };
  const summary = missionRosterEntrySummary(body, mission);
  if (!summary.verified) return { cls: "blocked", text: "Verify rule", summary };
  if (summary.ready) return { cls: "ready", text: "Entry depth ready", summary };
  if (summary.percent >= 60) return { cls: "close", text: `${summary.percent}% close`, summary };
  return { cls: "blocked", text: `${summary.percent}% blocked`, summary };
}

function missionMarkup(body, mission) {
  const status = missionStatus(body, mission);
  const rewards = mission.rewards?.length ? mission.rewards.join(" · ") : "Mission rewards";
  return `<details class="rote-exact-mission" data-rote-exact-mission-card="${escapeAttr(mission.id)}" ${mission.missionType === "special" ? "open" : ""}><summary><span class="rote-exact-type ${escapeAttr(mission.missionType)}">${escapeHtml(mission.missionType)}</span><span><strong>${escapeHtml(mission.name)}</strong><small>${escapeHtml(requirementText(mission))}</small></span><b class="rote-exact-status ${status.cls}">${escapeHtml(status.text)}</b></summary><div class="rote-exact-body"><div class="rote-exact-rule"><div><span>Exact Entry</span><strong>${escapeHtml(requirementText(mission))}</strong></div><div><span>Rewards</span><strong>${escapeHtml(rewards)}</strong></div><div><span>Verified</span><strong>${mission.entry?.verified ? `Yes · ${escapeHtml(mission.lastVerified || "")}` : "No · fail closed"}</strong></div></div>${mission.entry?.notes ? `<div class="rote-exact-notice">${escapeHtml(mission.entry.notes)}</div>` : ""}${mission.mechanics?.map((item) => `<div class="rote-exact-notice"><strong>Mechanic:</strong> ${escapeHtml(item)}</div>`).join("") || ""}${mandatoryMarkup(body, mission)}<div class="rote-exact-section"><header><div><span>ALLY CODE</span><h4>Best progressed legal candidates</h4></div>${status.summary ? `<span>${status.summary.candidates.length} legal owned</span>` : ""}</header>${candidatesMarkup(body, mission)}</div><div class="rote-exact-section"><header><div><span>TEAM PLANS</span><h4>Sourced / planning cores</h4></div></header>${mission.recommendations?.length ? `<div class="rote-exact-teams">${mission.recommendations.map((recommendation) => teamMarkup(body, mission, recommendation)).join("")}</div>` : `<div class="rote-exact-notice">No battle-team claim is attached yet. Entry legality remains usable.</div>`}</div></div></details>`;
}

function render() {
  state.renderQueued = false;
  const panel = $("workspace-rote");
  const host = ensureHost();
  if (!panel || !host) return;
  const isWorkspaceVisible = !panel.hidden && panel.classList.contains("active");
  const mapView = $("roteMapView");
  const isMapVisible = state.view === "map" && (!mapView || !mapView.hidden);
  host.hidden = !isWorkspaceVisible || !isMapVisible;
  if (host.hidden) return;

  const body = liveBody();
  const planet = rotePlanetById(state.selectedPlanet);
  const missions = normalizeRoteMissions(roteMissionsForPlanet(state.selectedPlanet));
  const readyCount = body ? missions.filter((mission) => missionRosterEntrySummary(body, mission).ready).length : 0;
  host.innerHTML = `<header class="rote-exact-head"><div><div class="kicker">EXACT MISSION INTELLIGENCE · ${escapeHtml(planet.phase)}</div><h3>${escapeHtml(planetName(state.selectedPlanet))}</h3><p>${missions.length} mission records with entry legality separated from battle-team confidence. ${body ? `${readyCount}/${missions.length} currently show sufficient legal roster depth.` : "Load an Ally Code for roster-specific readiness."}</p></div><b>${ROTE_MISSION_COUNT} ROTE MISSION RECORDS</b></header><div class="rote-exact-grid">${missions.map((mission) => missionMarkup(body, mission)).join("")}</div><div class="rote-exact-boundary"><strong>Data boundary:</strong> exact entry restrictions come from the current ROTE zone tables / official bonus-zone posts. Planning cores are never promoted to verified battle teams merely because all five units are owned. Equipped Zeta/Omicron and mod quality will be evaluated in the combat-intelligence layer separately.</div>`;

  for (const button of host.querySelectorAll("[data-rote-exact-inspect]")) {
    button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("swgoh:inspect-unit", { detail: { baseId: button.dataset.roteExactInspect } })));
  }
  for (const button of host.querySelectorAll("[data-rote-exact-team]")) {
    button.addEventListener("click", () => {
      const mission = missions.find((item) => item.id === button.dataset.roteExactMission);
      const recommendation = mission?.recommendations?.find((item) => item.id === button.dataset.roteExactTeam);
      if (!mission || !recommendation || !body) return;
      const fit = recommendationRosterFit(body, mission, recommendation);
      const baseIds = fit.rows.map((row) => row.unit?.baseId).filter(Boolean).slice(0, 5);
      if (!baseIds.length) return;
      window.dispatchEvent(new CustomEvent("swgoh:replace-squad", { detail: { baseIds, size: Math.min(5, baseIds.length), name: `ROTE ${planetName(state.selectedPlanet)} · ${mission.name}` } }));
    });
  }
}

function queueRender(delay = 0) {
  if (state.renderQueued) return;
  state.renderQueued = true;
  setTimeout(render, delay);
}

function install() {
  if (state.initialized) return true;
  const panel = $("workspace-rote");
  if (!panel) return false;
  ensureCss();

  panel.addEventListener("click", (event) => {
    const planet = event.target.closest("[data-rote-planet]");
    if (planet?.dataset?.rotePlanet) {
      state.selectedPlanet = planet.dataset.rotePlanet;
      queueRender(0);
      return;
    }
    const view = event.target.closest("[data-rote-view]");
    if (view?.dataset?.roteView) {
      state.view = view.dataset.roteView;
      queueRender(0);
    }
  });
  $("allyForm")?.addEventListener("submit", () => queueRender(650));
  window.addEventListener("swgoh:workspace-activated", (event) => {
    if (event.detail?.id === "rote") queueRender(50);
  });

  state.initialized = true;
  queueRender(150);
  return true;
}

let attempts = 0;
function boot() {
  attempts += 1;
  if (install() || attempts >= 80) return;
  setTimeout(boot, 75);
}
boot();