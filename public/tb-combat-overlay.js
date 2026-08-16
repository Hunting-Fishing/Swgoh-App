import { hydrateCombatPreparation } from "./tb-combat-prep-ui.js?v=20260815-tbcombat5";
import { missionRosterReadiness } from "./tb-roster-readiness.js?v=20260816-tbmission1";
import { missionStrategyCoverage } from "./tb-strategy-coverage.js?v=20260816-tbmission1";
import { normalizeRoteMissions } from "./rote-mission-overrides.js?v=20260815-tbcombat5";

const STORAGE_KEY = "swgoh:tb-command:selected";
const normalized = (value) => String(value || "").trim().toLowerCase();
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
let runToken = 0;
let dataPromises = new Map();

function ensureReadinessCss() {
  const href = "/tb-mission-readiness.css?v=20260816-tbmission1";
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function liveBody() {
  const digits = String(document.getElementById("allyCode")?.value || "").replace(/\D/g, "").slice(0, 9);
  const snapshot = window.__swgohLiveSnapshot;
  if (digits.length === 9 && snapshot?.allyCode === digits && snapshot?.body) return snapshot.body;
  return null;
}

async function campaignMissions(id) {
  if (dataPromises.has(id)) return dataPromises.get(id);
  const promise = (async () => {
    if (id === "geo-separatist") {
      const data = await import("./ds-geo-mission-overrides.js?v=20260816-dsgeo-strategy1");
      return data.DS_GEO_MISSIONS;
    }
    if (id === "geo-republic") {
      const data = await import("./geo-ls-data.js?v=20260815-tbcombat5");
      return data.GEO_LS_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "hoth-rebel") {
      const data = await import("./hoth-ls-data.js?v=20260815-tbcombat5");
      return data.HOTH_LS_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "hoth-imperial") {
      const data = await import("./hoth-ds-data.js?v=20260815-tbcombat5");
      return data.HOTH_DS_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "rote") {
      const data = await import("./rote-mission-data.js?v=20260815-tbcombat5");
      return normalizeRoteMissions(Object.values(data.ROTE_MISSIONS_BY_PLANET).flat());
    }
    return [];
  })();
  dataPromises.set(id, promise);
  try {
    return await promise;
  } catch (error) {
    dataPromises.delete(id);
    throw error;
  }
}

function recommendationByCard(mission, card) {
  const explicitId = card.dataset.legacyTeam || card.querySelector("[data-dsgeo-load-team]")?.dataset?.dsgeoLoadTeam || card.querySelector("[data-rote-exact-team]")?.dataset?.roteExactTeam || "";
  if (explicitId) {
    const match = mission?.recommendations?.find((item) => String(item.id) === String(explicitId));
    if (match) return match;
  }
  const title = card.querySelector("h5")?.textContent || card.querySelector("header strong")?.textContent || "";
  return mission?.recommendations?.find((item) => normalized(item.name) === normalized(title)) || null;
}

function decorateSlots(root, missions) {
  const byId = new Map(missions.map((mission) => [String(mission.id), mission]));

  for (const card of root.querySelectorAll(".dsgeo-team-card")) {
    const missionNode = card.closest("[data-legacy-mission-id],[data-dsgeo-mission-id]");
    const missionId = missionNode?.dataset?.legacyMissionId || missionNode?.dataset?.dsgeoMissionId || "";
    const mission = byId.get(String(missionId));
    const recommendation = recommendationByCard(mission, card);
    if (!mission || !recommendation) continue;
    let slot = card.querySelector(":scope > .tb-combat-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "tb-combat-slot";
      card.appendChild(slot);
    }
    slot.dataset.tbCombatMission = mission.id;
    slot.dataset.tbCombatTeam = recommendation.id;
  }

  for (const card of root.querySelectorAll(".rote-exact-team")) {
    const missionNode = card.closest("[data-rote-exact-mission-card]");
    const missionId = missionNode?.dataset?.roteExactMissionCard || "";
    const mission = byId.get(String(missionId));
    const recommendation = recommendationByCard(mission, card);
    if (!mission || !recommendation) continue;
    let slot = card.querySelector(":scope > .tb-combat-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "tb-combat-slot";
      card.appendChild(slot);
    }
    slot.dataset.tbCombatMission = mission.id;
    slot.dataset.tbCombatTeam = recommendation.id;
  }
}

function missionNodeId(node) {
  return node?.dataset?.legacyMissionId
    || node?.dataset?.dsgeoMissionId
    || node?.dataset?.roteExactMissionCard
    || "";
}

function rosterDetail(readiness) {
  if (!readiness) return "Load an Ally Code for live roster evaluation.";
  if (readiness.missingUnits?.length) return `Missing: ${readiness.missingUnits.slice(0, 3).map((row) => row.name || row.baseId).join(", ")}${readiness.missingUnits.length > 3 ? "…" : ""}`;
  if (readiness.progressionGaps?.length) return `Progression: ${readiness.progressionGaps.slice(0, 3).map((row) => row.name || row.baseId).join(", ")}${readiness.progressionGaps.length > 3 ? "…" : ""}`;
  if (readiness.modGaps?.length) return `Mods: ${readiness.modGaps.slice(0, 3).map((row) => `${row.name || row.baseId} +${row.gap || 0} SPD`).join(", ")}${readiness.modGaps.length > 3 ? "…" : ""}`;
  if (readiness.label === "READY WITH SUBSTITUTE") return "Legal roster depth exists, but the preferred sourced core is not an exact fit.";
  return readiness.recommendationId ? "Entry gate and sourced recommendation fit are ready." : "Verified mission-entry depth is ready.";
}

function strategyDetail(coverage) {
  if (coverage.coverage === "covered") return `${coverage.sourceCount || 0} sources · ${coverage.stageCount || 0} execution stage${coverage.stageCount === 1 ? "" : "s"}.`;
  if (coverage.coverage === "partial" && coverage.strategyAvailable) return `${coverage.sourceCount || 0} sources · sourced strategy exists but evidence remains partial/unverified.`;
  if (coverage.coverage === "partial") return `${coverage.recommendationCount || 0} planning core${coverage.recommendationCount === 1 ? "" : "s"} · no verified execution pack yet.`;
  return "No sourced strategy pack or planning evidence resolves yet.";
}

function decorateMissionReadiness(root, body, missions) {
  ensureReadinessCss();
  const byId = new Map(missions.map((mission) => [String(mission.id), mission]));
  const nodes = root.querySelectorAll("[data-legacy-mission-id],[data-dsgeo-mission-id],[data-rote-exact-mission-card]");

  for (const node of nodes) {
    const mission = byId.get(String(missionNodeId(node)));
    if (!mission) continue;
    const coverage = missionStrategyCoverage(mission);
    const readiness = body ? missionRosterReadiness(body, mission) : null;
    const rosterLabel = readiness?.label || "LOAD ALLY CODE";
    const rosterLevel = readiness?.level || "unknown";
    const strategyLabel = readiness?.strategy?.label || (coverage.coverage === "covered" ? "STRATEGY AVAILABLE" : "NO VERIFIED STRATEGY YET");
    const strategyLevel = coverage.coverage === "covered" ? "ready" : coverage.coverage === "partial" ? "warning" : "unknown";
    const bodyNode = node.querySelector(".dsgeo-mission-body,.rote-exact-body");
    if (!bodyNode) continue;

    let strip = bodyNode.querySelector(":scope > .tb-mission-readiness-strip");
    if (!strip) {
      strip = document.createElement("div");
      bodyNode.insertAdjacentElement("afterbegin", strip);
    }
    strip.className = "tb-mission-readiness-strip";
    strip.innerHTML = `<div class="${escapeHtml(rosterLevel)}"><span>Roster Readiness</span><strong>${escapeHtml(rosterLabel)}</strong><small>${escapeHtml(rosterDetail(readiness))}</small></div><div class="${escapeHtml(strategyLevel)}"><span>Strategy Evidence <b>${escapeHtml(String(coverage.coverage || "missing").toUpperCase())}</b></span><strong>${escapeHtml(strategyLabel)}</strong><small>${escapeHtml(strategyDetail(coverage))}</small></div>`;
  }
}

async function decorateVisible() {
  const token = ++runToken;
  const panel = document.getElementById("workspace-rote");
  if (!panel || panel.hidden || !panel.classList.contains("active")) return;
  const campaignId = localStorage.getItem(STORAGE_KEY) || "rote";
  const missions = await campaignMissions(campaignId);
  if (token !== runToken) return;
  const body = liveBody();
  decorateMissionReadiness(panel, body, missions);
  if (!body) return;
  decorateSlots(panel, missions);
  await hydrateCombatPreparation(panel, body, missions);
}

function schedule(...delays) {
  for (const delay of delays) setTimeout(() => void decorateVisible(), delay);
}

window.addEventListener("swgoh:workspace-activated", (event) => {
  if (event.detail?.id === "rote") schedule(40, 350, 1000);
});
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-tb-select],[data-legacy-territory],[data-dsgeo-territory],[data-rote-planet]")) schedule(40, 300, 1000);
}, true);
document.getElementById("allyForm")?.addEventListener("submit", () => schedule(700, 1300));

schedule(250, 1200);
