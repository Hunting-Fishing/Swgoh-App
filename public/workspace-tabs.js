import { farmCompletion, farmStatus } from "./farm-tracker.js";

const TAB_DEFINITIONS = [
  ["overview", "Overview"],
  ["roster", "Roster"],
  ["farm", "Farm Tracker"],
  ["mods", "Mods"],
  ["squads", "Squads"],
  ["gac", "GAC"],
  ["datacrons", "Datacrons"],
  ["events", "Events / Guides"],
  ["guild", "Guild / TB / TW"],
  ["resources", "Resources"],
];

const API_CACHE_MS = 25_000;
const trackerState = {
  catalog: [],
  catalogMap: new Map(),
  liveBody: null,
  liveAllyCode: "",
  liveFetchedAt: 0,
  activeTab: "overview",
};

function $(id) {
  return document.getElementById(id);
}

function digits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat().format(numeric) : "N/A";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function createPanel(id) {
  const section = document.createElement("section");
  section.id = `workspace-${id}`;
  section.className = "workspace-panel";
  section.dataset.workspacePanel = id;
  section.hidden = id !== "overview";
  return section;
}

function intro(kicker, title, description) {
  const section = document.createElement("section");
  section.className = "card workspace-intro";
  section.innerHTML = `
    <div class="kicker">${escapeHtml(kicker)}</div>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(description)}</p>
  `;
  return section;
}

function setupWorkspace() {
  const main = document.querySelector("main");
  if (!main || $("workspaceTabs")) return;

  const hero = document.querySelector(".hero.card");
  const profile = $("profile");
  const intelligence = $("intelligence");
  const controls = $("controls");
  const roster = $("roster");
  const empty = $("empty");
  const databases = [...document.querySelectorAll("section.database.card")];
  const staticDatabase = databases.find((section) => section.id !== "intelligence") || null;

  const tabs = document.createElement("nav");
  tabs.id = "workspaceTabs";
  tabs.className = "workspace-tabs";
  tabs.setAttribute("aria-label", "SWGOH workspace");

  const panels = new Map();
  for (const [id, label] of TAB_DEFINITIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `workspace-tab${id === "overview" ? " active" : ""}`;
    button.dataset.workspaceTab = id;
    button.textContent = label;
    button.setAttribute("aria-controls", `workspace-${id}`);
    button.setAttribute("aria-selected", id === "overview" ? "true" : "false");
    tabs.appendChild(button);

    const panel = createPanel(id);
    panels.set(id, panel);
  }

  main.replaceChildren(tabs, ...panels.values());

  const overview = panels.get("overview");
  if (hero) overview.appendChild(hero);
  if (profile) overview.appendChild(profile);
  if (empty) overview.appendChild(empty);
  overview.appendChild(intro(
    "COMMAND OVERVIEW",
    "Your SWGOH command center",
    "Load an Ally Code once, then move between roster, farms, mods, squads, GAC and other workspaces without scrolling through hundreds of units."
  ));

  const rosterPanel = panels.get("roster");
  rosterPanel.appendChild(intro(
    "LIVE OWNED ROSTER",
    "Characters & Ships",
    "Filter and inspect the live owned roster here. Static game data remains available below it for units the player does not own."
  ));
  if (controls) rosterPanel.appendChild(controls);
  if (roster) rosterPanel.appendChild(roster);
  if (staticDatabase) rosterPanel.appendChild(staticDatabase);

  const squadsPanel = panels.get("squads");
  squadsPanel.appendChild(intro(
    "ROSTER INTELLIGENCE",
    "Squads & player intelligence",
    "Owned-roster squad suggestions, public profile statistics and live competitive context are grouped here."
  ));
  if (intelligence) squadsPanel.appendChild(intelligence);

  setupFarmPanel(panels.get("farm"));
  setupModsPanel(panels.get("mods"));
  setupGacPanel(panels.get("gac"));
  setupDatacronPanel(panels.get("datacrons"));
  setupEventsPanel(panels.get("events"));
  setupGuildPanel(panels.get("guild"));
  setupResourcesPanel(panels.get("resources"));

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-workspace-tab]");
    if (!button) return;
    activateTab(button.dataset.workspaceTab, { pushHash: true });
  });

  const requestedTab = location.hash.replace(/^#/, "").toLowerCase();
  const initial = TAB_DEFINITIONS.some(([id]) => id === requestedTab) ? requestedTab : "overview";
  activateTab(initial, { pushHash: false });

  window.addEventListener("hashchange", () => {
    const requested = location.hash.replace(/^#/, "").toLowerCase();
    if (TAB_DEFINITIONS.some(([id]) => id === requested)) activateTab(requested, { pushHash: false });
  });

  $("allyForm")?.addEventListener("submit", () => {
    trackerState.liveBody = null;
    trackerState.liveFetchedAt = 0;
    setTimeout(() => refreshActiveWorkspace(true), 350);
  });
}

function activateTab(id, options = {}) {
  if (!TAB_DEFINITIONS.some(([candidate]) => candidate === id)) return;
  trackerState.activeTab = id;

  for (const panel of document.querySelectorAll("[data-workspace-panel]")) {
    panel.hidden = panel.dataset.workspacePanel !== id;
  }
  for (const button of document.querySelectorAll("button[data-workspace-tab]")) {
    const active = button.dataset.workspaceTab === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }

  if (options.pushHash && location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  localStorage.setItem("swgoh:workspace-tab", id);
  refreshActiveWorkspace(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadCatalog() {
  if (trackerState.catalog.length) return trackerState.catalog;
  const response = await fetch("/data/catalog.json?workspace=1", { cache: "no-store" });
  if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}`);
  const body = await response.json();
  trackerState.catalog = Array.isArray(body?.units) ? body.units : [];
  trackerState.catalogMap = new Map(trackerState.catalog.map((unit) => [unit.baseId, unit]));
  return trackerState.catalog;
}

async function loadLiveBody(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  if (
    !force &&
    trackerState.liveBody &&
    trackerState.liveAllyCode === allyCode &&
    Date.now() - trackerState.liveFetchedAt < API_CACHE_MS
  ) {
    return trackerState.liveBody;
  }

  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  trackerState.liveBody = body;
  trackerState.liveAllyCode = allyCode;
  trackerState.liveFetchedAt = Date.now();
  return body;
}

async function refreshActiveWorkspace(force = false) {
  try {
    if (trackerState.activeTab === "farm") await renderFarmTracker(force);
    if (trackerState.activeTab === "mods") await renderMods(force);
    if (trackerState.activeTab === "gac") await renderGac(force);
    if (trackerState.activeTab === "datacrons") await renderDatacrons(force);
    if (trackerState.activeTab === "guild") await renderGuild(force);
  } catch (error) {
    const output = $(`workspace${trackerState.activeTab[0].toUpperCase()}${trackerState.activeTab.slice(1)}Body`);
    if (output) output.innerHTML = `<div class="workspace-error">${escapeHtml(error.message || "Live workspace data is unavailable.")}</div>`;
  }
}

function trackerStorageKey() {
  const allyCode = digits($("allyCode")?.value) || trackerState.liveAllyCode || "default";
  return `swgoh:farm-tracker:v1:${allyCode}`;
}

function readTargets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(trackerStorageKey()) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTargets(targets) {
  localStorage.setItem(trackerStorageKey(), JSON.stringify(targets));
}

function resolveUnitInput(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  const byId = trackerState.catalogMap.get(text);
  if (byId) return byId;
  const lowered = text.toLowerCase();
  return trackerState.catalog.find((unit) => String(unit.name || "").toLowerCase() === lowered) || null;
}

function setupFarmPanel(panel) {
  panel.appendChild(intro(
    "REQUIREMENT TRACKING",
    "Farm Tracker",
    "Track explicit targets against the live roster. The percentage is based only on the selected requirement—stars, level, gear and relic—not speed, mods or a generic readiness score."
  ));

  const section = document.createElement("section");
  section.className = "card tracker-builder";
  section.innerHTML = `
    <div>
      <div class="kicker">CUSTOM TRACKER</div>
      <h3>Add a farm target</h3>
      <p class="workspace-note">Preset Galactic Legend, Journey Guide, Assault Battle, Territory Battle and Raid trackers will use the same engine as current game requirements are normalized.</p>
    </div>
    <form id="farmTargetForm" class="tracker-form">
      <label>Unit
        <input id="farmUnitInput" list="farmUnitOptions" placeholder="Character or ship name" autocomplete="off" required>
        <datalist id="farmUnitOptions"></datalist>
      </label>
      <label>Stars<input id="farmStars" type="number" min="1" max="7" value="7"></label>
      <label>Level<input id="farmLevel" type="number" min="1" max="85" value="85"></label>
      <label>Gear<input id="farmGear" type="number" min="1" max="13" value="13"></label>
      <label>Relic<input id="farmRelic" type="number" min="0" max="15" value="7"></label>
      <button type="submit">Track</button>
    </form>
    <div id="farmTrackerStatus" class="workspace-note">Load an Ally Code to compare targets against a live roster.</div>
    <div id="farmTrackerList" class="tracker-list"></div>
  `;
  panel.appendChild(section);

  loadCatalog().then((catalog) => {
    const datalist = $("farmUnitOptions");
    if (!datalist) return;
    datalist.innerHTML = catalog
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((unit) => `<option value="${escapeAttr(unit.name)}">${escapeHtml(unit.baseId)} · ${escapeHtml(unit.unitType)}</option>`)
      .join("");
  }).catch(() => {});

  $("farmTargetForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await loadCatalog();
      const unit = resolveUnitInput($("farmUnitInput")?.value);
      if (!unit) throw new Error("Choose an exact unit name from the game catalog.");
      const targets = readTargets().filter((target) => target.baseId !== unit.baseId);
      targets.push({
        baseId: unit.baseId,
        required: {
          stars: Number($("farmStars")?.value || 0),
          level: Number($("farmLevel")?.value || 0),
          gear: unit.unitType === "Ship" ? 0 : Number($("farmGear")?.value || 0),
          relic: unit.unitType === "Ship" ? 0 : Number($("farmRelic")?.value || 0),
        },
      });
      writeTargets(targets);
      $("farmUnitInput").value = "";
      await renderFarmTracker(true);
    } catch (error) {
      $("farmTrackerStatus").textContent = error.message || "Could not add tracker target.";
    }
  });
}

async function renderFarmTracker(force = false) {
  const list = $("farmTrackerList");
  const status = $("farmTrackerStatus");
  if (!list || !status) return;
  await loadCatalog();
  const body = await loadLiveBody(force);
  const targets = readTargets();
  if (!body) {
    status.textContent = "Enter and load a 9-digit Ally Code, then return here to compare live progress.";
    list.innerHTML = "";
    return;
  }

  const liveUnits = [...(body.units || []), ...(body.ships || [])];
  const liveMap = new Map(liveUnits.map((unit) => [unit.baseId, unit]));
  status.textContent = targets.length
    ? `${targets.length} tracked target${targets.length === 1 ? "" : "s"} for ${body.player?.name || body.player?.allyCode || "this player"}.`
    : "No farm targets yet. Add a character or ship above.";

  list.innerHTML = targets.map((target) => {
    const staticUnit = trackerState.catalogMap.get(target.baseId) || { baseId: target.baseId, name: target.baseId, unitType: "Character" };
    const current = liveMap.get(target.baseId) || {};
    const result = farmCompletion(current, target.required || {}, staticUnit.unitType);
    const rows = result.rows.map((row) => `
      <div class="tracker-requirement${row.complete ? " complete" : ""}">
        <span class="tracker-label">${escapeHtml(row.label)}</span>
        <strong>${escapeHtml(row.currentLabel)} / ${escapeHtml(row.requiredLabel)}</strong>
      </div>
    `).join("");
    return `
      <article class="tracker-card" data-farm-base-id="${escapeAttr(target.baseId)}">
        <div class="tracker-heading">
          <div>
            <span class="tracker-label">${escapeHtml(staticUnit.unitType)} · ${current.baseId ? "Owned" : "Not unlocked"}</span>
            <h3>${escapeHtml(staticUnit.name || target.baseId)}</h3>
          </div>
          <strong class="tracker-score">${result.percent}%</strong>
        </div>
        <div class="tracker-progress" aria-label="${result.percent}% complete"><div style="width:${result.percent}%"></div></div>
        <div class="tracker-requirements">${rows}</div>
        <div class="tracker-actions">
          <span class="tracker-status">${escapeHtml(farmStatus(result))}</span>
          <button class="tracker-remove" type="button" data-remove-farm="${escapeAttr(target.baseId)}">Remove</button>
        </div>
      </article>
    `;
  }).join("");

  for (const button of list.querySelectorAll("button[data-remove-farm]")) {
    button.addEventListener("click", () => {
      writeTargets(readTargets().filter((target) => target.baseId !== button.dataset.removeFarm));
      renderFarmTracker(false);
    });
  }
}

function setupModsPanel(panel) {
  panel.appendChild(intro(
    "MOD WORKSPACE",
    "Mods",
    "Audit equipped mod coverage and 6-dot investment from public roster data. Unequipped mod inventory is not exposed by the public player endpoint and will not be fabricated."
  ));
  const body = document.createElement("section");
  body.id = "workspaceModsBody";
  body.className = "card workspace-intro";
  body.innerHTML = `<div class="workspace-note">Load an Ally Code to analyze equipped mods.</div>`;
  panel.appendChild(body);
}

async function renderMods(force = false) {
  const output = $("workspaceModsBody");
  if (!output) return;
  const body = await loadLiveBody(force);
  if (!body) return;
  const characters = body.units || [];
  const withKnownMods = characters.filter((unit) => Number.isFinite(Number(unit.equippedMods)));
  const openSlots = withKnownMods.filter((unit) => Number(unit.equippedMods) < 6)
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
  const equippedMods = body.summary?.equippedMods;
  const sixDotMods = body.summary?.sixDotMods;

  output.innerHTML = `
    <div class="workspace-grid">
      <div class="workspace-stat"><span>Equipped Mods</span><strong>${formatNumber(equippedMods)}</strong></div>
      <div class="workspace-stat"><span>6-dot Mods</span><strong>${formatNumber(sixDotMods)}</strong></div>
      <div class="workspace-stat"><span>Characters With Open Slots</span><strong>${formatNumber(openSlots.length)}</strong></div>
      <div class="workspace-stat"><span>Mod Data Coverage</span><strong>${formatNumber(withKnownMods.length)} / ${formatNumber(characters.length)}</strong></div>
    </div>
    <p class="workspace-note">This is equipped-mod analysis only. The public Comlink player response does not expose the player's unequipped mod inventory.</p>
    ${openSlots.length ? `
      <table class="workspace-table">
        <thead><tr><th>Character</th><th>Power</th><th>Equipped</th><th>Open Slots</th></tr></thead>
        <tbody>${openSlots.slice(0, 30).map((unit) => `
          <tr><td><strong>${escapeHtml(unit.name)}</strong></td><td>${formatNumber(unit.power)}</td><td>${formatNumber(unit.equippedMods)}</td><td>${6 - Number(unit.equippedMods || 0)}</td></tr>
        `).join("")}</tbody>
      </table>
    ` : `<div class="workspace-note">No open mod slots were detected in the normalized character roster.</div>`}
  `;
}

function setupGacPanel(panel) {
  panel.appendChild(intro(
    "GRAND ARENA",
    "GAC",
    "Keep rating, league/division and recent season status separate from roster browsing so competitive planning has its own workspace."
  ));
  const body = document.createElement("section");
  body.id = "workspaceGacBody";
  body.className = "card workspace-intro";
  body.innerHTML = `<div class="workspace-note">Load an Ally Code to view GAC data.</div>`;
  panel.appendChild(body);
}

async function renderGac(force = false) {
  const output = $("workspaceGacBody");
  if (!output) return;
  const body = await loadLiveBody(force);
  if (!body) return;
  const competitive = body.competitive || {};
  const seasons = Array.isArray(body.seasonStatus) ? body.seasonStatus : [];
  output.innerHTML = `
    <div class="workspace-grid">
      <div class="workspace-stat"><span>Skill Rating</span><strong>${formatNumber(competitive.gacSkillRating || body.player?.gacSkillRating)}</strong></div>
      <div class="workspace-stat"><span>League</span><strong>${escapeHtml(competitive.gacLeague || body.player?.gacLeague || "N/A")}</strong></div>
      <div class="workspace-stat"><span>Division</span><strong>${escapeHtml(competitive.gacDivision || body.player?.gacDivision || "N/A")}</strong></div>
      <div class="workspace-stat"><span>Recent Seasons Returned</span><strong>${formatNumber(seasons.length)}</strong></div>
    </div>
    ${seasons.length ? `
      <table class="workspace-table">
        <thead><tr><th>Season</th><th>League</th><th>Division</th><th>Points</th><th>Rank</th></tr></thead>
        <tbody>${seasons.slice(0, 10).map((season) => `
          <tr><td><strong>${escapeHtml(season.seasonId || "N/A")}</strong></td><td>${escapeHtml(season.league || "N/A")}</td><td>${escapeHtml(season.division || "N/A")}</td><td>${formatNumber(season.seasonPoints)}</td><td>${season.rank ? `#${formatNumber(season.rank)}` : "N/A"}</td></tr>
        `).join("")}</tbody>
      </table>
    ` : `<div class="workspace-note">No public season-status records were returned for this player.</div>`}
  `;
}

function setupDatacronPanel(panel) {
  panel.appendChild(intro(
    "DATACRON WORKSPACE",
    "Datacrons",
    "Start with the player's live datacron count. Detailed set, level and affix analysis can be added when the gateway exposes the full public datacron payload."
  ));
  const body = document.createElement("section");
  body.id = "workspaceDatacronsBody";
  body.className = "card workspace-intro";
  body.innerHTML = `<div class="workspace-note">Load an Ally Code to view datacron data.</div>`;
  panel.appendChild(body);
}

async function renderDatacrons(force = false) {
  const output = $("workspaceDatacronsBody");
  if (!output) return;
  const body = await loadLiveBody(force);
  if (!body) return;
  const count = body.summary?.datacrons;
  output.innerHTML = `
    <div class="workspace-grid">
      <div class="workspace-stat"><span>Live Datacrons</span><strong>${Number.isFinite(Number(count)) ? formatNumber(count) : "N/A"}</strong></div>
    </div>
    <p class="workspace-note">The current gateway summary returns the count. The next data-layer expansion will preserve the individual public datacron records so set/level/affix analysis can be built here.</p>
  `;
}

function resourceCard(title, description, url, action = "Open resource") {
  return `
    <article class="resource-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action)} ↗</a>
    </article>
  `;
}

function setupEventsPanel(panel) {
  panel.appendChild(intro(
    "EVENT PLANNING",
    "Events & Guides",
    "This workspace will combine versioned Journey/Event definitions with live roster readiness. External planning tools remain available as references while native trackers are built."
  ));
  const body = document.createElement("section");
  body.className = "card workspace-intro";
  body.innerHTML = `
    <div class="resource-grid">
      ${resourceCard("SWGOH4.LIFE", "Event, conquest and planning resources referenced by the community.", "https://swgoh4.life/")}
      ${resourceCard("The Don Project", "Farm tracking reference with preset and custom progress trackers.", "https://thedonproject.com/swgoh/index.cgi")}
      ${resourceCard("SWGOH.GG", "Unit, roster, GAC and game-information reference.", "https://swgoh.gg/")}
    </div>
    <p class="workspace-note">Native preset trackers will be generated from current game Journey Guide and requirement definitions rather than copied from another site's static tables.</p>
  `;
  panel.appendChild(body);
}

function setupGuildPanel(panel) {
  panel.appendChild(intro(
    "GUILD OPERATIONS",
    "Guild / Territory Battles / Territory Wars",
    "Guild-wide readiness, ROTE operations, Territory Battle deployment and Territory War planning belong in a separate operational workspace."
  ));
  const body = document.createElement("section");
  body.id = "workspaceGuildBody";
  body.className = "card workspace-intro";
  body.innerHTML = `<div class="workspace-note">Load an Ally Code to identify the current guild. Full guild roster data requires the gateway's public /guild integration.</div>`;
  panel.appendChild(body);
}

async function renderGuild(force = false) {
  const output = $("workspaceGuildBody");
  if (!output) return;
  const body = await loadLiveBody(force);
  if (!body) return;
  output.innerHTML = `
    <div class="workspace-grid">
      <div class="workspace-stat"><span>Player Guild</span><strong>${escapeHtml(body.player?.guildName || "N/A")}</strong></div>
      <div class="workspace-stat"><span>Player GP</span><strong>${formatNumber(body.player?.galacticPower)}</strong></div>
    </div>
    <p class="workspace-note">Next: proxy the public Comlink guild endpoint, cache one guild snapshot, then build member readiness, ROTE operations and TW planning from shared guild data instead of issuing one player request per member.</p>
  `;
}

function setupResourcesPanel(panel) {
  panel.appendChild(intro(
    "COMMUNITY TOOLBOX",
    "Resources",
    "Keep external tools in one place while we progressively absorb the high-value workflows into Roster Command."
  ));
  const body = document.createElement("section");
  body.className = "card workspace-intro";
  body.innerHTML = `
    <div class="resource-grid">
      ${resourceCard("The Don Project", "Farm and requirement tracker inspiration.", "https://thedonproject.com/swgoh/index.cgi")}
      ${resourceCard("SWGOH4.LIFE", "Community event and planning resources.", "https://swgoh4.life/")}
      ${resourceCard("Grandivory Mods Optimizer", "Dedicated mod optimization and character priority planning.", "https://mods-optimizer.swgoh.grandivory.com/")}
      ${resourceCard("SWGOH.GG", "Roster, units, game data, GAC and community reference.", "https://swgoh.gg/")}
      ${resourceCard("Community tools directory", "Reddit community compilation of SWGOH tools and resources.", "https://www.reddit.com/r/SWGalaxyOfHeroes/comments/1c7oo0k/all_the_swgoh_tools_and_resources_in_one_place/")}
      ${resourceCard("SWGOH Comlink", "Open-source public game/player data interface used by this application's live pipeline.", "https://github.com/swgoh-utils/swgoh-comlink")}
    </div>
  `;
  panel.appendChild(body);
}

setupWorkspace();
