import './rote-tactical-map-integration.js';
import { rotePlanetById } from "./rote-map-data.js";
import { ROTE_MISSIONS_BY_PLANET } from "./rote-mission-data.js";
import { TB_MISSION_VISUAL_ASSETS } from "./tb-visual-assets-data.js";
import { hydrateCombatPreparation } from "./tb-combat-prep-ui.js";
import { ROTE_P1_MISSION_MAP_SOURCE } from "./rote-mission-map-p1-data.js";
import { roteMissionMap } from "./rote-mission-map-registry.js";

const selectedNodeByPlanet = new Map();
let scheduled = false;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function selectedPlanetId() {
  return document.querySelector("#roteGalaxyMap [data-rote-planet].selected")?.dataset.rotePlanet || "";
}

function liveBody() {
  return window.__swgohLiveSnapshot?.body || null;
}

function phaseLabel(planetId) {
  const phase = String(rotePlanetById(planetId)?.phase || "");
  return /^P\d+$/.test(phase) ? `PHASE ${phase.slice(1)}` : phase || "ROTE";
}

function missionIcon(type) {
  return TB_MISSION_VISUAL_ASSETS[type] || TB_MISSION_VISUAL_ASSETS.combat;
}

function typeLabel(type) {
  if (type === "fleet") return "FLEET";
  if (type === "special") return "SPECIAL";
  if (type === "reva") return "REVA";
  if (type === "deployment") return "DEPLOY";
  if (type === "operations") return "OPERATIONS";
  return "COMBAT";
}

function selectedNodeFor(map) {
  const saved = selectedNodeByPlanet.get(map.id);
  return map.nodes.find((node) => node.id === saved) || map.nodes[0] || null;
}

function nodeMarkup(node, selected) {
  const linked = Boolean(node.missionId && node.teamId);
  return `<button type="button"
    class="rote-source-mission-node type-${escapeAttr(node.type)}${selected ? " selected" : ""}${linked ? " strategy-linked" : ""}"
    data-rote-source-mission="${escapeAttr(node.id)}"
    style="top:${Number(node.top)}%;left:${Number(node.left)}%"
    aria-label="Open ${escapeAttr(node.label)} mission details"
    title="${escapeAttr(`${node.label} · ${node.requirement}`)}">
      <img src="${escapeAttr(missionIcon(node.type))}" alt="" loading="lazy" decoding="async">
      <span>${escapeHtml(node.label)}</span>
  </button>`;
}

function detailMarkup(node) {
  const linked = Boolean(node.missionId && node.teamId);
  const body = liveBody();
  return `<section class="rote-source-mission-detail">
    <header>
      <div><span>${escapeHtml(typeLabel(node.type))} · SOURCE NODE ${escapeHtml(node.id.toUpperCase())}</span><strong>${escapeHtml(node.label)}</strong></div>
      <b class="${linked ? "linked" : "source-only"}">${linked ? "APP STRATEGY LINKED" : "SOURCE ONLY"}</b>
    </header>
    <div class="rote-source-mission-facts">
      <div><span>Entry / requirement</span><strong>${escapeHtml(node.requirement)}</strong></div>
      <div><span>Reward / territory value</span><strong>${escapeHtml(node.reward)}</strong></div>
    </div>
    ${node.note ? `<div class="rote-source-boundary evidence-note">${escapeHtml(node.note)}</div>` : ""}
    ${linked
      ? body
        ? `<div class="rote-source-live-prep" data-tb-combat-mission="${escapeAttr(node.missionId)}" data-tb-combat-team="${escapeAttr(node.teamId)}"><span>Loading live roster preparation…</span></div>`
        : '<div class="rote-source-boundary">Load an Ally Code to evaluate this mapped mission against the live roster. The source requirement remains visible without player data.</div>'
      : '<div class="rote-source-boundary">This source node is not forced onto an internal recommendation record. Requirements and placement are shown, but roster strategy is intentionally not inferred.</div>'}
  </section>`;
}

async function hydrateLinkedMission(panel, planetId) {
  const body = liveBody();
  if (!body) return;
  const missions = ROTE_MISSIONS_BY_PLANET[planetId] || [];
  await hydrateCombatPreparation(panel, body, missions);
}

function renderPanel(board, planetId, map) {
  let panel = board.querySelector(":scope > .rote-source-mission-map-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "rote-source-mission-map-panel";
    const thresholds = board.querySelector(":scope > .tb-territory-threshold-panel");
    const summary = board.querySelector(":scope > .rote-board-summary");
    if (thresholds) thresholds.after(panel);
    else if (summary) summary.after(panel);
    else board.prepend(panel);
  }

  const selectedNode = selectedNodeFor(map);
  if (!selectedNode) return;
  const liveKey = `${window.__swgohLiveSnapshot?.allyCode || ""}:${window.__swgohLiveSnapshot?.fetchedAt || 0}`;
  const signature = `${planetId}|${selectedNode.id}|${liveKey}`;
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;

  panel.innerHTML = `
    <div class="rote-source-mission-map-head">
      <div><span>SOURCE MISSION MAP · ${escapeHtml(phaseLabel(planetId))}</span><strong>${escapeHtml(planetId.charAt(0).toUpperCase() + planetId.slice(1))}</strong><small>Click a mission icon for requirements and live preparation where a verified internal mapping exists.</small></div>
      <b>${map.nodes.length} NODES</b>
    </div>
    <div class="rote-source-mission-map" role="group" aria-label="${escapeAttr(planetId)} mission positions" style="--rote-source-planet:url(&quot;${escapeAttr(map.background)}&quot;)">
      ${map.nodes.map((node) => nodeMarkup(node, node.id === selectedNode.id)).join("")}
    </div>
    ${detailMarkup(selectedNode)}
    <small class="rote-source-mission-credit">Mission layout reference: GenSkaar ROTE · pinned revision ${escapeHtml(ROTE_P1_MISSION_MAP_SOURCE.revision.slice(0, 12))}. Current evidence overrides stale requirement text; unlinked nodes are not assigned guessed strategy records.</small>`;

  for (const button of panel.querySelectorAll("[data-rote-source-mission]")) {
    button.addEventListener("click", () => {
      selectedNodeByPlanet.set(planetId, button.dataset.roteSourceMission || map.nodes[0]?.id || "");
      panel.dataset.signature = "";
      scheduleEnhance();
    });
  }
  hydrateLinkedMission(panel, planetId).catch((error) => {
    const slot = panel.querySelector(".rote-source-live-prep");
    if (slot) slot.innerHTML = `<div class="rote-source-boundary">Live battle preparation unavailable: ${escapeHtml(error?.message || "unknown error")}</div>`;
  });
}

function removeUnsupportedPanel(board) {
  board.querySelector(":scope > .rote-source-mission-map-panel")?.remove();
}

function enhanceAll() {
  scheduled = false;
  const board = document.getElementById("roteMissionBoard");
  if (!board) return;
  const planetId = selectedPlanetId();
  const map = roteMissionMap(planetId);
  if (!map) {
    removeUnsupportedPanel(board);
    return;
  }
  renderPanel(board, planetId, map);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(enhanceAll);
}

function install() {
  enhanceAll();
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:workspace-activated", scheduleEnhance);
  document.getElementById("allyForm")?.addEventListener("submit", () => setTimeout(scheduleEnhance, 650));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
