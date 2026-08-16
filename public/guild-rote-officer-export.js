import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";

const state = {
  catalogPromise: null,
  catalog: [],
  coverage: null,
  coverageKey: "",
  guild: null,
  loading: false,
  scheduled: false,
};

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const cleanCell = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

function currentRedundancyTarget() {
  const value = Number(window.__swgohGuildRoteRedundancyTarget || 2);
  return Math.max(1, Math.min(5, Number.isFinite(value) ? Math.trunc(value) : 2));
}

function memberProgress(evaluation = {}) {
  if (!evaluation?.member) return "No candidate";
  if (evaluation.exactReady) return "Entry ready";
  if (evaluation.knownGateReady) return "Known gate met";
  const parts = [];
  if (Number(evaluation.mandatoryBlockers || 0) > 0) parts.push(`${Number(evaluation.mandatoryBlockers)} mandatory blocker${Number(evaluation.mandatoryBlockers) === 1 ? "" : "s"}`);
  if (Number(evaluation.poolShortfall || 0) > 0) parts.push(`${Number(evaluation.poolShortfall)} pool short`);
  if (!parts.length) parts.push(`${Number(evaluation.percent || 0)}% entry`);
  return parts.join(" · ");
}

function missionLabel(missionRow = {}) {
  return `${missionRow.phase || "?"} ${missionRow.planetName || "Unknown"} — ${missionRow.mission?.name || missionRow.key || "Mission"}`;
}

function missionRefList(row = {}) {
  return (row.missionRefs || []).map((mission) => missionLabel(mission)).join(" | ");
}

export function missionLeadTsv(coverage = {}) {
  const header = ["Phase", "Planet", "Lane", "Mission", "Evidence", "Exact Ready", "Lead", "Lead Ally Code", "Alternates"].join("\t");
  const rows = (coverage.leads || []).map((lead) => {
    const mission = lead.mission || {};
    return [
      mission.phase,
      mission.planetName,
      mission.lane,
      mission.mission?.name || mission.key,
      mission.evidence,
      mission.exactReady?.length || 0,
      lead.member?.name || "UNASSIGNED",
      lead.member?.allyCode || "",
      (lead.alternatives || []).map((member) => `${member.name}${member.allyCode ? ` (${member.allyCode})` : ""}`).join(", "),
    ].map(cleanCell).join("\t");
  });
  return [header, ...rows].join("\n");
}

export function farmPriorityTsv(coverage = {}) {
  const header = ["Priority", "Member", "Ally Code", "Unit", "Base ID", "Current", "Needed", "Mission Impact", "Mandatory Impact", "Pool Impact", "Affected Missions"].join("\t");
  const rows = (coverage.farms || []).map((row, index) => {
    const unit = row.unit || null;
    let current = "Not owned";
    if (unit) {
      current = String(unit.unitType || "Character") === "Ship"
        ? `${Number(unit.stars || 0)}★ · ${number(unit.power)} GP`
        : `${Number(unit.relic || 0) > 0 ? `R${Number(unit.relic || 0)}` : `G${Number(unit.gear || 0)}`} · ${Number(unit.stars || 0)}★ · ${number(unit.power)} GP`;
    }
    return [
      index + 1,
      row.member?.name || "",
      row.member?.allyCode || "",
      row.unitName || row.baseId || "",
      row.baseId || "",
      current,
      row.gapLabel || "",
      row.missionImpact || 0,
      row.mandatoryImpact || 0,
      row.poolImpact || 0,
      missionRefList(row),
    ].map(cleanCell).join("\t");
  });
  return [header, ...rows].join("\n");
}

export function truncateOfficerBrief(text, maxLength = 1850) {
  const source = String(text || "");
  const limit = Math.max(80, Number(maxLength || 1850));
  if (source.length <= limit) return source;
  const suffix = "\n…more details available in the ROTE Guild dashboard.";
  const available = Math.max(1, limit - suffix.length);
  const sliced = source.slice(0, available);
  const boundary = sliced.lastIndexOf("\n");
  return `${boundary > available * 0.6 ? sliced.slice(0, boundary) : sliced}${suffix}`.slice(0, limit);
}

export function buildOfficerBrief(coverage = {}, guildName = "Guild", options = {}) {
  const summary = coverage.summary || {};
  const redundancyTarget = Math.max(1, Math.min(5, Number(coverage.redundancyTarget || options.redundancyTarget || 2)));
  const maxZero = Math.max(0, Number(options.maxZero ?? 6));
  const maxFragile = Math.max(0, Number(options.maxFragile ?? 6));
  const maxFarms = Math.max(0, Number(options.maxFarms ?? 8));
  const lines = [
    `**ROTE Officer Brief — ${cleanCell(guildName || "Guild")}**`,
    `Exact entry coverage: **${Number(summary.exactCoveragePercent || 0)}%** · ${redundancyTarget}+ redundancy: **${Number(summary.redundancyCoveragePercent || 0)}%**`,
    `Hydrated rosters: **${Number(summary.hydratedMembers || 0)}/${Number(summary.totalMembers || 0)}** · Zero coverage: **${Number(summary.zeroCoverageMissions || 0)}** · Single-owner: **${Number(summary.fragileMissions || 0)}** · Partial fleet evidence: **${Number(summary.partialEvidenceMissions || 0)}**`,
  ];

  const zero = (coverage.zeroCoverage || []).slice(0, maxZero);
  if (zero.length) {
    lines.push("", "**🔴 Zero Coverage**");
    for (const mission of zero) {
      const best = (mission.evaluations || []).find((row) => row.rosterAvailable) || null;
      lines.push(`• ${missionLabel(mission)} — closest: ${cleanCell(best?.member?.name || "none")} (${cleanCell(memberProgress(best))})`);
    }
    if ((coverage.zeroCoverage || []).length > zero.length) lines.push(`• +${(coverage.zeroCoverage || []).length - zero.length} more zero-coverage missions`);
  }

  const fragile = (coverage.fragile || []).slice(0, maxFragile);
  if (fragile.length) {
    lines.push("", "**🟠 Single-Owner Risk**");
    for (const mission of fragile) {
      const owner = mission.exactReady?.[0]?.member;
      lines.push(`• ${missionLabel(mission)} — ${cleanCell(owner?.name || "unknown")} only`);
    }
    if ((coverage.fragile || []).length > fragile.length) lines.push(`• +${(coverage.fragile || []).length - fragile.length} more single-owner missions`);
  }

  const farms = (coverage.farms || []).slice(0, maxFarms);
  if (farms.length) {
    lines.push("", `**🛠 Highest-Impact Farms · ${redundancyTarget}-Owner Target**`);
    for (const row of farms) {
      lines.push(`• ${cleanCell(row.member?.name || "member")} — ${cleanCell(row.unitName || row.baseId)} → ${cleanCell(row.gapLabel)} · ${Number(row.missionImpact || 0)} mission${Number(row.missionImpact || 0) === 1 ? "" : "s"}`);
    }
    if ((coverage.farms || []).length > farms.length) lines.push(`• +${(coverage.farms || []).length - farms.length} more farm targets`);
  }

  if (Number(summary.partialEvidenceMissions || 0) > 0) {
    lines.push("", "_*Fleet note: generic fleet gates without complete selectable-ship rules are excluded from exact-ready claims.*_");
  }
  return truncateOfficerBrief(lines.join("\n"), Number(options.maxLength || 1850));
}

async function loadCatalog() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?guild-officer-export=1", { cache: "no-cache" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static catalog unavailable.");
      state.catalog = body.units;
      return body.units;
    });
  return state.catalogPromise;
}

async function loadCoverage(force = false) {
  const allyCode = digits(document.getElementById("allyCode")?.value);
  if (allyCode.length !== 9) throw new Error("Load a 9-digit Ally Code first.");
  const target = currentRedundancyTarget();
  const key = `${allyCode}:${state.catalog.length}:${target}`;
  if (!force && state.coverage && state.coverageKey === key) return state.coverage;
  if (state.loading) throw new Error("Guild coverage is already loading.");
  state.loading = true;
  try {
    const [catalog, response] = await Promise.all([
      loadCatalog(),
      fetch(`/api/guild/by-player/${allyCode}/roster`, { cache: "no-store" }),
    ]);
    const guild = await response.json();
    if (!response.ok || !Array.isArray(guild?.members)) throw new Error(guild?.error || "Guild roster is unavailable.");
    state.guild = guild;
    state.coverage = buildGuildRoteMissionCoverage(guild, catalog, { redundancyTarget: target });
    state.coverageKey = `${allyCode}:${catalog.length}:${target}`;
    return state.coverage;
  } finally {
    state.loading = false;
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to a selection-based copy for browsers that block clipboard permission.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = Boolean(document.execCommand?.("copy"));
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

function guildName() {
  return state.guild?.guild?.name || state.guild?.name || "Guild";
}

function status(message, tone = "") {
  const output = document.querySelector("[data-guild-officer-export-status]");
  if (!output) return;
  output.textContent = message;
  output.dataset.tone = tone;
}

async function runExport(type) {
  status("Preparing current guild coverage…");
  try {
    const coverage = await loadCoverage(false);
    let text = "";
    let label = "report";
    if (type === "leads") {
      text = missionLeadTsv(coverage);
      label = "mission leads TSV";
    } else if (type === "farms") {
      text = farmPriorityTsv(coverage);
      label = "farm priorities TSV";
    } else {
      text = buildOfficerBrief(coverage, guildName());
      label = "officer brief";
    }
    const copied = await copyText(text);
    status(copied ? `Copied ${label} for ${coverage.redundancyTarget}-owner coverage.` : `Copy was blocked. Select the data from the dashboard instead.`, copied ? "success" : "danger");
  } catch (error) {
    status(error?.message || "Officer export failed.", "danger");
  }
}

function exportMarkup() {
  return `<section class="guild-officer-export" data-guild-officer-export>
    <div><span>OFFICER EXPORT CENTER</span><strong>Share the current ROTE plan</strong><small>Discord brief and farm TSV follow the selected Coverage Target; mission leads are based on exact-ready members.</small></div>
    <div class="guild-officer-export-actions">
      <button type="button" data-guild-export="brief">Copy Officer Brief</button>
      <button type="button" data-guild-export="leads">Copy Mission Leads TSV</button>
      <button type="button" data-guild-export="farms">Copy Farm Priorities TSV</button>
    </div>
    <span class="guild-officer-export-status" data-guild-officer-export-status></span>
  </section>`;
}

function ensureExportCenter() {
  const shell = document.getElementById("guildRoteMissionCoverage");
  if (!shell || shell.querySelector("[data-guild-officer-export]")) return;
  const boundary = shell.querySelector(".guild-mission-boundary");
  if (boundary) boundary.insertAdjacentHTML("afterend", exportMarkup());
  else shell.insertAdjacentHTML("afterbegin", exportMarkup());
}

function scheduleInstall() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(() => {
    state.scheduled = false;
    ensureExportCenter();
  });
}

function install() {
  loadCatalog().catch(() => {});
  const observer = new MutationObserver(scheduleInstall);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-guild-export]");
    if (!button) return;
    event.preventDefault();
    runExport(button.dataset.guildExport || "brief");
  });
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.coverage = null;
    state.coverageKey = "";
    state.guild = null;
  });
  window.addEventListener("swgoh:guild-rote-redundancy-target", () => {
    state.coverage = null;
    state.coverageKey = "";
    status(`Coverage target changed to ${currentRedundancyTarget()} ready owner${currentRedundancyTarget() === 1 ? "" : "s"}. Exports will use the new target.`);
  });
  scheduleInstall();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}