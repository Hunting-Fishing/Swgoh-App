import { roteMissionMap } from "./rote-mission-map-registry.js";
import {
  isRoteInfrastructureNode,
  missionEntryRule,
  resolveRoteMissionNodes,
} from "./rote-mission-node-eligibility.js";
import { missionSlotModel } from "./tb-mission-slot-model.js";

const CSS_HREF = "/rote-slot-presentation.css?v=20260816-slots1";
let scheduled = false;

const normalize = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function installCss() {
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

function currentContext() {
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
  return { overlay, inspector, node, mission: node.mission };
}

function candidateSection(inspector) {
  return [...inspector.querySelectorAll(":scope > .rote-zoom-section")].find((section) => {
    const label = normalize(section.querySelector(".rote-zoom-section-head span")?.textContent);
    return label === "your legal units" || label === "eligible flex units" || label === "gate matching owned ships";
  }) || null;
}

function candidateRows(section) {
  if (!section) return [];
  return [...section.querySelectorAll(".rote-zoom-pool-scroll button[data-inspect-base-id]")].map((button) => ({
    button,
    baseId: String(button.dataset.inspectBaseId || ""),
    name: String(button.querySelector("strong")?.textContent || ""),
  }));
}

function slotSignature(context, rows, model) {
  return [
    context.mission.id,
    model.squadSize,
    model.mandatorySlots,
    model.flexSlots,
    rows.map((row) => row.baseId || normalize(row.name)).join(","),
  ].join("|");
}

function enhanceRule(inspector, mission, model) {
  if (!model.squadSize || !model.mandatorySlots) return;
  const rule = missionEntryRule(mission);
  const gate = [...inspector.querySelectorAll(".rote-zoom-rule")].find((item) => normalize(item.querySelector("span")?.textContent) === "squad unit gate");
  const strong = gate?.querySelector("strong");
  if (!strong) return;
  const threshold = rule.threshold.length ? ` · ${rule.threshold.join(" · ")}` : "";
  strong.textContent = model.fixedSquad
    ? `${model.squadSize} slots · ${model.mandatorySlots} required · FIXED SQUAD${threshold}`
    : `${model.squadSize} slots · ${model.mandatorySlots} required + ${model.flexSlots} flex${threshold}`;
}

function flexibleIdentitySet(model) {
  const ids = new Set();
  const names = new Set();
  for (const unit of model.flexCandidates) {
    const id = String(unit?.baseId || "");
    const name = normalize(unit?.name || "");
    if (id) ids.add(id);
    if (name) names.add(name);
  }
  return { ids, names };
}

function isFlexibleRow(row, identities) {
  return Boolean((row.baseId && identities.ids.has(row.baseId)) || (row.name && identities.names.has(normalize(row.name))));
}

function collapsePool(section, count, label = "eligible units") {
  const scroll = section.querySelector(".rote-zoom-pool-scroll");
  if (!scroll) return;
  scroll.hidden = section.dataset.tbFlexExpanded !== "true";
  let button = section.querySelector("[data-tb-flex-toggle]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "rote-slot-pool-toggle";
    button.dataset.tbFlexToggle = "true";
    scroll.before(button);
  }
  const expanded = section.dataset.tbFlexExpanded === "true";
  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = `${expanded ? "Hide" : "Show"} ${count} ${label}`;
}

function enhanceCandidateSection(section, mission, rows, model) {
  if (!section || String(mission?.entry?.unitType || "Character").toLowerCase() !== "character") return;

  if (model.fixedSquad) {
    section.innerHTML = `<div class="rote-slot-fixed"><span>FIXED MISSION SQUAD</span><strong>${model.mandatorySlots}/${model.squadSize} slots are required units</strong><small>No other roster units are selectable for this mission when the encoded required-unit set consumes every squad slot.</small></div>`;
    return;
  }

  const heading = section.querySelector(".rote-zoom-section-head");
  const label = heading?.querySelector("span");
  const count = heading?.querySelector("strong");
  const status = heading?.querySelector("b");

  if (model.mandatorySlots > 0) {
    if (label) label.textContent = "ELIGIBLE FLEX UNITS";
    if (count) count.textContent = `${model.flexCandidates.length} owned fillers · choose ${model.flexSlots}`;
    if (status) status.textContent = model.flexReady ? "FLEX DEPTH READY" : "FLEX DEPTH GAP";

    const flexIdentity = flexibleIdentitySet(model);
    for (const row of rows) row.button.hidden = !isFlexibleRow(row, flexIdentity);

    let note = section.querySelector(".rote-slot-flex-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "rote-slot-flex-note";
      heading?.insertAdjacentElement("afterend", note);
    }
    note.innerHTML = `<strong>${model.mandatorySlots} required slot${model.mandatorySlots === 1 ? "" : "s"} + ${model.flexSlots} flexible slot${model.flexSlots === 1 ? "" : "s"}</strong><span>Required units are shown above and removed from this filler pool.</span>`;
    collapsePool(section, model.flexCandidates.length, "eligible fillers");
    return;
  }

  if (rows.length > 24) collapsePool(section, rows.length, "eligible units");
}

function enhanceCockpit(inspector, model) {
  if (!model.mandatorySlots) return;
  const cockpit = inspector.querySelector("[data-rote-plan-cockpit]");
  if (!cockpit) return;
  const depth = [...cockpit.querySelectorAll(".rote-plan-kpis article")].find((article) => {
    const label = normalize(article.querySelector("span")?.textContent);
    return label === "legal depth" || label === "flex slots";
  });
  if (!depth) return;
  const label = depth.querySelector("span");
  const strong = depth.querySelector("strong");
  const small = depth.querySelector("small");
  if (label) label.textContent = "FLEX SLOTS";
  if (strong) strong.textContent = String(model.flexSlots);
  if (small) {
    small.textContent = model.fixedSquad
      ? "Fixed squad · no filler choices"
      : `${model.flexCandidates.length} owned eligible filler${model.flexCandidates.length === 1 ? "" : "s"}`;
  }
}

function enhance() {
  scheduled = false;
  const context = currentContext();
  if (!context) return;
  if (String(context.mission?.entry?.unitType || "Character").toLowerCase() !== "character") return;

  const section = candidateSection(context.inspector);
  const rows = candidateRows(section);
  const eligibility = { candidates: rows.map((row) => ({ baseId: row.baseId, name: row.name })) };
  const model = missionSlotModel(context.mission, eligibility);
  const signature = slotSignature(context, rows, model);
  if (context.inspector.dataset.tbSlotSignature === signature) return;

  enhanceRule(context.inspector, context.mission, model);
  enhanceCandidateSection(section, context.mission, rows, model);
  enhanceCockpit(context.inspector, model);
  context.inspector.dataset.tbSlotSignature = signature;
}

function schedule() {
  if (scheduled || typeof requestAnimationFrame === "undefined") return;
  scheduled = true;
  requestAnimationFrame(enhance);
}

function install() {
  installCss();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest?.("[data-tb-flex-toggle]");
    if (!toggle) return;
    event.preventDefault();
    const section = toggle.closest(".rote-zoom-section");
    const scroll = section?.querySelector(".rote-zoom-pool-scroll");
    if (!section || !scroll) return;
    const expanded = section.dataset.tbFlexExpanded !== "true";
    section.dataset.tbFlexExpanded = String(expanded);
    scroll.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    const visible = [...scroll.querySelectorAll("button[data-inspect-base-id]")].filter((button) => !button.hidden).length;
    toggle.textContent = `${expanded ? "Hide" : "Show"} ${visible} ${section.querySelector(".rote-slot-flex-note") ? "eligible fillers" : "eligible units"}`;
  }, true);

  window.addEventListener("swgoh:workspace-activated", schedule);
  schedule();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
