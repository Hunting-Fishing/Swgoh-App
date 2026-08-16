import { buildGuildTwCapability, filterGuildTwFactions } from "./guild-tw-capability-model.js";

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

const state = {
  target: null,
  guildBody: null,
  catalog: [],
  allyCode: "",
  model: null,
  section: "overview",
  search: "",
  coverage: "All",
  sort: "r7",
  selectedFaction: "",
};

function route(path, extra = {}) {
  const params = new URLSearchParams();
  if (digits(state.allyCode).length === 9) params.set("allyCode", digits(state.allyCode));
  for (const [key, value] of Object.entries(extra)) if (value != null && String(value) !== "") params.set(key, String(value));
  return `${path}${params.toString() ? `?${params.toString()}` : ""}`;
}

function playerLink(allyCode) {
  const code = digits(allyCode);
  return code.length === 9 ? `/?allyCode=${encodeURIComponent(code)}#roster` : "";
}

function unitMatrixLink(baseId) {
  return route("/guild/units", { unit: baseId });
}

function stat(label, value, tone = "", detail = "") {
  return `<div class="guild-tw-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function concentrationLabel(value) {
  return ({ "very-thin": "Very Thin", thin: "Thin", moderate: "Moderate", broad: "Broad", none: "No R7" })[value] || value;
}

function concentrationTone(value) {
  if (value === "broad") return "good";
  if (value === "moderate") return "neutral";
  if (value === "thin" || value === "very-thin") return "warn";
  return "bad";
}

function header(title, description) {
  return `<section class="guild-route-page-heading guild-tw-heading"><div><div class="kicker">TERRITORY WARS · ROSTER CAPABILITY</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><div class="guild-tw-evidence">ROSTER EVIDENCE ONLY</div></section>`;
}

function evidenceNote() {
  return '<div class="guild-tw-evidence-note"><strong>Evidence boundary:</strong> these are faction-roster capability measurements from current guild ownership and relic progression. They are not current TW meta rankings, offense/defense recommendations, counter claims, datacron evaluations, or predictions of wins.</div>';
}

function overviewPage() {
  const m = state.model;
  const s = m.summary;
  const broad = m.factions.slice().sort((a, b) => b.r7Owners - a.r7Owners || b.r5Owners - a.r5Owners).slice(0, 10);
  const thin = m.factions.filter((row) => row.r5Owners > 0).slice().sort((a, b) => a.r7Owners - b.r7Owners || a.r5Owners - b.r5Owners).slice(0, 10);
  return `${header("TW Guild Command", "Guild-wide faction depth is now calculated from the live hydrated roster. Detailed teams, members and upgrade bottlenecks each live on their own TW page.")}
    <div class="guild-tw-summary">${stat("Hydrated Members", `${number(m.hydratedMembers)} / ${number(m.totalMembers)}`)}${stat("Factions Tracked", number(s.factionsTracked))}${stat("5-Unit Faction Cores", number(s.completeFactionCores))}${stat("R5 Cores", number(s.r5FactionCores))}${stat("R7 Cores", number(s.r7FactionCores), "good")}${stat("Leader-Capable", number(s.leaderCapableCores))}${stat("Thin R7 Factions", number(s.thinR7Factions), s.thinR7Factions ? "warn" : "good")}${stat("Zero R7 Factions", number(s.zeroR7Factions), s.zeroR7Factions ? "bad" : "good")}</div>
    <div class="guild-tw-card-grid">
      ${twCard("TEAM COVERAGE", "Faction Team Coverage", "See how many guild members can field five owned, R5 and R7 characters in each faction, plus leader-capable depth.", route("/guild/tw/teams"))}
      ${twCard("MEMBER DEPTH", "Member TW Rosters", "Compare which guild members carry the largest number of complete faction cores and high-relic faction cores.", route("/guild/tw/members"))}
      ${twCard("UPGRADE PRESSURE", "Faction Bottlenecks", "Find below-R7 units appearing in the strongest near-R7 faction cores and drill into guild ownership.", route("/guild/tw/bottlenecks"))}
    </div>
    <div class="guild-page-two-col">
      <section class="guild-page-card"><div class="kicker">DEEPEST R7 COVERAGE</div><h3>Broadest high-relic faction depth</h3><div class="guild-tw-rank-list">${broad.map((row, index) => factionRank(row, index)).join("")}</div></section>
      <section class="guild-page-card"><div class="kicker">THIN COVERAGE WATCH</div><h3>Factions carried by fewer R7-capable members</h3><div class="guild-tw-rank-list">${thin.map((row, index) => factionRank(row, index, true)).join("")}</div></section>
    </div>
    ${evidenceNote()}`;
}

function twCard(kicker, title, body, href) {
  return `<article class="guild-tw-card"><div class="kicker">${escapeHtml(kicker)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><a href="${escapeAttr(href)}">Open ${escapeHtml(title)} →</a></article>`;
}

function factionRank(row, index, risk = false) {
  return `<a href="${escapeAttr(route("/guild/tw/teams", { faction: row.faction }))}"><strong>#${index + 1} ${escapeHtml(row.faction)}</strong><span>${number(row.r7Owners)} R7 · ${number(row.r5Owners)} R5 · ${number(row.completeOwners)} owned cores</span><em class="${escapeAttr(risk ? concentrationTone(row.concentration) : "")}">${escapeHtml(concentrationLabel(row.concentration))}</em></a>`;
}

function teamsPage() {
  const rows = filterGuildTwFactions(state.model.factions, { search: state.search, coverage: state.coverage, sort: state.sort });
  const selected = state.model.factions.find((row) => row.faction === state.selectedFaction) || null;
  return `${header("Faction Team Coverage", "Measure five-character faction-core availability across the entire guild at owned, R5 and R7 progression bands. This is a roster-depth view, not a TW meta-team list.")}
    <section class="guild-page-card guild-tw-controls"><label>Faction Search<input id="guildTwFactionSearch" value="${escapeAttr(state.search)}" placeholder="Jedi, Sith, Mandalorian…"></label><label>Coverage<select id="guildTwCoverage"><option value="All">All factions</option><option value="R7"${state.coverage === "R7" ? " selected" : ""}>Has R7 coverage</option><option value="NoR7"${state.coverage === "NoR7" ? " selected" : ""}>No R7 coverage</option><option value="Thin"${state.coverage === "Thin" ? " selected" : ""}>Thin R7 coverage</option><option value="NearR7"${state.coverage === "NearR7" ? " selected" : ""}>Near-R7 members</option></select></label><label>Sort<select id="guildTwSort"><option value="r7">R7 depth</option><option value="r5"${state.sort === "r5" ? " selected" : ""}>R5 depth</option><option value="complete"${state.sort === "complete" ? " selected" : ""}>Owned cores</option><option value="risk"${state.sort === "risk" ? " selected" : ""}>Thin coverage first</option><option value="name"${state.sort === "name" ? " selected" : ""}>Faction name</option></select></label><div class="guild-tw-count">${number(rows.length)} factions</div></section>
    <div class="guild-tw-teams-layout"><section class="guild-page-card"><div class="guild-tw-table-wrap"><table class="guild-tw-table"><thead><tr><th>Faction</th><th>Owned 5</th><th>R5 Core</th><th>R7 Core</th><th>Leader-Capable</th><th>Near R7</th><th>R7 Coverage</th><th>Concentration</th></tr></thead><tbody>${rows.map((row) => `<tr data-tw-faction="${escapeAttr(row.faction)}" class="${row.faction === state.selectedFaction ? "selected" : ""}"><td><strong>${escapeHtml(row.faction)}</strong><small>${number(row.catalogCharacters)} catalog characters</small></td><td>${number(row.completeOwners)}</td><td>${number(row.r5Owners)}</td><td><strong>${number(row.r7Owners)}</strong></td><td>${number(row.leaderCapableOwners)}</td><td>${number(row.nearR7Owners)}</td><td>${row.r7CoveragePercent}%</td><td><span class="guild-tw-risk ${escapeAttr(concentrationTone(row.concentration))}">${escapeHtml(concentrationLabel(row.concentration))}</span></td></tr>`).join("")}</tbody></table></div></section><aside id="guildTwFactionDetail" class="guild-page-card guild-tw-detail">${selected ? factionDetail(selected) : '<div class="workspace-note">Select a faction to see exactly which members carry its strongest roster depth.</div>'}</aside></div>
    ${evidenceNote()}`;
}

function factionDetail(row) {
  const owners = row.evaluations.filter((entry) => entry.complete).slice(0, 20);
  return `<div class="kicker">FACTION DRILL-IN</div><h3>${escapeHtml(row.faction)}</h3><div class="guild-tw-detail-stats">${stat("Owned Cores", row.completeOwners)}${stat("R5", row.r5Owners)}${stat("R7", row.r7Owners)}${stat("Leader", row.leaderCapableOwners)}</div><h4>Strongest member cores</h4><div class="guild-tw-member-list">${owners.map((entry) => `<div><div><strong>${escapeHtml(entry.memberName)}</strong><small>${entry.r7Complete ? "R7 core" : entry.r5Complete ? "R5 core" : `Relic floor R${number(entry.relicFloor)}`} · ${number(entry.combinedGp)} selected-core GP</small></div>${entry.allyCode ? `<a href="${escapeAttr(playerLink(entry.allyCode))}">Roster</a>` : ""}</div>`).join("") || '<div class="workspace-note">No member currently owns five characters in this faction.</div>'}</div>${row.nearR7Owners ? `<h4>Near-R7 members</h4><div class="guild-tw-near-list">${row.evaluations.filter((entry) => entry.r5Complete && !entry.r7Complete && entry.r7UpgradeRows.length).slice(0, 12).map((entry) => `<div><strong>${escapeHtml(entry.memberName)}</strong><span>${entry.r7UpgradeRows.map((unit) => `${escapeHtml(unit.name)} R${number(unit.currentRelic)}→R7`).join(" · ")}</span></div>`).join("")}</div>` : ""}`;
}

function membersPage() {
  const rows = state.model.members;
  return `${header("Member TW Roster Depth", "Compare how many faction cores each guild member can field at owned, R5 and R7 progression bands. A faction core is a roster-depth measure, not an assigned offense or defense squad.")}
    <section class="guild-page-card"><div class="guild-tw-table-wrap"><table class="guild-tw-table guild-tw-member-table"><thead><tr><th>Member</th><th>GP</th><th>5-Unit Factions</th><th>R5 Factions</th><th>R7 Factions</th><th>Leader-Capable</th><th>Strongest Factions</th><th>Player</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.memberName)}</strong><small>${escapeHtml(row.allyCode)}</small></td><td>${number(row.memberGp)}</td><td>${number(row.completeFactions)}</td><td>${number(row.r5Factions)}</td><td><strong>${number(row.r7Factions)}</strong></td><td>${number(row.leaderCapableFactions)}</td><td><div class="guild-tw-tags">${row.strongestFactions.slice(0, 5).map((faction) => `<span>${escapeHtml(faction.faction)} · R${number(faction.relicFloor)}</span>`).join("")}</div></td><td>${row.allyCode ? `<a class="guild-unit-player-link" href="${escapeAttr(playerLink(row.allyCode))}">Open Roster →</a>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>
    ${evidenceNote()}`;
}

function bottlenecksPage() {
  const rows = state.model.bottlenecks;
  return `${header("Faction Upgrade Bottlenecks", "Identify characters appearing below R7 in members' strongest five-character faction cores when those members already have an R5-complete core. This is upgrade-pressure analysis, not a directive to farm the unit for TW.")}
    <section class="guild-page-card">${rows.length ? `<div class="guild-tw-table-wrap"><table class="guild-tw-table"><thead><tr><th>Faction</th><th>Unit</th><th>Affected Members</th><th>Total Relic Gap</th><th>Member Examples</th><th>Guild Ownership</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.faction)}</strong></td><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${number(row.affectedMembers)}</td><td>${number(row.totalRelicGap)}</td><td><div class="guild-tw-tags">${row.members.slice(0, 5).map((member) => `<span>${escapeHtml(member.memberName)} · R${number(member.currentRelic)}</span>`).join("")}</div></td><td><a class="guild-unit-player-link" href="${escapeAttr(unitMatrixLink(row.baseId))}">Open Unit Matrix →</a></td></tr>`).join("")}</tbody></table></div>` : '<div class="workspace-note">No R5-complete faction cores currently have below-R7 units in their strongest five-character core.</div>'}</section>
    ${evidenceNote()}`;
}

function renderWithFocus(id) {
  render();
  const element = document.getElementById(id);
  if (!element) return;
  element.focus();
  const length = String(element.value || "").length;
  element.setSelectionRange?.(length, length);
}

function updateFactionQuery() {
  const params = new URLSearchParams(location.search);
  if (state.selectedFaction) params.set("faction", state.selectedFaction); else params.delete("faction");
  history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
}

function wireTeams() {
  document.getElementById("guildTwFactionSearch")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderWithFocus("guildTwFactionSearch");
  });
  document.getElementById("guildTwCoverage")?.addEventListener("change", (event) => { state.coverage = event.target.value; render(); });
  document.getElementById("guildTwSort")?.addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  for (const row of document.querySelectorAll("[data-tw-faction]")) row.addEventListener("click", () => {
    state.selectedFaction = row.dataset.twFaction;
    updateFactionQuery();
    render();
  });
}

function render() {
  if (!state.target || !state.model) return;
  if (state.section === "teams") state.target.innerHTML = teamsPage();
  else if (state.section === "members") state.target.innerHTML = membersPage();
  else if (state.section === "bottlenecks") state.target.innerHTML = bottlenecksPage();
  else state.target.innerHTML = overviewPage();
  if (state.section === "teams") wireTeams();
}

export function renderGuildTwCapabilityPage({ target, guildBody, catalog, allyCode, section = "overview" } = {}) {
  if (!target || !guildBody || !Array.isArray(catalog)) return;
  state.target = target;
  state.guildBody = guildBody;
  state.catalog = catalog;
  state.allyCode = digits(allyCode);
  state.section = section;
  const params = new URLSearchParams(location.search);
  state.selectedFaction = String(params.get("faction") || "");
  state.model = buildGuildTwCapability(guildBody, catalog, { squadSize: 5 });
  render();
}
