import { describeGpQuality, selectProfileGp } from "./gp-policy.js";
import { mergeAbilityProgression, progressionCounts } from "./progression-policy.js";
import { readinessAnalysis } from "./readiness-policy.js";
import {
  isCanonicalRosterBody,
  isLiveRosterBody,
  loadPreferredPlayerRoster,
  rosterCapabilityKnown,
  rosterProgressionTotal,
  rosterSourceStatus,
  unitProgressionKnown,
  unitProgressionValue,
} from "./roster-source-policy.js";
import { buildFactionSquads, squadReadiness } from "./team-builder.js";

const state = {
  characters: [],
  ships: [],
  units: [],
  player: null,
  fetchedAt: null,
  lastBody: null,
  catalog: [],
  catalogMap: new Map(),
  catalogShown: 24,
};

const $ = (id) => document.getElementById(id);
const health = $("health");
const allyForm = $("allyForm");
const allyCode = $("allyCode");
const loadButton = $("loadButton");
const errorBox = $("error");
const profile = $("profile");
const controls = $("controls");
const roster = $("roster");
const empty = $("empty");
const intelligence = $("intelligence");
const intelligenceStatus = $("intelligenceStatus");
const intelligenceSummary = $("intelligenceSummary");
const squadGrid = $("squadGrid");
const profileStatsGrid = $("profileStatsGrid");
const seasonGrid = $("seasonGrid");
const search = $("search");
const unitType = $("unitType");
const alignment = $("alignment");
const sort = $("sort");
const count = $("count");
const details = $("details");
const catalogStatus = $("catalogStatus");
const catalogSearch = $("catalogSearch");
const catalogType = $("catalogType");
const catalogAlignment = $("catalogAlignment");
const catalogSort = $("catalogSort");
const catalogCount = $("catalogCount");
const catalogGrid = $("catalogGrid");
const catalogMore = $("catalogMore");

function number(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function knownNumber(value, fallback = "N/A") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat().format(parsed) : fallback;
}

function capabilityNumber(body, capability, value, fallback = "N/A") {
  return rosterCapabilityKnown(body, capability) ? knownNumber(value, fallback) : fallback;
}

function decimal(value, digits = 1) {
  return Number(value || 0).toFixed(digits);
}

function sanitizeAllyCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

function formatAllyCode(value) {
  const raw = sanitizeAllyCode(value);
  return raw.replace(/(\d{3})(?=\d)/g, "$1-");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.toggle("hidden", !message);
}

function staticUnitFor(baseId) {
  return state.catalogMap.get(String(baseId || "")) || null;
}

function appliedAbility(staticAbility, liveAbility) {
  return mergeAbilityProgression(staticAbility, liveAbility);
}

function persistedSkillEvidence(unit = {}) {
  return (Array.isArray(unit.skillTiers) ? unit.skillTiers : []).map((skill) => ({
    id: skill.id,
    tier: skill.rawTier,
    displayTier: skill.effectiveTier,
  }));
}

function enrichUnit(unit) {
  const staticUnit = staticUnitFor(unit.baseId);
  if (!staticUnit) return {
    ...unit,
    zetas: unitProgressionValue(unit, "zetas", "zetas"),
    omegas: unitProgressionValue(unit, "omegas", "omegas"),
    omicrons: unitProgressionValue(unit, "omicrons", "omicrons"),
  };

  const staticAbilities = staticUnit.abilities || [];
  const directAbilities = Array.isArray(unit.abilities) ? unit.abilities : [];
  const liveAbilities = directAbilities.length ? directAbilities : persistedSkillEvidence(unit);
  const liveById = new Map(liveAbilities.filter((ability) => ability?.id).map((ability) => [ability.id, ability]));
  const mergedAbilities = staticAbilities.map((ability, index) => appliedAbility(
    ability,
    liveById.get(ability.id) || liveAbilities[index]
  ));
  const counts = progressionCounts(unit, mergedAbilities);

  return {
    ...staticUnit,
    ...unit,
    name: unit.name || staticUnit.name,
    role: unit.role || staticUnit.role,
    alignment: unit.alignment === "Unknown" ? staticUnit.alignment : unit.alignment || staticUnit.alignment,
    factions: Array.isArray(unit.factions) && unit.factions.length ? unit.factions : staticUnit.factions,
    image: unit.image || staticUnit.image,
    imageFallback: unit.image && staticUnit.image && unit.image !== staticUnit.image ? staticUnit.image : "",
    zetas: unitProgressionKnown(unit, "zetas") ? counts.zetas : null,
    omegas: unitProgressionKnown(unit, "omegas") ? counts.omegas : null,
    omicrons: unitProgressionKnown(unit, "omicrons") ? counts.omicrons : null,
    abilities: mergedAbilities.length ? mergedAbilities : liveAbilities,
  };
}

function applyCatalogToLiveRoster() {
  if (!state.units.length || !state.catalogMap.size) return;
  state.characters = state.characters.map(enrichUnit);
  state.ships = state.ships.map(enrichUnit);
  state.units = [...state.characters, ...state.ships];
  if (state.lastBody) {
    renderProfile(state.lastBody);
    renderIntelligence(state.lastBody);
  }
  renderRoster();
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const body = await response.json();
    if (response.ok && body.status === "ready") {
      health.textContent = "Live pipeline ready";
      health.className = "status ready";
    } else {
      health.textContent = "Gateway needs configuration";
      health.className = "status warning";
    }
  } catch {
    health.textContent = "Gateway unavailable";
    health.className = "status danger";
  }
}

async function loadCatalog() {
  catalogStatus.textContent = "Loading static game data…";
  catalogStatus.className = "status";
  try {
    const response = await fetch("/data/catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Static catalog returned HTTP ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body?.units) || !body.units.length) throw new Error("Static catalog contained no units.");

    state.catalog = body.units;
    state.catalogMap = new Map(body.units.map((unit) => [unit.baseId, unit]));
    const catalogCharacters = body.units.filter((unit) => unit.unitType === "Character").length;
    const catalogShips = body.units.filter((unit) => unit.unitType === "Ship").length;
    catalogStatus.textContent = `${number(catalogCharacters)} characters · ${number(catalogShips)} ships · ${number(body.units.length)} total · Game ${body.gameVersion || "current"}`;
    catalogStatus.className = "status ready";
    renderCatalog();
    applyCatalogToLiveRoster();
  } catch (error) {
    catalogStatus.textContent = "Static catalog unavailable";
    catalogStatus.className = "status warning";
    catalogGrid.innerHTML = `<div class="catalog-error">${escapeHtml(error.message || "Static game data could not be loaded.")}</div>`;
  }
}

function applyRosterBody(body) {
  state.player = body.player;
  state.lastBody = body;
  state.characters = (body.units || []).map(enrichUnit);
  state.ships = (Array.isArray(body.ships) ? body.ships : []).map(enrichUnit);
  state.units = [...state.characters, ...state.ships];
  state.fetchedAt = body.fetchedAt || body.player.updatedAt;

  if (isLiveRosterBody(body)) {
    window.__swgohLiveSnapshot = { allyCode: sanitizeAllyCode(body.player?.allyCode), body, fetchedAt: Date.now() };
  }

  renderProfile(body);
  renderRoster();
  renderIntelligence(body);
  empty.classList.add("hidden");
  profile.classList.remove("hidden");
  controls.classList.remove("hidden");
  roster.classList.remove("hidden");
  intelligence.classList.remove("hidden");
}

allyCode.addEventListener("input", () => {
  allyCode.value = formatAllyCode(allyCode.value);
});

allyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = sanitizeAllyCode(allyCode.value);
  if (code.length !== 9) {
    showError("Enter a valid 9-digit Ally Code.");
    return;
  }

  loadButton.disabled = true;
  loadButton.textContent = "Loading roster…";
  showError("");

  try {
    const result = await loadPreferredPlayerRoster(code);
    applyRosterBody(result.body);
  } catch (error) {
    state.player = null;
    state.lastBody = null;
    state.characters = [];
    state.ships = [];
    state.units = [];
    profile.classList.add("hidden");
    controls.classList.add("hidden");
    roster.classList.add("hidden");
    intelligence.classList.add("hidden");
    empty.classList.remove("hidden");
    showError(error.message || "SWGOH roster data is unavailable.");
  } finally {
    loadButton.disabled = false;
    loadButton.textContent = "Load Roster";
  }
});

function renderProfile(body) {
  const player = body.player;
  const characters = state.characters;
  const ships = state.ships;
  const gp = selectProfileGp(player, characters, ships);
  const displayedCharacterGp = gp.characterGp;
  const displayedShipGp = gp.shipGp;
  const displayedTotalGp = gp.totalGp;
  const sevenStarCharacters = characters.filter((unit) => Number(unit.stars) === 7).length;
  const sevenStarShips = ships.filter((unit) => Number(unit.stars) === 7).length;
  const relicCharacters = characters.filter((unit) => Number(unit.relic) > 0);
  const avgRelic = relicCharacters.length
    ? relicCharacters.reduce((sum, unit) => sum + Number(unit.relic || 0), 0) / relicCharacters.length
    : 0;
  const zetas = rosterProgressionTotal(body, "zetas", "zetas");
  const omegas = rosterProgressionTotal(body, "omegas", "omegas", { summaryAliases: ["omegaUpgrades"] });
  const omicrons = rosterProgressionTotal(body, "omicrons", "omicrons");
  const rosterCount = characters.length + ships.length;
  const summary = body.summary || {};
  const competitive = body.competitive || {};
  const arenaRank = Number(player.arenaRank || competitive.arenaRank || 0);
  const fleetArenaRank = Number(player.fleetArenaRank || competitive.fleetArenaRank || 0);
  const gacSkillRating = Number(player.gacSkillRating || competitive.gacSkillRating || 0);
  const gpQuality = describeGpQuality(gp);

  profile.innerHTML = `
    <div class="profile-heading">
      <div class="kicker">CURRENT PLAYER</div>
      <h3>${escapeHtml(player.name)}</h3>
      <p>${escapeHtml(formatAllyCode(player.allyCode))}${player.guildName ? ` · ${escapeHtml(player.guildName)}` : ""}</p>
    </div>
    <div class="stats-row primary-stats">
      <div><span>Galactic Power</span><strong>${number(displayedTotalGp)}</strong></div>
      <div><span>Character GP</span><strong>${number(displayedCharacterGp)}</strong></div>
      <div><span>Ship GP</span><strong>${number(displayedShipGp)}</strong></div>
      <div><span>Level</span><strong>${number(player.level)}</strong></div>
    </div>
    <div class="collection-summary">
      <div><span>Roster</span><strong>${number(rosterCount)}</strong></div>
      <div><span>Characters</span><strong>${number(characters.length)}</strong><small>${number(sevenStarCharacters)} at 7★</small></div>
      <div><span>Ships</span><strong>${number(ships.length)}</strong><small>${number(sevenStarShips)} at 7★</small></div>
      <div><span>Relics</span><strong>${number(relicCharacters.length)}</strong><small>Avg R${decimal(avgRelic)}</small></div>
      <div><span>Zetas</span><strong>${knownNumber(zetas)}</strong></div>
      <div><span>Omegas</span><strong>${knownNumber(omegas)}</strong></div>
      <div><span>Omicrons</span><strong>${knownNumber(omicrons)}</strong></div>
      <div><span>6-dot Mods</span><strong>${capabilityNumber(body, "sixDotMods", summary.sixDotMods)}</strong></div>
      <div><span>Datacrons</span><strong>${capabilityNumber(body, "datacrons", summary.datacrons)}</strong></div>
      <div><span>Squad Arena</span><strong>${arenaRank ? `#${number(arenaRank)}` : "N/A"}</strong></div>
      <div><span>Fleet Arena</span><strong>${fleetArenaRank ? `#${number(fleetArenaRank)}` : "N/A"}</strong></div>
      <div><span>GAC Rating</span><strong>${gacSkillRating ? number(gacSkillRating) : "N/A"}</strong></div>
    </div>
    <div class="data-quality"><strong>GP check:</strong> ${escapeHtml(gpQuality)}</div>
    <div class="data-quality muted"><strong>Account inventory:</strong> Comlink does not expose unequipped materials, gear, mods, or player currency balances, so this app does not show fake zero balances.</div>
    <div class="freshness">${escapeHtml(rosterSourceStatus(body, rosterCount))}</div>
  `;
}

function renderIntelligence(body) {
  const summary = body.summary || {};
  const competitive = body.competitive || {};
  const capabilities = body.capabilities || {};
  const squads = buildFactionSquads(state.characters, { size: 5, limit: 8 });
  const profileStats = Array.isArray(body.profileStats) ? body.profileStats : [];
  const seasons = Array.isArray(body.seasonStatus) ? body.seasonStatus : [];
  const league = body.player?.gacLeague || competitive.gacLeague || "N/A";
  const division = body.player?.gacDivision || competitive.gacDivision || "";
  const canonical = isCanonicalRosterBody(body);

  intelligenceStatus.textContent = canonical ? "Persisted roster intelligence" : capabilities.liveRoster === false ? "Limited live data" : "Live roster intelligence";
  intelligenceStatus.className = canonical || capabilities.liveRoster === false ? "status warning" : "status ready";
  intelligenceSummary.innerHTML = `
    <div><span>Equipped Mods</span><strong>${capabilityNumber(body, "equippedMods", summary.equippedMods)}</strong></div>
    <div><span>6-dot Mods</span><strong>${capabilityNumber(body, "sixDotMods", summary.sixDotMods)}</strong></div>
    <div><span>Purchased Abilities</span><strong>${capabilityNumber(body, "purchasedAbilities", summary.purchasedAbilities)}</strong></div>
    <div><span>Unlocked Titles</span><strong>${capabilityNumber(body, "unlockedCosmetics", summary.unlockedTitles)}</strong></div>
    <div><span>Unlocked Portraits</span><strong>${capabilityNumber(body, "unlockedCosmetics", summary.unlockedPortraits)}</strong></div>
    <div><span>Datacrons</span><strong>${capabilityNumber(body, "datacrons", summary.datacrons)}</strong></div>
    <div><span>GAC League</span><strong>${escapeHtml(String(league))}${division ? ` ${escapeHtml(String(division))}` : ""}</strong></div>
    <div><span>GAC Rating</span><strong>${rosterCapabilityKnown(body, "competitiveProfile") ? knownNumber(competitive.gacSkillRating || body.player?.gacSkillRating) : "N/A"}</strong></div>
  `;

  if (squads.length) {
    squadGrid.innerHTML = squads.map((squad) => {
      const readiness = squadReadiness(squad);
      const members = squad.members.map((member) => `
        <button class="squad-member" data-squad-base-id="${escapeAttr(member.baseId)}" type="button">
          <span>${escapeHtml(member.name)}</span>
          <strong>${number(member.power)} GP · ${number(member.readiness)}%</strong>
        </button>
      `).join("");
      return `
        <article class="squad-card">
          <div class="squad-heading">
            <div><span>Faction</span><h4>${escapeHtml(squad.faction)}</h4></div>
            <strong>${number(squad.totalPower)} GP</strong>
          </div>
          <div class="squad-meta">
            <span>${number(squad.averageReadiness)}% avg readiness</span>
            <span>${readiness.ready} ready · ${readiness.developing} developing · ${readiness.needsWork} needs work</span>
            ${squad.benchCount ? `<span>${number(squad.benchCount)} additional owned</span>` : ""}
          </div>
          <div class="squad-members">${members}</div>
        </article>
      `;
    }).join("");
  } else {
    squadGrid.innerHTML = `<div class="intel-empty">No five-character faction group could be built from the normalized owned roster.</div>`;
  }

  for (const button of squadGrid.querySelectorAll("button[data-squad-base-id]")) {
    button.addEventListener("click", () => {
      const unit = state.characters.find((candidate) => candidate.baseId === button.dataset.squadBaseId);
      if (unit) showDetails(unit);
    });
  }

  profileStatsGrid.innerHTML = profileStats.length
    ? profileStats.slice(0, 12).map((stat) => `
      <div class="profile-stat">
        <span>${escapeHtml(stat.id || "Profile Stat")}</span>
        <strong>${escapeHtml(String(stat.value ?? "N/A"))}</strong>
      </div>
    `).join("")
    : `<div class="intel-empty">${canonical ? "Public profile-stat detail requires a live refresh." : "No public profile-stat entries returned for this player."}</div>`;

  seasonGrid.innerHTML = seasons.length
    ? seasons.slice(0, 3).map((season) => `
      <article class="season-card">
        <div><span>Season</span><strong>${escapeHtml(season.seasonId || "Current")}</strong></div>
        <div><span>League / Division</span><strong>${escapeHtml(String(season.league || league || "N/A"))}${season.division ? ` ${escapeHtml(String(season.division))}` : ""}</strong></div>
        <div><span>Points</span><strong>${number(season.seasonPoints)}</strong></div>
        <div><span>Rank</span><strong>${season.rank ? `#${number(season.rank)}` : "N/A"}</strong></div>
      </article>
    `).join("")
    : `<div class="intel-empty">${canonical ? "GAC season detail requires a live refresh." : "No public season-status entries returned for this player."}</div>`;
}

function renderRoster() {
  const query = search.value.trim().toLowerCase();
  const selectedType = unitType.value;
  const selectedAlignment = alignment.value;
  const sortKey = sort.value;

  const units = state.units
    .filter((unit) => selectedType === "All" || unit.unitType === selectedType)
    .filter((unit) => selectedAlignment === "All" || unit.alignment === selectedAlignment)
    .filter((unit) => {
      if (!query) return true;
      const haystack = [unit.name, unit.baseId, unit.unitType, unit.role, unit.alignment, ...(unit.factions || []), ...(unit.tags || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (sortKey === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      return Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
    });

  count.textContent = `${units.length} / ${state.units.length}`;
  roster.innerHTML = units.map(cardHtml).join("");
  wireImages(roster);

  for (const button of roster.querySelectorAll("button[data-base-id]")) {
    button.addEventListener("click", () => {
      const unit = state.units.find((candidate) => candidate.baseId === button.dataset.baseId);
      if (unit) showDetails(unit);
    });
  }
}

function wireImages(container) {
  for (const image of container.querySelectorAll("img[data-portrait]")) {
    image.addEventListener("error", () => {
      const fallback = image.dataset.fallback;
      if (fallback && image.src !== fallback) {
        image.src = fallback;
        delete image.dataset.fallback;
      } else {
        image.remove();
      }
    });
  }
}

function cardHtml(unit) {
  const tags = (unit.factions || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const fallback = unit.imageFallback ? ` data-fallback="${escapeAttr(unit.imageFallback)}"` : "";
  const image = `
    <div class="initials">${escapeHtml(unit.short || initials(unit.name))}</div>
    ${unit.image ? `<img data-portrait${fallback} src="${escapeAttr(unit.image)}" alt="${escapeAttr(unit.name)}" loading="lazy">` : ""}
  `;
  const badge = unit.unitType === "Ship" ? "SHIP" : Number(unit.relic) > 0 ? `R${number(unit.relic)}` : `G${number(unit.gear)}`;
  const liveReadiness = isLiveRosterBody(state.lastBody);
  const readiness = liveReadiness ? readinessAnalysis(unit) : null;

  return `
    <article class="unit-card">
      <div class="portrait">${image}<div class="relic">${escapeHtml(badge)}</div></div>
      <div class="unit-body">
        <div class="unit-title"><h3>${escapeHtml(unit.name)}</h3><span>${escapeHtml(unit.alignment)}</span></div>
        <p>${escapeHtml(unit.summary || unit.description || "Roster unit")}</p>
        <div class="metrics">
          <div><span>Power</span><strong>${number(unit.power)}</strong></div>
          <div><span>Speed</span><strong>${number(unit.speed)}</strong></div>
          <div><span>${escapeHtml(readiness?.band || "Readiness")}</span><strong>${readiness ? `${number(unit.readiness)}%` : "LIVE"}</strong></div>
        </div>
        <div class="upgrade-line">Z ${knownNumber(unit.zetas, "—")} · Ω ${knownNumber(unit.omegas, "—")} · Omi ${knownNumber(unit.omicrons, "—")}</div>
        <div class="tags">${tags}</div>
        <button data-base-id="${escapeAttr(unit.baseId)}">Inspect</button>
      </div>
    </article>
  `;
}

function initials(name) {
  return String(name || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function abilityFlags(ability) {
  return [
    ability.hasZeta || ability.zeta ? "Zeta" : "",
    ability.hasOmega || ability.omega ? "Omega" : "",
    ability.hasOmicron || ability.omicron ? "Omicron" : "",
  ].filter(Boolean).map((label) => `<em>${escapeHtml(label)}</em>`).join("");
}

function showDetails(unit) {
  const liveReadiness = isLiveRosterBody(state.lastBody);
  const readiness = liveReadiness ? readinessAnalysis(unit) : null;
  const abilities = (unit.abilities || []).map((ability) => `
    <li>
      <div class="ability-heading"><strong>${escapeHtml(ability.name || ability.type)}</strong><div class="ability-flags">${abilityFlags(ability)}</div></div>
      <span>Tier ${number(ability.tier || 0)}${ability.maxTier ? ` / ${number(ability.maxTier)}` : ""}</span>
      <span>${escapeHtml(ability.note || ability.description || "")}</span>
    </li>
  `).join("");
  const gaps = readiness
    ? readiness.gaps.length
      ? readiness.gaps.map((gap) => `<li class="requirement-gap ${escapeAttr(gap.severity)}"><strong>${escapeHtml(gap.label)}</strong><span>${escapeHtml(gap.severity)} priority</span></li>`).join("")
      : `<li class="requirement-gap complete"><strong>Baseline development targets met</strong><span>No basic star, level, gear/relic or mod-slot gap detected.</span></li>`
    : `<li class="requirement-gap"><strong>Live detail required</strong><span>Refresh the live roster before calculating mod-slot readiness or readiness gaps.</span></li>`;
  const purchasedAbilities = (unit.purchasedAbilityIds || []).map((id) => `<li><code>${escapeHtml(id)}</code></li>`).join("");
  const purchasedCount = rosterCapabilityKnown(state.lastBody || {}, "purchasedAbilities") ? knownNumber(unit.purchasedAbilityIds?.length) : "N/A";

  details.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="kicker">${escapeHtml(unit.unitType)} · ${escapeHtml(unit.baseId)}</div>
    <h2>${escapeHtml(unit.name)}</h2>
    <p>${escapeHtml(unit.role)} · ${escapeHtml(unit.alignment)}</p>
    <div class="readiness-banner">
      <div><span>Readiness</span><strong>${readiness ? `${number(readiness.score)}%` : "—"}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(readiness?.band || "Live detail required")}</strong></div>
      <div><span>Development Gaps</span><strong>${readiness ? number(readiness.gapCount) : "—"}</strong></div>
    </div>
    <div class="detail-metrics">
      <div><span>Power</span><strong>${number(unit.power)}</strong></div>
      <div><span>Speed</span><strong>${number(unit.speed)}</strong></div>
      <div><span>Stars</span><strong>${number(unit.stars)}</strong></div>
      <div><span>Gear</span><strong>${number(unit.gear)}</strong></div>
      <div><span>Relic</span><strong>${number(unit.relic)}</strong></div>
      <div><span>Equipped Mods</span><strong>${capabilityNumber(state.lastBody || {}, "equippedMods", unit.equippedMods)}</strong></div>
      <div><span>Zetas</span><strong>${knownNumber(unit.zetas)}</strong></div>
      <div><span>Omegas</span><strong>${knownNumber(unit.omegas)}</strong></div>
      <div><span>Omicrons</span><strong>${knownNumber(unit.omicrons)}</strong></div>
      <div><span>Purchased Abilities</span><strong>${purchasedCount}</strong></div>
    </div>
    <h3>Development Gaps</h3>
    <ul class="requirement-gaps">${gaps}</ul>
    ${purchasedAbilities && rosterCapabilityKnown(state.lastBody || {}, "purchasedAbilities") ? `<h3>Purchased Special Abilities</h3><ul class="purchased-abilities">${purchasedAbilities}</ul>` : ""}
    <h3>Abilities</h3>
    <ul class="abilities">${abilities || "<li>No ability detail returned.</li>"}</ul>
  `;
  details.querySelector(".close").addEventListener("click", () => details.close());
  details.showModal();
}

function renderCatalog() {
  const query = catalogSearch.value.trim().toLowerCase();
  const selectedType = catalogType.value;
  const selectedAlignment = catalogAlignment.value;
  const sortKey = catalogSort.value;

  const units = state.catalog
    .filter((unit) => selectedType === "All" || unit.unitType === selectedType)
    .filter((unit) => selectedAlignment === "All" || unit.alignment === selectedAlignment)
    .filter((unit) => {
      if (!query) return true;
      return [unit.name, unit.baseId, unit.role, unit.alignment, ...(unit.factions || []), ...(unit.categories || [])].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (sortKey === "abilities") return (b.abilities?.length || 0) - (a.abilities?.length || 0) || a.name.localeCompare(b.name);
      if (sortKey === "type") return a.unitType.localeCompare(b.unitType) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

  const visible = units.slice(0, state.catalogShown);
  catalogCount.textContent = `${visible.length} shown / ${units.length} matching / ${state.catalog.length} total`;
  catalogGrid.innerHTML = visible.map(catalogCardHtml).join("");
  catalogMore.classList.toggle("hidden", visible.length >= units.length);
  wireImages(catalogGrid);

  for (const button of catalogGrid.querySelectorAll("button[data-catalog-base-id]")) {
    button.addEventListener("click", () => {
      const unit = staticUnitFor(button.dataset.catalogBaseId);
      if (unit) showCatalogDetails(unit);
    });
  }
}

function catalogCardHtml(unit) {
  const special = (unit.abilities || []).reduce((counts, ability) => {
    if (ability.zeta) counts.zeta += 1;
    if (ability.omega) counts.omega += 1;
    if (ability.omicron) counts.omicron += 1;
    return counts;
  }, { zeta: 0, omega: 0, omicron: 0 });
  const tags = (unit.factions || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

  return `
    <article class="catalog-unit">
      <div class="catalog-portrait">
        <div class="initials">${escapeHtml(initials(unit.name))}</div>
        ${unit.image ? `<img data-portrait src="${escapeAttr(unit.image)}" alt="${escapeAttr(unit.name)}" loading="lazy">` : ""}
        <div class="relic">${escapeHtml(unit.unitType === "Ship" ? "SHIP" : "CHAR")}</div>
      </div>
      <div class="catalog-body">
        <div class="unit-title"><h3>${escapeHtml(unit.name)}</h3><span>${escapeHtml(unit.alignment)}</span></div>
        <p>${escapeHtml(unit.description || `${unit.role} · ${unit.baseId}`)}</p>
        <div class="catalog-metrics">
          <span>${number(unit.abilities?.length || 0)} abilities</span>
          <span>Z ${number(special.zeta)}</span>
          <span>Ω ${number(special.omega)}</span>
          <span>Omi ${number(special.omicron)}</span>
        </div>
        <div class="tags">${tags}</div>
        <button data-catalog-base-id="${escapeAttr(unit.baseId)}">View Game Data</button>
      </div>
    </article>
  `;
}

function showCatalogDetails(unit) {
  const abilities = (unit.abilities || []).map((ability) => `
    <li>
      <div class="ability-heading"><strong>${escapeHtml(ability.name)}</strong><div class="ability-flags">${abilityFlags(ability)}</div></div>
      <span>${escapeHtml(ability.type)}${ability.maxTier ? ` · Max Tier ${number(ability.maxTier)}` : ""}</span>
      <span>${escapeHtml(ability.description || "")}</span>
    </li>
  `).join("");
  const factions = (unit.factions || []).map((faction) => `<span>${escapeHtml(faction)}</span>`).join("");

  details.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="kicker">STATIC GAME DATA · ${escapeHtml(unit.baseId)}</div>
    <h2>${escapeHtml(unit.name)}</h2>
    <p>${escapeHtml(unit.role)} · ${escapeHtml(unit.alignment)} · ${escapeHtml(unit.unitType)}</p>
    <p>${escapeHtml(unit.description || "")}</p>
    <div class="tags detail-tags">${factions}</div>
    <div class="detail-metrics">
      <div><span>Max Stars</span><strong>${number(unit.maxRarity)}</strong></div>
      <div><span>Max Level</span><strong>${number(unit.maxLevel)}</strong></div>
      <div><span>Abilities</span><strong>${number(unit.abilities?.length || 0)}</strong></div>
      <div><span>Gear Tiers</span><strong>${number(unit.gearTiers?.length || 0)}</strong></div>
      <div><span>Crew</span><strong>${number(unit.crew?.length || 0)}</strong></div>
      <div><span>Legend</span><strong>${unit.legend ? "Yes" : "No"}</strong></div>
    </div>
    <h3>Abilities</h3>
    <ul class="abilities">${abilities || "<li>No abilities in catalog.</li>"}</ul>
  `;
  details.querySelector(".close").addEventListener("click", () => details.close());
  details.showModal();
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

search.addEventListener("input", renderRoster);
unitType.addEventListener("change", renderRoster);
alignment.addEventListener("change", renderRoster);
sort.addEventListener("change", () => {
  if (sort.value === "readiness" && isCanonicalRosterBody(state.lastBody || {})) {
    showError("Readiness requires live-only roster detail. Use Refresh Live Detail in Roster Commander to promote this persisted baseline before ranking readiness.");
  }
  renderRoster();
});
catalogSearch.addEventListener("input", () => { state.catalogShown = 24; renderCatalog(); });
catalogType.addEventListener("change", () => { state.catalogShown = 24; renderCatalog(); });
catalogAlignment.addEventListener("change", () => { state.catalogShown = 24; renderCatalog(); });
catalogSort.addEventListener("change", () => { state.catalogShown = 24; renderCatalog(); });
catalogMore.addEventListener("click", () => { state.catalogShown += 24; renderCatalog(); });
details.addEventListener("click", (event) => {
  if (event.target === details) details.close();
});

checkHealth();
loadCatalog();