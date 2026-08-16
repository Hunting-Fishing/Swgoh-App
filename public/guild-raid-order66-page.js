import {
  buildGuildOrder66Capability,
  filterGuildOrder66Members,
  filterGuildOrder66Units,
} from "./guild-raid-order66-model.js";

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
  section: "overview",
  model: null,
  memberSearch: "",
  memberBand: "all",
  unitSearch: "",
  unitGroup: "All",
  unitSort: "r7",
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
  return `<div class="guild-raid-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function header(title, description) {
  return `<section class="guild-route-page-heading guild-raid-heading"><div><div class="kicker">GUILD RAIDS · ORDER 66</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><div class="guild-raid-evidence">ROSTER CAPABILITY</div></section>`;
}

function evidenceNote() {
  return '<div class="guild-raid-evidence-note"><strong>Evidence boundary:</strong> live guild roster data proves ownership and progression only. Official difficulty multipliers and guild reward milestones are reference rules. This app does not infer submitted attempts, battle success, team damage, or projected guild raid score from relic counts.</div>';
}

function raidCard(kicker, title, body, href) {
  return `<article class="guild-raid-card"><div class="kicker">${escapeHtml(kicker)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><a href="${escapeAttr(href)}">Open ${escapeHtml(title)} →</a></article>`;
}

function bandGrid() {
  return `<div class="guild-raid-band-grid">${state.model.raid.progressionBands.map((band) => `<div><span>${escapeHtml(band.label)}</span><strong>${band.multiplier}×</strong><small>${number(state.model.guildBandCounts[band.id] || 0)} eligible guild units meet this band</small></div>`).join("")}</div>`;
}

function eligibilityGroups() {
  const groups = new Map();
  for (const unit of state.model.eligibility.units) groups.set(unit.raidGroup, (groups.get(unit.raidGroup) || 0) + 1);
  return [...groups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function overviewPage() {
  const m = state.model;
  const s = m.summary;
  return `${header("Raid Command", "Order 66 is modeled as a versioned raid-rules layer on top of the same live Guild roster used by TB and TW. Eligibility prefers the game catalog's Order 66 raid tag and falls back to the official allowed groups when that tag is absent.")}
    <div class="guild-raid-summary">${stat("Hydrated Members", `${number(m.hydratedMembers)} / ${number(m.totalMembers)}`)}${stat("Eligible Catalog Units", number(s.allowedCatalogUnits))}${stat("Eligible Units Owned", number(s.totalEligibleOwned))}${stat("R5 Eligible", number(s.totalR5Eligible))}${stat("R7 Eligible", number(s.totalR7Eligible), "good")}${stat("R9 Eligible", number(s.totalR9Eligible), "good")}${stat("Members with 5 R5", number(s.membersWithFiveR5))}${stat("Members with 5 R7", number(s.membersWithFiveR7), s.membersWithFiveR7 ? "good" : "warn")}</div>
    <div class="guild-raid-card-grid">
      ${raidCard("RAID RULES", "Order 66 Capability", "Review allowed-unit resolution, official progression bands, and the guild's current eligible roster depth.", route("/guild/raids/order-66"))}
      ${raidCard("MEMBER DEPTH", "Raid Members", "Compare each guild member's eligible characters at G12, R1, R3, R5, R7, R8 and R9.", route("/guild/raids/members"))}
      ${raidCard("UNIT COVERAGE", "Eligible Units", "See exactly how many guild members own each eligible character and how many have it at high relics.", route("/guild/raids/units"))}
      ${raidCard("OFFICIAL REWARDS", "Guild Milestones", "Reference the official Order 66 guild score thresholds and Raid MK I/II/III rewards without fabricating a score forecast.", route("/guild/raids/milestones"))}
    </div>
    <section class="guild-page-card"><div class="kicker">PROGRESSION BANDS</div><h3>Official difficulty requirement bands</h3>${bandGrid()}</section>
    ${evidenceNote()}`;
}

function order66Page() {
  const m = state.model;
  const s = m.summary;
  const groups = eligibilityGroups();
  return `${header("Order 66 Roster Capability", "The raid's allowed roster is resolved from current catalog metadata where possible. The official allowed-list fallback keeps the page useful when the generated catalog has not exposed the dedicated raid tag.")}
    <div class="guild-raid-summary">${stat("Allowed Units", s.allowedCatalogUnits)}${stat("Catalog-Tag Resolved", s.tagResolvedUnits, s.tagResolvedUnits ? "good" : "warn")}${stat("Official Fallback", s.fallbackResolvedUnits)}${stat("Members with Eligible", s.membersWithEligibleUnits)}${stat("Members with 5 G12", s.membersWithFiveG12)}${stat("Members with 5 R5", s.membersWithFiveR5)}${stat("Members with 5 R7", s.membersWithFiveR7, "good")}${stat("Members with 5 R9", s.membersWithFiveR9, "good")}</div>
    <div class="guild-page-two-col"><section class="guild-page-card"><div class="kicker">ELIGIBILITY RESOLUTION</div><h3>${escapeHtml(m.eligibility.evidenceMode)}</h3><p class="workspace-note">If the current catalog exposes the Order 66 Raid tag, tagged units are accepted directly. Official fallback groups cover Pirates, Jedi Vanguard, Dark Side Clone Troopers/Tarkin and the named eligible Bad Batch/Jedi characters.</p><div class="guild-raid-group-list">${groups.map(([group, count]) => `<div><strong>${escapeHtml(group)}</strong><span>${number(count)} units</span></div>`).join("")}</div></section><section class="guild-page-card"><div class="kicker">OFFICIAL DIFFICULTY BANDS</div><h3>Progression requirements</h3>${bandGrid()}</section></div>
    <section class="guild-page-card"><div class="kicker">FIVE-CHARACTER DEPTH</div><h3>Guild member availability by progression floor</h3><p class="workspace-note">These counts mean the member owns at least five eligible characters meeting the listed progression floor. They do not assert a valid optimized team, an unused attempt, or a score.</p><div class="guild-raid-depth-bars">${[
      ["G12", s.membersWithFiveG12],
      ["R5", s.membersWithFiveR5],
      ["R7", s.membersWithFiveR7],
      ["R9", s.membersWithFiveR9],
    ].map(([label, count]) => `<div><span>${label}</span><div><i style="width:${m.hydratedMembers ? Math.min(100, (count / m.hydratedMembers) * 100) : 0}%"></i></div><strong>${number(count)} / ${number(m.hydratedMembers)}</strong></div>`).join("")}</div></section>
    ${evidenceNote()}`;
}

function memberBandOptions() {
  return ['<option value="all">All members</option>', ...state.model.raid.progressionBands.filter((band) => band.id !== "none").map((band) => `<option value="${escapeAttr(band.id)}"${state.memberBand === band.id ? " selected" : ""}>Has ${escapeHtml(band.label)} eligible unit</option>`)].join("");
}

function membersPage() {
  const rows = filterGuildOrder66Members(state.model.members, { search: state.memberSearch, band: state.memberBand });
  return `${header("Raid Member Depth", "Review every hydrated guild member's Order 66-eligible roster across the official progression bands. Five-character-pool counts are roster arithmetic only, not predicted raid attempts or scores.")}
    <section class="guild-page-card guild-raid-controls"><label>Search Members<input id="guildRaidMemberSearch" value="${escapeAttr(state.memberSearch)}" placeholder="Member, Ally Code, eligible unit…"></label><label>Progression Filter<select id="guildRaidMemberBand">${memberBandOptions()}</select></label><div class="guild-raid-count">${number(rows.length)} members</div></section>
    <section class="guild-page-card"><div class="guild-raid-table-wrap"><table class="guild-raid-table guild-raid-member-table"><thead><tr><th>Member</th><th>Eligible Owned</th><th>G12</th><th>R1</th><th>R3</th><th>R5</th><th>R7</th><th>R8</th><th>R9</th><th>5-Char R7 Pools</th><th>Strongest Eligible</th><th>Player</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.memberName)}</strong><small>${number(row.memberGp)} GP · ${escapeHtml(row.allyCode)}</small></td><td>${number(row.eligibleOwnedCount)}</td><td>${number(row.bands.g12)}</td><td>${number(row.bands.r1)}</td><td>${number(row.bands.r3)}</td><td>${number(row.bands.r5)}</td><td><strong>${number(row.bands.r7)}</strong></td><td>${number(row.bands.r8)}</td><td><strong>${number(row.bands.r9)}</strong></td><td>${number(row.fiveCharacterPools.r7)}</td><td><div class="guild-raid-tags">${row.strongestEligible.slice(0, 5).map((unit) => `<span>${escapeHtml(unit.name)} · ${escapeHtml(unit.progression)}</span>`).join("")}</div></td><td>${row.allyCode ? `<a class="guild-unit-player-link" href="${escapeAttr(playerLink(row.allyCode))}">Open Roster →</a>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>
    ${evidenceNote()}`;
}

function unitGroupOptions() {
  const groups = [...new Set(state.model.units.map((row) => row.raidGroup))].sort();
  return ['<option value="All">All eligible groups</option>', ...groups.map((group) => `<option value="${escapeAttr(group)}"${state.unitGroup === group ? " selected" : ""}>${escapeHtml(group)}</option>`)].join("");
}

function unitsPage() {
  const rows = filterGuildOrder66Units(state.model.units, { search: state.unitSearch, group: state.unitGroup, sort: state.unitSort });
  return `${header("Eligible Unit Coverage", "Inspect every Order 66-eligible character across the current guild. Ownership and progression can be drilled into the generic Guild Unit Matrix for member-level detail.")}
    <section class="guild-page-card guild-raid-controls guild-raid-unit-controls"><label>Search Units<input id="guildRaidUnitSearch" value="${escapeAttr(state.unitSearch)}" placeholder="Mace, Pirate, Appo…"></label><label>Eligibility Group<select id="guildRaidUnitGroup">${unitGroupOptions()}</select></label><label>Sort<select id="guildRaidUnitSort"><option value="r7">R7 ownership</option><option value="r9"${state.unitSort === "r9" ? " selected" : ""}>R9 ownership</option><option value="owners"${state.unitSort === "owners" ? " selected" : ""}>Total owners</option><option value="scarcity"${state.unitSort === "scarcity" ? " selected" : ""}>Scarce first</option><option value="name"${state.unitSort === "name" ? " selected" : ""}>Name</option></select></label><div class="guild-raid-count">${number(rows.length)} units</div></section>
    <section class="guild-page-card"><div class="guild-raid-table-wrap"><table class="guild-raid-table"><thead><tr><th>Eligible Unit</th><th>Group</th><th>Owners</th><th>G12</th><th>R3</th><th>R5</th><th>R7</th><th>R8</th><th>R9</th><th>Ownership</th><th>Resolution</th><th>Guild Detail</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(row.raidGroup)}</td><td><strong>${number(row.owners)}</strong></td><td>${number(row.counts.g12)}</td><td>${number(row.counts.r3)}</td><td>${number(row.counts.r5)}</td><td><strong>${number(row.counts.r7)}</strong></td><td>${number(row.counts.r8)}</td><td><strong>${number(row.counts.r9)}</strong></td><td>${row.ownershipPercent}%</td><td><span class="guild-raid-source ${escapeAttr(row.eligibilitySource === "catalog-tag" ? "tag" : "fallback")}">${escapeHtml(row.eligibilitySource)}</span></td><td><a class="guild-unit-player-link" href="${escapeAttr(unitMatrixLink(row.baseId))}">Open Unit Matrix →</a></td></tr>`).join("")}</tbody></table></div></section>
    ${evidenceNote()}`;
}

function milestonesPage() {
  return `${header("Order 66 Guild Milestones", "Reference the official Order 66 guild milestone score thresholds and Raid MK currency rewards. These are target thresholds only; no guild score is projected from roster depth.")}
    <section class="guild-page-card"><div class="guild-raid-table-wrap"><table class="guild-raid-table guild-raid-milestone-table"><thead><tr><th>Tier</th><th>Guild Score Threshold</th><th>Raid MK I</th><th>Raid MK II</th><th>Raid MK III</th></tr></thead><tbody>${state.model.raid.guildMilestones.map((row) => `<tr><td><strong>${number(row.tier)}</strong></td><td><strong>${number(row.score)}</strong></td><td>${number(row.mk1)}</td><td>${number(row.mk2)}</td><td>${number(row.mk3)}</td></tr>`).join("")}</tbody></table></div><p class="workspace-note">Official Order 66 milestone table encoded as versioned reference data. Personal milestones are outside this Guild capability page.</p></section>
    ${evidenceNote()}`;
}

function renderWithFocus(id) {
  render();
  const input = document.getElementById(id);
  if (!input) return;
  input.focus();
  const length = String(input.value || "").length;
  input.setSelectionRange?.(length, length);
}

function wireMembers() {
  document.getElementById("guildRaidMemberSearch")?.addEventListener("input", (event) => { state.memberSearch = event.target.value; renderWithFocus("guildRaidMemberSearch"); });
  document.getElementById("guildRaidMemberBand")?.addEventListener("change", (event) => { state.memberBand = event.target.value; render(); });
}

function wireUnits() {
  document.getElementById("guildRaidUnitSearch")?.addEventListener("input", (event) => { state.unitSearch = event.target.value; renderWithFocus("guildRaidUnitSearch"); });
  document.getElementById("guildRaidUnitGroup")?.addEventListener("change", (event) => { state.unitGroup = event.target.value; render(); });
  document.getElementById("guildRaidUnitSort")?.addEventListener("change", (event) => { state.unitSort = event.target.value; render(); });
}

function render() {
  if (!state.target || !state.model) return;
  if (state.section === "order66") state.target.innerHTML = order66Page();
  else if (state.section === "members") state.target.innerHTML = membersPage();
  else if (state.section === "units") state.target.innerHTML = unitsPage();
  else if (state.section === "milestones") state.target.innerHTML = milestonesPage();
  else state.target.innerHTML = overviewPage();
  if (state.section === "members") wireMembers();
  if (state.section === "units") wireUnits();
}

export function renderGuildOrder66Page({ target, guildBody, catalog, allyCode, section = "overview" } = {}) {
  if (!target || !guildBody || !Array.isArray(catalog)) return;
  state.target = target;
  state.guildBody = guildBody;
  state.catalog = catalog;
  state.allyCode = digits(allyCode);
  state.section = section;
  state.model = buildGuildOrder66Capability(guildBody, catalog);
  render();
}
