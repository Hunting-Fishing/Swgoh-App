import { roteMissionMap } from "./rote-mission-map-registry.js";
import {
  isRoteInfrastructureNode,
  missionRosterEligibility,
  resolveRoteMissionNodes,
} from "./rote-mission-node-eligibility.js";
import { recommendationRosterFit } from "./tb-mission-intelligence.js";

let catalogPromise = null;
let catalogStatus = "idle";
let catalogError = "";
let catalogById = new Map();
let catalogByName = new Map();
let scheduled = false;
let lastBodyKey = "";
let lastEnrichedBody = null;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const normalizeName = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function liveSnapshot() {
  return typeof window === "undefined" ? null : window.__swgohLiveSnapshot || null;
}

function catalogMatch(baseId = "", name = "") {
  const id = String(baseId || "");
  if (id && catalogById.has(id)) return catalogById.get(id);
  const normalized = normalizeName(name);
  return normalized ? catalogByName.get(normalized) || null : null;
}

function enrichUnit(unit = {}) {
  const staticUnit = catalogMatch(unit.baseId, unit.name) || {};
  const liveFactions = Array.isArray(unit.factions) && unit.factions.length ? unit.factions : null;
  const liveCategories = Array.isArray(unit.categories) && unit.categories.length ? unit.categories : null;
  const liveAlignment = String(unit.alignment || "");
  return {
    ...staticUnit,
    ...unit,
    name: unit.name || staticUnit.name || unit.baseId || "Unknown",
    unitType: unit.unitType || staticUnit.unitType || "Character",
    alignment: liveAlignment && liveAlignment !== "Unknown" ? liveAlignment : staticUnit.alignment || liveAlignment || "Unknown",
    factions: liveFactions || staticUnit.factions || [],
    categories: liveCategories || staticUnit.categories || [],
  };
}

function enrichedBody() {
  const snapshot = liveSnapshot();
  if (!snapshot?.body || catalogStatus !== "ready") return null;
  const key = `${snapshot.allyCode || ""}:${snapshot.fetchedAt || 0}:${catalogById.size}`;
  if (lastEnrichedBody && lastBodyKey === key) return lastEnrichedBody;
  lastBodyKey = key;
  lastEnrichedBody = {
    ...snapshot.body,
    units: (snapshot.body.units || []).map(enrichUnit),
    ships: (snapshot.body.ships || []).map(enrichUnit),
  };
  return lastEnrichedBody;
}

async function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogStatus = "loading";
  catalogPromise = fetch("/data/catalog.json", { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Static catalog returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.units) || !payload.units.length) throw new Error("Static unit catalog contained no units");
      catalogById = new Map(payload.units.map((unit) => [String(unit.baseId || ""), unit]).filter(([id]) => id));
      catalogByName = new Map(payload.units.map((unit) => [normalizeName(unit.name), unit]).filter(([name]) => name));
      catalogStatus = "ready";
      catalogError = "";
      lastBodyKey = "";
      lastEnrichedBody = null;
      scheduleRender();
      return payload;
    })
    .catch((error) => {
      catalogStatus = "error";
      catalogError = error?.message || "Static unit catalog unavailable";
      scheduleRender();
      return null;
    });
  return catalogPromise;
}

export function describeEntryGap(gap = {}) {
  if (gap?.missing) return "Not owned";
  const parts = [];
  if (Number(gap.stars || 0) > 0) parts.push(`+${Number(gap.stars)}★`);
  if (Number(gap.relic || 0) > 0) parts.push(`+${Number(gap.relic)} relic`);
  if (Number(gap.gear || 0) > 0) parts.push(`+${Number(gap.gear)} gear`);
  if (Number(gap.power || 0) > 0) parts.push(`+${formatNumber(gap.power)} GP`);
  return parts.length ? parts.join(" · ") : "Entry gate met";
}

export function missionPlanningSummary(eligibility = {}) {
  if (!eligibility?.loaded) {
    return Object.freeze({
      status: "unloaded",
      tone: "neutral",
      label: "Roster not evaluated",
      poolCount: 0,
      poolTarget: Number(eligibility?.poolTarget || eligibility?.squadSize || 0),
      poolShortfall: 0,
      mandatoryReady: 0,
      mandatoryTotal: 0,
      mandatoryBlockers: Object.freeze([]),
    });
  }

  const candidates = Array.isArray(eligibility.candidates) ? eligibility.candidates : [];
  const mandatory = Array.isArray(eligibility.mandatory) ? eligibility.mandatory : [];
  const poolTarget = Math.max(0, Number(eligibility.poolTarget || eligibility.squadSize || 0));
  const poolShortfall = Math.max(0, poolTarget - candidates.length);
  const mandatoryBlockers = mandatory.filter((row) => !row.legal);
  const mandatoryReady = mandatory.length - mandatoryBlockers.length;

  let status = "blocked";
  let tone = "danger";
  let label = "Farm required";
  if (eligibility.ready) {
    status = "ready";
    tone = "success";
    label = "Entry ready";
  } else if (mandatoryBlockers.length <= 1 && poolShortfall <= 1) {
    status = "close";
    tone = "warning";
    label = "Close to ready";
  }

  return Object.freeze({
    status,
    tone,
    label,
    poolCount: candidates.length,
    poolTarget,
    poolShortfall,
    mandatoryReady,
    mandatoryTotal: mandatory.length,
    mandatoryBlockers: Object.freeze(mandatoryBlockers),
  });
}

export function recommendationPlanningSummary(fit = {}) {
  const rows = Array.isArray(fit.rows) ? fit.rows : [];
  const blockers = rows.filter((row) => !row.owned || !row.legal);
  return Object.freeze({
    total: rows.length,
    owned: Number(fit.owned || 0),
    legal: Number(fit.legal || 0),
    complete: Boolean(fit.complete),
    blockers: Object.freeze(blockers),
  });
}

function currentMissionContext() {
  const overlay = document.querySelector(".rote-planet-zoom[data-rote-zoom-planet]");
  if (!overlay) return null;
  const planetId = String(overlay.dataset.roteZoomPlanet || "");
  const selected = overlay.querySelector(".rote-zoom-node.selected[data-rote-zoom-node]");
  const nodeId = String(selected?.dataset.roteZoomNode || "");
  if (!planetId || !nodeId) return null;
  const map = roteMissionMap(planetId);
  if (!map) return null;
  const resolved = resolveRoteMissionNodes(planetId, map);
  const node = resolved.nodes.find((candidate) => candidate.id === nodeId) || null;
  if (!node || isRoteInfrastructureNode(node) || !node.mission) return null;
  const inspector = overlay.querySelector(".rote-zoom-inspector");
  if (!inspector) return null;
  return { overlay, inspector, planetId, node, mission: node.mission };
}

function blockerRowMarkup(row = {}) {
  const unit = row.unit || {};
  const baseId = String(row.baseId || row.member?.baseId || unit.baseId || "");
  const name = String(row.name || row.member?.name || unit.name || baseId || "Required unit");
  const state = !row.owned ? "NOT OWNED" : row.legal ? "READY" : "BELOW ENTRY GATE";
  const inspect = baseId ? ` data-inspect-base-id="${escapeAttr(baseId)}"` : "";
  return `<button type="button" class="rote-plan-blocker"${inspect}>
    <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(state)}</small></span>
    <b>${escapeHtml(describeEntryGap(row.gap || {}))}</b>
  </button>`;
}

function recommendationMarkup(body, mission) {
  const recommendations = mission.recommendations || [];
  if (!recommendations.length) {
    return '<div class="rote-plan-empty">No mission-specific team recommendation is encoded yet. Use the legal pool and Squad Workbench for manual planning.</div>';
  }

  return recommendations.map((recommendation) => {
    const fit = recommendationRosterFit(body, mission, recommendation);
    const summary = recommendationPlanningSummary(fit);
    const tone = summary.complete ? "success" : summary.owned === summary.total && summary.total ? "warning" : "danger";
    const blockers = summary.blockers.slice(0, 5);
    return `<article class="rote-plan-team ${tone}">
      <header>
        <div><span>RECOMMENDED TEAM FIT</span><strong>${escapeHtml(recommendation.name || "Team")}</strong></div>
        <b>${summary.complete ? "READY" : `${summary.legal}/${summary.total} LEGAL`}</b>
      </header>
      <div class="rote-plan-team-metrics"><span>${summary.owned}/${summary.total} owned</span><span>${summary.legal}/${summary.total} at entry gate</span></div>
      ${blockers.length ? `<div class="rote-plan-blockers compact">${blockers.map(blockerRowMarkup).join("")}</div>` : '<div class="rote-plan-ready-note">Every encoded team member is owned and legal for the mission entry gate.</div>'}
    </article>`;
  }).join("");
}

function panelMarkup(context, body) {
  if (!liveSnapshot()?.body) {
    return `<section class="rote-plan-cockpit neutral" data-rote-plan-cockpit>
      <header><div><span>MISSION PLANNING COCKPIT</span><strong>Load an Ally Code</strong></div><b>NO ROSTER</b></header>
      <p>Load a live roster to calculate entry depth, mandatory-unit blockers, and recommended-team fit for this mission.</p>
    </section>`;
  }
  if (catalogStatus === "loading" || catalogStatus === "idle") {
    return `<section class="rote-plan-cockpit neutral" data-rote-plan-cockpit><header><div><span>MISSION PLANNING COCKPIT</span><strong>Preparing exact roster rules</strong></div><b>LOADING</b></header><p>Static faction and alignment definitions are loading before mission legality is calculated.</p></section>`;
  }
  if (catalogStatus === "error" || !body) {
    return `<section class="rote-plan-cockpit danger" data-rote-plan-cockpit><header><div><span>MISSION PLANNING COCKPIT</span><strong>Exact roster calculation unavailable</strong></div><b>FAIL CLOSED</b></header><p>${escapeHtml(catalogError || "Static unit definitions are unavailable.")}</p></section>`;
  }

  const eligibility = missionRosterEligibility(body, context.mission);
  const summary = missionPlanningSummary(eligibility);
  const blockers = summary.mandatoryBlockers;
  const depthText = summary.poolTarget ? `${summary.poolCount}/${summary.poolTarget}` : `${summary.poolCount}`;
  const depthNote = summary.poolShortfall > 0 ? `${summary.poolShortfall} more legal unit${summary.poolShortfall === 1 ? "" : "s"} needed` : "Legal depth gate met";
  const mandatoryText = summary.mandatoryTotal ? `${summary.mandatoryReady}/${summary.mandatoryTotal}` : "None";

  return `<section class="rote-plan-cockpit ${summary.tone}" data-rote-plan-cockpit>
    <header>
      <div><span>MISSION PLANNING COCKPIT</span><strong>${escapeHtml(summary.label)}</strong></div>
      <b>${escapeHtml(String(eligibility.percent || 0))}% ENTRY</b>
    </header>
    <div class="rote-plan-kpis">
      <article><span>LEGAL DEPTH</span><strong>${escapeHtml(depthText)}</strong><small>${escapeHtml(depthNote)}</small></article>
      <article><span>MANDATORY</span><strong>${escapeHtml(mandatoryText)}</strong><small>${blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}` : "Mandatory gate met"}</small></article>
      <article><span>STATUS</span><strong>${escapeHtml(summary.status.toUpperCase())}</strong><small>${eligibility.ready ? "Can enter now" : "Roster action required"}</small></article>
    </div>
    ${blockers.length ? `<div class="rote-plan-section"><div class="rote-plan-section-head"><span>MANDATORY BLOCKERS</span><b>${blockers.length}</b></div><div class="rote-plan-blockers">${blockers.map(blockerRowMarkup).join("")}</div></div>` : '<div class="rote-plan-ready-note">No mandatory-unit blocker is preventing mission entry.</div>'}
    <div class="rote-plan-section"><div class="rote-plan-section-head"><span>RECOMMENDED TEAM READINESS</span><b>${context.mission.recommendations?.length || 0}</b></div>${recommendationMarkup(body, context.mission)}</div>
    <div class="rote-plan-actions"><button type="button" data-rote-plan-open-roster>Open Roster Workspace</button><span>Click any blocker to inspect that unit.</span></div>
  </section>`;
}

function renderCockpit() {
  scheduled = false;
  const context = currentMissionContext();
  if (!context) return;
  const snapshot = liveSnapshot();
  const signature = `${context.planetId}|${context.node.id}|${snapshot?.fetchedAt || 0}|${catalogStatus}|${catalogById.size}`;
  const existing = context.inspector.querySelector(":scope > [data-rote-plan-cockpit]");
  if (existing?.dataset.signature === signature) return;

  const shell = document.createElement("div");
  shell.innerHTML = panelMarkup(context, enrichedBody()).trim();
  const panel = shell.firstElementChild;
  if (!panel) return;
  panel.dataset.signature = signature;
  existing?.remove();
  const head = context.inspector.querySelector(":scope > .rote-zoom-inspector-head");
  if (head) head.insertAdjacentElement("afterend", panel);
  else context.inspector.prepend(panel);
}

function scheduleRender() {
  if (scheduled || typeof requestAnimationFrame === "undefined") return;
  scheduled = true;
  requestAnimationFrame(renderCockpit);
}

function install() {
  loadCatalog();
  const observer = new MutationObserver(() => scheduleRender());
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-signature"] });
  document.addEventListener("click", (event) => {
    const openRoster = event.target.closest("[data-rote-plan-open-roster]");
    if (!openRoster) return;
    event.preventDefault();
    event.stopPropagation();
    document.querySelector('button[data-workspace-tab="roster"]')?.click();
  }, true);
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    lastBodyKey = "";
    lastEnrichedBody = null;
    setTimeout(scheduleRender, 500);
  });
  window.addEventListener("swgoh:workspace-activated", scheduleRender);
  scheduleRender();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
