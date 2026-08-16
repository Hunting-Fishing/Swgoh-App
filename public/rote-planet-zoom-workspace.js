import { rotePlanetById } from "./rote-map-data.js";
import { roteMissionMap } from "./rote-mission-map-registry.js";
import {
  isRoteInfrastructureNode,
  missionEntryRule,
  missionRosterEligibility,
  resolveRoteMissionNodes,
} from "./rote-mission-node-eligibility.js";
import { recommendationLabel } from "./tb-mission-intelligence.js";
import { hydrateCombatPreparation } from "./tb-combat-prep-ui.js";
import { TB_MISSION_VISUAL_ASSETS } from "./tb-visual-assets-data.js";

const selectedNodeByPlanet = new Map();
let activePlanetId = "";
let scheduled = false;
let catalogPromise = null;
let catalogById = new Map();
let catalogByName = new Map();
let catalogStatus = "idle";
let catalogError = "";
let enrichedBodyCache = null;
let enrichedBodyKey = "";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const normalizeName = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

function liveSnapshot() {
  return typeof window === "undefined" ? null : window.__swgohLiveSnapshot || null;
}

function liveBody() {
  return liveSnapshot()?.body || null;
}

function unitCatalogMatch(baseId = "", name = "") {
  const id = String(baseId || "");
  if (id && catalogById.has(id)) return catalogById.get(id);
  const key = normalizeName(name);
  return key ? catalogByName.get(key) || null : null;
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
      enrichedBodyCache = null;
      enrichedBodyKey = "";
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

function enrichLiveUnit(unit = {}) {
  const staticUnit = unitCatalogMatch(unit.baseId, unit.name) || {};
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
    image: unit.image || staticUnit.image || "",
  };
}

function eligibilityBody() {
  const snapshot = liveSnapshot();
  if (!snapshot?.body || catalogStatus !== "ready") return null;
  const key = `${snapshot.allyCode || ""}:${snapshot.fetchedAt || 0}:${catalogById.size}`;
  if (enrichedBodyCache && enrichedBodyKey === key) return enrichedBodyCache;
  enrichedBodyKey = key;
  enrichedBodyCache = {
    ...snapshot.body,
    units: (snapshot.body.units || []).map(enrichLiveUnit),
    ships: (snapshot.body.ships || []).map(enrichLiveUnit),
  };
  return enrichedBodyCache;
}

function missionIcon(type) {
  return TB_MISSION_VISUAL_ASSETS[type] || TB_MISSION_VISUAL_ASSETS.combat;
}

function typeLabel(type) {
  if (type === "fleet") return "FLEET";
  if (type === "special") return "SPECIAL";
  if (type === "reva") return "REVA SPECIAL";
  if (type === "deployment") return "DEPLOYMENT";
  if (type === "operations") return "OPERATIONS";
  return "COMBAT";
}

function unitInitials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function unitPortraitMarkup(unit = {}, fallbackName = "") {
  const name = unit.name || fallbackName || unit.baseId || "Unknown";
  const image = unit.image || "";
  return `<span class="rote-zoom-unit-portrait">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy" decoding="async">` : escapeHtml(unitInitials(name))}</span>`;
}

function thresholdText(member = {}) {
  const bits = [];
  if (member.starsMin != null) bits.push(`${Number(member.starsMin)}★`);
  if (member.relicMin != null) bits.push(`R${Number(member.relicMin)}+`);
  else if (member.gearMin != null) bits.push(`G${Number(member.gearMin)}+`);
  if (member.powerMin != null) bits.push(`${number(member.powerMin)}+ GP`);
  return bits.join(" · ") || "Mission gate";
}

export function poolEvidenceLevel(rule = {}) {
  if (String(rule.unitType || "Character").toLowerCase() !== "ship") return "exact";
  if (rule.allowedBaseIds?.length || rule.requiredBaseIds?.length || rule.categories?.length || rule.alignments?.length) return "exact";
  return "gate-only";
}

export function missionTypeConflict(node = {}) {
  if (!node?.mission || node.type === "reva") return false;
  const sourceType = node.type === "reva" ? "special" : String(node.type || "combat");
  const missionType = String(node.mission.missionType || "combat");
  return !isRoteInfrastructureNode(node) && sourceType !== missionType;
}

function ruleMarkup(mission) {
  const rule = missionEntryRule(mission);
  const alignmentText = rule.alignments.length ? rule.alignments.join(" + ") : "Any / not restricted";
  const categoryText = rule.categories.length ? `${rule.categories.join(rule.categoryMode === "any" ? " OR " : " + ")}` : "No faction restriction";
  const exactListText = rule.allowedBaseIds.length
    ? `${rule.allowedBaseIds.length} exact allowed unit IDs`
    : rule.requiredBaseIds.length ? `${rule.requiredBaseIds.length} required unit IDs` : "No exact allow-list";
  return `<section class="rote-zoom-section">
    <div class="rote-zoom-section-head"><div><span>ENTRY RULE</span><strong>What the mission actually permits</strong></div><b>${escapeHtml(rule.unitType)}</b></div>
    <div class="rote-zoom-rule-grid">
      <div class="rote-zoom-rule"><span>Squad / unit gate</span><strong>${rule.squadSize ? `${rule.squadSize} slots · ` : ""}${escapeHtml(rule.threshold.join(" · ") || "No numeric gate recorded")}</strong></div>
      <div class="rote-zoom-rule"><span>Alignment</span><strong>${escapeHtml(alignmentText)}</strong></div>
      <div class="rote-zoom-rule"><span>Faction / category</span><strong>${escapeHtml(categoryText)}</strong></div>
      <div class="rote-zoom-rule"><span>Exact allow-list</span><strong>${escapeHtml(exactListText)}</strong></div>
    </div>
    ${rule.notes ? `<p class="rote-zoom-rule-note">${escapeHtml(rule.notes)}</p>` : ""}
  </section>`;
}

function requiredUnitRows(mission, eligibility) {
  const rule = missionEntryRule(mission);
  if (!rule.mandatory.length) {
    return '<div class="rote-zoom-empty">No named mandatory unit is encoded. Fill the mission slots from the legal pool shown below.</div>';
  }
  return `<div class="rote-zoom-required-grid">${rule.mandatory.map((required, index) => {
    const status = eligibility?.mandatory?.[index] || null;
    const catalog = unitCatalogMatch(required.baseId, required.name) || {};
    const unit = status?.unit || catalog;
    const className = status ? (status.legal ? "ready" : "blocked") : "";
    const statusText = !eligibility?.loaded ? "Roster not evaluated" : status?.legal ? "OWNED · LEGAL" : status?.owned ? "OWNED · BELOW GATE" : "NOT OWNED";
    return `<article class="rote-zoom-unit required ${className}">
      ${unitPortraitMarkup(unit, required.name)}
      <div class="rote-zoom-unit-copy"><strong>${escapeHtml(required.name)}</strong><span>${escapeHtml(thresholdText(required))}</span><small>${escapeHtml(statusText)}</small></div>
    </article>`;
  }).join("")}</div>`;
}

function exactAllowedUnitRows(rule) {
  if (!rule.allowedBaseIds.length) return "";
  return `<div class="rote-zoom-allowed-grid">${rule.allowedBaseIds.map((baseId) => {
    const catalog = unitCatalogMatch(baseId, baseId) || { baseId, name: baseId };
    return `<article class="rote-zoom-unit">
      ${unitPortraitMarkup(catalog, baseId)}
      <div class="rote-zoom-unit-copy"><strong>${escapeHtml(catalog.name || baseId)}</strong><span>Allowed by exact ID</span><small>${escapeHtml(baseId)}</small></div>
    </article>`;
  }).join("")}</div>`;
}

function candidateRowsMarkup(eligibility, mission) {
  const rule = missionEntryRule(mission);
  const evidence = poolEvidenceLevel(rule);
  if (!liveBody()) return '<div class="rote-zoom-empty">Load an Ally Code to intersect this mission rule with the player roster.</div>';
  if (catalogStatus === "loading" || catalogStatus === "idle") return '<div class="rote-zoom-empty">Loading static unit definitions before calculating exact faction/alignment legality…</div>';
  if (catalogStatus === "error") return `<div class="rote-zoom-warning">Exact owned-unit legality is unavailable because the static unit catalog could not be loaded: ${escapeHtml(catalogError)}</div>`;
  if (!eligibility?.loaded) return '<div class="rote-zoom-empty">Roster eligibility has not been calculated.</div>';
  if (!eligibility.candidates.length) return `<div class="rote-zoom-empty">No owned ${escapeHtml(rule.unitType.toLowerCase())} currently matches the encoded entry gate.</div>`;

  const heading = evidence === "exact" ? "YOUR LEGAL UNITS" : "GATE-MATCHING OWNED SHIPS";
  const warning = evidence === "gate-only"
    ? '<div class="rote-zoom-warning">The current mission record confirms the ship star gate and any named mandatory ship, but does not encode a complete fleet allow-list. These ships match the known gate; they are not presented as a complete legality claim.</div>'
    : "";
  return `${warning}<div class="rote-zoom-section-head"><div><span>${heading}</span><strong>${eligibility.candidates.length} owned choices</strong></div><b>${eligibility.ready ? "ENTRY DEPTH READY" : "DEPTH GAP"}</b></div>
    <div class="rote-zoom-pool-scroll"><div class="rote-zoom-allowed-grid">${eligibility.candidates.map((unit) => `<button type="button" class="rote-zoom-unit ready" data-inspect-base-id="${escapeAttr(unit.baseId || "")}">
      ${unitPortraitMarkup(unit)}
      <div class="rote-zoom-unit-copy"><strong>${escapeHtml(unit.name || unit.baseId)}</strong><span>${String(unit.unitType || "Character") === "Ship" ? `${number(unit.power)} GP · ${number(unit.stars)}★` : `R${number(unit.relic)} · ${number(unit.power)} GP`}</span><small>${String(unit.unitType || "Character") === "Ship" ? escapeHtml(unit.baseId || "") : `${number(unit.speed)} Speed · ${escapeHtml(unit.alignment || "")}`}</small></div>
    </button>`).join("")}</div></div>`;
}

export function recommendationBaseIds(recommendation = {}, catalog = null) {
  const result = [];
  const byId = catalog?.byId || catalogById;
  const byName = catalog?.byName || catalogByName;
  for (const member of recommendation.members || []) {
    let baseId = String(member?.baseId || "");
    if (!baseId && member?.name) baseId = String(byName.get(normalizeName(member.name))?.baseId || "");
    if (baseId && byId.has(baseId) && !result.includes(baseId)) result.push(baseId);
  }
  for (const baseId of recommendation.baseIds || []) {
    const id = String(baseId || "");
    if (id && !result.includes(id)) result.push(id);
  }
  return result;
}

function recommendationMarkup(mission, node) {
  const recommendations = mission?.recommendations || [];
  if (!recommendations.length) return '<div class="rote-zoom-empty">No mission-specific team recommendation is encoded yet. The legal pool above remains usable for roster planning.</div>';
  return recommendations.map((recommendation) => {
    const baseIds = recommendationBaseIds(recommendation);
    const members = recommendation.members || [];
    const teamId = String(recommendation.id || "");
    const strategyLinked = teamId && (String(node.teamId || "") === teamId || recommendation.verifiedLegal || recommendations.length === 1);
    return `<article class="rote-zoom-recommendation">
      <header><div><span>RECOMMENDED · NOT THE ENTRY RULE</span><strong>${escapeHtml(recommendation.name)}</strong></div><b>${escapeHtml(recommendationLabel(mission, recommendation))}</b></header>
      <div class="rote-zoom-recommend-grid">${members.map((member) => {
        const catalog = unitCatalogMatch(member.baseId, member.name) || { baseId: member.baseId || "", name: member.name || member.baseId || "Unknown" };
        return `<article class="rote-zoom-unit">${unitPortraitMarkup(catalog, member.name)}<div class="rote-zoom-unit-copy"><strong>${escapeHtml(member.name || catalog.name || member.baseId)}</strong><span>Team suggestion</span><small>${escapeHtml(member.baseId || catalog.baseId || "")}</small></div></article>`;
      }).join("")}</div>
      ${baseIds.length ? `<div class="rote-zoom-action-row"><button type="button" data-rote-zoom-load-team="${escapeAttr(baseIds.join(","))}" data-rote-zoom-team-name="${escapeAttr(recommendation.name)}">Load in Squad Workbench</button></div>` : ""}
      ${strategyLinked ? `<div class="rote-zoom-strategy-slot" data-tb-combat-mission="${escapeAttr(mission.id)}" data-tb-combat-team="${escapeAttr(teamId)}"><span>Loading battle preparation…</span></div>` : ""}
    </article>`;
  }).join("");
}

function infrastructureInspector(node, planet) {
  return `<div class="rote-zoom-inspector-head"><span>${escapeHtml(typeLabel(node.type))} · ${escapeHtml(planet.name)}</span><h4>${escapeHtml(node.label)}</h4><p>This is territory infrastructure rather than a playable mission squad.</p></div>
    <section class="rote-zoom-section">
      <div class="rote-zoom-source-facts"><div><span>Requirement</span><strong>${escapeHtml(node.requirement)}</strong></div><div><span>Territory value / effect</span><strong>${escapeHtml(node.reward)}</strong></div></div>
      ${node.type === "operations" ? '<button type="button" data-rote-zoom-operations>Open Operations Readiness</button>' : ""}
    </section>`;
}

function missionInspector(node, resolved, planet, body) {
  const mission = node.mission;
  if (!mission) {
    return `<div class="rote-zoom-inspector-head"><span>${escapeHtml(typeLabel(node.type))}</span><h4>${escapeHtml(node.label)}</h4><p>This source node could not be resolved to a verified app mission record, so no roster legality is inferred.</p></div><section class="rote-zoom-section"><div class="rote-zoom-source-facts"><div><span>Map reference requirement</span><strong>${escapeHtml(node.requirement)}</strong></div><div><span>Map reference reward</span><strong>${escapeHtml(node.reward)}</strong></div></div></section>`;
  }
  const eligibility = body ? missionRosterEligibility(body, mission) : missionRosterEligibility(null, mission);
  const rule = missionEntryRule(mission);
  const conflict = missionTypeConflict(node);
  const badgeClass = eligibility.loaded ? (eligibility.ready ? "ready" : "blocked") : "";
  const badgeText = eligibility.loaded ? (eligibility.ready ? `${eligibility.percent}% ENTRY READY` : `${eligibility.percent}% ENTRY DEPTH`) : "ROSTER NOT EVALUATED";
  return `<div class="rote-zoom-inspector-head">
      <span>${escapeHtml(typeLabel(mission.missionType))} · ${escapeHtml(planet.name)}</span>
      <h4>${escapeHtml(mission.name)}</h4>
      <div class="rote-zoom-badges"><b class="rote-zoom-badge ${badgeClass}">${escapeHtml(badgeText)}</b><b class="rote-zoom-badge">${escapeHtml((mission.rewards || []).join(" · ") || node.reward)}</b>${conflict ? '<b class="rote-zoom-badge warning">MISSION-TYPE EVIDENCE CONFLICT</b>' : ""}</div>
      <p>Required units, legal entry choices, and recommended battle teams are intentionally separated below.</p>
    </div>
    ${conflict ? '<div class="rote-zoom-warning">The source map marker and the normalized mission record disagree on mission type. Entry legality is still shown, but battle-mode/Omicron conclusions should remain fail-closed until that evidence conflict is resolved.</div>' : ""}
    ${node.note ? `<div class="rote-zoom-warning">${escapeHtml(node.note)}</div>` : ""}
    ${ruleMarkup(mission)}
    <section class="rote-zoom-section">
      <div class="rote-zoom-section-head"><div><span>REQUIRED UNITS</span><strong>Named mandatory characters / ships</strong></div><b>${rule.mandatory.length || "NONE"}</b></div>
      ${requiredUnitRows(mission, eligibility)}
    </section>
    ${rule.allowedBaseIds.length ? `<section class="rote-zoom-section"><div class="rote-zoom-section-head"><div><span>EXACT ALLOWED SET</span><strong>Units the rule explicitly names as selectable</strong></div><b>${rule.allowedBaseIds.length}</b></div>${exactAllowedUnitRows(rule)}</section>` : ""}
    <section class="rote-zoom-section">${candidateRowsMarkup(eligibility, mission)}</section>
    <section class="rote-zoom-section">
      <div class="rote-zoom-section-head"><div><span>RECOMMENDED TEAM</span><strong>Battle planning — separate from legality</strong></div><b>${mission.recommendations?.length || 0}</b></div>
      ${recommendationMarkup(mission, node)}
    </section>
    <section class="rote-zoom-section">
      <div class="rote-zoom-section-head"><div><span>MAP REFERENCE</span><strong>Source-node context</strong></div></div>
      <div class="rote-zoom-source-facts"><div><span>Source map requirement</span><strong>${escapeHtml(node.requirement)}</strong></div><div><span>Source map reward / value</span><strong>${escapeHtml(node.reward)}</strong></div></div>
    </section>`;
}

function selectedNodeFor(resolved) {
  const saved = selectedNodeByPlanet.get(resolved.planetId);
  return resolved.nodes.find((node) => node.id === saved) || resolved.nodes.find((node) => !isRoteInfrastructureNode(node)) || resolved.nodes[0] || null;
}

function nodeStatus(node, body) {
  if (isRoteInfrastructureNode(node) || !node.mission) return "";
  if (!liveBody() || !body) return "status-unloaded";
  return missionRosterEligibility(body, node.mission).ready ? "status-ready" : "status-blocked";
}

function renderOverlay() {
  scheduled = false;
  const mapView = document.getElementById("roteMapView");
  const galaxy = document.getElementById("roteGalaxyMap");
  if (mapView) mapView.classList.add("rote-zoom-workspace-enabled");
  if (!galaxy) return;

  const existing = galaxy.querySelector(":scope > .rote-planet-zoom");
  if (!activePlanetId) {
    existing?.remove();
    return;
  }

  const sourceMap = roteMissionMap(activePlanetId);
  const planet = rotePlanetById(activePlanetId);
  if (!sourceMap || !planet) {
    activePlanetId = "";
    existing?.remove();
    return;
  }

  const resolved = resolveRoteMissionNodes(activePlanetId, sourceMap);
  const selectedNode = selectedNodeFor(resolved);
  if (!selectedNode) return;
  selectedNodeByPlanet.set(activePlanetId, selectedNode.id);
  const body = eligibilityBody();
  const snapshot = liveSnapshot();
  const signature = `${activePlanetId}|${selectedNode.id}|${snapshot?.fetchedAt || 0}|${catalogStatus}|${catalogById.size}`;
  if (existing?.dataset.signature === signature) return;

  const overlay = existing || document.createElement("section");
  overlay.className = "rote-planet-zoom";
  overlay.dataset.signature = signature;
  overlay.dataset.roteZoomPlanet = activePlanetId;
  const phase = String(planet.phase || "ROTE");
  const lane = planet.lane || planet.alignment || "Mixed";
  overlay.innerHTML = `<div class="rote-zoom-stage">
      <div class="rote-zoom-planet-art" style="background-image:url(&quot;${escapeAttr(sourceMap.background)}&quot;)"></div>
      <div class="rote-zoom-topbar"><div class="rote-zoom-title"><span>${escapeHtml(phase)} · ${escapeHtml(lane)} · R${escapeHtml(planet.relic)}</span><strong>${escapeHtml(planet.name)}</strong><small>Planet workspace · select a mission marker to inspect exact entry rules and the loaded roster.</small></div><button type="button" class="rote-zoom-close" data-rote-zoom-close>← Galaxy Map</button></div>
      ${resolved.nodes.map((node) => `<button type="button" class="rote-zoom-node type-${escapeAttr(node.type)} ${nodeStatus(node, body)}${node.id === selectedNode.id ? " selected" : ""}" data-rote-zoom-node="${escapeAttr(node.id)}" style="top:${Number(node.top)}%;left:${Number(node.left)}%" aria-label="Open ${escapeAttr(node.label)}"><img src="${escapeAttr(missionIcon(node.type))}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(node.mission?.name || node.label)}</span></button>`).join("")}
    </div>
    <aside class="rote-zoom-inspector">${isRoteInfrastructureNode(selectedNode) ? infrastructureInspector(selectedNode, planet) : missionInspector(selectedNode, resolved, planet, body)}</aside>`;
  if (!existing) galaxy.appendChild(overlay);

  const prepBody = body;
  if (prepBody) hydrateCombatPreparation(overlay, prepBody, resolved.missions).catch(() => {});
}

function scheduleRender() {
  if (scheduled || typeof requestAnimationFrame === "undefined") return;
  scheduled = true;
  requestAnimationFrame(renderOverlay);
}

function openPlanet(planetId) {
  const id = String(planetId || "");
  if (!roteMissionMap(id)) return;
  activePlanetId = id;
  scheduleRender();
  loadCatalog();
}

function closePlanet() {
  activePlanetId = "";
  scheduleRender();
}

function install() {
  const enableLayout = () => document.getElementById("roteMapView")?.classList.add("rote-zoom-workspace-enabled");
  enableLayout();
  loadCatalog();

  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-rote-zoom-close]");
    if (close) {
      event.preventDefault();
      event.stopPropagation();
      closePlanet();
      return;
    }

    const nodeButton = event.target.closest("[data-rote-zoom-node]");
    if (nodeButton) {
      event.preventDefault();
      event.stopPropagation();
      selectedNodeByPlanet.set(activePlanetId, nodeButton.dataset.roteZoomNode || "");
      const overlay = nodeButton.closest(".rote-planet-zoom");
      if (overlay) overlay.dataset.signature = "";
      scheduleRender();
      return;
    }

    const operations = event.target.closest("[data-rote-zoom-operations]");
    if (operations) {
      event.preventDefault();
      event.stopPropagation();
      closePlanet();
      document.querySelector('button[data-rote-view="operations"]')?.click();
      return;
    }

    const loadTeam = event.target.closest("[data-rote-zoom-load-team]");
    if (loadTeam) {
      event.preventDefault();
      event.stopPropagation();
      const baseIds = String(loadTeam.dataset.roteZoomLoadTeam || "").split(",").map((id) => id.trim()).filter(Boolean);
      if (baseIds.length) {
        window.dispatchEvent(new CustomEvent("swgoh:replace-squad", { detail: { baseIds, size: baseIds.length, name: loadTeam.dataset.roteZoomTeamName || "ROTE Mission Team" } }));
        document.querySelector('button[data-workspace-tab="squads"]')?.click();
      }
      return;
    }
  }, true);

  document.addEventListener("click", (event) => {
    const planetButton = event.target.closest("#roteGalaxyMap [data-rote-planet]");
    if (planetButton) openPlanet(planetButton.dataset.rotePlanet);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activePlanetId) closePlanet();
  });

  const observer = new MutationObserver(() => {
    enableLayout();
    if (activePlanetId) scheduleRender();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:workspace-activated", () => {
    enableLayout();
    if (activePlanetId) scheduleRender();
  });
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    enrichedBodyCache = null;
    enrichedBodyKey = "";
    if (activePlanetId) setTimeout(scheduleRender, 500);
  });
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
