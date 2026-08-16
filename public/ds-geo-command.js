import { DS_GEO_SOURCES } from "./ds-geo-data.js";
import { DS_GEO_TERRITORIES, dsGeoTerritoryById } from "./ds-geo-mission-overrides.js";
import { legalRosterCandidates, missionRosterEntrySummary, recommendationLabel, recommendationRosterFit, recommendationUpgradeRows } from "./tb-mission-intelligence.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "—";

let selectedTerritoryId = "p1-top";

function ensureCss() {
  const href = "/ds-geo-command.css?v=20260815-dsgeo2";
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
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
  return bits.join(" · ") || "Verified mission entry";
}

function territoryStatus(body, territory) {
  if (!body) return { status: "unloaded", label: "Load Ally Code", percent: 0 };
  const verified = territory.missions.filter((mission) => mission.entry?.verified);
  if (!verified.length) return { status: "review", label: "Verify", percent: 0 };
  const scores = verified.map((mission) => missionRosterEntrySummary(body, mission, 5).percent);
  const percent = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const status = percent >= 100 ? "ready" : percent >= 60 ? "close" : percent > 0 ? "building" : "blocked";
  const label = status === "ready" ? "Entry depth" : status === "close" ? "Close" : status === "building" ? "Building" : "Blocked";
  return { status, label, percent };
}

function mapLines() {
  return `<svg class="dsgeo-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M12,28 C22,24 28,18 37,18 M12,72 C22,70 28,55 37,50 M12,72 C22,78 28,82 37,82" />
    <path d="M37,18 C47,18 52,18 62,18 M37,50 C47,48 52,48 62,50 M37,82 C47,82 52,82 62,82" />
    <path d="M62,18 C72,18 78,18 87,18 M62,50 C72,50 78,50 87,50 M62,82 C72,82 78,82 87,82" />
  </svg>`;
}

function territoryNode(body, territory) {
  const readiness = territoryStatus(body, territory);
  const selected = territory.id === selectedTerritoryId;
  const missionCount = territory.missions.length;
  return `<button type="button" class="dsgeo-territory status-${readiness.status}${selected ? " selected" : ""}" data-dsgeo-territory="${escapeAttr(territory.id)}" style="left:${territory.x}%;top:${territory.y}%" aria-pressed="${selected ? "true" : "false"}">
    <span class="dsgeo-phase">P${territory.phase} · ${escapeHtml(territory.lane)}</span>
    <strong>${escapeHtml(territory.name)}</strong>
    <small>${territory.unitType === "Ship" ? "Fleet" : "Squad"} · ${territory.starsMin}★ · ${missionCount} mission${missionCount === 1 ? "" : "s"}</small>
    <b>${body ? `${readiness.percent}% ${readiness.label}` : readiness.label}</b>
  </button>`;
}

function territoryMap(body) {
  return `<section class="card dsgeo-map-card">
    <div class="dsgeo-map-head">
      <div><div class="kicker">GEONOSIS · SEPARATIST MIGHT</div><h3>Interactive Territory Map</h3><p>Click a territory to inspect zone thresholds, mission-entry rules, live roster candidates and sourced team plans.</p></div>
      <div class="dsgeo-legend"><span class="ready">Ready depth</span><span class="close">Close</span><span class="building">Building</span><span class="blocked">Blocked</span></div>
    </div>
    <div class="dsgeo-map">
      ${mapLines()}
      <div class="dsgeo-phase-column" style="left:12%">PHASE 1</div>
      <div class="dsgeo-phase-column" style="left:37%">PHASE 2</div>
      <div class="dsgeo-phase-column" style="left:62%">PHASE 3</div>
      <div class="dsgeo-phase-column" style="left:87%">PHASE 4</div>
      ${DS_GEO_TERRITORIES.map((territory) => territoryNode(body, territory)).join("")}
    </div>
  </section>`;
}

function starsMarkup(territory) {
  return territory.starThresholds.map((threshold, index) => `<div><span>${index + 1}★</span><strong>${number(threshold)}</strong></div>`).join("");
}

function unitPortrait(unit, fallbackName) {
  const name = unit?.name || fallbackName || "Unknown";
  const image = unit?.image || unit?.imageUrl || "";
  return `<span class="dsgeo-unit-portrait">${image ? `<img src="${escapeAttr(image)}" alt="">` : `<b>${escapeHtml(name.slice(0, 2).toUpperCase())}</b>`}</span>`;
}

function mandatoryMarkup(body, mission) {
  if (!body || !mission.entry?.verified || !mission.entry?.mandatoryMembers?.length) return "";
  const summary = missionRosterEntrySummary(body, mission, 5);
  return `<div class="dsgeo-note ${summary.mandatory.complete ? "" : "warning"}"><strong>Mandatory:</strong> ${summary.mandatory.rows.map((row) => `${escapeHtml(row.unit?.name || row.member?.name || row.member?.baseId || "Unit")} — ${row.legal ? "ready" : escapeHtml(gapText(row))}`).join(" · ")}</div>`;
}

function candidateMarkup(body, mission) {
  if (!mission.entry?.verified) return `<div class="dsgeo-note warning">Candidate ranking is disabled until this mission's exact entry restriction is reverified.</div>`;
  if (!body) return `<div class="dsgeo-note">Load an Ally Code to rank legal roster candidates.</div>`;
  const candidates = legalRosterCandidates(body, mission, 5);
  if (!candidates.length) return `<div class="dsgeo-note danger">No owned units currently clear this verified mission entry gate.</div>`;
  return `${mandatoryMarkup(body, mission)}<div class="dsgeo-candidates">${candidates.map((unit, index) => `<button type="button" data-inspect-base-id="${escapeAttr(unit.baseId)}" title="Inspect ${escapeAttr(unit.name)}">
    <em>#${index + 1}</em>${unitPortrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>${unit.unitType === "Ship" ? `${unit.stars || 0}★ · ${number(unit.power)} GP` : `${unit.stars || 0}★ · G${unit.gear || 0}${Number(unit.relic || 0) ? ` · R${unit.relic}` : ""} · ${number(unit.power)} GP`}</small></span>
  </button>`).join("")}</div>`;
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

function upgradeCallout(body, mission, upgrades) {
  if (!body) return "";
  if (!mission.entry?.verified) return `<div class="dsgeo-upgrade-callout"><strong>Upgrade advice paused:</strong> exact entry legality must be reverified before this mission can produce roster investment advice.</div>`;
  if (upgrades.length) return `<div class="dsgeo-upgrade-callout"><strong>${upgrades[0].mandatory ? "Mandatory unit gap" : "Priority entry gap"}:</strong> ${escapeHtml(upgrades[0].unit?.name || upgrades[0].name)} · ${escapeHtml(gapText(upgrades[0]))}</div>`;
  return `<div class="dsgeo-upgrade-callout ready"><strong>Entry gate:</strong> all listed members and mandatory units clear the verified mission gate.</div>`;
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
  return `<article class="dsgeo-team-card${fit.complete ? " complete" : ""}">
    <header><div><span>${escapeHtml(recommendationLabel(mission, recommendation))}</span><h5>${escapeHtml(recommendation.name)}</h5></div><b>${escapeHtml(fitLabel)}</b></header>
    <div class="dsgeo-team-members">${fit.rows.map((row) => `<div class="${row.legal ? "ready" : row.owned ? "under" : "missing"}">
      ${unitPortrait(row.unit, row.name)}<span><strong>${escapeHtml(row.unit?.name || row.name)}</strong><small>${body && mission.entry?.verified ? escapeHtml(gapText(row)) : body ? "Entry check paused" : "Roster not loaded"}</small></span>
    </div>`).join("")}</div>
    <div class="dsgeo-team-meta"><span>Source: ${escapeHtml(recommendation.sourceIds?.join(", ") || "community")}</span><span>${zetaKnown ? `${zetas} Zetas installed` : "Zeta recommendation pending"}</span><span>${omiKnown ? `${omicrons} Omicrons installed` : "TB Omicron relevance pending"}</span></div>
    ${upgradeCallout(body, mission, upgrades)}
    <footer>${canLoad ? `<button type="button" data-dsgeo-load-team="${escapeAttr(recommendation.id)}">Load in Squad Workbench</button>` : ""}<small>Composition quality is source-labelled separately from entry legality.</small></footer>
  </article>`;
}

function missionCard(body, mission) {
  const entrySummary = mission.entry?.verified && body ? missionRosterEntrySummary(body, mission, 5) : null;
  const rewards = mission.rewards?.length
    ? mission.rewards.join(" · ")
    : mission.waves?.length
      ? `${mission.waves.length} wave${mission.waves.length === 1 ? "" : "s"} · max ${number(mission.waves.reduce((sum, value) => sum + Number(value || 0), 0))} TP/player`
      : "Combat mission";
  const poolLabel = !mission.entry?.verified
    ? "VERIFY"
    : !body
      ? "Load roster"
      : `${entrySummary.candidates.length} legal${entrySummary.mandatory.total ? ` · ${entrySummary.mandatory.ready}/${entrySummary.mandatory.total} mandatory` : ""}`;
  return `<details class="dsgeo-mission" data-dsgeo-mission-id="${escapeAttr(mission.id)}" ${mission.missionType === "special" ? "open" : ""}>
    <summary>
      <span class="dsgeo-mission-type ${escapeAttr(mission.missionType)}">${escapeHtml(mission.missionType)}</span>
      <span><strong>${escapeHtml(mission.name)}</strong><small>${escapeHtml(requirementLabel(mission))}</small></span>
      <b>${escapeHtml(poolLabel)}</b>
    </summary>
    <div class="dsgeo-mission-body">
      <div class="dsgeo-rule-row"><div><span>Entry rule</span><strong>${escapeHtml(requirementLabel(mission))}</strong></div><div><span>Rewards / waves</span><strong>${escapeHtml(rewards)}</strong></div><div><span>Verified</span><strong>${mission.entry?.verified ? `Yes · ${escapeHtml(mission.lastVerified || "")}` : "No · fail closed"}</strong></div></div>
      ${mission.entry?.notes ? `<p class="dsgeo-entry-note">${escapeHtml(mission.entry.notes)}</p>` : ""}
      <section><div class="dsgeo-section-title"><span>YOUR ALLY CODE</span><h5>Best progressed legal candidates</h5></div>${candidateMarkup(body, mission)}<p class="dsgeo-boundary">This is a progression ranking inside the verified legal entry pool. It is not automatically the best battle composition.</p></section>
      <section><div class="dsgeo-section-title"><span>SOURCED TEAM PLANS</span><h5>Recommended / community compositions</h5></div><div class="dsgeo-team-grid">${mission.recommendations?.length ? mission.recommendations.map((recommendation) => recommendationMarkup(body, mission, recommendation)).join("") : `<div class="dsgeo-note">No sourced team plan is attached yet.</div>`}</div></section>
    </div>
  </details>`;
}

function territoryBoard(body, territory) {
  return `<aside class="card dsgeo-board">
    <header><div><div class="kicker">PHASE ${territory.phase} · ${escapeHtml(territory.lane.toUpperCase())}</div><h3>${escapeHtml(territory.name)}</h3><p>${territory.unitType === "Ship" ? "Fleet territory" : "Character territory"} · ${territory.starsMin}★ entry baseline</p></div><span>${territory.missions.length} missions</span></header>
    <div class="dsgeo-stars">${starsMarkup(territory)}</div>
    <div class="dsgeo-territory-meta"><div><span>Platoon TP</span><strong>${number(territory.platoonTp)} × 6</strong></div><div><span>3★ target</span><strong>${number(territory.starThresholds[2])}</strong></div></div>
    <section class="dsgeo-mission-list">${territory.missions.map((mission) => missionCard(body, mission)).join("")}</section>
  </aside>`;
}

function sourceStrip() {
  return `<section class="card dsgeo-source-strip"><div><strong>Data boundary</strong><span>Current zone structure and verified entry rules are stored separately from community team advice.</span></div>${Object.values(DS_GEO_SOURCES).map((source) => `<span><b>${escapeHtml(source.kind)}</b>${escapeHtml(source.label)}${source.license ? ` · ${escapeHtml(source.license)}` : ""}</span>`).join("")}</section>`;
}

function renderInto(host, body) {
  const territory = dsGeoTerritoryById(selectedTerritoryId);
  host.innerHTML = `<section class="dsgeo-layout">${territoryMap(body)}${territoryBoard(body, territory)}</section>${sourceStrip()}`;

  for (const button of host.querySelectorAll("[data-dsgeo-territory]")) {
    button.addEventListener("click", () => {
      selectedTerritoryId = button.dataset.dsgeoTerritory || "p1-top";
      renderInto(host, body);
    });
  }

  for (const button of host.querySelectorAll("[data-dsgeo-load-team]")) {
    button.addEventListener("click", () => {
      const missionId = button.closest("[data-dsgeo-mission-id]")?.dataset.dsgeoMissionId;
      const mission = territory.missions.find((item) => item.id === missionId);
      const recommendation = mission?.recommendations?.find((item) => item.id === button.dataset.dsgeoLoadTeam);
      if (!mission?.entry?.verified || !recommendation) return;
      const fit = recommendationRosterFit(body, mission, recommendation);
      if (!fit.includesMandatory) return;
      const baseIds = fit.rows.map((row) => row.unit?.baseId).filter(Boolean).slice(0, 5);
      if (!baseIds.length) return;
      window.dispatchEvent(new CustomEvent("swgoh:replace-squad", {
        detail: {
          baseIds,
          size: baseIds.length === 3 ? 3 : 5,
          name: `DS Geo · ${territory.name} · ${mission.name} · ${recommendation.name}`,
        },
      }));
    });
  }
}

export function renderDsGeoCampaign(host, body) {
  ensureCss();
  if (!host) return;
  renderInto(host, body || null);
}
