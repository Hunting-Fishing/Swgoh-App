import { analyzeTeamCombatPreparation, combatPreparationStatus, loadCombatCatalog } from "./tb-combat-intelligence.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function ensureCss() {
  const href = "/tb-combat-prep.css?v=20260815-tbcombat1";
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
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

function prepMarkup(analysis) {
  const status = combatPreparationStatus(analysis);
  const activeOmiRows = analysis.tbOmicrons.rows;
  const mechanicCount = analysis.mechanics.length + analysis.enemies.length;
  return `<section class="tbcp-card">
    <header class="tbcp-head"><div><span>MISSION BATTLE PREPARATION</span><strong>Abilities · Zetas · TB Omicrons · Mods</strong></div><b class="${status.level}">${escapeHtml(status.label)}</b></header>
    <div class="tbcp-summary">
      <div><span>Zetas installed</span><strong>${analysis.zetas.installed}/${analysis.zetas.available}</strong></div>
      <div><span>TB-active Omicrons</span><strong>${analysis.tbOmicrons.installed}/${analysis.tbOmicrons.active}</strong></div>
      <div><span>Minimum target</span><strong>${escapeHtml(targetText(analysis.targets.minimum))}</strong></div>
      <div><span>Known mechanics</span><strong>${mechanicCount}</strong></div>
    </div>
    <details class="tbcp-details"><summary>Inspect battle preparation</summary>
      <div class="tbcp-members">${analysis.members.map(memberMarkup).join("")}</div>
      <div class="tbcp-columns">
        <section><h6>TB Omicron activity</h6>${activeOmiRows.length ? activeOmiRows.map((row) => `<span class="tbcp-guidance"><b>${row.installed ? "INSTALLED" : "AVAILABLE"}</b>${escapeHtml(row.unitName)} · ${escapeHtml(row.name)} · ${escapeHtml(row.modeLabel)}</span>`).join("") : '<span class="tbcp-pending">No Omicron on this listed team is marked active for this mission type.</span>'}<p>This reports game-mode activation only. It does not claim the Omicron is worth purchasing for this specific battle.</p></section>
        <section><h6>Explicit ability / Zeta guidance</h6>${guidanceRows([...analysis.guidance.abilities, ...analysis.guidance.zetas, ...analysis.guidance.omicrons])}</section>
        <section><h6>Mods</h6>${guidanceRows(analysis.guidance.mods)}<p>${analysis.targets.minimum.speed != null ? `Team template speed target: ${escapeHtml(analysis.targets.minimum.speed)}+.` : "No source-backed mission speed target has been recorded for this team yet."}</p></section>
        <section><h6>Safer investment</h6><span class="tbcp-pending">${escapeHtml(targetText(analysis.targets.safer))}</span></section>
      </div>
      ${(analysis.mechanics.length || analysis.enemies.length || analysis.guidance.strategy.length) ? `<div class="tbcp-strategy"><h6>Battle notes</h6>${analysis.mechanics.map((item) => `<p><b>MECHANIC</b> ${escapeHtml(item)}</p>`).join("")}${analysis.enemies.map((item) => `<p><b>ENEMY</b> ${escapeHtml(item)}</p>`).join("")}${analysis.guidance.strategy.map((item) => `<p><b>${escapeHtml(item.priority)}</b> ${escapeHtml(item.name)}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</p>`).join("")}</div>` : ""}
      <footer><button type="button" data-tbcp-open-mods>Open Mods Command</button><small>No win percentage is generated. Missing battle guidance remains explicitly pending until sourced/verified.</small></footer>
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
  let catalog;
  try {
    catalog = await loadCombatCatalog();
  } catch (error) {
    for (const slot of slots) slot.innerHTML = `<div class="tbcp-load-error">Battle preparation unavailable: ${escapeHtml(error?.message || "catalog error")}</div>`;
    return;
  }

  for (const slot of slots) {
    const mission = byMission.get(String(slot.dataset.tbCombatMission || ""));
    const recommendation = mission?.recommendations?.find((item) => String(item.id) === String(slot.dataset.tbCombatTeam || ""));
    if (!mission || !recommendation) continue;
    const analysis = analyzeTeamCombatPreparation(body, mission, recommendation, catalog);
    slot.innerHTML = prepMarkup(analysis);
  }
  for (const button of root.querySelectorAll("[data-tbcp-open-mods]")) {
    button.addEventListener("click", () => document.querySelector('button[data-workspace-tab="mods"]')?.click());
  }
}
