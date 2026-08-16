import { ROTE_PLANETS } from "./rote-map-data.js";
import { roteMissionMap } from "./rote-mission-map-registry.js";
import {
  missionEntryRule,
  missionRosterEligibility,
  resolveRoteMissionNodes,
} from "./rote-mission-node-eligibility.js";
import { allRosterUnits, entryGap, normalizeRosterName } from "./tb-mission-intelligence.js";

const state = {
  catalogPromise: null,
  catalog: [],
  catalogById: new Map(),
  catalogByName: new Map(),
  catalogStatus: "idle",
  catalogError: "",
  scheduled: false,
  queue: null,
  queueKey: "",
  search: "",
  phase: "All",
  kind: "All",
  ownership: "All",
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const normalizeName = normalizeRosterName;

function liveSnapshot() {
  return typeof window === "undefined" ? null : window.__swgohLiveSnapshot || null;
}

function catalogMaps(catalog = []) {
  return {
    byId: new Map(catalog.map((unit) => [String(unit?.baseId || ""), unit]).filter(([id]) => id)),
    byName: new Map(catalog.map((unit) => [normalizeName(unit?.name), unit]).filter(([name]) => name)),
  };
}

function catalogMatch(baseId = "", name = "", maps = null) {
  const byId = maps?.byId || state.catalogById;
  const byName = maps?.byName || state.catalogByName;
  const id = String(baseId || "");
  if (id && byId.has(id)) return byId.get(id);
  const normalized = normalizeName(name);
  return normalized ? byName.get(normalized) || null : null;
}

function enrichUnit(unit = {}, maps = null) {
  const staticUnit = catalogMatch(unit.baseId, unit.name, maps) || {};
  const liveFactions = Array.isArray(unit.factions) && unit.factions.length ? unit.factions : null;
  const liveCategories = Array.isArray(unit.categories) && unit.categories.length ? unit.categories : null;
  const liveAlignment = String(unit.alignment || "");
  return {
    ...staticUnit,
    ...unit,
    name: unit.name || staticUnit.name || unit.baseId || "Unknown",
    unitType: unit.unitType || staticUnit.unitType || "Character",
    alignment: liveAlignment && liveAlignment !== "Unknown" ? liveAlignment : staticUnit.alignment || liveAlignment || "Unknown",
    factions: liveFactions || staticUnit.factions || [],
    categories: liveCategories || staticUnit.categories || [],
    image: unit.image || staticUnit.image || "",
  };
}

export function enrichRoteRosterBody(body, catalog = []) {
  const maps = catalogMaps(catalog);
  return {
    ...body,
    units: (body?.units || []).map((unit) => enrichUnit(unit, maps)),
    ships: (body?.ships || []).map((unit) => enrichUnit(unit, maps)),
  };
}

async function loadCatalog() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogStatus = "loading";
  state.catalogPromise = fetch("/data/catalog.json", { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Static catalog returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.units) || !payload.units.length) throw new Error("Static unit catalog contained no units");
      state.catalog = payload.units;
      const maps = catalogMaps(payload.units);
      state.catalogById = maps.byId;
      state.catalogByName = maps.byName;
      state.catalogStatus = "ready";
      state.catalogError = "";
      state.queue = null;
      state.queueKey = "";
      scheduleRender();
      return payload;
    })
    .catch((error) => {
      state.catalogStatus = "error";
      state.catalogError = error?.message || "Static unit catalog unavailable";
      scheduleRender();
      return null;
    });
  return state.catalogPromise;
}

export function rotePoolEvidence(mission = {}) {
  const rule = missionEntryRule(mission);
  if (String(rule.unitType || "Character").toLowerCase() !== "ship") return "exact";
  if (rule.allowedBaseIds.length || rule.requiredBaseIds.length || rule.categories.length || rule.alignments.length) return "exact";
  return "gate-only";
}

function unitFactionSet(unit = {}) {
  return new Set([...(unit.factions || []), ...(unit.categories || [])].map((value) => String(value).toLowerCase()));
}

export function unitMatchesRotePoolIdentity(unit = {}, rule = {}) {
  if (rule.unitType && String(unit.unitType || "Character").toLowerCase() !== String(rule.unitType).toLowerCase()) return false;
  const alignment = String(unit.alignment || "").toLowerCase();
  if (rule.alignments?.length && !rule.alignments.some((allowed) => alignment === String(allowed).toLowerCase())) return false;
  const baseId = String(unit.baseId || "");
  if (rule.requiredBaseIds?.length && !rule.requiredBaseIds.includes(baseId)) return false;
  if (rule.allowedBaseIds?.length && !rule.allowedBaseIds.includes(baseId)) return false;
  if (rule.categories?.length) {
    const factions = unitFactionSet(unit);
    const checks = rule.categories.map((category) => factions.has(String(category).toLowerCase()));
    if (rule.categoryMode === "any" ? !checks.some(Boolean) : !checks.every(Boolean)) return false;
  }
  return true;
}

function currentUnitLabel(unit = null) {
  if (!unit) return "Not owned";
  if (String(unit.unitType || "Character") === "Ship") return `${Number(unit.stars || 0)}★ · ${number(unit.power)} GP`;
  const progression = Number(unit.relic || 0) > 0 ? `R${Number(unit.relic || 0)}` : `G${Number(unit.gear || 0)}`;
  return `${progression} · ${number(unit.power)} GP`;
}

export function roteGapLabel(gap = {}) {
  if (gap?.missing) return "Acquire unit";
  const parts = [];
  if (Number(gap.stars || 0) > 0) parts.push(`+${Number(gap.stars)}★`);
  if (Number(gap.relic || 0) > 0) parts.push(`+${Number(gap.relic)} relic`);
  if (Number(gap.gear || 0) > 0) parts.push(`+${Number(gap.gear)} gear`);
  if (Number(gap.power || 0) > 0) parts.push(`+${number(gap.power)} GP`);
  return parts.length ? parts.join(" · ") : "Gate met";
}

function missionRef(planet, mission, kind, gap, shortfall = 0) {
  return Object.freeze({
    key: `${planet.id}:${mission.id}`,
    planetId: planet.id,
    planetName: planet.name,
    phase: planet.phase,
    missionId: mission.id,
    missionName: mission.name,
    kind,
    gap,
    shortfall,
  });
}

function resolveMemberIdentity(row, catalogMapsForRun) {
  const unit = row?.unit || null;
  const member = row?.member || {};
  const staticUnit = catalogMatch(member.baseId || unit?.baseId, member.name || unit?.name, catalogMapsForRun) || {};
  return {
    baseId: String(unit?.baseId || member.baseId || staticUnit.baseId || ""),
    name: String(unit?.name || member.name || staticUnit.name || member.baseId || "Required unit"),
    image: unit?.image || staticUnit.image || "",
    unitType: unit?.unitType || staticUnit.unitType || "Character",
    unit,
  };
}

function liveRosterMaps(body = {}) {
  const roster = allRosterUnits(body);
  return {
    byId: new Map(roster.map((unit) => [String(unit.baseId || ""), unit]).filter(([id]) => id)),
    byName: new Map(roster.map((unit) => [normalizeName(unit.name), unit]).filter(([name]) => name)),
  };
}

function liveMatch(catalogUnit = {}, liveMaps) {
  const id = String(catalogUnit.baseId || "");
  if (id && liveMaps.byId.has(id)) return liveMaps.byId.get(id);
  return liveMaps.byName.get(normalizeName(catalogUnit.name)) || null;
}

export function nearestPoolUpgradeCandidates(body, catalog, mission, eligibility, limit = 3) {
  const rule = missionEntryRule(mission);
  if (rotePoolEvidence(mission) !== "exact") return [];
  const shortfall = Math.max(0, Number(eligibility?.poolTarget || 0) - Number(eligibility?.candidates?.length || 0));
  if (!shortfall) return [];
  const liveMaps = liveRosterMaps(body);
  const legalIds = new Set((eligibility.candidates || []).map((unit) => String(unit.baseId || "")).filter(Boolean));
  const seen = new Set();
  const rows = [];

  for (const staticUnit of catalog || []) {
    if (!staticUnit || !unitMatchesRotePoolIdentity(staticUnit, rule)) continue;
    const baseId = String(staticUnit.baseId || "");
    const key = baseId || normalizeName(staticUnit.name);
    if (!key || seen.has(key) || legalIds.has(baseId)) continue;
    seen.add(key);
    const owned = liveMatch(staticUnit, liveMaps);
    const gap = owned ? entryGap(owned, mission) : { ...entryGap(null, mission), score: 1_000_000 };
    if (!gap.missing && Number(gap.score || 0) <= 0) continue;
    rows.push({
      baseId,
      name: staticUnit.name || baseId,
      image: staticUnit.image || "",
      unitType: staticUnit.unitType || rule.unitType,
      unit: owned,
      owned: Boolean(owned),
      gap,
    });
  }

  return rows
    .sort((a, b) => Number(b.owned) - Number(a.owned) || Number(a.gap?.score || 0) - Number(b.gap?.score || 0) || String(a.name).localeCompare(String(b.name)))
    .slice(0, Math.max(limit, shortfall));
}

export function aggregateRoteUpgradeEntries(entries = []) {
  const grouped = new Map();
  for (const entry of entries) {
    const baseId = String(entry?.baseId || "");
    const name = String(entry?.name || baseId || "Required unit");
    const key = baseId || normalizeName(name);
    if (!key) continue;
    let item = grouped.get(key);
    if (!item) {
      item = {
        key,
        baseId,
        name,
        image: entry.image || "",
        unitType: entry.unitType || "Character",
        unit: entry.unit || null,
        owned: Boolean(entry.unit || entry.owned),
        mandatory: new Map(),
        pool: new Map(),
        gaps: [],
      };
      grouped.set(key, item);
    }
    if (!item.baseId && baseId) item.baseId = baseId;
    if (!item.image && entry.image) item.image = entry.image;
    if (!item.unit && entry.unit) item.unit = entry.unit;
    if (entry.unit || entry.owned) item.owned = true;
    if (entry.ref?.kind === "mandatory") item.mandatory.set(entry.ref.key, entry.ref);
    if (entry.ref?.kind === "pool") item.pool.set(entry.ref.key, entry.ref);
    if (entry.gap) item.gaps.push(entry.gap);
  }

  return [...grouped.values()].map((item) => {
    const mandatoryRefs = [...item.mandatory.values()];
    const poolRefs = [...item.pool.values()];
    const missionKeys = new Set([...mandatoryRefs, ...poolRefs].map((ref) => ref.key));
    const maxGap = item.gaps.slice().sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0] || {};
    const maxGapScore = Number(maxGap?.score || 0);
    return Object.freeze({
      key: item.key,
      baseId: item.baseId,
      name: item.name,
      image: item.image,
      unitType: item.unitType,
      unit: item.unit,
      owned: item.owned,
      mandatoryImpact: mandatoryRefs.length,
      poolImpact: poolRefs.length,
      missionImpact: missionKeys.size,
      refs: Object.freeze([...mandatoryRefs, ...poolRefs]),
      maxGap: Object.freeze({ ...maxGap }),
      maxGapScore,
      priorityScore: mandatoryRefs.length * 1_000_000 + missionKeys.size * 100_000 + Number(item.owned) * 10_000 - Math.min(maxGapScore, 9_999),
    });
  }).sort((a, b) => b.mandatoryImpact - a.mandatoryImpact
    || b.missionImpact - a.missionImpact
    || Number(b.owned) - Number(a.owned)
    || a.maxGapScore - b.maxGapScore
    || String(a.name).localeCompare(String(b.name)));
}

export function buildRoteUpgradePriorityQueue(body, catalog = []) {
  if (!body) return Object.freeze({ entries: Object.freeze([]), missionsScanned: 0, missionsReady: 0, poolGapMissions: 0, partialFleetMissions: 0, exactMandatoryBlockers: 0 });
  const enriched = enrichRoteRosterBody(body, catalog);
  const catalogMapsForRun = catalogMaps(catalog);
  const entries = [];
  let missionsScanned = 0;
  let missionsReady = 0;
  let poolGapMissions = 0;
  let partialFleetMissions = 0;
  let exactMandatoryBlockers = 0;
  const seenMissions = new Set();

  for (const planet of ROTE_PLANETS) {
    const map = roteMissionMap(planet.id);
    if (!map) continue;
    const resolved = resolveRoteMissionNodes(planet.id, map);
    for (const mission of resolved.missions || []) {
      const missionKey = `${planet.id}:${mission?.id || ""}`;
      if (!mission?.entry?.verified || seenMissions.has(missionKey)) continue;
      seenMissions.add(missionKey);
      missionsScanned += 1;
      const eligibility = missionRosterEligibility(enriched, mission);
      if (!eligibility.loaded) continue;
      const evidence = rotePoolEvidence(mission);
      if (eligibility.ready && evidence === "exact") missionsReady += 1;
      const poolShortfall = Math.max(0, Number(eligibility.poolTarget || 0) - Number(eligibility.candidates?.length || 0));
      if (poolShortfall > 0) poolGapMissions += 1;
      if (evidence === "gate-only") partialFleetMissions += 1;

      for (const row of eligibility.mandatory || []) {
        if (row.legal) continue;
        exactMandatoryBlockers += 1;
        const identity = resolveMemberIdentity(row, catalogMapsForRun);
        const gap = row.gap || entryGap(identity.unit, mission, row.member || null);
        entries.push({
          ...identity,
          owned: Boolean(identity.unit),
          gap,
          ref: missionRef(planet, mission, "mandatory", gap, poolShortfall),
        });
      }

      if (poolShortfall > 0 && evidence === "exact") {
        const near = nearestPoolUpgradeCandidates(enriched, catalog, mission, eligibility, Math.min(3, Math.max(1, poolShortfall)));
        for (const candidate of near) {
          entries.push({
            ...candidate,
            ref: missionRef(planet, mission, "pool", candidate.gap, poolShortfall),
          });
        }
      }
    }
  }

  return Object.freeze({
    entries: Object.freeze(aggregateRoteUpgradeEntries(entries)),
    missionsScanned,
    missionsReady,
    poolGapMissions,
    partialFleetMissions,
    exactMandatoryBlockers,
  });
}

function portraitMarkup(item) {
  if (item.image) return `<span class="rote-priority-portrait"><img src="${escapeAttr(item.image)}" alt="" loading="lazy" decoding="async"></span>`;
  const initials = String(item.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  return `<span class="rote-priority-portrait">${escapeHtml(initials)}</span>`;
}

function refMarkup(ref) {
  const kind = ref.kind === "mandatory" ? "MANDATORY" : "POOL DEPTH";
  return `<button type="button" class="rote-priority-mission" data-rote-priority-planet="${escapeAttr(ref.planetId)}"><span>${escapeHtml(ref.phase)} · ${escapeHtml(ref.planetName)}</span><strong>${escapeHtml(ref.missionName)}</strong><small>${kind}</small></button>`;
}

function filteredEntries(queue) {
  const query = normalizeName(state.search);
  return (queue?.entries || []).filter((item) => {
    if (state.ownership === "Owned" && !item.owned) return false;
    if (state.ownership === "Missing" && item.owned) return false;
    if (state.kind === "Mandatory" && item.mandatoryImpact <= 0) return false;
    if (state.kind === "Pool" && item.poolImpact <= 0) return false;
    if (state.phase !== "All" && !item.refs.some((ref) => ref.phase === state.phase)) return false;
    if (query) {
      const haystack = normalizeName([item.name, item.baseId, ...item.refs.flatMap((ref) => [ref.planetName, ref.missionName, ref.phase])].join(" "));
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function rowMarkup(item, index) {
  const refs = item.refs.slice(0, 4);
  const more = Math.max(0, item.refs.length - refs.length);
  return `<article class="rote-priority-row">
    <div class="rote-priority-rank">#${index + 1}</div>
    ${portraitMarkup(item)}
    <div class="rote-priority-unit">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(currentUnitLabel(item.unit))}</span>
      <small>${escapeHtml(roteGapLabel(item.maxGap))}</small>
    </div>
    <div class="rote-priority-impact">
      <span><b>${item.missionImpact}</b> mission${item.missionImpact === 1 ? "" : "s"}</span>
      <span><b>${item.mandatoryImpact}</b> mandatory</span>
      <span><b>${item.poolImpact}</b> pool option${item.poolImpact === 1 ? "" : "s"}</span>
    </div>
    <div class="rote-priority-missions">${refs.map(refMarkup).join("")}${more ? `<span class="rote-priority-more">+${more} more mission references</span>` : ""}</div>
    <div class="rote-priority-actions">${item.baseId ? `<button type="button" data-inspect-base-id="${escapeAttr(item.baseId)}">Inspect Unit</button>` : ""}</div>
  </article>`;
}

function panelShell() {
  const panel = document.createElement("section");
  panel.id = "roteUpgradePriorityQueue";
  panel.className = "card rote-priority-card";
  panel.dataset.rotePriorityQueue = "";
  return panel;
}

function ensurePanel() {
  const mapView = document.getElementById("roteMapView");
  if (!mapView) return null;
  let panel = document.getElementById("roteUpgradePriorityQueue");
  if (panel) return panel;
  panel = panelShell();
  const boundary = mapView.querySelector(":scope > .rote-map-boundary");
  if (boundary) mapView.insertBefore(panel, boundary);
  else mapView.appendChild(panel);
  return panel;
}

function renderFilteredRows() {
  const panel = document.getElementById("roteUpgradePriorityQueue");
  if (!panel || !state.queue) return;
  const rows = filteredEntries(state.queue);
  const list = panel.querySelector(".rote-priority-list");
  const count = panel.querySelector("[data-rote-priority-count]");
  if (count) count.textContent = `${number(rows.length)} priority units`;
  if (list) list.innerHTML = rows.length
    ? rows.slice(0, 20).map(rowMarkup).join("")
    : '<div class="rote-priority-empty">No upgrade candidates match the current filters.</div>';
}

function renderQueue() {
  state.scheduled = false;
  const panel = ensurePanel();
  if (!panel) return;
  const snapshot = liveSnapshot();
  const renderKey = `${snapshot?.allyCode || "none"}:${snapshot?.fetchedAt || 0}:${state.catalogStatus}:${state.catalog.length}:${state.catalogError}`;
  if (panel.dataset.renderKey === renderKey) return;
  panel.dataset.renderKey = renderKey;

  if (!snapshot?.body) {
    panel.innerHTML = `<div class="rote-priority-head"><div><span>ROTE UPGRADE PRIORITY</span><h3>Mission Impact Queue</h3><p>Load an Ally Code to rank verified ROTE blockers by mission impact and upgrade distance.</p></div><b>NO ROSTER</b></div>`;
    return;
  }
  if (state.catalogStatus === "idle" || state.catalogStatus === "loading") {
    panel.innerHTML = `<div class="rote-priority-head"><div><span>ROTE UPGRADE PRIORITY</span><h3>Mission Impact Queue</h3><p>Loading static unit definitions before calculating exact mission restrictions…</p></div><b>LOADING</b></div>`;
    return;
  }
  if (state.catalogStatus === "error") {
    panel.innerHTML = `<div class="rote-priority-head"><div><span>ROTE UPGRADE PRIORITY</span><h3>Mission Impact Queue</h3><p>${escapeHtml(state.catalogError)}</p></div><b>FAIL CLOSED</b></div>`;
    return;
  }

  const key = `${snapshot.allyCode || ""}:${snapshot.fetchedAt || 0}:${state.catalog.length}`;
  if (!state.queue || state.queueKey !== key) {
    state.queueKey = key;
    state.queue = buildRoteUpgradePriorityQueue(snapshot.body, state.catalog);
  }
  const queue = state.queue;
  const rows = filteredEntries(queue);
  const uniqueMandatoryUnits = queue.entries.filter((item) => item.mandatoryImpact > 0).length;
  panel.innerHTML = `
    <div class="rote-priority-head">
      <div><span>ROTE UPGRADE PRIORITY</span><h3>Mission Impact Queue</h3><p>Exact mandatory blockers rank first, then nearest evidence-safe pool-depth candidates. Higher mission reuse and lower remaining investment rise toward the top.</p></div>
      <b>${queue.missionsReady}/${queue.missionsScanned} exact-entry ready</b>
    </div>
    <div class="rote-priority-summary">
      <article><span>VERIFIED MISSIONS</span><strong>${number(queue.missionsScanned)}</strong><small>Scanned across mapped ROTE planets</small></article>
      <article><span>MANDATORY BLOCKER UNITS</span><strong>${number(uniqueMandatoryUnits)}</strong><small>${number(queue.exactMandatoryBlockers)} blocked mandatory occurrences</small></article>
      <article><span>POOL-DEPTH GAPS</span><strong>${number(queue.poolGapMissions)}</strong><small>Verified mission pools below target</small></article>
      <article><span>PARTIAL FLEET EVIDENCE</span><strong>${number(queue.partialFleetMissions)}</strong><small>Excluded from selectable-ship ranking claims</small></article>
    </div>
    <div class="rote-priority-evidence"><strong>Evidence boundary:</strong> mandatory named-unit blockers are exact. Pool candidates are only proposed when unit identity restrictions are encoded. Generic fleet star gates without a complete allow-list remain visible as partial evidence but do not generate ship farm recommendations.</div>
    <div class="rote-priority-filters">
      <label>Search<input type="search" data-rote-priority-search value="${escapeAttr(state.search)}" placeholder="Unit, planet, mission…"></label>
      <label>Phase<select data-rote-priority-phase>${["All", "P1", "P2", "P3", "P4", "P5", "P6", "Zeffo", "Mandalore"].map((value) => `<option${state.phase === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Impact<select data-rote-priority-kind>${["All", "Mandatory", "Pool"].map((value) => `<option${state.kind === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Ownership<select data-rote-priority-ownership>${["All", "Owned", "Missing"].map((value) => `<option${state.ownership === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <span data-rote-priority-count>${number(rows.length)} priority units</span>
    </div>
    <div class="rote-priority-list">${rows.length ? rows.slice(0, 20).map(rowMarkup).join("") : '<div class="rote-priority-empty">No upgrade candidates match the current filters.</div>'}</div>`;
}

function scheduleRender() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(renderQueue);
}

function install() {
  loadCatalog();
  const observer = new MutationObserver(() => scheduleRender());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-rote-priority-search]")) return;
    state.search = event.target.value || "";
    renderFilteredRows();
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-rote-priority-phase]")) state.phase = event.target.value || "All";
    else if (event.target.matches?.("[data-rote-priority-kind]")) state.kind = event.target.value || "All";
    else if (event.target.matches?.("[data-rote-priority-ownership]")) state.ownership = event.target.value || "All";
    else return;
    renderFilteredRows();
  });
  document.addEventListener("click", (event) => {
    const planet = event.target.closest?.("[data-rote-priority-planet]");
    if (planet) {
      event.preventDefault();
      event.stopPropagation();
      document.querySelector('button[data-rote-view="map"]')?.click();
      const planetId = String(planet.dataset.rotePriorityPlanet || "");
      setTimeout(() => document.querySelector(`#roteGalaxyMap [data-rote-planet="${planetId}"]`)?.click(), 0);
      return;
    }
    if (event.target.closest?.('button[data-workspace-tab="rote"]')) setTimeout(scheduleRender, 300);
  }, true);
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.queue = null;
    state.queueKey = "";
    const panel = document.getElementById("roteUpgradePriorityQueue");
    if (panel) panel.dataset.renderKey = "";
    setTimeout(scheduleRender, 550);
  });
  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#rote") setTimeout(scheduleRender, 250);
  });
  scheduleRender();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
