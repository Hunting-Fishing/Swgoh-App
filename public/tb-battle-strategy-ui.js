const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function checkDetail(check) {
  if (check.type === "leader") return check.ready ? `Leader: ${check.expected}` : `Expected ${check.expected}; current ${check.current || "none"}`;
  if (check.type === "unit") return check.reason || "Key unit check";
  if (check.type === "mechanic") {
    if (!check.ready) return `No explicit ${check.expected || check.label} source found on this listed team.`;
    return (check.sources || []).slice(0, 3).map((source) => `${source.unitName} · ${source.abilityName}`).join("; ");
  }
  if (check.type === "ability") {
    if (!check.hasAbility) return `${check.unitName || check.baseId} · ${check.label} not found on the current listed unit data`;
    const missing = [];
    if (check.minimumTier != null && !check.tierReady) missing.push(`tier ${check.minimumTier}+ required; current ${check.installedTier ?? "unknown"}`);
    if (check.requiresZeta && !check.zetaReady) missing.push("Zeta required but not installed");
    if (check.requiresOmicron && !check.omicronReady) missing.push("Omicron required but not installed");
    if (missing.length) return `${check.unitName} · ${check.label} · ${missing.join(" · ")}`;
    const installed = [];
    if (check.installedTier != null) installed.push(`tier ${check.installedTier}`);
    if (check.requiresZeta) installed.push("Zeta installed");
    if (check.requiresOmicron) installed.push("Omicron installed");
    return `${check.unitName} · ${check.label}${installed.length ? ` · ${installed.join(" · ")}` : ""}`;
  }
  if (check.type === "speed-order") {
    const faster = check.fasterSpeed == null ? `${check.fasterName} speed unknown` : `${check.fasterName} ${check.fasterSpeed}`;
    const slower = check.slowerSpeed == null ? `${check.slowerName} speed unknown` : `${check.slowerName} ${check.slowerSpeed}`;
    return `${faster} > ${slower}${check.reason ? ` · ${check.reason}` : ""}`;
  }
  return "";
}

function checksMarkup(strategy) {
  if (!strategy?.checks?.length) return '<span class="tbsi-empty">No roster-specific preflight checks are defined for this strategy pack.</span>';
  return `<div class="tbsi-check-grid">${strategy.checks.map((check) => `<article class="tbsi-check ${check.ready ? "ready" : check.required ? "blocked" : "warning"}">
    <b>${check.ready ? "READY" : check.required ? "MISSING" : "ADVISORY"}</b>
    <div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(checkDetail(check))}</small></div>
  </article>`).join("")}</div>`;
}

function stagesMarkup(strategy) {
  if (!strategy?.stages?.length) return '<span class="tbsi-empty">Detailed encounter sequencing has not been sourced for this mission yet.</span>';
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

export function battleStrategyMarkup(strategy = {}) {
  if (!strategy.available) {
    return `<section class="tbsi-panel pending">
      <header class="tbsi-head"><div><span>BATTLE STRATEGY INTELLIGENCE</span><strong>Mission-specific turn plan</strong></div><b>STRATEGY PENDING</b></header>
      <p class="tbsi-pending-copy">No sourced strategy pack has been published for this mission yet. Entry rules, mechanic coverage and roster preparation remain available above; the app will not fill this section with generic combat advice.</p>
      <small class="tbsi-boundary">${escapeHtml(strategy.evidenceBoundary || "")}</small>
    </section>`;
  }

  const statusClass = strategy.status === "blocked" ? "blocked" : strategy.status === "warning" ? "warning" : "ready";
  return `<section class="tbsi-panel ${statusClass}">
    <header class="tbsi-head"><div><span>BATTLE STRATEGY INTELLIGENCE</span><strong>${escapeHtml(strategy.title)}</strong></div><b>${escapeHtml(strategy.label)}</b></header>
    <div class="tbsi-meta"><span>Confidence <b>${escapeHtml(strategy.confidence)}</b></span><span>Verified <b>${escapeHtml(strategy.lastVerified)}</b></span><span>Pack <b>${escapeHtml(strategy.strategyId)}</b></span></div>
    <p class="tbsi-summary">${escapeHtml(strategy.summary)}</p>
    <details class="tbsi-details" open><summary>Roster preflight</summary>${checksMarkup(strategy)}</details>
    <details class="tbsi-details" open><summary>Execution plan</summary>${stagesMarkup(strategy)}</details>
    <div class="tbsi-bottom-grid">${prioritiesMarkup(strategy)}${risksMarkup(strategy)}</div>
    <details class="tbsi-sources"><summary>Strategy evidence &amp; sources</summary><div>${sourcesMarkup(strategy)}</div><small>${escapeHtml(strategy.evidenceBoundary || "")}</small></details>
  </section>`;
}
