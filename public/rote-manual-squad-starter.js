import { enrichGuildRoteMember } from "./guild-rote-mission-coverage-model.js";
import { buildRoteManualSquadCore } from "./rote-manual-squad-starter-model.js";
import { roteMissionMap } from "./rote-mission-map-registry.js";
import { resolveRoteMissionNodes } from "./rote-mission-node-eligibility.js";

const state = {
  catalogPromise: null,
  catalog: [],
  scheduled: false,
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    state.catalog = shared;
    return state.catalog;
  }
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?rote-manual-core=1", { cache: "no-cache" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static catalog unavailable");
      state.catalog = body.units;
      return state.catalog;
    })
    .catch(() => []);
  return state.catalogPromise;
}

function enrichedBody() {
  const snapshot = window.__swgohLiveSnapshot;
  if (!snapshot?.body || !state.catalog.length) return null;
  const body = snapshot.body;
  const member = enrichGuildRoteMember({
    playerId: body.player?.playerId || body.player?.id || "personal",
    allyCode: body.player?.allyCode || snapshot.allyCode || "",
    name: body.player?.name || "Player",
    rosterAvailable: true,
    units: [...(body.units || []), ...(body.ships || [])],
  }, state.catalog);
  return { ...body, units: member.units, ships: member.ships };
}

function currentMissionContext() {
  const overlay = document.querySelector(".rote-planet-zoom[data-rote-zoom-planet]");
  if (!overlay) return null;
  const planetId = String(overlay.dataset.roteZoomPlanet || "");
  const nodeId = String(overlay.querySelector(".rote-zoom-node.selected[data-rote-zoom-node]")?.dataset.roteZoomNode || "");
  const map = roteMissionMap(planetId);
  if (!planetId || !nodeId || !map) return null;
  const resolved = resolveRoteMissionNodes(planetId, map);
  const node = resolved.nodes.find((candidate) => candidate.id === nodeId) || null;
  if (!node?.mission) return null;
  return { overlay, planetId, planetName: map.planetName || planetId, nodeId, mission: node.mission };
}

function sourceLabel(core) {
  if (core.exactEntryCore) return "Manual legal mission core · GP-ranked";
  if (core.mandatoryBlockers.length) return "Manual planning core · mandatory blockers included";
  return "Manual legal-pool core · GP-ranked";
}

function actionMarkup(context, core) {
  const missing = core.unownedMandatory.length;
  const blocked = core.mandatoryBlockers.length;
  const evidence = core.evidence === "exact" ? "exact entry rules" : "known gates only";
  return `<div class="rote-manual-core-action" data-rote-manual-core-shell>
    <button type="button" data-rote-manual-core="${escapeAttr(context.nodeId)}"${core.available ? "" : " disabled"}>${escapeHtml(core.actionLabel)}</button>
    <span>${core.baseIds.length}/${core.squadSize || "?"} slots · ${core.legalPoolCount} legal pool · ${blocked} mandatory blocker${blocked === 1 ? "" : "s"}${missing ? ` · ${missing} unowned required` : ""} · ${escapeHtml(evidence)}</span>
    <small>GP-ranked roster starting point only — not a battle-performance recommendation.</small>
  </div>`;
}

function renderAction() {
  state.scheduled = false;
  const context = currentMissionContext();
  if (!context) return;
  const actions = context.overlay.querySelector(".rote-zoom-inspector .rote-zoom-actions");
  if (!actions) return;
  const body = enrichedBody();
  if (!body) {
    loadCatalog().then(scheduleRender).catch(() => {});
    return;
  }
  const core = buildRoteManualSquadCore(body, context.mission);
  const existing = actions.querySelector("[data-rote-manual-core-shell]");
  if (!core.available && core.reason === "character-workbench-only") {
    existing?.remove();
    return;
  }
  const snapshot = window.__swgohLiveSnapshot;
  const sig = `${context.planetId}:${context.nodeId}:${snapshot?.allyCode || ""}:${snapshot?.fetchedAt || 0}:${core.baseIds.join("|")}:${core.mandatoryBlockers.length}`;
  if (existing?.dataset.signature === sig) return;
  const shell = document.createElement("div");
  shell.innerHTML = actionMarkup(context, core).trim();
  const next = shell.firstElementChild;
  if (!next) return;
  next.dataset.signature = sig;
  if (existing) existing.replaceWith(next);
  else actions.appendChild(next);
}

function scheduleRender() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(renderAction);
}

function loadCore() {
  const context = currentMissionContext();
  const body = enrichedBody();
  if (!context || !body) return;
  const core = buildRoteManualSquadCore(body, context.mission);
  if (!core.available) return;
  window.dispatchEvent(new CustomEvent("swgoh:set-squad-mission-context", {
    detail: {
      planetId: context.planetId,
      nodeId: context.nodeId,
      baseIds: [...core.baseIds],
      sourceLabel: sourceLabel(core),
    },
  }));
  window.dispatchEvent(new CustomEvent("swgoh:replace-squad", {
    detail: {
      baseIds: [...core.baseIds],
      size: core.squadSize || 5,
      name: `ROTE ${context.planetName} · ${context.mission.name} · Manual Core`,
    },
  }));
  document.querySelector('button[data-workspace-tab="squads"]')?.click();
}

function install() {
  loadCatalog().catch(() => {});
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-rote-manual-core]")) return;
    event.preventDefault();
    event.stopPropagation();
    loadCore();
  }, true);
  document.getElementById("allyForm")?.addEventListener("submit", () => setTimeout(scheduleRender, 500));
  scheduleRender();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
