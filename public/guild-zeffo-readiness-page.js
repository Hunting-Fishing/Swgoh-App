import { buildGuildZeffoReadiness, filterGuildZeffoRows } from "./guild-zeffo-readiness-model.js";

const MISSION_TABS = Object.freeze([
  { id: "zeffo", label: "Zeffo / Bracca", active: true },
  { id: "mandalore", label: "Mandalore", comingSoon: true },
  { id: "reva", label: "Reva", comingSoon: true },
  { id: "wat", label: "Wat Tambor", comingSoon: true },
  { id: "other", label: "More TB Missions", comingSoon: true },
]);

const state = {
  target: null,
  report: null,
  search: "",
  status: "ALL",
  allyCode: "",
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
  link.href = "/guild-zeffo-readiness.css?v=20260822-tbprofile1";
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
    <button type="button" class="guild-tb-mission-tab${tab.active ? " active" : ""}" ${tab.comingSoon ? "disabled" : ""} aria-current="${tab.active ? "page" : "false"}">
      <span>${escapeHtml(tab.label)}</span>${tab.comingSoon ? '<small>COMING NEXT</small>' : '<small>LIVE</small>'}
    </button>`).join("")}</nav>`;
}

function profileMeta(row) {
  const detail = [row.profileTitle, row.memberRole].filter(Boolean).join(" · ");
  return detail ? `<small class="guild-zeffo-profile-title">${escapeHtml(detail)}</small>` : "";
}

function renderMemberCard(row) {
  const rosterHref = memberLink(row);
  const ggHref = swgohLink(row);
  const avatar = `<div class="guild-zeffo-avatar" aria-hidden="true"><span>${escapeHtml(initials(row.name))}</span></div>`;
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
      <div class="guild-zeffo-toon"><span>Cere Junda</span>${stateBadge(row.cere)}</div>
      <div class="guild-zeffo-toon preferred"><span>JKCK <em>Preferred</em></span>${stateBadge(row.jkck)}</div>
      <div class="guild-zeffo-toon"><span>Baby Cal</span>${stateBadge(row.babyCal)}</div>
    </div>
    <div class="guild-zeffo-member-result">
      ${statusBadge(row.status)}
      <strong>${escapeHtml(row.upgradeText)}</strong>
      <small>${row.preferredPath === "JKCK" ? "JKCK priority route" : "Baby Cal fallback route"}</small>
    </div>
    <div class="guild-zeffo-member-actions">
      ${rosterHref ? `<a href="${escapeAttr(rosterHref)}">Open Profile</a>` : ""}
      ${ggHref ? `<a href="${escapeAttr(ggHref)}" target="_blank" rel="noreferrer">SWGOH.GG ↗</a>` : ""}
    </div>
  </article>`;
}

function renderRows(rows = []) {
  if (!rows.length) return '<div class="guild-zeffo-empty">No guild members match this view.</div>';
  return `<div class="guild-zeffo-member-list">${rows.map(renderMemberCard).join("")}</div>`;
}

function stat(label, value, detail = "", tone = "") {
  return `<div class="guild-zeffo-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function actionText(report) {
  const lines = [
    `${report.guild.name} — Bracca / Zeffo Officer Action List`,
    `Ready: ${report.summary.ready}/${report.unlockTarget} · Almost: ${report.summary.almost} · Far: ${report.summary.far}`,
    "",
  ];
  for (const row of report.actionMembers) {
    lines.push(`${row.status === "ALMOST" ? "🟡" : "🔴"} ${row.name} — ${number(row.galacticPower)} GP — Cere ${row.cere.label} | JKCK ${row.jkck.label} | Baby Cal ${row.babyCal.label} — ${row.upgradeText}`);
  }
  if (!report.actionMembers.length) lines.push("✅ Every hydrated member in this guild is mission-ready.");
  return lines.join("\n");
}

function csvCell(value) {
  const cell = String(value ?? "");
  return `"${cell.replaceAll('"', '""')}"`;
}

function downloadCsv(report) {
  const header = ["Player", "Overall GP", "Ally Code", "Cere Junda", "JKCK", "Baby Cal", "Status", "Preferred Path", "Upgrade / Ready Path", "SWGOH.GG"];
  const rows = report.members.map((row) => [
    row.name,
    row.galacticPower,
    row.allyCode,
    row.cere.label,
    row.jkck.label,
    row.babyCal.label,
    row.status,
    row.preferredPath,
    row.upgradeText,
    row.allyCode ? `https://swgoh.gg/p/${row.allyCode}/` : "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(report.guild.name || "guild").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-zeffo-readiness.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function render() {
  const target = state.target;
  const report = state.report;
  if (!target || !report) return;
  const rows = filterGuildZeffoRows(report.members, { search: state.search, status: state.status });
  const s = report.summary;
  const unlockTone = s.canFieldUnlockCount ? "good" : "warn";

  target.innerHTML = `
    <section class="guild-route-page-heading guild-zeffo-heading">
      <div><div class="kicker">TB OFFICER READINESS</div><h2>Territory Battle Mission Readiness</h2><p>Profile-first guild roster view for special-mission requirements. Zeffo / Bracca is live now; Mandalore, Reva, Wat Tambor and additional TB readiness tabs use this same member-card framework.</p></div>
      <a class="guild-zeffo-back-link" href="/guild/tb?allyCode=${encodeURIComponent(state.allyCode)}">← TB Command</a>
    </section>
    ${missionTabs()}
    <section class="guild-zeffo-guild-summary">
      <div><div class="kicker">${escapeHtml(report.guild.name)}</div><h3>Zeffo / Bracca</h3><p>${number(report.guild.galacticPower)} guild GP · ${number(report.guild.memberCount)} members</p></div>
      <div class="guild-zeffo-guild-score ${escapeAttr(unlockTone)}"><strong>${number(s.ready)} / ${number(report.unlockTarget)}</strong><span>mission eligible</span></div>
    </section>
    <section class="guild-zeffo-gate ${escapeAttr(unlockTone)}">
      <div><strong>${s.canFieldUnlockCount ? "Guild has enough eligible accounts" : "More eligible accounts are needed"}</strong><span>Entry gate: Cere Junda R7+ AND either JKCK R7+ or Baby Cal R7+. Zeffo unlock requires 30 successful Bracca clears in the same ROTE run.</span></div>
      <div class="guild-zeffo-gate-score"><strong>${s.buffer >= 0 ? "+" : ""}${number(s.buffer)}</strong><span>eligibility buffer</span></div>
    </section>
    <div class="guild-zeffo-stat-grid">
      ${stat("Ready", s.ready, `${s.buffer >= 0 ? "+" : ""}${s.buffer} vs 30`, s.ready >= report.unlockTarget ? "good" : "warn")}
      ${stat("JKCK Ready", s.jkckReady, "preferred route", "primary")}
      ${stat("Baby Cal Fallback", s.babyFallback, "ready without R7 JKCK", "secondary")}
      ${stat("Almost", s.almost, "R5–R6 gate pieces", "close")}
      ${stat("Far", s.far, "R4 / pre-relic / locked", "far")}
      ${stat("Roster Data", `${number(s.total - s.rosterUnavailable)}/${number(s.total)}`, "hydrated members")}
    </div>
    <section class="guild-page-card guild-zeffo-action-card">
      <div class="guild-zeffo-section-title"><div><div class="kicker">OFFICER ACTION LIST</div><h2>Members not ready</h2><p>Closest upgrades first. Each row starts with the member profile and overall GP, followed by the exact Zeffo requirements.</p></div><div class="guild-zeffo-actions"><button id="guildZeffoCopyAction" type="button">Copy Action List</button><button id="guildZeffoDownloadCsv" type="button">Download CSV</button></div></div>
      ${renderRows(report.actionMembers)}
    </section>
    <section class="guild-page-card guild-zeffo-full-card">
      <div class="guild-zeffo-section-title"><div><div class="kicker">FULL GUILD</div><h2>Member readiness</h2><p>SWGOH.GG-inspired guild roster hierarchy: player identity and GP first, mission readiness second.</p></div><div class="guild-zeffo-toolbar"><label>Search<input id="guildZeffoSearch" value="${escapeAttr(state.search)}" placeholder="Member or Ally Code"></label><label>Status<select id="guildZeffoStatus"><option value="ALL"${state.status === "ALL" ? " selected" : ""}>All</option><option value="READY"${state.status === "READY" ? " selected" : ""}>Ready</option><option value="ALMOST"${state.status === "ALMOST" ? " selected" : ""}>Almost</option><option value="FAR"${state.status === "FAR" ? " selected" : ""}>Far</option></select></label></div></div>
      ${renderRows(rows)}
    </section>
    <section class="guild-zeffo-footnote"><strong>Exact states only:</strong> R0–R9 = relic tier · G1–G12 = gear tier · LOCKED = character not unlocked. This page is calculated from the current guild roster response, not a manually maintained guild spreadsheet.</section>`;

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
      await navigator.clipboard.writeText(actionText(report));
      button.textContent = "Copied ✓";
      setTimeout(() => { button.textContent = "Copy Action List"; }, 1500);
    } catch {
      button.textContent = "Copy unavailable";
    }
  });
  target.querySelector("#guildZeffoDownloadCsv")?.addEventListener("click", () => downloadCsv(report));
}

export function renderGuildZeffoReadinessPage({ target, guildBody, allyCode = "" } = {}) {
  if (!target) return;
  ensureStyles();
  state.target = target;
  state.allyCode = String(allyCode || "").replace(/\D/g, "").slice(0, 9);
  state.report = buildGuildZeffoReadiness(guildBody || {});
  render();
  return state.report;
}
