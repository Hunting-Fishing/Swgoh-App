import {
  buildGuildRosterSnapshot,
  compactGuildSnapshot,
  compareGuildSnapshots,
  filterGuildMembers,
} from "./guild-page-model.js";

const state = {
  allyCode: "",
  guildBody: null,
  snapshot: null,
  previous: null,
  delta: null,
  catalog: null,
  loading: false,
  active: "overview",
  cache: "",
  ageSeconds: 0,
  search: "",
  status: "All",
  sort: "gp",
  selectedMemberId: "",
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function formatAllyCode(value) {
  const code = digits(value);
  return code.length === 9 ? code.replace(/(\d{3})(?=\d)/g, "$1-") : code || "N/A";
}

function formatTime(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function snapshotKey(guildId) {
  return guildId ? `swgoh:guild-command:last-snapshot:${guildId}` : "";
}

function readPreviousSnapshot(guildId) {
  const key = snapshotKey(guildId);
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && Array.isArray(parsed.members) ? parsed : null;
  } catch {
    return null;
  }
}

function saveCurrentSnapshot(snapshot) {
  const key = snapshotKey(snapshot?.guild?.id);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(compactGuildSnapshot(snapshot)));
  } catch {
    // Snapshot history is optional; live roster remains available.
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return { body, response };
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const { body } = await fetchJson("/data/catalog.json?guild-command-page=1");
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  return state.catalog;
}

async function loadGuild(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9 || state.loading) {
    renderEmpty();
    return;
  }
  if (!force && state.snapshot && state.allyCode === allyCode) {
    render();
    return;
  }

  state.loading = true;
  renderLoading();
  try {
    const url = `/api/guild/by-player/${allyCode}/roster${force ? "?refresh=1" : ""}`;
    const [{ body: guildBody, response }, catalog] = await Promise.all([fetchJson(url), loadCatalog()]);
    if (!Array.isArray(guildBody?.members)) throw new Error("Live guild roster returned no member list.");
    const snapshot = buildGuildRosterSnapshot(guildBody, catalog);
    const previous = readPreviousSnapshot(snapshot.guild.id);
    state.allyCode = allyCode;
    state.guildBody = guildBody;
    state.snapshot = snapshot;
    state.previous = previous;
    state.delta = compareGuildSnapshots(previous, compactGuildSnapshot(snapshot));
    state.cache = String(response.headers.get("X-Guild-Cache") || "");
    state.ageSeconds = Number(response.headers.get("Age") || 0);
    saveCurrentSnapshot(snapshot);
    render();
    window.__swgohGuildCommandSnapshot = snapshot;
    window.dispatchEvent(new CustomEvent("swgoh:guild-command-snapshot", { detail: { snapshot, force } }));
  } catch (error) {
    renderError(error?.message || "Guild roster is unavailable.");
  } finally {
    state.loading = false;
  }
}

function stat(label, value, detail = "") {
  return `<div class="guild-page-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function capabilityCard(kicker, title, status, body, actionTab) {
  return `<article class="guild-capability-card"><div class="kicker">${escapeHtml(kicker)}</div><div class="guild-capability-title"><h3>${escapeHtml(title)}</h3><span>${escapeHtml(status)}</span></div><p>${escapeHtml(body)}</p><button type="button" data-guild-section-jump="${escapeAttr(actionTab)}">Open ${escapeHtml(title)}</button></article>`;
}

function renderHeader() {
  const snapshot = state.snapshot;
  const target = $("guildPageHeader");
  if (!target || !snapshot) return;
  const hydration = snapshot.hydration;
  const sourceTime = snapshot.fetchedAt || state.guildBody?.fetchedAt;
  const sourceLabel = state.cache ? `${state.cache}${state.ageSeconds ? ` · ${state.ageSeconds}s old` : ""}` : snapshot.source;
  target.innerHTML = `
    <div class="guild-page-identity">
      <div class="kicker">LIVE GUILD COMMAND CENTER</div>
      <h1>${escapeHtml(snapshot.guild.name)}</h1>
      <p>Current guild membership and hydrated member rosters are the shared foundation for Territory Battles, Territory Wars and Raids.</p>
      <div class="guild-page-meta"><span>${number(snapshot.guild.galacticPower)} GP</span><span>${number(snapshot.summary.totalMembers)} members</span><span>${hydration.complete ? "Full roster hydration" : `${number(hydration.hydrated)}/${number(hydration.requested)} hydrated`}</span></div>
    </div>
    <div class="guild-page-freshness">
      <span class="guild-page-live ${hydration.complete ? "ready" : "partial"}">${hydration.complete ? "ROSTER READY" : "PARTIAL ROSTER"}</span>
      <small>Source: ${escapeHtml(sourceLabel || "live")}</small>
      <small>Fetched: ${escapeHtml(formatTime(sourceTime))}</small>
      <button id="guildPageRefreshNow" type="button">Refresh Guild Now</button>
    </div>`;
  $("guildPageRefreshNow")?.addEventListener("click", () => loadGuild(true));
}

function renderOverview() {
  const target = $("guildPageOverview");
  const snapshot = state.snapshot;
  if (!target || !snapshot) return;
  const s = snapshot.summary;
  target.innerHTML = `
    <div class="guild-page-stat-grid">
      ${stat("Guild GP", number(s.guildGp))}
      ${stat("Average Member GP", number(s.averageGp))}
      ${stat("Median Member GP", number(s.medianGp))}
      ${stat("Character GP", number(s.characterGp), "Hydrated rosters")}
      ${stat("Ship GP", number(s.shipGp), "Hydrated rosters")}
      ${stat("Galactic Legends", number(s.galacticLegends), "Catalog-derived")}
      ${stat("R7+ Characters", number(s.relic7Characters))}
      ${stat("R9 Characters", number(s.relic9Characters))}
    </div>
    <div class="guild-page-two-col">
      <section class="guild-page-card"><div class="kicker">MEMBERSHIP WATCH</div><h2>Guild changes since last browser snapshot</h2>${membershipDeltaHtml()}</section>
      <section class="guild-page-card"><div class="kicker">ROSTER RANGE</div><h2>Member power distribution</h2><div class="guild-roster-range">${stat("Highest GP", number(s.highestGp))}${stat("Median GP", number(s.medianGp))}${stat("Lowest GP", number(s.lowestGp))}${stat("7★ Ships", number(s.sevenStarShips))}</div></section>
    </div>
    <div class="guild-capability-grid">
      ${capabilityCard("TERRITORY BATTLES", "TB Command", "Operational", "Verified ROTE mission coverage, Operations assignments, roster protection, phase command and farm priorities use this guild snapshot.", "tb")}
      ${capabilityCard("TERRITORY WARS", "TW Command", "Roster foundation", "Guild GP, GL depth, relic depth, ship strength and member distribution are ready for the next defense/offense assignment model.", "tw")}
      ${capabilityCard("RAIDS", "Raid Command", "Roster foundation", "The hydrated roster is ready for raid-specific eligibility, team coverage and scoring once current raid rules are encoded.", "raids")}
    </div>`;
  wireSectionJumps(target);
}

function membershipDeltaHtml() {
  const delta = state.delta;
  if (!delta?.hasPrevious) return '<p class="workspace-note">First snapshot on this browser. Refresh later to detect joins, departures, renames and member GP changes.</p>';
  if (!delta.changed) return '<div class="guild-membership-clean">No membership or member-GP changes detected since the previous saved snapshot.</div>';
  const rows = [];
  for (const member of delta.joined) rows.push(`<div class="guild-change joined"><strong>JOINED</strong><span>${escapeHtml(member.name || member.id)}</span><small>${number(member.galacticPower)} GP</small></div>`);
  for (const member of delta.left) rows.push(`<div class="guild-change left"><strong>LEFT</strong><span>${escapeHtml(member.name || member.id)}</span><small>${number(member.galacticPower)} GP at prior snapshot</small></div>`);
  for (const row of delta.renamed) rows.push(`<div class="guild-change renamed"><strong>RENAMED</strong><span>${escapeHtml(row.before)} → ${escapeHtml(row.after)}</span></div>`);
  for (const row of delta.gpChanges.slice(0, 10)) rows.push(`<div class="guild-change gp"><strong>${row.delta >= 0 ? "+" : ""}${number(row.delta)} GP</strong><span>${escapeHtml(row.name)}</span><small>${number(row.before)} → ${number(row.after)}</small></div>`);
  return `<div class="guild-change-list">${rows.join("")}</div><p class="workspace-note">Membership history is browser-local in this version. Shared officer history will move to server persistence.</p>`;
}

function renderMembers() {
  const target = $("guildPageMembers");
  if (!target || !state.snapshot) return;
  const rows = filterGuildMembers(state.snapshot.members, { search: state.search, status: state.status, sort: state.sort });
  const selected = state.snapshot.members.find((row) => row.id === state.selectedMemberId) || null;
  target.innerHTML = `
    <div class="guild-members-toolbar">
      <label>Search<input id="guildPageMemberSearch" value="${escapeAttr(state.search)}" placeholder="Member, Ally Code, Galactic Legend…"></label>
      <label>Roster<select id="guildPageMemberStatus"><option value="All">All members</option><option value="Hydrated"${state.status === "Hydrated" ? " selected" : ""}>Hydrated</option><option value="Unavailable"${state.status === "Unavailable" ? " selected" : ""}>Unavailable</option></select></label>
      <label>Sort<select id="guildPageMemberSort"><option value="gp"${state.sort === "gp" ? " selected" : ""}>Total GP</option><option value="characterGp"${state.sort === "characterGp" ? " selected" : ""}>Character GP</option><option value="shipGp"${state.sort === "shipGp" ? " selected" : ""}>Ship GP</option><option value="gl"${state.sort === "gl" ? " selected" : ""}>Galactic Legends</option><option value="relic7"${state.sort === "relic7" ? " selected" : ""}>R7+ Depth</option><option value="name"${state.sort === "name" ? " selected" : ""}>Name</option></select></label>
      <div class="guild-member-count">${number(rows.length)} shown</div>
    </div>
    <div class="guild-members-layout">
      <div class="guild-members-table-wrap"><table class="guild-members-table"><thead><tr><th>Member</th><th>Total GP</th><th>Character GP</th><th>Ship GP</th><th>GLs</th><th>R7+</th><th>R9</th><th>Roster</th></tr></thead><tbody>${rows.map(memberRowHtml).join("")}</tbody></table></div>
      <aside id="guildMemberDetail" class="guild-member-detail">${selected ? memberDetailHtml(selected) : '<div class="workspace-note">Select a guild member to inspect roster depth and top units.</div>'}</aside>
    </div>`;
  $("guildPageMemberSearch")?.addEventListener("input", (event) => { state.search = event.target.value; renderMembers(); });
  $("guildPageMemberStatus")?.addEventListener("change", (event) => { state.status = event.target.value; renderMembers(); });
  $("guildPageMemberSort")?.addEventListener("change", (event) => { state.sort = event.target.value; renderMembers(); });
  for (const row of target.querySelectorAll("[data-guild-member-id]")) row.addEventListener("click", () => { state.selectedMemberId = row.dataset.guildMemberId; renderMembers(); });
  $("guildPageLoadMember")?.addEventListener("click", loadSelectedMember);
}

function memberRowHtml(member) {
  return `<tr data-guild-member-id="${escapeAttr(member.id)}" class="${member.id === state.selectedMemberId ? "selected" : ""}"><td><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(formatAllyCode(member.allyCode))}</small></td><td>${number(member.galacticPower)}</td><td>${number(member.characterGp)}</td><td>${number(member.shipGp)}</td><td><strong>${number(member.galacticLegendCount)}</strong></td><td>${number(member.relic7)}</td><td>${number(member.relic9)}</td><td><span class="guild-roster-state ${member.rosterAvailable ? "ready" : "missing"}">${member.rosterAvailable ? "READY" : "UNAVAILABLE"}</span></td></tr>`;
}

function memberDetailHtml(member) {
  const gls = member.galacticLegends.length ? member.galacticLegends.map((row) => `<span>${escapeHtml(row.name)} · R${number(row.relic)}</span>`).join("") : '<span>None detected</span>';
  const top = member.topUnits.length ? member.topUnits.map((row) => `<div><strong>${escapeHtml(row.name)}</strong><small>${row.unitType === "Ship" ? `${number(row.stars)}★` : `R${number(row.relic)}`} · ${number(row.power)} GP</small></div>`).join("") : '<p class="workspace-note">Roster detail unavailable.</p>';
  return `<div class="kicker">MEMBER ROSTER</div><h3>${escapeHtml(member.name)}</h3><p>${escapeHtml(formatAllyCode(member.allyCode))} · ${number(member.galacticPower)} GP</p><div class="guild-member-mini-stats">${stat("Characters", number(member.characterCount))}${stat("Ships", number(member.shipCount))}${stat("R5+", number(member.relic5))}${stat("R7+", number(member.relic7))}</div><h4>Galactic Legends</h4><div class="guild-gl-list">${gls}</div><h4>Top roster units</h4><div class="guild-top-units">${top}</div>${member.allyCode ? '<button id="guildPageLoadMember" type="button">Load This Member</button>' : ""}`;
}

function loadSelectedMember() {
  const member = state.snapshot?.members.find((row) => row.id === state.selectedMemberId);
  if (!member?.allyCode) return;
  const input = $("allyCode");
  if (!input) return;
  input.value = formatAllyCode(member.allyCode);
  $("allyForm")?.requestSubmit();
}

function renderTw() {
  const target = $("guildPageTw");
  if (!target || !state.snapshot) return;
  const s = state.snapshot.summary;
  const leaders = state.snapshot.members.filter((row) => row.rosterAvailable).slice().sort((a, b) => b.galacticLegendCount - a.galacticLegendCount || b.relic7 - a.relic7 || b.galacticPower - a.galacticPower).slice(0, 12);
  target.innerHTML = `<section class="guild-page-card"><div class="kicker">TERRITORY WAR ROSTER FOUNDATION</div><h2>Guild combat depth</h2><p>These are factual roster-depth metrics, not a TW win/readiness score. Defense/offense team assignments will be layered on this normalized guild roster.</p><div class="guild-page-stat-grid compact">${stat("Guild GP", number(s.guildGp))}${stat("GLs", number(s.galacticLegends))}${stat("R7+", number(s.relic7Characters))}${stat("R9", number(s.relic9Characters))}${stat("Character GP", number(s.characterGp))}${stat("Ship GP", number(s.shipGp))}</div></section><section class="guild-page-card"><div class="kicker">HIGH-END DEPTH</div><h2>Members carrying the deepest TW rosters</h2><div class="guild-rank-list">${leaders.map((member, index) => `<div><strong>#${index + 1} ${escapeHtml(member.name)}</strong><span>${number(member.galacticLegendCount)} GL · ${number(member.relic7)} R7+ · ${number(member.galacticPower)} GP</span></div>`).join("")}</div></section><section class="guild-page-card guild-next-model"><strong>Next TW layer</strong><span>Encode squad ownership, defense/offense availability, counters, datacrons and member assignment limits against this same guild snapshot.</span></section>`;
}

function renderRaids() {
  const target = $("guildPageRaids");
  if (!target || !state.snapshot) return;
  const s = state.snapshot.summary;
  const depth = state.snapshot.members.filter((row) => row.rosterAvailable).slice().sort((a, b) => b.relic7 - a.relic7 || b.relic5 - a.relic5 || b.galacticPower - a.galacticPower).slice(0, 12);
  target.innerHTML = `<section class="guild-page-card"><div class="kicker">RAID ROSTER FOUNDATION</div><h2>Guild progression depth</h2><p>The Guild Page now has the roster foundation needed for raid eligibility and team scoring. Current raid-specific rules must be encoded before this becomes a raid readiness score.</p><div class="guild-page-stat-grid compact">${stat("Hydrated Members", `${number(s.hydratedMembers)} / ${number(s.totalMembers)}`)}${stat("R7+ Characters", number(s.relic7Characters))}${stat("R9 Characters", number(s.relic9Characters))}${stat("7★ Ships", number(s.sevenStarShips))}</div></section><section class="guild-page-card"><div class="kicker">RELIC DEPTH</div><h2>Members with the deepest high-relic rosters</h2><div class="guild-rank-list">${depth.map((member, index) => `<div><strong>#${index + 1} ${escapeHtml(member.name)}</strong><span>${number(member.relic5)} R5+ · ${number(member.relic7)} R7+ · ${number(member.relic9)} R9</span></div>`).join("")}</div></section><section class="guild-page-card guild-next-model"><strong>Next Raid layer</strong><span>Load current raid unit restrictions, teams, difficulty gates and score bands, then calculate member and guild coverage from this live roster.</span></section>`;
}

function wireSectionJumps(root) {
  for (const button of root.querySelectorAll("[data-guild-section-jump]")) button.addEventListener("click", () => activateSection(button.dataset.guildSectionJump));
}

function activateSection(id) {
  const valid = ["overview", "members", "tb", "tw", "raids"];
  state.active = valid.includes(id) ? id : "overview";
  for (const button of document.querySelectorAll("[data-guild-page-tab]")) button.classList.toggle("active", button.dataset.guildPageTab === state.active);
  for (const panel of document.querySelectorAll("[data-guild-page-panel]")) panel.hidden = panel.dataset.guildPagePanel !== state.active;
  if (state.active === "members") renderMembers();
  if (state.active === "tw") renderTw();
  if (state.active === "raids") renderRaids();
}

function render() {
  if (!state.snapshot) return;
  renderHeader();
  renderOverview();
  renderMembers();
  renderTw();
  renderRaids();
  activateSection(state.active);
}

function renderLoading() {
  const header = $("guildPageHeader");
  if (header) header.innerHTML = '<div class="guild-page-loading"><strong>Refreshing guild roster…</strong><span>Hydrating current membership and member rosters from the live gateway.</span></div>';
}

function renderError(message) {
  const header = $("guildPageHeader");
  if (header) header.innerHTML = `<div class="workspace-error">${escapeHtml(message)}</div>`;
}

function renderEmpty() {
  const header = $("guildPageHeader");
  if (header && !state.snapshot) header.innerHTML = '<div class="guild-page-loading"><strong>Load an Ally Code</strong><span>The Guild Page will identify the player’s current guild and build the full guild roster.</span></div>';
}

function buildPage(panel) {
  if ($("guildCommandPage")) return;
  const existing = [...panel.children];
  const page = document.createElement("div");
  page.id = "guildCommandPage";
  page.className = "guild-command-page";
  page.innerHTML = `
    <section id="guildPageHeader" class="guild-page-header"></section>
    <nav class="guild-page-tabs" aria-label="Guild command sections"><button type="button" class="active" data-guild-page-tab="overview">Overview</button><button type="button" data-guild-page-tab="members">Members</button><button type="button" data-guild-page-tab="tb">Territory Battles</button><button type="button" data-guild-page-tab="tw">Territory Wars</button><button type="button" data-guild-page-tab="raids">Raids</button></nav>
    <section data-guild-page-panel="overview" id="guildPageOverview" class="guild-page-panel"></section>
    <section data-guild-page-panel="members" id="guildPageMembers" class="guild-page-panel" hidden></section>
    <section data-guild-page-panel="tb" id="guildPageTb" class="guild-page-panel" hidden><div class="guild-section-heading"><div><div class="kicker">TERRITORY BATTLES</div><h2>TB Officer Command</h2><p>All existing ROTE mission coverage, Operations, phase command, farm, strategy and officer tools remain available below.</p></div></div><div id="guildPageTbTools" class="guild-page-tb-tools"></div></section>
    <section data-guild-page-panel="tw" id="guildPageTw" class="guild-page-panel" hidden></section>
    <section data-guild-page-panel="raids" id="guildPageRaids" class="guild-page-panel" hidden></section>`;
  panel.replaceChildren(page);
  const tbTools = $("guildPageTbTools");
  for (const node of existing) tbTools.appendChild(node);

  for (const button of page.querySelectorAll("[data-guild-page-tab]")) button.addEventListener("click", () => activateSection(button.dataset.guildPageTab));
  const observer = new MutationObserver(() => {
    for (const child of [...panel.children]) if (child !== page) tbTools.appendChild(child);
  });
  observer.observe(panel, { childList: true });
  renderEmpty();
}

function install() {
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel) return;
  buildPage(panel);
  const guildTab = document.querySelector('button[data-workspace-tab="guild"]');
  if (guildTab) {
    guildTab.textContent = "Guild";
    guildTab.addEventListener("click", () => loadGuild(false));
  }
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.guildBody = null;
    state.snapshot = null;
    state.previous = null;
    state.delta = null;
    state.selectedMemberId = "";
    setTimeout(() => {
      if (location.hash.toLowerCase() === "#guild") loadGuild(true);
    }, 450);
  });
  if (location.hash.toLowerCase() === "#guild") loadGuild(false);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
