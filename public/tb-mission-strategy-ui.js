import { evaluateBattleStrategy } from "./tb-battle-strategy.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function ensureCss() {
  const href = "/tb-battle-strategy.css?v=20260815-tbstrategy3";
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function stagesMarkup(strategy) {
  if (!strategy?.stages?.length) return '<span class="tbsi-empty">Detailed encounter sequencing has not been sourced yet.</span>';
  return `<div class="tbsi-stage-list">${strategy.stages.map((stage, index) => `<section class="tbsi-stage">
    <header><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(stage.label)}</strong>${stage.objective ? `<small>${escapeHtml(stage.objective)}</small>` : ""}</div>${stage.confidence ? `<b>${escapeHtml(stage.confidence)}</b>` : ""}</header>
    <ol>${(stage.steps || []).map((entry) => `<li class="${escapeHtml(String(entry.priority || "helpful").toLowerCase())}"><b>${escapeHtml(String(entry.priority || "HELPFUL").toUpperCase())}</b><span>${escapeHtml(entry.instruction)}</span></li>`).join("")}</ol>
    ${stage.hazards?.length ? `<div class="tbsi-stage-hazards"><b>HAZARDS</b>${stage.hazards.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
  </section>`).join("")}</div>`;
}

function prioritiesMarkup(strategy) {
  if (!strategy?.targetPriorities?.length) return "";
  return `<section class="tbsi-priorities"><h6>Target priorities</h6>${strategy.targetPriorities.map((item) => `<article><b>${escapeHtml(String(item.priority || "HELPFUL").toUpperCase())}</b><div><strong>${escapeHtml(item.target)}</strong><span>${item.when ? `${escapeHtml(item.when)} · ` : ""}${escapeHtml(item.reason || "")}</span></div></article>`).join("")}</section>`;
}

function risksMarkup(strategy) {
  if (!strategy?.failureRisks?.length) return "";
  return `<section class="tbsi-risks"><h6>Failure risks</h6>${strategy.failureRisks.map((item) => `<p><b>WATCH</b>${escapeHtml(item)}</p>`).join("")}</section>`;
}

function sourcesMarkup(strategy) {
  if (!strategy?.sources?.length) return '<span>No linked sources</span>';
  return strategy.sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(source.kind)}</b>${escapeHtml(source.label)}</a>`).join("");
}

export function missionBattleStrategyMarkup(mission = {}) {
  const strategy = evaluateBattleStrategy({ missionId: mission.id, members: [] }, mission);
  if (!strategy.available) {
    return `<details class="tbsi-panel pending tbsi-mission-only">
      <summary class="tbsi-head"><div><span>MISSION STRATEGY</span><strong>Source-backed battle plan</strong></div><b>STRATEGY PENDING</b></summary>
      <p class="tbsi-pending-copy">No sourced mission-level strategy pack has been published yet. Entry legality and roster readiness remain authoritative; no generic turn order is generated.</p>
      <small class="tbsi-boundary">${escapeHtml(strategy.evidenceBoundary || "")}</small>
    </details>`;
  }

  return `<details class="tbsi-panel tbsi-mission-only">
    <summary class="tbsi-head"><div><span>MISSION STRATEGY</span><strong>${escapeHtml(strategy.title)}</strong></div><b>${escapeHtml(strategy.strategyStatus || "SOURCED")}</b></summary>
    <div class="tbsi-meta"><span>Confidence <b>${escapeHtml(strategy.confidence)}</b></span><span>Verified <b>${escapeHtml(strategy.lastVerified)}</b></span><span>Pack <b>${escapeHtml(strategy.strategyId)}</b></span></div>
    <p class="tbsi-summary">${escapeHtml(strategy.summary)}</p>
    <div class="tbsi-mission-boundary"><b>MISSION-LEVEL ONLY</b> This panel describes the sourced encounter plan. It does not claim a best squad or that your roster is ready.</div>
    <details class="tbsi-details" open><summary>Execution plan</summary>${stagesMarkup(strategy)}</details>
    <div class="tbsi-bottom-grid">${prioritiesMarkup(strategy)}${risksMarkup(strategy)}</div>
    <details class="tbsi-sources"><summary>Strategy evidence &amp; sources</summary><div>${sourcesMarkup(strategy)}</div><small>${escapeHtml(strategy.evidenceBoundary || "")}</small></details>
  </details>`;
}

export function hydrateMissionLevelStrategies(root, missions = []) {
  if (!root) return;
  ensureCss();
  const byId = new Map((missions || []).map((mission) => [String(mission.id), mission]));
  for (const slot of root.querySelectorAll("[data-tb-mission-strategy]")) {
    const mission = byId.get(String(slot.dataset.tbMissionStrategy || ""));
    if (!mission) continue;
    slot.innerHTML = missionBattleStrategyMarkup(mission);
  }
}
