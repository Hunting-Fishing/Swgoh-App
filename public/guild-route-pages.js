import {
  buildGuildRosterSnapshot,
  compactGuildSnapshot,
  compareGuildSnapshots,
  filterGuildMembers,
} from "./guild-page-model.js";

const ROUTES = Object.freeze([
  ["overview", "/guild", "Overview"],
  ["members", "/guild/members", "Members"],
  ["tb", "/guild/tb", "Territory Battles"],
  ["tw", "/guild/tw", "Territory Wars"],
  ["raids", "/guild/raids", "Raids"],
]);
const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";

const state = {
  route: "overview",
  catalog: null,
  guildBody: null,
  snapshot: null,
  delta: null,
  cache: "",
  ageSeconds: 0,
  loading: false,
  memberSearch: "",
  memberStatus: "All",
  memberSort: "gp",
  selectedMemberId: "",
  tbTools: null,
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

function isGuildRoute() {
  return location.pathname === "/guild" || location.pathname === "/guild/" || location.pathname.startsWith("/guild/");
}

function routeFromPath(pathname = location.pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = ROUTES.find(([, path]) => path === normalized);
  return match?.[0] || "overview";
}

function currentAllyCode() {
  const query = digits(new URLSearchParams(location.search).get("allyCode"));
  const input = digits($("allyCode")?.value);
  const snapshot = digits(window.__swgohLiveSnapshot?.allyCode || window.__swgohLiveSnapshot?.body?.player?.allyCode);
  let stored = "";
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, snapshot, stored].find((code) => code.length === 9) || "";
}

function rememberAllyCode(value) {
  const code = digits(value);
  if (code.length !== 9) return "";
  try { localStorage.setItem(ALLY_STORAGE_KEY, code); } catch {}
  return code;
}

function routeUrl(path, allyCode = currentAllyCode()) {
  const code = digits(allyCode);
  return code.length === 9 ? `${path}?allyCode=${encodeURIComponent(code)}` : path;
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
  try { localStorage.setItem(key, JSON.stringify(compactGuildSnapshot(snapshot))); } catch {}
}

function formatAllyCode(value) {
  const code = digits(value);
  return code.length === 9 ? code.replace(/(\d{3})(?=\d)/g, "$1-") : code || "";
}

function formatTime(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return { body, response };
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const { body } = await fetchJson("/data/catalog.json?guild-routes=1");
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  return state.catalog;
}

async function loadGuild(force = false) {
  const allyCode = rememberAllyCode($("allyCode")?.value || currentAllyCode());
  if (allyCode.length !== 9 || state.loading) {
    renderNeedsAllyCode();
    return;
  }
  state.loading = true;
  setHeaderLoading();
  try {
    const url = `/api/guild/by-player/${allyCode}/roster${force ? "?refresh=1" : ""}`;
    const [{ body: guildBody, response }, catalog] = await Promise.all([fetchJson(url), loadCatalog()]);
    if (!Array.isArray(guildBody?.members)) throw new Error("Live guild roster returned no member list.");
    const snapshot = buildGuildRosterSnapshot(guildBody, catalog);
    const previous = readPreviousSnapshot(snapshot.guild.id);
    state.guildBody = guildBody;
    state.snapshot = snapshot;
    state.delta = compareGuildSnapshots(previous, compactGuildSnapshot(snapshot));
    state.cache = String(response.headers.get("X-Guild-Cache") || "");
    state.ageSeconds = Number(response.headers.get("Age") || 0);
    saveCurrentSnapshot(snapshot);
    renderHeader();
    renderActivePage();
    updateRouteLinks(allyCode);
    window.__swgohGuildCommandSnapshot = snapshot;
    window.dispatchEvent(new CustomEvent("swgoh:guild-command-snapshot", { detail: { snapshot, force, route: state.route } }));
  } catch (error) {
    renderRouteError(error?.message || "Guild roster is unavailable.");
  } finally {
    state.loading = false;
  }
}

function stat(label, value, detail = "") {
  return `<div class="guild-page-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function renderHeader() {
  const target = $("guildRouteHeader");
  const snapshot = state.snapshot;
  if (!target || !snapshot) return;
  const hydration = snapshot.hydration;
  const sourceTime = snapshot.fetchedAt || state.guildBody?.fetchedAt;
  const sourceLabel = state.cache ? `${state.cache}${state.ageSeconds ? ` · ${state.ageSeconds}s old` : ""}` : snapshot.source;
  target.innerHTML = `
    <div class="guild-page-identity">
      <div class="kicker">LIVE GUILD COMMAND CENTER</div>
      <h1>${escapeHtml(snapshot.guild.name)}</h1>
      <p>One guild roster authority for member management, Territory Battles, Territory Wars and Raids.</p>
      <div class="guild-page-meta"><span>${number(snapshot.guild.galacticPower)} GP</span><span>${number(snapshot.summary.totalMembers)} members</span><span>${hydration.complete ? "Full roster hydration" : `${number(hydration.hydrated)}/${number(hydration.requested)} hydrated`}</span></div>
    </div>
    <div class="guild-page-freshness">
      <span class="guild-page-live ${hydration.complete ? "ready" : "partial"}">${hydration.complete ? "ROSTER READY" : "PARTIAL ROSTER"}</span>
      <small>Source: ${escapeHtml(sourceLabel || "live")}</small>
      <small>Fetched: ${escapeHtml(formatTime(sourceTime))}</small>
      <button id="guildRouteRefreshNow" type="button">Refresh Guild Now</button>
    </div>`;
  $("guildRouteRefreshNow")?.addEventListener("click", () => loadGuild(true));
}

function setHeaderLoading() {
  const target = $("guildRouteHeader");
  if (target) target.innerHTML = '<div class="guild-page-loading"><strong>Refreshing guild roster…</strong><span>Hydrating current guild membership and member rosters from the shared live guild service.</span></div>';
}

function renderNeedsAllyCode() {
  const target = $("guildRouteHeader");
  if (target) target.innerHTML = '<div class="guild-page-loading"><strong>Load a Guild</strong><span>Enter any current guild member Ally Code above. The app will identify the guild and hydrate its current member roster.</span></div>';
  const content = $("guildRouteContent");
  if (content && state.route !== "tb") content.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Guild data is not loaded yet.</div></section>';
}

function renderRouteError(message) {
  const target = $("guildRouteHeader");
  if (target) target.innerHTML = `<div class="workspace-error">${escapeHtml(message)}</div>`;
}

function membershipDeltaHtml() {
  const delta = state.delta;
  if (!delta?.hasPrevious) return '<p class="workspace-note">First saved snapshot on this browser. Refresh later to detect joins, departures, renames and member GP changes.</p>';
  if (!delta.changed) return '<div class="guild-membership-clean">No membership or member-GP changes detected since the previous saved snapshot.</div>';
  const rows = [];
  for (const member of delta.joined) rows.push(`<div class="guild-change joined"><strong>JOINED</strong><span>${escapeHtml(member.name || member.id)}</span><small>${number(member.galacticPower)} GP</small></div>`);
  for (const member of delta.left) rows.push(`<div class="guild-change left"><strong>LEFT</strong><span>${escapeHtml(member.name || member.id)}</span><small>${number(member.galacticPower)} GP at prior snapshot</small></div>`);
  for (const row of delta.renamed) rows.push(`<div class="guild-change renamed"><strong>RENAMED</strong><span>${escapeHtml(row.before)} → ${escapeHtml(row.after)}</span></div>`);
  for (const row of delta.gpChanges.slice(0, 10)) rows.push(`<div class="guild-change gp"><strong>${row.delta >= 0 ? "+" : ""}${number(row.delta)} GP</strong><span>${escapeHtml(row.name)}</span><small>${number(row.before)} → ${number(row.after)}</small></div>`);
  return `<div class="guild-change-list">${rows.join("")}</div><p class="workspace-note">Membership history is browser-local in this version; the live roster itself comes from the shared server guild service.</p>`;
}

function renderOverview() {
  const target = $("guildRouteContent");
  const snapshot = state.snapshot;
  if (!target || !snapshot) return;
  const s = snapshot.summary;
  const code = currentAllyCode();
  target.innerHTML = `
    <section class="guild-route-page-heading"><div><div class="kicker">GUILD OVERVIEW</div><h2>Guild Capability Dashboard</h2><p>High-level guild roster facts only. Detailed operational tools live on their own pages.</p></div></section>
    <div class="guild-page-stat-grid">
      ${stat("Guild GP", number(s.guildGp))}${stat("Average Member GP", number(s.averageGp))}${stat("Median Member GP", number(s.medianGp))}${stat("Character GP", number(s.characterGp), "Hydrated rosters")}
      ${stat("Ship GP", number(s.shipGp), "Hydrated rosters")}${stat("Galactic Legends", number(s.galacticLegends), "Catalog-derived")}${stat("R7+ Characters", number(s.relic7Characters))}${stat("R9 Characters", number(s.relic9Characters))}
    </div>
    <div class="guild-page-two-col">
      <section class="guild-page-card"><div class="kicker">MEMBERSHIP WATCH</div><h2>Guild changes</h2>${membershipDeltaHtml()}</section>
      <section class="guild-page-card"><div class="kicker">ROSTER RANGE</div><h2>Member power distribution</h2><div class="guild-roster-range">${stat("Highest GP", number(s.highestGp))}${stat("Median GP", number(s.medianGp))}${stat("Lowest GP", number(s.lowestGp))}${stat("7★ Ships", number(s.sevenStarShips))}</div></section>
    </div>
    <div class="guild-capability-grid guild-route-card-grid">
      ${routeCard("MEMBERS", "Guild Roster", "Inspect every current member, GP split, GLs and relic depth.", routeUrl("/guild/members", code))}
      ${routeCard("TERRITORY BATTLES", "TB Command", "ROTE Phase Command, missions, Operations, redundancy, farms and officer tools.", routeUrl("/guild/tb", code))}
      ${routeCard("TERRITORY WARS", "TW Command", "Guild combat-depth foundation for the dedicated offense/defense planner.", routeUrl("/guild/tw", code))}
      ${routeCard("RAIDS", "Raid Command", "Guild relic-depth foundation for raid eligibility, teams and scoring.", routeUrl("/guild/raids", code))}
    </div>`;
}

function routeCard(kicker, title, body, href) {
  return `<article class="guild-capability-card"><div class="kicker">${escapeHtml(kicker)}</div><div class="guild-capability-title"><h3>${escapeHtml(title)}</h3><span>OPEN PAGE</span></div><p>${escapeHtml(body)}</p><a class="guild-route-card-link" href="${escapeAttr(href)}">Open ${escapeHtml(title)} →</a></article>`;
}

function renderMembers() {
  const target = $("guildRouteContent");
  if (!target || !state.snapshot) return;
  const rows = filterGuildMembers(state.snapshot.members, { search: state.memberSearch, status: state.memberStatus, sort: state.memberSort });
  const selected = state.snapshot.members.find((row) => row.id === state.selectedMemberId) || null;
  target.innerHTML = `
    <section class="guild-route-page-heading"><div><div class="kicker">GUILD ROSTER</div><h2>Current Guild Members</h2><p>Live normalized member roster data used by TB, TW and Raid planning.</p></div></section>
    <div class="guild-members-toolbar">
      <label>Search<input id="guildRouteMemberSearch" value="${escapeAttr(state.memberSearch)}" placeholder="Member, Ally Code, Galactic Legend…"></label>
      <label>Roster<select id="guildRouteMemberStatus"><option value="All">All members</option><option value="Hydrated"${state.memberStatus === "Hydrated" ? " selected" : ""}>Hydrated</option><option value="Unavailable"${state.memberStatus === "Unavailable" ? " selected" : ""}>Unavailable</option></select></label>
      <label>Sort<select id="guildRouteMemberSort"><option value="gp"${state.memberSort === "gp" ? " selected" : ""}>Total GP</option><option value="characterGp"${state.memberSort === "characterGp" ? " selected" : ""}>Character GP</option><option value="shipGp"${state.memberSort === "shipGp" ? " selected" : ""}>Ship GP</option><option value="gl"${state.memberSort === "gl" ? " selected" : ""}>Galactic Legends</option><option value="relic7"${state.memberSort === "relic7" ? " selected" : ""}>R7+ Depth</option><option value="name"${state.memberSort === "name" ? " selected" : ""}>Name</option></select></label>
      <div class="guild-member-count">${number(rows.length)} shown</div>
    </div>
    <div class="guild-members-layout">
      <div class="guild-members-table-wrap"><table class="guild-members-table"><thead><tr><th>Member</th><th>Total GP</th><th>Character GP</th><th>Ship GP</th><th>GLs</th><th>R7+</th><th>R9</th><th>Roster</th></tr></thead><tbody>${rows.map(memberRowHtml).join("")}</tbody></table></div>
      <aside id="guildRouteMemberDetail" class="guild-member-detail">${selected ? memberDetailHtml(selected) : '<div class="workspace-note">Select a guild member to inspect roster depth and top units.</div>'}</aside>
    </div>`;
  $("guildRouteMemberSearch")?.addEventListener("input", (event) => { state.memberSearch = event.target.value; renderMembers(); });
  $("guildRouteMemberStatus")?.addEventListener("change", (event) => { state.memberStatus = event.target.value; renderMembers(); });
  $("guildRouteMemberSort")?.addEventListener("change", (event) => { state.memberSort = event.target.value; renderMembers(); });
  for (const row of target.querySelectorAll("[data-guild-route-member-id]")) row.addEventListener("click", () => { state.selectedMemberId = row.dataset.guildRouteMemberId; renderMembers(); });
}

function memberRowHtml(member) {
  return `<tr data-guild-route-member-id="${escapeAttr(member.id)}" class="${member.id === state.selectedMemberId ? "selected" : ""}"><td><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(formatAllyCode(member.allyCode))}</small></td><td>${number(member.galacticPower)}</td><td>${number(member.characterGp)}</td><td>${number(member.shipGp)}</td><td><strong>${number(member.galacticLegendCount)}</strong></td><td>${number(member.relic7)}</td><td>${number(member.relic9)}</td><td><span class="guild-roster-state ${member.rosterAvailable ? "ready" : "missing"}">${member.rosterAvailable ? "READY" : "UNAVAILABLE"}</span></td></tr>`;
}

function memberDetailHtml(member) {
  const gls = member.galacticLegends.length ? member.galacticLegends.map((row) => `<span>${escapeHtml(row.name)} · R${number(row.relic)}</span>`).join("") : '<span>None detected</span>';
  const top = member.topUnits.length ? member.topUnits.map((row) => `<div><strong>${escapeHtml(row.name)}</strong><small>${row.unitType === "Ship" ? `${number(row.stars)}★` : `R${number(row.relic)}`} · ${number(row.power)} GP</small></div>`).join("") : '<p class="workspace-note">Roster detail unavailable.</p>';
  const playerHref = member.allyCode ? `/?allyCode=${encodeURIComponent(digits(member.allyCode))}#roster` : "/#roster";
  return `<div class="kicker">MEMBER ROSTER</div><h3>${escapeHtml(member.name)}</h3><p>${escapeHtml(formatAllyCode(member.allyCode))} · ${number(member.galacticPower)} GP</p><div class="guild-member-mini-stats">${stat("Characters", number(member.characterCount))}${stat("Ships", number(member.shipCount))}${stat("R5+", number(member.relic5))}${stat("R7+", number(member.relic7))}</div><h4>Galactic Legends</h4><div class="guild-gl-list">${gls}</div><h4>Top roster units</h4><div class="guild-top-units">${top}</div>${member.allyCode ? `<a class="guild-member-player-link" href="${escapeAttr(playerHref)}">Open Player Roster →</a>` : ""}`;
}

function renderTw() {
  const target = $("guildRouteContent");
  if (!target || !state.snapshot) return;
  const s = state.snapshot.summary;
  const leaders = state.snapshot.members.filter((row) => row.rosterAvailable).slice().sort((a, b) => b.galacticLegendCount - a.galacticLegendCount || b.relic7 - a.relic7 || b.galacticPower - a.galacticPower).slice(0, 15);
  target.innerHTML = `
    <section class="guild-route-page-heading"><div><div class="kicker">TERRITORY WARS</div><h2>TW Guild Command</h2><p>Dedicated TW page. Current metrics are factual roster depth; no fabricated TW readiness or win score.</p></div></section>
    <div class="guild-page-stat-grid compact">${stat("Guild GP", number(s.guildGp))}${stat("GLs", number(s.galacticLegends))}${stat("R7+", number(s.relic7Characters))}${stat("R9", number(s.relic9Characters))}${stat("Character GP", number(s.characterGp))}${stat("Ship GP", number(s.shipGp))}</div>
    <section class="guild-page-card"><div class="kicker">HIGH-END COMBAT DEPTH</div><h2>Members carrying the deepest TW rosters</h2><div class="guild-rank-list">${leaders.map((member, index) => `<div><strong>#${index + 1} ${escapeHtml(member.name)}</strong><span>${number(member.galacticLegendCount)} GL · ${number(member.relic7)} R7+ · ${number(member.galacticPower)} GP</span></div>`).join("")}</div></section>
    <section class="guild-page-card guild-next-model"><strong>TW planner next layer</strong><span>Squad ownership, offense/defense availability, counters, datacrons, zone capacity and member assignment limits will live here—not on the home page.</span></section>`;
}

function renderRaids() {
  const target = $("guildRouteContent");
  if (!target || !state.snapshot) return;
  const s = state.snapshot.summary;
  const depth = state.snapshot.members.filter((row) => row.rosterAvailable).slice().sort((a, b) => b.relic7 - a.relic7 || b.relic5 - a.relic5 || b.galacticPower - a.galacticPower).slice(0, 15);
  target.innerHTML = `
    <section class="guild-route-page-heading"><div><div class="kicker">RAIDS</div><h2>Raid Guild Command</h2><p>Dedicated Raid page. Current metrics are roster depth only until current raid restrictions, teams and score bands are encoded.</p></div></section>
    <div class="guild-page-stat-grid compact">${stat("Hydrated Members", `${number(s.hydratedMembers)} / ${number(s.totalMembers)}`)}${stat("R7+ Characters", number(s.relic7Characters))}${stat("R9 Characters", number(s.relic9Characters))}${stat("7★ Ships", number(s.sevenStarShips))}</div>
    <section class="guild-page-card"><div class="kicker">RELIC DEPTH</div><h2>Members with the deepest high-relic rosters</h2><div class="guild-rank-list">${depth.map((member, index) => `<div><strong>#${index + 1} ${escapeHtml(member.name)}</strong><span>${number(member.relic5)} R5+ · ${number(member.relic7)} R7+ · ${number(member.relic9)} R9</span></div>`).join("")}</div></section>
    <section class="guild-page-card guild-next-model"><strong>Raid planner next layer</strong><span>Current raid eligibility, allowed units, teams, difficulty gates, expected score bands and guild score potential will live here.</span></section>`;
}

function renderTb() {
  const target = $("guildRouteContent");
  if (!target) return;
  target.innerHTML = '<section class="guild-route-page-heading"><div><div class="kicker">TERRITORY BATTLES</div><h2>TB Officer Command</h2><p>ROTE mission coverage, Phase Command, Operations, redundancy, farm priorities and officer tools are isolated on this page.</p></div></section>';
  if (state.tbTools) {
    state.tbTools.hidden = false;
    state.tbTools.dataset.workspacePanel = "guild";
    state.tbTools.classList.add("guild-page-tb-tools", "guild-route-tb-tools");
    target.appendChild(state.tbTools);
  } else {
    target.insertAdjacentHTML("beforeend", '<section class="guild-page-card"><div class="workspace-note">TB tools are initializing…</div></section>');
  }
}

function renderActivePage() {
  if (!state.snapshot && state.route !== "tb") return;
  if (state.route === "overview") renderOverview();
  if (state.route === "members") renderMembers();
  if (state.route === "tb") renderTb();
  if (state.route === "tw") renderTw();
  if (state.route === "raids") renderRaids();
}

function updateRouteLinks(allyCode = currentAllyCode()) {
  for (const link of document.querySelectorAll("[data-guild-route-nav]")) {
    link.href = routeUrl(link.dataset.guildRoutePath, allyCode);
  }
  const home = $("guildRouteBackHome");
  if (home) home.href = allyCode ? `/?allyCode=${encodeURIComponent(allyCode)}#overview` : "/#overview";
}

function guildNavHtml() {
  return ROUTES.map(([id, path, label]) => `<a data-guild-route-nav data-guild-route-path="${escapeAttr(path)}" class="${id === state.route ? "active" : ""}" href="${escapeAttr(routeUrl(path))}">${escapeHtml(label)}</a>`).join("");
}

function prepareRouteShell() {
  state.route = routeFromPath();
  document.body.classList.add("guild-route-mode");
  const main = document.querySelector("main");
  if (!main) return false;

  const code = currentAllyCode();
  if (code) rememberAllyCode(code);
  const allyForm = $("allyForm");
  if (allyForm && code) $("allyCode").value = formatAllyCode(code);

  const guildTab = document.querySelector('button[data-workspace-tab="guild"]');
  if (state.route === "tb" && guildTab && code) guildTab.click();
  const existingTbTools = $("guildPageTbTools");
  if (existingTbTools) state.tbTools = existingTbTools;

  const root = document.createElement("div");
  root.id = "guildRouteRoot";
  root.className = "guild-route-shell";
  root.innerHTML = `
    <div class="guild-route-topline"><a id="guildRouteBackHome" class="guild-route-back" href="/#overview">← Player Command</a><span>SWGOH COMMAND CENTER · GUILD</span></div>
    <section id="guildRouteHeader" class="guild-page-header"></section>
    <section class="guild-route-ally card"><div><div class="kicker">GUILD LOOKUP</div><strong>Load any current guild member</strong><p>One Ally Code identifies the live guild and hydrates the guild roster used by every Guild page.</p></div><div id="guildRouteAllyFormHost"></div></section>
    <nav class="guild-route-nav" aria-label="Guild Command Center">${guildNavHtml()}</nav>
    <section id="guildRouteContent" class="guild-route-content"></section>`;

  main.replaceChildren(root);
  if (allyForm) {
    $("guildRouteAllyFormHost")?.appendChild(allyForm);
    const label = allyForm.querySelector('label[for="allyCode"]');
    if (label) label.textContent = "Member Ally Code";
    const button = allyForm.querySelector("#loadButton");
    if (button) button.textContent = "Load Guild";
    allyForm.addEventListener("submit", () => {
      const next = rememberAllyCode($("allyCode")?.value);
      updateRouteLinks(next);
      setTimeout(() => loadGuild(true), 50);
    });
  }

  const topbarKicker = document.querySelector(".topbar .kicker");
  const topbarTitle = document.querySelector(".topbar h1");
  if (topbarKicker) topbarKicker.textContent = "SWGOH COMMAND CENTER · GUILD OPERATIONS";
  if (topbarTitle) topbarTitle.textContent = "Guild Command Center";

  updateRouteLinks(code);
  renderNeedsAllyCode();
  if (state.route === "tb") renderTb();
  return true;
}

function installHomeGuildLink() {
  const queryCode = digits(new URLSearchParams(location.search).get("allyCode"));
  if (queryCode.length === 9) {
    const input = $("allyCode");
    if (input && digits(input.value) !== queryCode) {
      input.value = formatAllyCode(queryCode);
      setTimeout(() => $("allyForm")?.requestSubmit(), 80);
    }
  }

  if (location.hash.toLowerCase() === "#guild") {
    location.replace(routeUrl("/guild", currentAllyCode()));
    return;
  }

  const button = document.querySelector('button[data-workspace-tab="guild"]');
  if (!button) return;
  const link = document.createElement("a");
  link.className = `${button.className} guild-route-link`;
  link.textContent = "Guild";
  link.href = routeUrl("/guild", currentAllyCode());
  link.setAttribute("aria-label", "Open Guild Command Center");
  link.addEventListener("click", () => {
    const code = rememberAllyCode($("allyCode")?.value || currentAllyCode());
    link.href = routeUrl("/guild", code);
  });
  button.replaceWith(link);

  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#guild") location.replace(routeUrl("/guild", currentAllyCode()));
  });
}

function install() {
  if (!isGuildRoute()) {
    installHomeGuildLink();
    return;
  }
  if (!prepareRouteShell()) return;
  const code = currentAllyCode();
  if (code.length === 9) loadGuild(false);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);
