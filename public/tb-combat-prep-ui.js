import { analyzeTeamCombatPreparation, combatPreparationStatus, loadCombatCatalog, loadCombatKnowledge } from "./tb-combat-intelligence.js";
import { battleStrategyMarkup } from "./tb-battle-strategy-ui.js";
import { missionRosterReadiness } from "./tb-roster-readiness.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function ensureStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function ensureCss() {
  ensureStyle("/tb-combat-prep.css?v=20260816-tbcombat3");
  ensureStyle("/tb-battle-strategy.css?v=20260815-tbstrategy1");
}

function targetText(target = {}) {
  const bits = [];
  if (target.relic != null) bits.push(`R${target.relic}+`);
  if (target.gear != null) bits.push(`G${target.gear}+`);
  if (target.speed != null) bits.push(`${target.speed}+ Speed`);
  if (target.notes) bits.push(String(target.notes));
  return bits.join(" · ") || "Not sourced yet";
}

function guidanceRows(items = []) {
  if (!items.length) return '<span class="tbcp-pending">No mission-specific priority recorded yet</span>';
  return items.map((item) => `<span class="tbcp-guidance"><b>${escapeHtml(item.priority)}</b>${escapeHtml(item.name)}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</span>`).join("");
}

function memberMarkup(member) {
  const name = member.unit?.name || member.name || "Unknown";
  const speed = member.currentSpeed == null ? "—" : member.currentSpeed;
  const activeOmi = member.omicrons.rows.filter((ability) => ability.activeHere);
  const zetaText = member.zetas.available ? `${member.zetas.installed}/${member.zetas.available}` : "0";
  const omiText = activeOmi.length ? `${activeOmi.filter((ability) => ability.installed).length}/${activeOmi.length}` : "0";
  const abilityLines = [
    ...member.zetas.rows.filter((ability) => !ability.installed).slice(0, 2).map((ability) => `Zeta available: ${ability.name}`),
    ...activeOmi.slice(0, 2).map((ability) => `${ability.installed ? "TB Omicron installed" : "TB Omicron available"}: ${ability.name}`),
  ];
  return `<article class="tbcp-member${member.legal ? " ready" : " blocked"}">
    <header><strong>${escapeHtml(name)}</strong><span>${member.legal ? "ENTRY READY" : "ENTRY GAP"}</span></header>
    <div class="tbcp-member-stats"><span>Speed <b>${escapeHtml(speed)}</b></span><span>Zetas <b>${escapeHtml(zetaText)}</b></span><span>TB Omi <b>${escapeHtml(omiText)}</b></span></div>
    ${abilityLines.length ? `<div class="tbcp-ability-lines">${abilityLines.map((line) => `<small>${escapeHtml(line)}</small>`).join("")}</div>` : '<small class="tbcp-muted">No unresolved Zeta / active TB Omicron detected from current ability data.</small>'}
  </article>`;
}

function mechanicSourceText(sources = []) {
  if (!sources.length) return "No explicit matching ability found on this listed team.";
  return sources.slice(0, 4).map((source) => `${source.unitName} · ${source.abilityName}`).join("; ");
}

function mechanicCoverageMarkup(coverage = {}) {
  const rows = [
    ...(coverage.covered || []).map((item) => `<article class="tbcp-mechanic covered"><b>COVERED</b><div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(mechanicSourceText(item.sources))}</span><small>${escapeHtml(item.note)}</small></div></article>`),
    ...(coverage.missing || []).map((item) => `<article class="tbcp-mechanic missing"><b>MISSING</b><div><strong>${escapeHtml(item.label)}</strong><span>No explicit matching mechanic was found on this listed team.</span><small>${escapeHtml(item.note)}</small></div></article>`),
    ...(coverage.hazards || []).map((item) => `<article class="tbcp-mechanic hazard"><b>HAZARD</b><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></div></article>`),
  ];
  if (!rows.length) rows.push('<div class="tbcp-mechanic-empty">No source-backed battle mechanic requirement is encoded for this mission yet.</div>');

  const enemyRows = coverage.enemies?.resolved?.length
    ? coverage.enemies.resolved.map((enemy) => `<span class="tbcp-enemy-kit"><b>${escapeHtml(enemy.name)}</b>${escapeHtml((enemy.mechanics || []).slice(0, 6).join(" · ") || "Kit indexed")}${enemy.debuffs?.length ? `<small>Debuffs: ${escapeHtml(enemy.debuffs.slice(0, 5).join(", "))}</small>` : ""}</span>`).join("")
    : '<span class="tbcp-pending">No exact enemy definition is linked to this mission record yet.</span>';
  const unresolved = coverage.enemies?.unresolved?.length
    ? `<p class="tbcp-unresolved">Unresolved enemy references: ${escapeHtml(coverage.enemies.unresolved.join(", "))}</p>`
    : "";
  const informational = coverage.informational?.length
    ? `<div class="tbcp-info-notes">${coverage.informational.map((item) => `<p><b>INFO</b> ${escapeHtml(item)}</p>`).join("")}</div>`
    : "";

  return `<section class="tbcp-mechanic-panel">
    <div class="tbcp-mechanic-head"><h6>Mission Mechanic Coverage</h6><span>${coverage.covered?.length || 0} covered · ${coverage.missing?.length || 0} missing · ${coverage.hazards?.length || 0} hazards</span></div>
    <div class="tbcp-mechanic-grid">${rows.join("")}</div>
    ${informational}
    <details class="tbcp-enemy-details"><summary>Enemy kit intelligence</summary><div class="tbcp-enemy-grid">${enemyRows}</div>${unresolved}</details>
    <small class="tbcp-evidence-boundary">${escapeHtml(coverage.evidenceBoundary || "")}</small>
  </section>`;
}

function interactionMarkup(profile = {}) {
  const rows = (profile.activeInteractions || []).slice(0, 10);
  return `<section class="tbcp-interaction-panel">
    <div class="tbcp-mechanic-head"><h6>Team Interaction Evidence</h6><span>${rows.length ? `${profile.activeInteractions.length} explicit links` : "no explicit in-team links"}</span></div>
    ${rows.length ? `<div class="tbcp-interaction-grid">${rows.map((item) => `<span><b>${escapeHtml(item.relationTypes?.join(" + ") || item.abilityType || "LINK")}</b>${escapeHtml(item.abilityName)} → ${escapeHtml(item.targetName)}<small>${escapeHtml(item.sentence)}</small></span>`).join("")}</div>` : '<span class="tbcp-pending">No explicit named-unit or faction interaction was detected inside this selected team.</span>'}
    <small class="tbcp-evidence-boundary">${escapeHtml(profile.evidenceBoundary || "")}</small>
  </section>`;
}

function prepMarkup(analysis, readiness) {
  const status = combatPreparationStatus(analysis);
  const activeOmiRows = analysis.tbOmicrons.rows;
  const coverageCount = (analysis.mechanicCoverage?.requirements?.length || 0) + (analysis.mechanicCoverage?.hazards?.length || 0);
  return `<section class="tbcp-card">
    <header class="tbcp-head"><div><span>MISSION BATTLE PREPARATION</span><strong>Abilities · Mechanics · Strategy · Mods</strong></div><b class="${status.level}">${escapeHtml(status.label)}</b></header>
    <div class="tbcp-summary">
      <div><span>Roster Readiness</span><strong>${escapeHtml(readiness?.label || "UNKNOWN")}</strong></div>
      <div><span>Strategy Evidence</span><strong>${escapeHtml(readiness?.strategy?.label || "NO VERIFIED STRATEGY YET")}</strong></div>
      <div><span>Zetas installed</span><strong>${analysis.zetas.installed}/${analysis.zetas.available}</strong></div>
      <div><span>TB-active Omicrons</span><strong>${analysis.tbOmicrons.installed}/${analysis.tbOmicrons.active}</strong></div>
      <div><span>Minimum target</span><strong>${escapeHtml(targetText(analysis.targets.minimum))}</strong></div>
      <div><span>Battle mechanics</span><strong>${coverageCount || "Pending"}</strong></div>
    </div>
    <details class="tbcp-details"><summary>Inspect battle preparation</summary>
      <div class="tbcp-members">${analysis.members.map(memberMarkup).join("")}</div>
      ${mechanicCoverageMarkup(analysis.mechanicCoverage)}
      ${battleStrategyMarkup(analysis.battleStrategy)}
      ${interactionMarkup(analysis.interactionProfile)}
      <div class="tbcp-columns">
        <section><h6>TB Omicron activity</h6>${activeOmiRows.length ? activeOmiRows.map((row) => `<span class="tbcp-guidance"><b>${row.installed ? "INSTALLED" : "AVAILABLE"}</b>${escapeHtml(row.unitName)} · ${escapeHtml(row.name)} · ${escapeHtml(row.modeLabel)}</span>`).join("") : '<span class="tbcp-pending">No Omicron on this listed team is marked active for this mission type.</span>'}<p>This reports game-mode activation only. It does not claim the Omicron is worth purchasing for this specific battle.</p></section>
        <section><h6>Explicit ability / Zeta guidance</h6>${guidanceRows([...analysis.guidance.abilities, ...analysis.guidance.zetas, ...analysis.guidance.omicrons])}</section>
        <section><h6>Mods</h6>${guidanceRows(analysis.guidance.mods)}<p>${analysis.targets.minimum.speed != null ? `Team template speed target: ${escapeHtml(analysis.targets.minimum.speed)}+.` : "No source-backed mission speed target has been recorded for this team yet."}</p></section>
        <section><h6>Safer investment</h6><span class="tbcp-pending">${escapeHtml(targetText(analysis.targets.safer))}</span></section>
      </div>
      ${(analysis.mechanics.length || analysis.enemies.length || analysis.guidance.strategy.length) ? `<div class="tbcp-strategy"><h6>Source Battle Notes</h6>${analysis.mechanics.map((item) => `<p><b>MECHANIC</b> ${escapeHtml(item)}</p>`).join("")}${analysis.enemies.map((item) => `<p><b>ENEMY</b> ${escapeHtml(typeof item === "string" ? item : item?.name || item?.baseId || item?.definitionId || "Enemy")}</p>`).join("")}${analysis.guidance.strategy.map((item) => `<p><b>${escapeHtml(item.priority)}</b> ${escapeHtml(item.name)}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</p>`).join("")}</div>` : ""}
      <footer><button type="button" data-tbcp-open-mods>Open Mods Command</button><small>No win percentage is generated. Battle Strategy Intelligence reports source-backed or explicitly labeled community-tested execution guidance and fails closed when a mission has not been researched.</small></footer>
    </details>
  </section>`;
}

function missionMap(missions) {
  return new Map((missions || []).map((mission) => [String(mission.id), mission]));
}

export async function hydrateCombatPreparation(root, body, missions) {
  if (!root || !body) return;
  const slots = [...root.querySelectorAll("[data-tb-combat-mission][data-tb-combat-team]")];
  if (!slots.length) return;
  ensureCss();
  const byMission = missionMap(missions);
  const visibleMissionIds = new Set(slots.map((slot) => String(slot.dataset.tbCombatMission || "")).filter(Boolean));
  const needEnemy = [...visibleMissionIds].some((id) => Array.isArray(byMission.get(id)?.enemies) && byMission.get(id).enemies.length > 0);
  let catalog;
  let knowledge;
  try {
    [catalog, knowledge] = await Promise.all([loadCombatCatalog(), loadCombatKnowledge({ needEnemy })]);
  } catch (error) {
    for (const slot of slots) slot.innerHTML = `<div class="tbcp-load-error">Battle preparation unavailable: ${escapeHtml(error?.message || "catalog error")}</div>`;
    return;
  }

  for (const slot of slots) {
    const mission = byMission.get(String(slot.dataset.tbCombatMission || ""));
    const recommendation = mission?.recommendations?.find((item) => String(item.id) === String(slot.dataset.tbCombatTeam || ""));
    if (!mission || !recommendation) continue;
    const analysis = analyzeTeamCombatPreparation(body, mission, recommendation, catalog, knowledge);
    const readiness = missionRosterReadiness(body, mission);
    slot.innerHTML = prepMarkup(analysis, readiness);
  }
  for (const button of root.querySelectorAll("[data-tbcp-open-mods]")) {
    button.addEventListener("click", () => document.querySelector('button[data-workspace-tab="mods"]')?.click());
  }
}
