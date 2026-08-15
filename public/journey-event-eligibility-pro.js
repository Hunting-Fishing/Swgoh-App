import { JOURNEY_EVENT_PROFILES, buildEventCandidatePlan } from "./journey-event-eligibility.js";

const CACHE_MS = 25_000;
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const NUMBER = new Intl.NumberFormat();

const state = {
  catalog: [],
  catalogMap: new Map(),
  manifest: null,
  body: null,
  allyCode: "",
  fetchedAt: 0,
  renderTimer: 0,
  rendering: false,
  rerender: false,
  pendingForce: false,
};

function journeyMapVisible() {
  const farm = $("workspace-farm");
  const map = $("farmJourneyMap");
  return Boolean(
    farm && !farm.hidden &&
    map && !map.hidden &&
    map.querySelector(".journey-map-toolbar")
  );
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const response = await fetch("/data/catalog.json?journey-eligibility=1", { cache: "no-store" });
  if (!response.ok) throw new Error(`Game catalog returned HTTP ${response.status}`);
  const body = await response.json();
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  state.catalogMap = new Map(state.catalog.map((unit) => [String(unit?.baseId || ""), unit]));
  return state.catalog;
}

async function loadManifest() {
  if (state.manifest) return state.manifest;
  const response = await fetch("/data/manifest.json?journey-eligibility=1", { cache: "no-store" });
  if (!response.ok) return null;
  state.manifest = await response.json();
  return state.manifest;
}

async function loadLive(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < CACHE_MS) {
    state.body = shared.body;
    state.allyCode = allyCode;
    state.fetchedAt = Number(shared.fetchedAt || Date.now());
    return shared.body;
  }
  if (!force && state.body && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) return state.body;
  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.body = body;
  state.allyCode = allyCode;
  state.fetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.fetchedAt };
  return body;
}

function targetUnit(profile) {
  return state.catalogMap.get(profile.targetBaseId) || {};
}

function tone(plan) {
  if (plan.complete) return "ready";
  if (plan.percent >= 80) return "close";
  if (plan.percent >= 50) return "building";
  return "far";
}

function candidateStatus(candidate, targetStars) {
  if (!candidate.owned) return { label: "Not owned", tone: "far" };
  if (candidate.finalTierReady) return { label: `${candidate.stars}★ eligible`, tone: "ready" };
  if (candidate.stars >= Math.max(1, targetStars - 1)) return { label: `${candidate.stars}★ · needs ${targetStars}★`, tone: "close" };
  if (candidate.stars >= 4) return { label: `${candidate.stars}★ · needs ${targetStars}★`, tone: "building" };
  return { label: `${candidate.stars}★ · needs ${targetStars}★`, tone: "far" };
}

function compactCandidate(candidate, targetStars) {
  const status = candidateStatus(candidate, targetStars);
  return `
    <button type="button" class="journey-eligibility-candidate tone-${status.tone}" data-inspect-base-id="${escapeAttr(candidate.baseId)}" title="Inspect ${escapeAttr(candidate.name)}">
      ${candidate.image ? `<img src="${escapeAttr(candidate.image)}" alt="" loading="lazy">` : '<span class="journey-eligibility-avatar">?</span>'}
      <span>
        <strong>${escapeHtml(candidate.name)}</strong>
        <small>${escapeHtml(status.label)}${candidate.owned && candidate.power ? ` · ${NUMBER.format(candidate.power)} GP` : ""}</small>
      </span>
    </button>`;
}

function allCandidate(candidate, targetStars) {
  const status = candidateStatus(candidate, targetStars);
  return `
    <button type="button" class="journey-eligibility-pool-row tone-${status.tone}" data-inspect-base-id="${escapeAttr(candidate.baseId)}">
      ${candidate.image ? `<img src="${escapeAttr(candidate.image)}" alt="" loading="lazy">` : '<span class="journey-eligibility-avatar">?</span>'}
      <span class="journey-eligibility-pool-copy">
        <strong>${escapeHtml(candidate.name)}</strong>
        <small>${escapeHtml(status.label)}</small>
      </span>
      <span class="journey-eligibility-pool-stats">
        <b>${candidate.owned ? `${candidate.stars}★` : "—"}</b>
        <small>${candidate.owned && candidate.power ? `${NUMBER.format(candidate.power)} GP` : ""}</small>
      </span>
    </button>`;
}

function selectorCard(plan) {
  const profile = plan.profile;
  const target = targetUnit(profile);
  const cardTone = tone(plan);
  return `
    <article class="journey-eligibility-card tone-${cardTone}" data-eligibility-profile="${escapeAttr(profile.id)}">
      <header class="journey-eligibility-head">
        <button type="button" class="journey-eligibility-target" data-inspect-base-id="${escapeAttr(profile.targetBaseId)}" title="Inspect ${escapeAttr(profile.name)}">
          ${target.image ? `<img src="${escapeAttr(target.image)}" alt="" loading="lazy">` : '<span>★</span>'}
        </button>
        <div class="journey-eligibility-title">
          <span>${escapeHtml(profile.faction)} · ANY ${profile.requiredCount} VERIFIED</span>
          <h4>${escapeHtml(profile.name)}</h4>
          <small>Final event tier: ${profile.requiredCount} legal characters at ${profile.targetStars}★</small>
        </div>
        <div class="journey-eligibility-score">
          <b>${plan.percent}%</b>
          <span>${plan.finalTierEligibleCount}/${profile.requiredCount} eligible</span>
        </div>
      </header>
      <div class="journey-eligibility-progress tone-${cardTone}"><span style="width:${plan.percent}%"></span></div>
      <div class="journey-eligibility-boundary">
        <strong>ENTRY ELIGIBILITY ONLY</strong>
        <span>Legal roster candidates, not a battle-team recommendation.</span>
      </div>
      <section class="journey-eligibility-best">
        <div class="journey-eligibility-subhead">
          <div><span>PROGRESSION / GP ORDER</span><h5>Best progressed legal 5</h5></div>
          <b>${plan.ownedCount} owned · ${plan.poolSize} verified pool</b>
        </div>
        ${plan.bestFive.length
          ? `<div class="journey-eligibility-best-grid">${plan.bestFive.map((candidate) => compactCandidate(candidate, profile.targetStars)).join("")}</div>`
          : '<div class="journey-eligibility-no-roster">Load/own verified event characters to rank your legal roster choices.</div>'}
      </section>
      <details class="journey-eligibility-details">
        <summary><span>All verified event candidates</span><b>${plan.poolSize}</b></summary>
        <div class="journey-eligibility-pool">${plan.candidates.map((candidate) => allCandidate(candidate, profile.targetStars)).join("")}</div>
        ${plan.verificationWarnings.length ? `<div class="journey-eligibility-warning">${plan.verificationWarnings.map(escapeHtml).join(" ")}</div>` : ""}
        <p class="journey-eligibility-source">Checked event pool ∩ versioned catalog faction/category. New faction-tagged characters fail closed until event eligibility is reverified. Current account unlock progression can also include Legacy Story Token / quest-chain gates; this card models the event squad itself, not those separate account gates.</p>
      </details>
    </article>`;
}

function currentFilter() {
  return document.querySelector("#farmJourneyMap [data-journey-map-filter].active")?.dataset?.journeyMapFilter || "all";
}

function currentSearch() {
  return String($("journeyMapSearch")?.value || "").trim().toLowerCase();
}

function visiblePlans(plans) {
  const filter = currentFilter();
  const search = currentSearch();
  return plans.filter((plan) => {
    if (search && ![
      plan.profile.name,
      plan.profile.faction,
      ...plan.candidates.map((candidate) => candidate.name),
    ].join(" ").toLowerCase().includes(search)) return false;
    if (filter === "tracked") return false;
    if (filter === "ready") return plan.complete;
    if (filter === "incomplete") return !plan.complete;
    return true;
  });
}

function versionState() {
  const expected = String(JOURNEY_EVENT_PROFILES[0]?.verification?.gameDataVersion || "");
  const current = String(state.manifest?.gameVersion || "");
  return { expected, current, valid: !expected || !current || current.startsWith(expected) };
}

function versionGate(version) {
  if (version.valid) return "";
  return `<div class="journey-eligibility-version-warning"><strong>REVERIFY EVENT POOLS</strong><span>Eligibility was checked against game data ${escapeHtml(version.expected)}, but the local catalog is now ${escapeHtml(version.current)}. Candidate recommendations are disabled until the pools are reviewed against the new game version.</span></div>`;
}

async function renderEligibility(force = false) {
  if (!journeyMapVisible()) return;
  const map = $("farmJourneyMap");
  const toolbar = map?.querySelector(".journey-map-toolbar");
  if (!toolbar) return;

  await Promise.all([loadCatalog(), loadManifest()]);
  if (!journeyMapVisible()) return;

  const body = await loadLive(force);
  if (!journeyMapVisible()) return;

  const liveUnits = body ? [...(body.units || []), ...(body.ships || [])] : [];
  const plans = JOURNEY_EVENT_PROFILES.map((profile) => buildEventCandidatePlan(profile, state.catalog, liveUnits));
  const visible = visiblePlans(plans);
  const version = versionState();

  $("journeyEventEligibilityBand")?.remove();
  if (!visible.length && version.valid) return;

  const section = document.createElement("section");
  section.id = "journeyEventEligibilityBand";
  section.className = "journey-eligibility-band";
  section.innerHTML = `
    <header>
      <div>
        <span>VERIFIED EVENT-VALID POOLS</span>
        <h3>Legacy Legendary Eligibility</h3>
        <p>Hard entry legality first. A faction tag alone is not enough to enter our suggestions.</p>
      </div>
      <div class="journey-eligibility-legend">
        <strong>${version.valid ? `${visible.length} event${visible.length === 1 ? "" : "s"}` : "Verification paused"}</strong>
        <span>Final-tier ${JOURNEY_EVENT_PROFILES[0]?.targetStars || 7}★ check</span>
      </div>
    </header>
    ${versionGate(version)}
    ${version.valid ? `<div class="journey-eligibility-grid">${visible.map(selectorCard).join("")}</div>` : ""}
    <footer>
      <strong>Battle intelligence comes next.</strong>
      <span>This release does not score ability synergy, enemy mechanics, forced lineups, mods, turn order or minimum relic investment. Those will be layered on top of this legal-entry foundation.</span>
    </footer>`;
  toolbar.insertAdjacentElement("afterend", section);
}

function schedule(delay = 100, force = false) {
  if (force) state.pendingForce = true;
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(async () => {
    if (!journeyMapVisible()) return;
    if (state.rendering) {
      state.rerender = true;
      return;
    }
    state.rendering = true;
    const useForce = state.pendingForce;
    state.pendingForce = false;
    try {
      await renderEligibility(useForce);
    } catch {
      // Eligibility is supplemental; never block workspace navigation.
    } finally {
      state.rendering = false;
      if (state.rerender) {
        state.rerender = false;
        schedule(120, false);
      }
    }
  }, delay);
}

function init() {
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-farm-view='map']")) schedule(220, false);
    if (event.target.closest?.("[data-journey-map-filter]")) schedule(120, false);
    if (event.target.closest?.("[data-track-journey], [data-untrack-journey]")) schedule(320, false);
    if (event.target.closest?.("[data-workspace-tab='farm']")) schedule(260, false);
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "journeyMapSearch") schedule(180, false);
  });
  $("allyForm")?.addEventListener("submit", () => {
    state.body = null;
    state.fetchedAt = 0;
    if (journeyMapVisible()) schedule(800, true);
  });
  window.addEventListener("hashchange", () => schedule(260, false));

  // Deliberately no broad MutationObserver. The previous subtree observer could
  // repeatedly rebuild a large hidden eligibility DOM and starve tab navigation.
  if (journeyMapVisible()) schedule(250, false);
}

init();
