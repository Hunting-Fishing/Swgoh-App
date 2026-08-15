import { hydrateMissionLevelStrategies } from "./tb-mission-strategy-ui.js?v=20260815-tbstrategy3";
import { normalizeRoteMissions } from "./rote-mission-overrides.js?v=20260815-tbstrategy3";

let runToken = 0;
let missionsPromise = null;

async function roteMissions() {
  missionsPromise ||= import("./rote-mission-data.js?v=20260815-tbstrategy3")
    .then((data) => normalizeRoteMissions(Object.values(data.ROTE_MISSIONS_BY_PLANET || {}).flat()))
    .catch((error) => {
      missionsPromise = null;
      throw error;
    });
  return missionsPromise;
}

function decorateSlots(root) {
  for (const card of root.querySelectorAll("[data-rote-exact-mission-card]")) {
    const missionId = String(card.dataset.roteExactMissionCard || "");
    if (!missionId) continue;
    let slot = card.querySelector(":scope > .rote-exact-body > [data-tb-mission-strategy]");
    if (slot) {
      slot.dataset.tbMissionStrategy = missionId;
      continue;
    }
    const body = card.querySelector(":scope > .rote-exact-body");
    if (!body) continue;
    slot = document.createElement("div");
    slot.className = "tb-mission-strategy-slot";
    slot.dataset.tbMissionStrategy = missionId;
    const teamSection = [...body.querySelectorAll(":scope > .rote-exact-section")].find((section) => /TEAM PLANS/i.test(section.textContent || ""));
    if (teamSection) teamSection.insertAdjacentElement("beforebegin", slot);
    else body.appendChild(slot);
  }
}

async function hydrateVisible() {
  const token = ++runToken;
  const panel = document.getElementById("workspace-rote");
  if (!panel || panel.hidden || !panel.classList.contains("active")) return;
  const cards = panel.querySelectorAll("[data-rote-exact-mission-card]");
  if (!cards.length) return;
  const missions = await roteMissions();
  if (token !== runToken) return;
  decorateSlots(panel);
  hydrateMissionLevelStrategies(panel, missions);
}

function schedule(...delays) {
  for (const delay of delays) setTimeout(() => void hydrateVisible(), delay);
}

window.addEventListener("swgoh:workspace-activated", (event) => {
  if (event.detail?.id === "rote") schedule(60, 350, 900);
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-rote-planet],[data-rote-view],[data-tb-select]")) schedule(50, 300, 850);
}, true);

document.getElementById("allyForm")?.addEventListener("submit", () => schedule(750, 1300));

schedule(350, 1200);
