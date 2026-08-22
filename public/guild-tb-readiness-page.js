import { buildGuildZeffoReadiness, filterGuildZeffoRows } from "./guild-zeffo-readiness-model.js";
import { buildGuildMandaloreReadiness, filterGuildMandaloreRows } from "./guild-mandalore-readiness-model.js";
import { buildGuildRevaReadiness, filterGuildRevaRows } from "./guild-reva-readiness-model.js";
import { buildGuildWatReadiness, filterGuildWatRows } from "./guild-wat-readiness-model.js";

const MISSION_TABS = Object.freeze([
  { id: "zeffo", label: "Zeffo / Bracca", live: true },
  { id: "mandalore", label: "Mandalore", live: true },
  { id: "reva", label: "Reva", live: true },
  { id: "wat", label: "Wat Tambor", live: true },
  { id: "other", label: "More TB Missions", comingSoon: true },
]);

const state = { target: null, reports: {}, search: "", status: "ALL", allyCode: "", mission: "zeffo" };
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";

function ensureStyles() {
  for (const [key, href] of [
    ["base", "/guild-zeffo-readiness.css?v=20260822-mandalore1"],
    ["tb", "/guild-tb-readiness.css?v=20260822-revawat1"],
  ]) {
    if (document.querySelector(`link[data-guild-tb-readiness-css="${key}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.guildTbReadinessCss = key;
    document.head.appendChild(link);
  }
}

function initials(name = "") {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0] || ""}${parts.at(-1)?.[0] || ""}`.toUpperCase();
}

function stateBadge(unit = {}) {
  return `<span class="guild-zeffo-unit ${escapeAttr(unit.tone || "far")}">${escapeHtml(unit.label || "LOCKED")}</span>`;
}
function statusBadge(status) {
  return `<span class="guild-zeffo-status ${escapeAttr(String(status || "").toLowerCase())}">${escapeHtml(status)}</span>`;
}
function memberLink(row) {
  return row.allyCode ? `/?allyCode=${encodeURIComponent(row.allyCode)}#roster` : "";
}
function swgohLink(row) {
  return row.allyCode ? `https://swgoh.gg/p/${encodeURIComponent(row.allyCode)}/` : "";
}

function missionTabs() {
  return `<nav class="guild-tb-mission-tabs" aria-label="Territory Battle readiness missions">${MISSION_TABS.map((tab) => `
    <button type="button" class="guild-tb-mission-tab${tab.id === state.mission ? " active" : ""}" data-tb-readiness-mission="${escapeAttr(tab.id)}" ${tab.comingSoon ? "disabled" : ""} aria-current="${tab.id === state.mission ? "page" : "false"}">
      <span>${escapeHtml(tab.label)}</span><small>${tab.comingSoon ? "COMING NEXT" : "LIVE"}</small>
    </button>`).join("")}</nav>`;
}

function profileMeta(row) {
  const detail = [row.profileTitle, row.memberRole].filter(Boolean).join(" · ");
  return detail ? `<small class="guild-zeffo-profile-title">${escapeHtml(detail)}</small>` : "";
}

function zeffoView() {
  const report = state.reports.zeffo;
  return {
    id: "zeffo", label: "Zeffo / Bracca", planet: "Bracca Special Mission", report, mode: "unlock",
    gateText: "Cere Junda R7+ AND either JKCK R7+ or Baby Cal R7+. 30 successful Bracca clears in the same ROTE run unlock Zeffo.",
    filterRows: (rows) => filterGuildZeffoRows(rows, { search: state.search, status: state.status }),
    requirements: (row) => [
      { label: "Cere Junda", state: row.cere },
      { label: "JKCK", note: "Preferred", preferred: true, state: row.jkck },
      { label: "Baby Cal", state: row.babyCal },
    ],
    resultNote: (row) => row.preferredPath === "JKCK" ? "JKCK priority route" : "Baby Cal fallback route",
    actionTitle: "Bracca / Zeffo Officer Action List",
    stats: () => [
      ["Ready", report.summary.ready, `${report.summary.buffer >= 0 ? "+" : ""}${report.summary.buffer} vs 30`, report.summary.ready >= report.unlockTarget ? "good" : "warn"],
      ["JKCK Ready", report.summary.jkckReady, "preferred route", "primary"],
      ["Baby Cal Fallback", report.summary.babyFallback, "ready without R7 JKCK", "secondary"],
      ["Almost", report.summary.almost, "R5–R6 gate pieces", "close"],
      ["Far", report.summary.far, "R4 / pre-relic / locked", "far"],
      ["Roster Data", `${number(report.summary.total - report.summary.rosterUnavailable)}/${number(report.summary.total)}`, "hydrated members", ""],
    ],
  };
}

function mandaloreView() {
  const report = state.reports.mandalore;
  const bkmReady = report.members.filter((row) => row.boKatanMandalor.relic >= 7).length;
  const bamReady = report.members.filter((row) => row.beskarMando.relic >= 7).length;
  const thirdReady = report.members.filter((row) => row.thirdMando.state.relic >= 7).length;
  return {
    id: "mandalore", label: "Mandalore", planet: "Tatooine · Krayt Dragon Special Mission", report, mode: "unlock", gateText: report.gateText,
    filterRows: (rows) => filterGuildMandaloreRows(rows, { search: state.search, status: state.status }),
    requirements: (row) => [
      { label: "Bo-Katan Mand'alor", note: "Required", preferred: true, state: row.boKatanMandalor },
      { label: "Beskar Mando", note: "Required", preferred: true, state: row.beskarMando },
      { label: row.thirdMando.name || "Additional Mandalorian", note: "Best +1", state: row.thirdMando.state },
    ],
    resultNote: () => "Best additional Mandalorian selected automatically",
    actionTitle: "Mandalore Unlock Officer Action List",
    stats: () => [
      ["Ready", report.summary.ready, `${report.summary.buffer >= 0 ? "+" : ""}${report.summary.buffer} vs 25`, report.summary.ready >= report.unlockTarget ? "good" : "warn"],
      ["Bo-Katan R7+", bkmReady, "required core", "primary"],
      ["Beskar Mando R7+", bamReady, "required core", "primary"],
      ["3rd Mando R7+", thirdReady, "best additional Mandalorian", "secondary"],
      ["Almost", report.summary.almost, "all 3 at R5–R6+", "close"],
      ["Far", report.summary.far, "one or more below R5", "far"],
    ],
  };
}

function revaView() {
  const report = state.reports.reva;
  return {
    id: "reva", label: "Reva", planet: report.planetName, report, mode: "shards", gateText: report.gateText,
    filterRows: (rows) => filterGuildRevaRows(rows, { search: state.search, status: state.status }),
    requirements: (row) => [
      { label: "Grand Inquisitor", note: "Required", preferred: true, state: row.grandInquisitor },
      ...row.supports.map((slot, index) => ({ label: slot.name, note: `Inquisitor ${index + 1}`, state: slot.state })),
    ],
    resultNote: () => "GI + best four additional Inquisitorius selected automatically",
    actionTitle: "Reva Shard Mission Officer Action List",
    stats: () => [
      ["Ready", report.summary.ready, "eligible attempts", "good"],
      ["Potential Shards", report.summary.potentialShards, "per TB if all succeed", "primary"],
      ["GI R7+", report.summary.grandInquisitorReady, "mandatory leader", "primary"],
      ["4 Inqs R7+", report.summary.fourSupportsReady, "additional slots ready", "secondary"],
      ["Almost", report.summary.almost, "all required pieces R5–R6+", "close"],
      ["Far", report.summary.far, "one or more below R5", "far"],
    ],
  };
}

function watView() {
  const report = state.reports.wat;
  return {
    id: "wat", label: "Wat Tambor", planet: report.planetName, report, mode: "shards", gateText: report.gateText,
    filterRows: (rows) => filterGuildWatRows(rows, { search: state.search, status: state.status }),
    requirements: (row) => row.geonosians.map((geo, index) => ({ label: geo.name, note: index === 0 ? "GBA required" : "7★ · 16.5K GP", preferred: index === 0, state: geo.state })),
    resultNote: () => report.closeText,
    actionTitle: "Wat Tambor Shard Mission Officer Action List",
    stats: () => [
      ["Ready", report.summary.ready, "exact game gate", "good"],
      ["Potential Shards", report.summary.potentialShards, "per TB if all succeed", "primary"],
      ["GBA Ready", report.summary.gbaReady, "7★ + 16.5K GP", "primary"],
      ["All 5 at 7★", report.summary.allSevenStar, "power may still block", "secondary"],
      ["Almost", report.summary.almost, "planning heuristic only", "close"],
      ["Far", report.summary.far, "larger star / GP gap", "far"],
    ],
  };
}

function currentView() {
  if (state.mission === "mandalore") return mandaloreView();
  if (state.mission === "reva") return revaView();
  if (state.mission === "wat") return watView();
  return zeffoView();
}

function renderMemberCard(view, row) {
  const rosterHref = memberLink(row);
  const ggHref = swgohLink(row);
  const avatar = `<div class="guild-zeffo-avatar" aria-hidden="true"><span>${escapeHtml(initials(row.name))}</span></div>`;
  const requirements = view.requirements(row);
  return `<article class="guild-zeffo-member-card status-${escapeAttr(row.status.toLowerCase())}">
    <div class="guild-zeffo-member-profile">
      ${rosterHref ? `<a class="guild-zeffo-avatar-link" href="${escapeAttr(rosterHref)}">${avatar}</a>` : avatar}
      <div class="guild-zeffo-member-identity">
        ${rosterHref ? `<a class="guild-zeffo-member-name" href="${escapeAttr(rosterHref)}">${escapeHtml(row.name)}</a>` : `<strong class="guild-zeffo-member-name">${escapeHtml(row.name)}</strong>`}
        <strong class="guild-zeffo-member-gp">${number(row.galacticPower)} GP</strong>
        <small>${escapeHtml(row.allyCode || "No Ally Code")}</small>${profileMeta(row)}
      </div>
    </div>
    <div class="guild-zeffo-mission-readiness guild-tb-requirements-${requirements.length}">
      ${requirements.map((requirement) => `<div class="guild-zeffo-toon${requirement.preferred ? " preferred" : ""}"><span>${escapeHtml(requirement.label)}${requirement.note ? `<em>${escapeHtml(requirement.note)}</em>` : ""}</span>${stateBadge(requirement.state)}</div>`).join("")}
    </div>
    <div class="guild-zeffo-member-result">${statusBadge(row.status)}<strong>${escapeHtml(row.upgradeText)}</strong><small>${escapeHtml(view.resultNote(row))}</small></div>
    <div class="guild-zeffo-member-actions">${rosterHref ? `<a href="${escapeAttr(rosterHref)}">Open Profile</a>` : ""}${ggHref ? `<a href="${escapeAttr(ggHref)}" target="_blank" rel="noreferrer">SWGOH.GG ↗</a>` : ""}</div>
  </article>`;
}

function renderRows(view, rows = []) {
  return rows.length ? `<div class="guild-zeffo-member-list">${rows.map((row) => renderMemberCard(view, row)).join("")}</div>` : '<div class="guild-zeffo-empty">No guild members match this view.</div>';
}
function stat(label, value, detail = "", tone = "") {
  return `<div class="guild-zeffo-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}
function requirementText(view, row) {
  return view.requirements(row).map((requirement) => `${requirement.label} ${requirement.state.label}`).join(" | ");
}
function scoreText(view) {
  return view.mode === "unlock" ? `${view.report.summary.ready} / ${view.report.unlockTarget}` : `${view.report.summary.ready} / 50`;
}
function scoreLabel(view) {
  return view.mode === "unlock" ? "mission eligible" : "potential shards / TB";
}
function gateTone(view) {
  if (view.mode === "unlock") return view.report.summary.canFieldUnlockCount ? "good" : "warn";
  return view.report.summary.ready > 0 ? "good" : "warn";
}
function gateTitle(view) {
  if (view.mode === "unlock") return view.report.summary.canFieldUnlockCount ? "Guild has enough eligible accounts" : "More eligible accounts are needed";
  return `${number(view.report.summary.ready)} members currently meet the entry gate`;
}
function gateMetric(view) {
  if (view.mode === "unlock") {
    const buffer = view.report.summary.buffer;
    return [`${buffer >= 0 ? "+" : ""}${number(buffer)}`, "eligibility buffer"];
  }
  return [number(view.report.summary.potentialShards), "potential shards / TB"];
}

function actionText(view) {
  const report = view.report;
  const lines = [
    `${report.guild.name} — ${view.actionTitle}`,
    view.mode === "unlock" ? `Ready: ${report.summary.ready}/${report.unlockTarget} · Almost: ${report.summary.almost} · Far: ${report.summary.far}` : `Eligible: ${report.summary.ready}/50 · Potential shards: ${report.summary.potentialShards} · Almost: ${report.summary.almost} · Far: ${report.summary.far}`,
    "",
  ];
  for (const row of report.actionMembers) lines.push(`${row.status === "ALMOST" ? "🟡" : "🔴"} ${row.name} — ${number(row.galacticPower)} GP — ${requirementText(view, row)} — ${row.upgradeText}`);
  if (!report.actionMembers.length) lines.push("✅ Every hydrated member in this guild is mission-ready.");
  return lines.join("\n");
}

function csvCell(value) {
  const cell = String(value ?? "");
  return `"${cell.replaceAll('"', '""')}"`;
}
function downloadCsv(view) {
  const report = view.report;
  const maxRequirements = Math.max(0, ...report.members.map((row) => view.requirements(row).length));
  const header = ["Player", "Overall GP", "Ally Code", ...Array.from({ length: maxRequirements }, (_, i) => `Requirement ${i + 1}`), "Status", "Upgrade / Ready Path", "SWGOH.GG"];
  const rows = report.members.map((row) => {
    const requirements = view.requirements(row).map((requirement) => `${requirement.label} ${requirement.state.label}`);
    while (requirements.length < maxRequirements) requirements.push("");
    return [row.name, row.galacticPower, row.allyCode, ...requirements, row.status, row.upgradeText, row.allyCode ? `https://swgoh.gg/p/${row.allyCode}/` : ""];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(report.guild.name || "guild").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${view.id}-readiness.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function setMission(mission) {
  if (!["zeffo", "mandalore", "reva", "wat"].includes(mission) || mission === state.mission) return;
  state.mission = mission;
  state.search = "";
  state.status = "ALL";
  const params = new URLSearchParams(location.search);
  params.set("mission", mission);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  render();
}

function render() {
  const target = state.target;
  const view = currentView();
  const report = view.report;
  if (!target || !report) return;
  const rows = view.filterRows(report.members);
  const tone = gateTone(view);
  const [metric, metricLabel] = gateMetric(view);

  target.innerHTML = `
    <section class="guild-route-page-heading guild-zeffo-heading"><div><div class="kicker">TB OFFICER READINESS</div><h2>Territory Battle Mission Readiness</h2><p>Profile-first guild roster readiness for Zeffo, Mandalore, Reva and Wat Tambor. Exact game entry gates are separated from officer planning heuristics.</p></div><a class="guild-zeffo-back-link" href="/guild/tb?allyCode=${encodeURIComponent(state.allyCode)}">← TB Command</a></section>
    ${missionTabs()}
    <section class="guild-zeffo-guild-summary"><div><div class="kicker">${escapeHtml(report.guild.name)}</div><h3>${escapeHtml(view.label)}</h3><p>${number(report.guild.galacticPower)} guild GP · ${number(report.guild.memberCount)} members · ${escapeHtml(view.planet)}</p></div><div class="guild-zeffo-guild-score ${escapeAttr(tone)}"><strong>${escapeHtml(scoreText(view))}</strong><span>${escapeHtml(scoreLabel(view))}</span></div></section>
    <section class="guild-zeffo-gate ${escapeAttr(tone)}"><div><strong>${escapeHtml(gateTitle(view))}</strong><span>${escapeHtml(view.gateText)}</span></div><div class="guild-zeffo-gate-score"><strong>${escapeHtml(metric)}</strong><span>${escapeHtml(metricLabel)}</span></div></section>
    <div class="guild-zeffo-stat-grid">${view.stats().map(([label, value, detail, statTone]) => stat(label, value, detail, statTone)).join("")}</div>
    <section class="guild-page-card guild-zeffo-action-card"><div class="guild-zeffo-section-title"><div><div class="kicker">OFFICER ACTION LIST</div><h2>Members not ready</h2><p>Closest upgrades first. Every row starts with member profile and overall GP, then the exact mission requirements.</p></div><div class="guild-zeffo-actions"><button id="guildTbCopyAction" type="button">Copy Action List</button><button id="guildTbDownloadCsv" type="button">Download CSV</button></div></div>${renderRows(view, report.actionMembers)}</section>
    <section class="guild-page-card guild-zeffo-full-card"><div class="guild-zeffo-section-title"><div><div class="kicker">FULL GUILD</div><h2>Member readiness</h2></div><div class="guild-zeffo-toolbar"><label>Search<input id="guildTbReadinessSearch" value="${escapeAttr(state.search)}" placeholder="Member or Ally Code"></label><label>Status<select id="guildTbReadinessStatus"><option value="ALL"${state.status === "ALL" ? " selected" : ""}>All</option><option value="READY"${state.status === "READY" ? " selected" : ""}>Ready</option><option value="ALMOST"${state.status === "ALMOST" ? " selected" : ""}>Almost</option><option value="FAR"${state.status === "FAR" ? " selected" : ""}>Far</option></select></label></div></div>${renderRows(view, rows)}</section>
    <section class="guild-zeffo-footnote"><strong>Truth boundary:</strong> green means the current roster data meets the encoded game entry gate. Yellow is an officer planning band and never overrides the actual mission requirement. Data comes from the current guild roster response.</section>`;

  for (const button of target.querySelectorAll("[data-tb-readiness-mission]:not(:disabled)")) button.addEventListener("click", () => setMission(button.dataset.tbReadinessMission));
  target.querySelector("#guildTbReadinessSearch")?.addEventListener("input", (event) => { state.search = event.target.value; render(); requestAnimationFrame(() => target.querySelector("#guildTbReadinessSearch")?.focus()); });
  target.querySelector("#guildTbReadinessStatus")?.addEventListener("change", (event) => { state.status = event.target.value; render(); });
  target.querySelector("#guildTbCopyAction")?.addEventListener("click", async (event) => {
    try { await navigator.clipboard.writeText(actionText(view)); event.currentTarget.textContent = "Copied ✓"; setTimeout(() => { event.currentTarget.textContent = "Copy Action List"; }, 1500); }
    catch { event.currentTarget.textContent = "Copy unavailable"; }
  });
  target.querySelector("#guildTbDownloadCsv")?.addEventListener("click", () => downloadCsv(view));
}

async function loadCatalog() {
  try {
    const response = await fetch("/data/catalog.json?tb-readiness=1", { cache: "no-store" });
    const body = await response.json();
    return Array.isArray(body?.units) ? body.units : [];
  } catch { return []; }
}

export async function renderGuildTbReadinessPage({ target, guildBody, allyCode = "" } = {}) {
  if (!target) return;
  ensureStyles();
  const catalog = await loadCatalog();
  state.target = target;
  state.allyCode = String(allyCode || "").replace(/\D/g, "").slice(0, 9);
  state.reports = {
    zeffo: buildGuildZeffoReadiness(guildBody || {}),
    mandalore: buildGuildMandaloreReadiness(guildBody || {}, catalog),
    reva: buildGuildRevaReadiness(guildBody || {}, catalog),
    wat: buildGuildWatReadiness(guildBody || {}),
  };
  const requested = new URLSearchParams(location.search).get("mission");
  state.mission = ["zeffo", "mandalore", "reva", "wat"].includes(requested) ? requested : "zeffo";
  render();
  return state.reports;
}
