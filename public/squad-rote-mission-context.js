import { enrichGuildRoteMember } from "./guild-rote-mission-coverage-model.js";
import { roteMissionMap } from "./rote-mission-map-registry.js";
import { resolveRoteMissionNodes } from "./rote-mission-node-eligibility.js";
import {
  assessSquadForRoteMission,
  replacementCandidates,
} from "./squad-rote-mission-context-model.js";

const state = {
  context: null,
  pendingSignature: "",
  catalogPromise: null,
  catalog: [],
  scheduled: false,
  renderKey: "",
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const signature = (baseIds = []) => [...baseIds].map(String).filter(Boolean).join("|");

function gapLabel(gap = {}) {
  if (gap?.missing) return "Not owned";
  const parts = [];
  if (Number(gap.stars || 0) > 0) parts.push(`+${Number(gap.stars)}★`);
  if (Number(gap.relic || 0) > 0) parts.push(`+${Number(gap.relic)} relic`);
  if (Number(gap.gear || 0) > 0) parts.push(`+${Number(gap.gear)} gear`);
  if (Number(gap.power || 0) > 0) parts.push(`+${number(gap.power)} GP`);
  return parts.length ? parts.join(" · ") : "Encoded gate met";
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    state.catalog = shared;
    return state.catalog;
  }
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?squad-rote-context=1", { cache: "no-cache" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static catalog unavailable.");
      state.catalog = body.units;
      return state.catalog;
    });
  return state.catalogPromise;
}

function enrichedLiveBody() {
  const snapshot = window.__swgohLiveSnapshot;
  if (!snapshot?.body) return null;
  const body = snapshot.body;
  const member = enrichGuildRoteMember({
    playerId: body.player?.playerId || body.player?.id || "personal",
    allyCode: body.player?.allyCode || snapshot.allyCode || "",
    name: body.player?.name || "Player",
    rosterAvailable: true,
    units: [...(body.units || []), ...(body.ships || [])],
  }, state.catalog);
  return {
    ...body,
    units: member.units,
    ships: member.ships,
  };
}

function currentWorkbenchBaseIds() {
  return [...document.querySelectorAll("#proSquadBuilder [data-squad-remove]")]
    .map((button) => String(button.dataset.squadRemove || ""))
    .filter(Boolean);
}

function missionContextByIds(planetId, nodeId) {
  const map = roteMissionMap(planetId);
  if (!planetId || !nodeId || !map) return null;
  const resolved = resolveRoteMissionNodes(planetId, map);
  const node = resolved.nodes.find((candidate) => candidate.id === nodeId) || null;
  if (!node?.mission) return null;
  return { map, node, mission: node.mission };
}

function resolveRoteContext(button) {
  const overlay = button.closest(".rote-planet-zoom[data-rote-zoom-planet]");
  if (!overlay) return null;
  const planetId = String(overlay.dataset.roteZoomPlanet || "");
  const nodeId = String(overlay.querySelector(".rote-zoom-node.selected[data-rote-zoom-node]")?.dataset.roteZoomNode || "");
  const resolved = missionContextByIds(planetId, nodeId);
  if (!resolved) return null;
  const index = Number(button.dataset.roteZoomLoadTeam || 0);
  const recommendation = resolved.mission.recommendations?.[index] || null;
  if (!recommendation) return null;
  const baseIds = (recommendation.members || []).map((member) => String(member.baseId || "")).filter(Boolean);
  return {
    planetId,
    planetName: String(resolved.map.planetName || planetId),
    nodeId,
    mission: resolved.mission,
    recommendation,
    sourceLabel: "",
    loadedBaseIds: baseIds,
    loadedSignature: signature(baseIds),
    capturedAt: Date.now(),
  };
}

function resolveRequestedContext(detail = {}) {
  const planetId = String(detail.planetId || "");
  const nodeId = String(detail.nodeId || "");
  const resolved = missionContextByIds(planetId, nodeId);
  if (!resolved) return null;
  const baseIds = [...new Set((detail.baseIds || []).map(String).filter(Boolean))];
  if (!baseIds.length) return null;
  return {
    planetId,
    planetName: String(resolved.map.planetName || planetId),
    nodeId,
    mission: resolved.mission,
    recommendation: null,
    sourceLabel: String(detail.sourceLabel || "Manual mission roster core"),
    loadedBaseIds: baseIds,
    loadedSignature: signature(baseIds),
    capturedAt: Date.now(),
  };
}

function publishContext(context) {
  if (!context) {
    delete window.__swgohSquadMissionContext;
    return;
  }
  window.__swgohSquadMissionContext = Object.freeze({
    planetId: context.planetId,
    planetName: context.planetName,
    nodeId: context.nodeId,
    missionId: context.mission?.id || "",
    missionName: context.mission?.name || "",
    recommendationName: context.recommendation?.name || "",
    sourceLabel: context.sourceLabel || "",
    loadedBaseIds: Object.freeze([...context.loadedBaseIds]),
    capturedAt: context.capturedAt,
  });
}

function setContext(context) {
  state.context = context;
  state.pendingSignature = context?.loadedSignature || "";
  state.renderKey = "";
  publishContext(context);
  window.dispatchEvent(new CustomEvent("swgoh:squad-mission-context", {
    detail: window.__swgohSquadMissionContext || null,
  }));
  scheduleRender();
}

function clearContext() {
  state.context = null;
  state.pendingSignature = "";
  state.renderKey = "";
  publishContext(null);
  const panel = document.getElementById("proSquadRoteContext");
  if (panel) panel.remove();
}

function ensurePanel() {
  const builder = document.getElementById("proSquadBuilder");
  if (!builder || !state.context) return null;
  let panel = document.getElementById("proSquadRoteContext");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "proSquadRoteContext";
  panel.className = "card squad-rote-context";
  builder.insertAdjacentElement("afterend", panel);
  return panel;
}

function evidenceLabel(assessment) {
  if (assessment.evidence !== "exact") return { tone: "partial", label: "KNOWN GATES ONLY" };
  if (assessment.exactEntrySquad) return { tone: "ready", label: "ENTRY LEGAL" };
  if (!assessment.sizeReady) return { tone: "blocked", label: "SQUAD INCOMPLETE" };
  return { tone: "blocked", label: "ENTRY BLOCKED" };
}

function strategyText(strategy = {}) {
  const coverage = String(strategy.coverage || "missing").toUpperCase();
  const details = [];
  if (strategy.sourceCount) details.push(`${strategy.sourceCount} source${strategy.sourceCount === 1 ? "" : "s"}`);
  if (strategy.stageCount) details.push(`${strategy.stageCount} stage${strategy.stageCount === 1 ? "" : "s"}`);
  if (strategy.confidence) details.push(String(strategy.confidence));
  return `${coverage}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

function templateText(context, modified) {
  if (!context.recommendation) {
    return modified ? `Modified from ${context.sourceLabel || "manual mission core"}` : (context.sourceLabel || "Manual mission roster core");
  }
  if (modified) return `Modified from ${context.recommendation.name || "loaded template"}`;
  if (context.recommendation.verifiedLegal) return "Verified-legal source template";
  return "Planning template · legality checked live";
}

function originBoundary(context) {
  if (!context.recommendation) return "This squad started from a manual GP-ranked roster core, not a sourced team recommendation.";
  return context.recommendation.verifiedLegal
    ? "The loaded source template is marked verified-legal."
    : "The loaded source is a planning template unless explicitly marked verified-legal.";
}

function selectedRowsMarkup(assessment) {
  return assessment.fit.rows.map((row) => {
    const baseId = String(row.member?.baseId || row.unit?.baseId || "");
    const label = assessment.evidence === "exact"
      ? row.owned && row.legal ? "LEGAL" : row.owned ? "BELOW / ILLEGAL" : "NOT OWNED"
      : row.owned && row.legal ? "KNOWN GATE" : row.owned ? "BELOW KNOWN GATE" : "NOT OWNED";
    return `<article class="squad-rote-member ${row.owned && row.legal ? "legal" : "blocked"}">
      <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(row.unit?.name || row.member?.name || baseId || "Unknown")}</strong><small>${escapeHtml(row.owned && row.legal ? "Encoded entry gate met" : gapLabel(row.gap))}</small></div>
      ${baseId ? `<button type="button" data-inspect-base-id="${escapeAttr(baseId)}">Inspect</button>` : ""}
    </article>`;
  }).join("");
}

function mandatoryMarkup(assessment) {
  const rows = [...assessment.mandatoryMissing, ...assessment.mandatoryBlocked];
  if (!rows.length) return '<div class="squad-rote-ok">All encoded mandatory-unit requirements are included and at their known progression gate.</div>';
  const selectedFit = assessment.fit.rows
    .filter((row) => row.owned && row.unit?.baseId)
    .slice()
    .sort((a, b) => Number(a.unit?.power || 0) - Number(b.unit?.power || 0));
  return `<div class="squad-rote-mandatory-list">${rows.map((row) => {
    const canAdd = row.unit?.baseId && row.legal;
    const full = assessment.squadSize > 0 && assessment.selectedBaseIds.length >= assessment.squadSize;
    const replace = full ? selectedFit.find((candidate) => String(candidate.unit?.baseId) !== String(row.baseId || "")) : null;
    let action = "";
    if (canAdd && !full) action = `<button type="button" data-squad-rote-add="${escapeAttr(row.unit.baseId)}">Add Required Unit</button>`;
    else if (canAdd && replace?.unit?.baseId) action = `<button type="button" data-squad-rote-replace="${escapeAttr(replace.unit.baseId)}" data-squad-rote-new="${escapeAttr(row.unit.baseId)}">Replace lowest-GP slot</button>`;
    return `<article class="squad-rote-mandatory">
      <div><span>${row.selected ? "REQUIRED UNIT BELOW GATE" : "REQUIRED UNIT MISSING FROM SQUAD"}</span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.legal ? "Owned and at known gate" : gapLabel(row.gap))}</small></div>
      ${action}
    </article>`;
  }).join("")}</div>`;
}

function replacementsMarkup(assessment) {
  if (!assessment.illegalSelected.length) return '<div class="squad-rote-ok">No selected member fails the encoded mission entry gate.</div>';
  return `<div class="squad-rote-replacement-list">${assessment.illegalSelected.map((row) => {
    const oldBaseId = String(row.member?.baseId || row.unit?.baseId || "");
    const candidates = replacementCandidates(assessment, oldBaseId, 5);
    return `<article class="squad-rote-replacement">
      <div class="squad-rote-replacement-head"><span>REPLACE ${escapeHtml(row.unit?.name || row.member?.name || oldBaseId)}</span><small>GP-ranked from the exact legal roster pool — not a battle-performance ranking.</small></div>
      <div class="squad-rote-alternatives">${candidates.length ? candidates.map((unit) => `<button type="button" data-squad-rote-replace="${escapeAttr(oldBaseId)}" data-squad-rote-new="${escapeAttr(unit.baseId)}"><strong>${escapeHtml(unit.name || unit.baseId)}</strong><small>${number(unit.power)} GP · ${number(unit.speed)} SPD</small></button>`).join("") : '<span>No unused legal replacement is available.</span>'}</div>
    </article>`;
  }).join("")}</div>`;
}

function renderContext() {
  state.scheduled = false;
  if (!state.context) return;
  const panel = ensurePanel();
  if (!panel) return;
  const snapshot = window.__swgohLiveSnapshot;
  const currentBaseIds = currentWorkbenchBaseIds();
  const key = `${state.context.mission?.id || ""}:${state.context.nodeId}:${signature(currentBaseIds)}:${snapshot?.allyCode || ""}:${snapshot?.fetchedAt || 0}:${state.catalog.length}`;
  if (state.renderKey === key) return;
  state.renderKey = key;

  const live = enrichedLiveBody();
  if (!live || !state.catalog.length) {
    panel.innerHTML = '<div class="squad-rote-loading">Preparing live mission legality…</div>';
    loadCatalog().then(() => {
      state.renderKey = "";
      scheduleRender();
    }).catch(() => {});
    return;
  }

  const modified = signature(currentBaseIds) !== state.context.loadedSignature;
  const assessment = assessSquadForRoteMission(live, state.context.mission, currentBaseIds, modified ? null : state.context.recommendation);
  const status = evidenceLabel(assessment);
  const mandatoryReadyCount = assessment.mandatory.filter((row) => row.satisfied).length;

  panel.innerHTML = `
    <div class="squad-rote-head">
      <div><span>ROTE MISSION CONTEXT · ${escapeHtml(state.context.planetName)}</span><h3>${escapeHtml(state.context.mission?.name || "Mission")}</h3><p>${escapeHtml(templateText(state.context, modified))}</p></div>
      <div class="squad-rote-head-actions"><b class="tone-${status.tone}">${escapeHtml(status.label)}</b><button type="button" data-squad-rote-clear>Clear ROTE Context</button></div>
    </div>
    <div class="squad-rote-summary">
      <article><span>SQUAD SIZE</span><strong>${assessment.selectedBaseIds.length}/${assessment.squadSize || "?"}</strong><small>${assessment.sizeReady ? "Encoded size gate met" : "More members required"}</small></article>
      <article><span>SELECTED GATE FIT</span><strong>${assessment.legalSelectedCount}/${assessment.fit.rows.length}</strong><small>${assessment.evidence === "exact" ? "Exact entry legality" : "Known gates only"}</small></article>
      <article><span>MANDATORY</span><strong>${mandatoryReadyCount}/${assessment.mandatory.length}</strong><small>${assessment.mandatoryReady ? "Required units satisfied" : "Required-unit action needed"}</small></article>
      <article><span>LEGAL ALTERNATIVES</span><strong>${number(assessment.alternatives.length)}</strong><small>Unused roster options at encoded gate</small></article>
      <article><span>STRATEGY EVIDENCE</span><strong>${escapeHtml(String(assessment.strategy.coverage || "missing").toUpperCase())}</strong><small>${escapeHtml(strategyText(assessment.strategy))}</small></article>
    </div>
    <div class="squad-rote-boundary"><strong>Evidence boundary:</strong> ${assessment.evidence === "exact" ? "entry legality is evaluated from verified mission restrictions." : "the full selectable-unit rule is not encoded, so this panel reports known gates only."} ${originBoundary(state.context)} Strategy coverage is separate and does not make this a guaranteed-win team.</div>
    <section class="squad-rote-section"><div class="squad-rote-section-title"><span>CURRENT WORKBENCH SQUAD</span><b>${assessment.fit.rows.length}</b></div><div class="squad-rote-members">${selectedRowsMarkup(assessment) || '<div class="squad-rote-ok">No squad members selected.</div>'}</div></section>
    ${assessment.mandatory.length ? `<section class="squad-rote-section"><div class="squad-rote-section-title"><span>MANDATORY REQUIREMENTS</span><b>${assessment.mandatory.length}</b></div>${mandatoryMarkup(assessment)}</section>` : ""}
    <section class="squad-rote-section"><div class="squad-rote-section-title"><span>ENTRY-LEGAL SUBSTITUTIONS</span><b>${assessment.illegalSelected.length}</b></div>${replacementsMarkup(assessment)}</section>`;
}

function scheduleRender() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(renderContext);
}

function replaceMember(oldBaseId, newBaseId) {
  const oldId = String(oldBaseId || "");
  const newId = String(newBaseId || "");
  if (!oldId || !newId) return;
  const remove = [...document.querySelectorAll("#proSquadBuilder [data-squad-remove]")]
    .find((button) => String(button.dataset.squadRemove || "") === oldId);
  if (!remove) return;
  remove.click();
  window.dispatchEvent(new CustomEvent("swgoh:add-to-squad", { detail: { baseId: newId } }));
  state.renderKey = "";
  scheduleRender();
}

function installBuilderObserver() {
  const builder = document.getElementById("proSquadBuilder");
  if (builder) {
    const observer = new MutationObserver(() => {
      state.renderKey = "";
      scheduleRender();
    });
    observer.observe(builder, { childList: true, subtree: true });
    return;
  }
  const bootstrap = new MutationObserver(() => {
    if (!document.getElementById("proSquadBuilder")) return;
    bootstrap.disconnect();
    installBuilderObserver();
  });
  bootstrap.observe(document.body, { childList: true, subtree: true });
}

function install() {
  loadCatalog().catch(() => {});
  installBuilderObserver();

  document.addEventListener("click", (event) => {
    const load = event.target.closest?.("[data-rote-zoom-load-team]");
    if (load) {
      const context = resolveRoteContext(load);
      if (context) setContext(context);
      return;
    }
    const replace = event.target.closest?.("[data-squad-rote-replace]");
    if (replace) {
      event.preventDefault();
      replaceMember(replace.dataset.squadRoteReplace, replace.dataset.squadRoteNew);
      return;
    }
    const add = event.target.closest?.("[data-squad-rote-add]");
    if (add) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("swgoh:add-to-squad", { detail: { baseId: String(add.dataset.squadRoteAdd || "") } }));
      state.renderKey = "";
      scheduleRender();
      return;
    }
    if (event.target.closest?.("[data-squad-rote-clear]")) clearContext();
  }, true);

  window.addEventListener("swgoh:set-squad-mission-context", (event) => {
    const context = resolveRequestedContext(event.detail || {});
    if (context) setContext(context);
  });
  window.addEventListener("swgoh:replace-squad", (event) => {
    const incoming = signature(event.detail?.baseIds || []);
    if (state.context && state.pendingSignature && incoming === state.pendingSignature) {
      state.pendingSignature = "";
      state.renderKey = "";
      scheduleRender();
      return;
    }
    if (state.context) clearContext();
  });
  window.addEventListener("swgoh:add-to-squad", () => {
    state.renderKey = "";
    scheduleRender();
  });
  window.addEventListener("swgoh:workspace-activated", (event) => {
    if (event.detail?.id === "squads") scheduleRender();
  });
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.renderKey = "";
    if (state.context) setTimeout(scheduleRender, 500);
  });
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}