import {
  legalRosterCandidates,
  missionRosterEntrySummary,
  recommendationLabel,
  recommendationRosterFit,
  recommendationUpgradeRows,
} from "./tb-mission-intelligence.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "—";
const selectedByCampaign = new Map();

function ensureCss() {
  for (const href of ["/ds-geo-command.css?v=20260815-dsgeo2", "/legacy-tb-themes.css?v=20260815-legacy1"]) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

function requirementLabel(mission) {
  const entry = mission.entry || {};
  if (!entry.verified) return `⚠ Verification gate · ${entry.notes || "entry restriction under review"}`;
  const bits = [];
  if (entry.unitType) bits.push(entry.unitType === "Ship" ? "Ships" : "Characters");
  if (entry.allowedAlignments?.length) bits.push(entry.allowedAlignments.join(" / "));
  else if (entry.alignment && entry.alignment !== "Mixed") bits.push(entry.alignment);
  if (entry.requiredCategories?.length) bits.push(entry.requiredCategories.join(entry.categoryMode === "any" ? " OR " : " + "));
  if (entry.mandatoryMembers?.length) bits.push(`Required: ${entry.mandatoryMembers.map((member) => member.name || member.baseId).join(" + ")}`);
  if (entry.starsMin) bits.push(`${entry.starsMin}★`);
  if (entry.powerMin) bits.push(`${number(entry.powerMin)}+ GP each`);
  if (entry.gearMin) bits.push(`G${entry.gearMin}+`);
  if (entry.relicMin) bits.push(`R${entry.relicMin}+`);
  if (entry.squadSize && entry.squadSize !== 5) bits.push(`${entry.squadSize}-unit battle`);
  return bits.join(" · ") || "Verified mission entry";
}

function territoryStatus(body, territory) {
  if (!body) return { status: "unloaded", label: "Load Ally Code", percent: 0 };
  const verified = territory.missions.filter((mission) => mission.entry?.verified);
  if (!verified.length) return { status: "review", label: "Verify", percent: 0 };
  const scores = verified.map((mission) => missionRosterEntrySummary(body, mission).percent);
  const percent = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const status = percent >= 100 ? "ready" : percent >= 60 ? "close" : percent > 0 ? "building" : "blocked";
  return { status, label: status === "ready" ? "Entry depth" : status === "close" ? "Close" : status === "building" ? "Building" : "Blocked", percent };
}

function mapLines(territories) {
  const phases = [...new Set(territories.map((territory) => territory.phase))].sort((a, b) => a - b);
  const paths = [];
  for (let i = 0; i < phases.length - 1; i += 1) {
    const left = territories.filter((territory) => territory.phase === phases[i]);
    const right = territories.filter((territory) => territory.phase === phases[i + 1]);
    for (const territory of left) {
      const nearest = right.slice().sort((a, b) => Math.abs(a.y - territory.y) - Math.abs(b.y - territory.y))[0];
      if (!nearest) continue;
      const mid = (territory.x + nearest.x) / 2;
      paths.push(`M${territory.x},${territory.y} C${mid},${territory.y} ${mid},${nearest.y} ${nearest.x},${nearest.y}`);
    }
  }
  return `<svg class="dsgeo-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${paths.join(" ")}" /></svg>`;
}

function territoryNode(body, campaign, territory) {
  const readiness = territoryStatus(body, territory);
  const selectedId = selectedByCampaign.get(campaign.id) || campaign.defaultTerritoryId || campaign.territories[0]?.id;
  const selected = territory.id === selectedId;
  return `<button type="button" class="dsgeo-territory status-${readiness.status}${selected ? " selected" : ""}" data-legacy-territory="${escapeAttr(territory.id)}" style="left:${territory.x}%;top:${territory.y}%" aria-pressed="${selected ? "true" : "false"}">
    <span class="dsgeo-phase">P${territory.phase} · ${escapeHtml(territory.lane)}</span>
    <strong>${escapeHtml(territory.name)}</strong>
    <small>${territory.unitType === "Ship" ? "Fleet" : "Squad"} · ${territory.starsMin || "—"}★ · ${territory.missions.length} mission${territory.missions.length === 1 ? "" : "s"}</small>
    <b>${body ? `${readiness.percent}% ${readiness.label}` : readiness.label}</b>
  </button>`;
}

function phaseColumns(campaign) {
  const phases = [...new Set(campaign.territories.map((territory) => territory.phase))].sort((a, b) => a - b);
  return phases.map((phase) => {
    const nodes = campaign.territories.filter((territory) => territory.phase === phase);
    const x = nodes.reduce((sum, territory) => sum + Number(territory.x || 0), 0) / Math.max(1, nodes.length);
    return `<div class="dsgeo-phase-column" style="left:${x}%">PHASE ${phase}</div>`;
  }).join("");
}

function territoryMap(body, campaign) {
  return `<section class="card dsgeo-map-card">
    <div class="dsgeo-map-head">
      <div><div class="kicker">${escapeHtml(campaign.kicker || campaign.name)}</div><h3>Interactive Territory Map</h3><p>${escapeHtml(campaign.mapDescription || "Click a territory to inspect entry rules, Ally-Code roster fit and sourced mission plans.")}</p></div>
      <div class="dsgeo-legend"><span class="ready">Ready depth</span><span class="close">Close</span><span class="building">Building</span><span class="blocked">Blocked</span></div>
    </div>
    <div class="dsgeo-map legacytb-map legacytb-theme-${escapeAttr(campaign.theme || "default")}">
      ${mapLines(campaign.territories)}
      ${phaseColumns(campaign)}
      ${campaign.territories.map((territory) => territoryNode(body, campaign, territory)).join("")}
    </div>
  </section>`;
}

function unitPortrait(unit, fallbackName) {
  const name = unit?.name || fallbackName || "Unknown";
  const image = unit?.image || unit?.imageUrl || "";
  return `<span class="dsgeo-unit-portrait">${image ? `<img src="${escapeAttr(image)}" alt="">` : `<b>${escapeHtml(name.slice(0, 2).toUpperCase())}</b>`}</span>`;
}

function gapText(row) {
  if (row.gap?.missing) return "Not owned";
  const gaps = [];
  if (row.gap?.stars) gaps.push(`+${row.gap.stars}★`);
  if (row.gap?.power) gaps.push(`+${number(row.gap.power)} GP`);
  if (row.gap?.gear) gaps.push(`+${row.gap.gear} gear`);
  if (row.gap?.relic) gaps.push(`+${row.gap.relic} relic`);
  return gaps.join(" · ") || "Entry ready";
}

function mandatoryMarkup(body, mission) {
  if (!body || !mission.entry?.verified || !mission.entry?.mandatoryMembers?.length) return "";
  const summary = missionRosterEntrySummary(body, mission);
  return `<div class="dsgeo-note ${summary.mandatory.complete ? "" : "warning"}"><strong>Mandatory:</strong> ${summary.mandatory.rows.map((row) => `${escapeHtml(row.unit?.name || row.member?.name || row.member?.baseId || "Unit")} — ${row.legal ? "ready" : escapeHtml(gapText(row))}`).join(" · ")}</div>`;
}

function candidateMarkup(body, mission) {
  if (!mission.entry?.verified) return `<div class="dsgeo-note warning">Candidate ranking is disabled until this mission's exact entry restriction is reverified.</div>`;
  if (!body) return `<div class="dsgeo-note">Load an Ally Code to rank legal roster candidates.</div>`;
  const candidates = legalRosterCandidates(body, mission, Math.max(5, Number(mission.entry?.squadSize || 5)));
  if (!candidates.length && !mission.entry?.mandatoryMembers?.length) return `<div class="dsgeo-note danger">No owned units currently clear this verified mission entry gate.</div>`;
  return `${mandatoryMarkup(body, mission)}${candidates.length ? `<div class="dsgeo-candidates">${candidates.map((unit, index) => `<button type="button" data-inspect-base-id="${escapeAttr(unit.baseId)}"><em>#${index + 1}</em>${unitPortrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>${unit.unitType === "Ship" ? `${unit.stars || 0}★ · ${number(unit.power)} GP` : `${unit.stars || 0}★ · G${unit.gear || 0}${Number(unit.relic || 0) ? ` · R${unit.relic}` : ""} · ${number(unit.power)} GP`}</small></span></button>`).join("")}</div>` : ""}`;
}

function upgradeCallout(body, mission, upgrades) {
  if (!body) return "";
  if (!mission.entry?.verified) return `<div class="dsgeo-upgrade-callout"><strong>Upgrade advice paused:</strong> exact entry legality must be reverified first.</div>`;
  if (upgrades.length) return `<div class="dsgeo-upgrade-callout"><strong>${upgrades[0].mandatory ? "Mandatory unit gap" : "Priority entry gap"}:</strong> ${escapeHtml(upgrades[0].unit?.name || upgrades[0].name)} · ${escapeHtml(gapText(upgrades[0]))}</div>`;
  return `<div class="dsgeo-upgrade-callout ready"><strong>Entry gate:</strong> this listed team clears the verified mission gate.</div>`;
}

function recommendationMarkup(body, mission, recommendation) {
  const fit = recommendationRosterFit(body, mission, recommendation);
  const upgrades = recommendationUpgradeRows(body, mission, recommendation);
  const resolved = fit.rows.filter((row) => row.unit);
  const characterOnly = resolved.length > 0 && resolved.every((row) => String(row.unit.unitType || "Character") !== "Ship");
  const canLoad = Boolean(mission.entry?.verified && fit.includesMandatory && characterOnly && resolved.length === fit.rows.length && fit.rows.length <= 5);
  const zetaKnown = resolved.some((row) => row.unit?.zetas != null);
  const omiKnown = resolved.some((row) => row.unit?.omicrons != null);
  const zetas = resolved.reduce((sum, row) => sum + Number(row.unit?.zetas || 0), 0);
  const omicrons = resolved.reduce((sum, row) => sum + Number(row.unit?.omicrons || 0), 0);
  const mandatorySuffix = fit.mandatory.total ? ` · mandatory ${fit.mandatory.ready}/${fit.mandatory.total}` : "";
  const fitLabel = !body ? "Load roster" : !mission.entry?.verified ? "Entry unverified" : `${fit.legal}/${fit.rows.length} entry-ready${mandatorySuffix}`;
  return `<article class="dsgeo-team-card${fit.complete ? " complete" : ""}" data-legacy-team="${escapeAttr(recommendation.id)}">
    <header><div><span>${escapeHtml(recommendationLabel(mission, recommendation))}</span><h5>${escapeHtml(recommendation.name)}</h5></div><b>${escapeHtml(fitLabel)}</b></header>
    <div class="dsgeo-team-members">${fit.rows.map((row) => `<div class="${row.legal ? "ready" : row.owned ? "under" : "missing"}">${unitPortrait(row.unit, row.name)}<span><strong>${escapeHtml(row.unit?.name || row.name)}</strong><small>${body && mission.entry?.verified ? escapeHtml(gapText(row)) : body ? "Entry check paused" : "Roster not loaded"}</small></span></div>`).join("")}</div>
    <div class="dsgeo-team-meta"><span>Source: ${escapeHtml(recommendation.sourceIds?.join(", ") || "community")}</span><span>${zetaKnown ? `${zetas} Zetas installed` : "Zeta guidance pending"}</span><span>${omiKnown ? `${omicrons} Omicrons installed` : "TB Omicron guidance pending"}</span></div>
    ${upgradeCallout(body, mission, upgrades)}
    <footer>${canLoad ? `<button type="button" data-legacy-load-team="${escapeAttr(recommendation.id)}">Load in Squad Workbench</button>` : ""}<small>Battle confidence and entry legality are separate.</small></footer>
  </article>`;
}

function intelligenceNotes(mission) {
  const sections = [];
  if (mission.mechanics?.length) sections.push(`<div class="dsgeo-note"><strong>Mission mechanics:</strong> ${escapeHtml(mission.mechanics.join(" · "))}</div>`);
  if (mission.enemies?.length) sections.push(`<div class="dsgeo-note"><strong>Enemy watch:</strong> ${escapeHtml(mission.enemies.join(" · "))}</div>`);
  return sections.join("");
}

function missionCard(body, mission) {
  const summary = mission.entry?.verified && body ? missionRosterEntrySummary(body, mission) : null;
  const rewards = mission.rewards?.length ? mission.rewards.join(" · ") : mission.waves?.length ? `${mission.waves.length} wave${mission.waves.length === 1 ? "" : "s"} · max ${number(mission.waves.reduce((sum, value) => sum + Number(value || 0), 0))} TP/player` : "Combat mission";
  const poolLabel = !mission.entry?.verified ? "VERIFY" : !body ? "Load roster" : `${summary.candidates.length} legal${summary.mandatory.total ? ` · ${summary.mandatory.ready}/${summary.mandatory.total} mandatory` : ""}`;
  return `<details class="dsgeo-mission" data-legacy-mission-id="${escapeAttr(mission.id)}" ${mission.missionType === "special" ? "open" : ""}>
    <summary><span class="dsgeo-mission-type ${escapeAttr(mission.missionType)}">${escapeHtml(mission.missionType)}</span><span><strong>${escapeHtml(mission.name)}</strong><small>${escapeHtml(requirementLabel(mission))}</small></span><b>${escapeHtml(poolLabel)}</b></summary>
    <div class="dsgeo-mission-body">
      <div class="dsgeo-rule-row"><div><span>Entry rule</span><strong>${escapeHtml(requirementLabel(mission))}</strong></div><div><span>Rewards / waves</span><strong>${escapeHtml(rewards)}</strong></div><div><span>Verified</span><strong>${mission.entry?.verified ? `Yes · ${escapeHtml(mission.lastVerified || "")}` : "No · fail closed"}</strong></div></div>
      ${mission.entry?.notes ? `<p class="dsgeo-entry-note">${escapeHtml(mission.entry.notes)}</p>` : ""}
      ${intelligenceNotes(mission)}
      <section><div class="dsgeo-section-title"><span>YOUR ALLY CODE</span><h5>Best progressed legal candidates</h5></div>${candidateMarkup(body, mission)}<p class="dsgeo-boundary">Progression ranking inside the legal entry pool; not automatically the best battle composition.</p></section>
      <section><div class="dsgeo-section-title"><span>SOURCED TEAM PLANS</span><h5>Recommended / community compositions</h5></div><div class="dsgeo-team-grid">${mission.recommendations?.length ? mission.recommendations.map((recommendation) => recommendationMarkup(body, mission, recommendation)).join("") : `<div class="dsgeo-note">No sourced battle team is attached yet. Entry eligibility and roster candidates remain available.</div>`}</div></section>
    </div>
  </details>`;
}

function territoryBoard(body, territory) {
  return `<aside class="card dsgeo-board"><header><div><div class="kicker">PHASE ${territory.phase} · ${escapeHtml(territory.lane.toUpperCase())}</div><h3>${escapeHtml(territory.name)}</h3><p>${territory.unitType === "Ship" ? "Fleet territory" : "Character territory"} · ${territory.starsMin || "—"}★ entry baseline</p></div><span>${territory.missions.length} missions</span></header>
    <div class="dsgeo-stars">${(territory.starThresholds || []).map((threshold, index) => `<div><span>${index + 1}★</span><strong>${number(threshold)}</strong></div>`).join("")}</div>
    <div class="dsgeo-territory-meta"><div><span>Platoon TP</span><strong>${territory.platoonTp ? `${number(territory.platoonTp)} × 6` : "See zone"}</strong></div><div><span>3★ target</span><strong>${number(territory.starThresholds?.[2])}</strong></div></div>
    <section class="dsgeo-mission-list">${territory.missions.map((mission) => missionCard(body, mission)).join("")}</section></aside>`;
}

function sourceStrip(campaign) {
  return `<section class="card dsgeo-source-strip"><div><strong>Data boundary</strong><span>Verified mission entry is stored separately from community battle advice and recommendation confidence.</span></div>${(campaign.sources || []).map((source) => `<span><b>${escapeHtml(source.kind || "reference")}</b>${escapeHtml(source.label)}${source.license ? ` · ${escapeHtml(source.license)}` : ""}</span>`).join("")}</section>`;
}

function findRecommendation(campaign, id) {
  for (const territory of campaign.territories) {
    for (const mission of territory.missions) {
      const recommendation = mission.recommendations?.find((item) => item.id === id);
      if (recommendation) return { mission, recommendation };
    }
  }
  return null;
}

export function renderLegacyTbCampaign(host, body, campaign) {
  if (!host || !campaign?.territories?.length) return;
  ensureCss();
  if (!selectedByCampaign.has(campaign.id)) selectedByCampaign.set(campaign.id, campaign.defaultTerritoryId || campaign.territories[0].id);
  const selectedId = selectedByCampaign.get(campaign.id);
  const territory = campaign.territories.find((item) => item.id === selectedId) || campaign.territories[0];
  host.innerHTML = `<section class="dsgeo-layout legacytb-shell legacytb-theme-${escapeAttr(campaign.theme || "default")}">${territoryMap(body, campaign)}${territoryBoard(body, territory)}</section>${sourceStrip(campaign)}`;

  for (const button of host.querySelectorAll("[data-legacy-territory]")) {
    button.addEventListener("click", () => {
      selectedByCampaign.set(campaign.id, button.dataset.legacyTerritory || campaign.territories[0].id);
      renderLegacyTbCampaign(host, body, campaign);
    });
  }
  for (const button of host.querySelectorAll("[data-legacy-load-team]")) {
    button.addEventListener("click", () => {
      const found = findRecommendation(campaign, button.dataset.legacyLoadTeam);
      if (!found) return;
      const fit = recommendationRosterFit(body, found.mission, found.recommendation);
      const baseIds = fit.rows.map((row) => row.unit?.baseId).filter(Boolean).slice(0, 5);
      if (!baseIds.length) return;
      window.dispatchEvent(new CustomEvent("swgoh:replace-squad", { detail: { baseIds, size: Math.min(5, baseIds.length), name: `${campaign.shortName || campaign.name} · ${found.mission.name} · ${found.recommendation.name}` } }));
    });
  }
}
