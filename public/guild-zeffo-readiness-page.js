import { buildGuildZeffoReadiness, filterGuildZeffoRows } from "./guild-zeffo-readiness-model.js";
import { buildGuildMandaloreReadiness, filterGuildMandaloreRows } from "./guild-mandalore-readiness-model.js";

const MISSION_TABS = Object.freeze([
  { id: "zeffo", label: "Zeffo / Bracca", live: true },
  { id: "mandalore", label: "Mandalore", live: true },
  { id: "reva", label: "Reva", comingSoon: true },
  { id: "wat", label: "Wat Tambor", comingSoon: true },
  { id: "other", label: "More TB Missions", comingSoon: true },
]);

const state = {
  target: null,
  reports: {},
  search: "",
  status: "ALL",
  allyCode: "",
  mission: "zeffo",
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";

function ensureStyles() {
  if (document.querySelector('link[data-guild-zeffo-readiness-css="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/guild-zeffo-readiness.css?v=20260822-mandalore1";
  link.dataset.guildZeffoReadinessCss = "true";
  document.head.appendChild(link);
}

function initials(name = "") {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function stateBadge(unit = {}) {
  return `<span class="guild-zeffo-unit ${escapeAttr(unit.tone || "far")}">${escapeHtml(unit.label || "LOCKED")}</span>`;
}

function statusBadge(status) {
  return `<span class="guild-zeffo-status ${escapeAttr(String(status || "").toLowerCase())}">${escapeHtml(status)}</span>`;
}

function memberLink(row) {
  if (!row.allyCode) return "";
  return `/?allyCode=${encodeURIComponent(row.allyCode)}#roster`;
}

function swgohLink(row) {
  if (!row.allyCode) return "";
  return `https://swgoh.gg/p/${encodeURIComponent(row.allyCode)}/`;
}

function missionTabs() {
  return `<nav class="guild-tb-mission-tabs" aria-label="Territory Battle readiness missions">${MISSION_TABS.map((tab) => `
    <button type="button" class="guild-tb-mission-tab${tab.id === state.mission ? " active" : ""}" data-tb-readiness-mission="${escapeAttr(tab.id)}" ${tab.comingSoon ? "disabled" : ""} aria-current="${tab.id === state.mission ? "page" : "false"}">
      <span>${escapeHtml(tab.label)}</span>${tab.comingSoon ? '<small>COMING NEXT</small>' : '<small>LIVE</small>'}
    </button>`).join("")}</nav>`;
}

function profileMeta(row) {
  const detail = [row.profileTitle, row.memberRole].filter(Boolean).join(" · ");
  return detail ? `<small class="guild-zeffo-profile-title">${escapeHtml(detail)}</small>` : "";
}

function zeffoView() {
  const report = state.reports.zeffo;
  return {
    id: "zeffo",
    label: "Zeffo / Bracca",
    planet: "Bracca Special Mission",
    report,
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
    id: "mandalore",
    label: "Mandalore",
    planet: "Tatooine · Krayt Dragon Special Mission",
    report,
    gateText: report.gateText,
    filterRows: (rows) => filterGuildMandaloreRows(rows, { search: state.search, status: state.status }),
    requirements: (row) => [
      { label: "Bo-Katan Mand'alor", note: "Required", preferred: true, state: row.boKatanMandalor },
      { label: "Beskar Mando", note: "Required", preferred: true, state: row.beskarMando },
      { label: row.thirdMando.name || "Additional Mandalorian", note: "Best +1 Mando", state: row.thirdMando.state },
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

function currentView() {
  return state.mission === "mandalore" ? mandaloreView() : zeffoView();
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
        <small>${escapeHtml(row.allyCode || "No Ally Code")}</small>
        ${profileMeta(row)}
      </div>
    </div>
    <div class="guild-zeffo-mission-readiness">
      ${requirements.map((requirement) => `<div class="guild-zeffo-toon${requirement.preferred ? " preferred" : ""}"><span>${escapeHtml(requirement.label)}${requirement.note ? `<em>${escapeHtml(requirement.note)}</em>` : ""}</span>${stateBadge(requirement.state)}</div>`).join("")}
    </div>
    <div class="guild-zeffo-member-result">
      ${statusBadge(row.status)}
      <strong>${escapeHtml(row.upgradeText)}</strong>
      <small>${escapeHtml(view.resultNote(row))}</small>
    </div>
    <div class="guild-zeffo-member-actions">
      ${rosterHref ? `<a href="${escapeAttr(rosterHref)}">Open Profile</a>` : ""}
      ${ggHref ? `<a href="${escapeAttr(ggHref)}" target="_blank" rel="noreferrer">SWGOH.GG ↗</a>` : ""}
    </div>
  </article>`;
}

function renderRows(view, rows = []) {
  if (!rows.length) return '<div class="guild-zeffo-empty">No guild members match this view.</div>';
  return `<div class="guild-zeffo-member-list">${rows.map((row) => renderMemberCard(view, row)).join("")}</div>`;
}

function stat(label, value, detail = "", tone = "") {
  return `<div class="guild-zeffo-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function requirementText(view, row) {
  return view.requirements(row).map((requirement) => `${requirement.label} ${requirement.state.label}`).join(" | ");
}

function actionText(view) {
  const report = view.report;
  const lines = [
    `${report.guild.name} — ${view.actionTitle}`,
    `Ready: ${report.summary.ready}/${report.unlockTarget} · Almost: ${report.summary.almost} · Far: ${report.summary.far}`,
    "",
  ];
  for (const row of report.actionMembers) {
    lines.push(`${row.status === "ALMOST" ? "🟡" : "🔴"} ${row.name} — ${number(row.galacticPower)} GP — ${requirementText(view, row)} — ${row.upgradeText}`);
  }
  if (!report.actionMembers.length) lines.push("✅ Every hydrated member in this guild is mission-ready.");
  return lines.join("\n");
}

function csvCell(value) {
  const cell = String(value ?? "");
  return `"${cell.replaceAll('"', '""')}"`;
}

function downloadCsv(view) {
  const report = view.report;
  const example = report.members[0];
  const requirementLabels = example ? view.requirements(example).map((row) => row.label) : ["Requirement 1", "Requirement 2", "Requirement 3"];
  const header = ["Player", "Overall GP", "Ally Code", ...requirementLabels, "Status", "Upgrade / Ready Path", "SWGOH.GG"];
  const rows = report.members.map((row) => [
    row.name,
    row.galacticPower,
    row.allyCode,
    ...view.requirements(row).map((requirement) => `${requirement.label} ${requirement.state.label}`),
    row.status,
    row.upgradeText,
    row.allyCode ? `https://swgoh.gg/p/${row.allyCode}/` : "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(report.guild.name || "guild").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${view.id}-readiness.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setMission(mission) {
  if (!["zeffo", "mandalore"].includes(mission) || mission === state.mission) return;
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
  const s = report.summary;
  const unlockTone = s.canFieldUnlockCount ? "good" : "warn";

  target.innerHTML = `
    <section class="guild-route-page-heading guild-zeffo-heading">
      <div><div class="kicker">TB OFFICER READINESS</div><h2>Territory Battle Mission Readiness</h2><p>Profile-first guild roster view for special-mission requirements. Zeffo / Bracca and Mandalore are live; Reva, Wat Tambor and additional TB missions will use this same framework.</p></div>
      <a class="guild-zeffo-back-link" href="/guild/tb?allyCode=${encodeURIComponent(state.allyCode)}">← TB Command</a>
    </section>
    ${missionTabs()}
    <section class="guild-zeffo-guild-summary">
      <div><div class="kicker">${escapeHtml(report.guild.name)}</div><h3>${escapeHtml(view.label)}</h3><p>${number(report.guild.galacticPower)} guild GP · ${number(report.guild.memberCount)} members · ${escapeHtml(view.planet)}</p></div>
      <div class="guild-zeffo-guild-score ${escapeAttr(unlockTone)}"><strong>${number(s.ready)} / ${number(report.unlockTarget)}</strong><span>mission eligible</span></div>
    </section>
    <section class="guild-zeffo-gate ${escapeAttr(unlockTone)}">
      <div><strong>${s.canFieldUnlockCount ? "Guild has enough eligible accounts" : "More eligible accounts are needed"}</strong><span>${escapeHtml(view.gateText)}</span></div>
      <div class="guild-zeffo-gate-score"><strong>${s.buffer >= 0 ? "+" : ""}${number(s.buffer)}</strong><span>eligibility buffer</span></div>
    </section>
    <div class="guild-zeffo-stat-grid">
      ${view.stats().map(([label, value, detail, tone]) => stat(label, value, detail, tone)).join("")}
    </div>
    <section class="guild-page-card guild-zeffo-action-card">
      <div class="guild-zeffo-section-title"><div><div class="kicker">OFFICER ACTION LIST</div><h2>Members not ready</h2><p>Closest upgrades first. Player identity and overall GP come first, followed by the exact ${escapeHtml(view.label)} requirements.</p></div><div class="guild-zeffo-actions"><button id="guildZeffoCopyAction" type="button">Copy Action List</button><button id="guildZeffoDownloadCsv" type="button">Download CSV</button></div></div>
      ${renderRows(view, report.actionMembers)}
    </section>
    <section class="guild-page-card guild-zeffo-full-card">
      <div class="guild-zeffo-section-title"><div><div class="kicker">FULL GUILD</div><h2>Member readiness</h2><p>SWGOH.GG-inspired guild roster hierarchy: player identity and GP first, mission readiness second.</p></div><div class="guild-zeffo-toolbar"><label>Search<input id="guildZeffoSearch" value="${escapeAttr(state.search)}" placeholder="Member or Ally Code"></label><label>Status<select id="guildZeffoStatus"><option value="ALL"${state.status === "ALL" ? " selected" : ""}>All</option><option value="READY"${state.status === "READY" ? " selected" : ""}>Ready</option><option value="ALMOST"${state.status === "ALMOST" ? " selected" : ""}>Almost</option><option value="FAR"${state.status === "FAR" ? " selected" : ""}>Far</option></select></label></div></div>
      ${renderRows(view, rows)}
    </section>
    <section class="guild-zeffo-footnote"><strong>Exact states only:</strong> R0–R9 = relic tier · G1–G12 = gear tier · LOCKED/NONE = missing requirement. Mandalore automatically selects each member's strongest additional Mandalorian; it never assumes one fixed third character.</section>`;

  for (const button of target.querySelectorAll("[data-tb-readiness-mission]:not(:disabled)")) {
    button.addEventListener("click", () => setMission(button.dataset.tbReadinessMission));
  }
  target.querySelector("#guildZeffoSearch")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
    requestAnimationFrame(() => target.querySelector("#guildZeffoSearch")?.focus());
  });
  target.querySelector("#guildZeffoStatus")?.addEventListener("change", (event) => {
    state.status = event.target.value;
    render();
  });
  target.querySelector("#guildZeffoCopyAction")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(actionText(view));
      button.textContent = "Copied ✓";
      setTimeout(() => { button.textContent = "Copy Action List"; }, 1500);
    } catch {
      button.textContent = "Copy unavailable";
    }
  });
  target.querySelector("#guildZeffoDownloadCsv")?.addEventListener("click", () => downloadCsv(view));
}

export function renderGuildZeffoReadinessPage({ target, guildBody, catalog = [], allyCode = "" } = {}) {
  if (!target) return;
  ensureStyles();
  state.target = target;
  state.allyCode = String(allyCode || "").replace(/\D/g, "").slice(0, 9);
  const requestedMission = String(new URLSearchParams(location.search).get("mission") || "zeffo").toLowerCase();
  state.mission = ["zeffo", "mandalore"].includes(requestedMission) ? requestedMission : "zeffo";
  state.reports = {
    zeffo: buildGuildZeffoReadiness(guildBody || {}),
    mandalore: buildGuildMandaloreReadiness(guildBody || {}, catalog),
  };
  render();
  return state.reports[state.mission];
}
