import { hydrateCombatPreparation } from "./tb-combat-prep-ui.js";

const STORAGE_KEY = "swgoh:tb-command:selected";
const normalized = (value) => String(value || "").trim().toLowerCase();
let runToken = 0;
let dataPromises = new Map();

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
      const data = await import("./ds-geo-data.js?v=20260815-tbcombat1");
      return data.DS_GEO_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "geo-republic") {
      const data = await import("./geo-ls-data.js?v=20260815-tbcombat1");
      return data.GEO_LS_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "hoth-rebel") {
      const data = await import("./hoth-ls-data.js?v=20260815-tbcombat1");
      return data.HOTH_LS_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "hoth-imperial") {
      const data = await import("./hoth-ds-data.js?v=20260815-tbcombat1");
      return data.HOTH_DS_TERRITORIES.flatMap((territory) => territory.missions);
    }
    if (id === "rote") {
      const data = await import("./rote-mission-data.js?v=20260815-tbcombat1");
      return Object.values(data.ROTE_MISSIONS_BY_PLANET).flat();
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

async function decorateVisible() {
  const token = ++runToken;
  const panel = document.getElementById("workspace-rote");
  if (!panel || panel.hidden || !panel.classList.contains("active")) return;
  const body = liveBody();
  if (!body) return;
  const campaignId = localStorage.getItem(STORAGE_KEY) || "rote";
  const missions = await campaignMissions(campaignId);
  if (token !== runToken) return;
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
