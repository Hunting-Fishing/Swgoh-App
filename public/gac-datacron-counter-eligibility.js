import "./gac-defense-datacron-ui.js";
import "./gac-own-defense-reserve.js";
import "./gac-saved-board-planner.js";
import "./gac-evidence-war-room.js";
import "./gac-war-room-matchup-deltas.js";
import {
  bestCoverage,
  datacronLabel,
  loadEligibilityContext,
} from "./gac-datacron-eligibility.js";
import { mechanicsLabels } from "./gac-datacron-mechanics.js";

let refreshToken = 0;

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function normalizedName(value) { return clean(value).toLowerCase().replace(/\s+/g, " "); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.querySelector('link[data-gac-datacron-counter-fit="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-datacron-counter-eligibility.css?v=20260819-gacdcfit2";
  link.dataset.gacDatacronCounterFit = "true";
  document.head.append(link);
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

function liveNameIndex(roster = {}) {
  const index = new Map();
  for (const unit of Array.isArray(roster?.units) ? roster.units : []) {
    const key = normalizedName(unit?.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(unit);
  }
  return index;
}

function squadFromCard(card, roster) {
  const names = [...card.querySelectorAll(".gac-counter-units [title]")]
    .map((node) => clean(node.getAttribute("title")))
    .filter(Boolean);
  if (!names.length) return { known: false, squad: [], reason: "counter-squad-names-unavailable" };
  const index = liveNameIndex(roster);
  const squad = [];
  for (const name of names) {
    const matches = index.get(normalizedName(name)) || [];
    if (matches.length !== 1) {
      return { known: false, squad: [], reason: matches.length ? `ambiguous-unit:${name}` : `unit-not-found:${name}` };
    }
    squad.push(matches[0]);
  }
  return { known: true, squad, reason: "exact-live-name-match" };
}

function readableFailure(reason) {
  const value = clean(reason);
  if (value.startsWith("requires-r")) return value.replace("requires-r", "needs R");
  if (value === "target-category-mismatch") return "not targeted by this bonus";
  if (value === "alignment-mismatch") return "alignment mismatch";
  if (value.startsWith("excluded:")) return `excluded ${value.slice(9).replace(/_/g, " ")}`;
  if (value === "unit-catalog-missing") return "unit catalog missing";
  if (value === "target-rule-unresolved") return "target rule unresolved";
  return value.replace(/-/g, " ");
}

function blockedSummary(coverage) {
  return coverage.members
    .filter((member) => member.benefitEligible !== true)
    .slice(0, 3)
    .map((member) => {
      const reason = member.failures.find((entry) => /requires-r|mismatch|excluded/.test(entry)) || member.failures[0] || "no matching ability target";
      return `${member.name}: ${readableFailure(reason)}`;
    })
    .join(" · ");
}

function resolvedAbilityNames(datacron) {
  return [...new Set((Array.isArray(datacron?.affixes) ? datacron.affixes : [])
    .filter((affix) => affix?.abilityTextResolved === true && clean(affix?.abilityName))
    .map((affix) => clean(affix.abilityName)))]
    .slice(0, 3);
}

function loadoutRecommendation(coverage, catalog = null) {
  if (!coverage?.datacron || !Number.isFinite(Number(coverage?.squadSize))) return null;
  const mechanics = mechanicsLabels(coverage.datacron, 8);
  return Object.freeze({
    datacronId: clean(coverage.datacron?.id),
    label: datacronLabel(coverage.datacron, catalog),
    level: Number(coverage.datacron?.level || 0),
    eligibleMembers: Number(coverage.eligibleMembers || 0),
    squadSize: Number(coverage.squadSize || 0),
    leaderEligible: coverage.leaderEligible === true,
    fullCoverage: Number(coverage.eligibleMembers || 0) === Number(coverage.squadSize || 0),
    mechanics: Object.freeze(mechanics),
  });
}

function renderUnknown(card, message) {
  card.querySelector(".gac-datacron-counter-fit")?.remove();
  delete card.dataset.datacronId;
  delete card.dataset.datacronCoverage;
  const output = document.createElement("div");
  output.className = "gac-datacron-counter-fit is-unknown";
  output.innerHTML = `<strong>Datacron loadout:</strong> ${escapeHtml(message)}<small>Datacron evidence is separate from historical counter strength; unknown evidence is never scored as zero.</small>`;
  card.append(output);
}

function renderCoverage(card, coverage, catalog) {
  card.querySelector(".gac-datacron-counter-fit")?.remove();
  const recommendation = loadoutRecommendation(coverage, catalog);
  const full = recommendation?.fullCoverage === true;
  const output = document.createElement("div");
  output.className = `gac-datacron-counter-fit ${full ? "is-full" : "is-partial"}`;
  const label = recommendation?.label || datacronLabel(coverage.datacron, catalog);
  const blocked = blockedSummary(coverage);
  const abilityNames = resolvedAbilityNames(coverage.datacron);
  const mechanics = recommendation?.mechanics || [];
  if (recommendation?.datacronId) card.dataset.datacronId = recommendation.datacronId;
  card.dataset.datacronCoverage = `${recommendation?.eligibleMembers || 0}/${recommendation?.squadSize || 0}`;
  const abilityLine = abilityNames.length
    ? `<small>Official ability text: ${escapeHtml(abilityNames.join(" · "))}</small>`
    : `<small>Ability mechanics text is not resolved for this selected datacron; coverage uses target/gate evidence only.</small>`;
  const mechanicsLine = mechanics.length
    ? `<div class="gac-datacron-mechanics"><span>MECHANICS</span>${mechanics.map((labelText) => `<b>${escapeHtml(labelText)}</b>`).join("")}</div>`
    : `<small>No traceable mechanics labels were resolved from official ability text.</small>`;
  output.innerHTML = `
    <strong>Recommended owned datacron:</strong> ${escapeHtml(label)} · ${recommendation?.eligibleMembers || 0}/${recommendation?.squadSize || 0} members receive ≥1 unlocked ability target${recommendation?.leaderEligible ? " · leader eligible" : ""}
    ${abilityLine}
    ${mechanicsLine}
    ${blocked ? `<small>${escapeHtml(blocked)}</small>` : `<small>Eligibility and mechanics evidence only. Historical win rate remains the counter-strength signal; no arbitrary datacron power multiplier is applied.</small>`}`;
  card.append(output);
}

async function enhanceCards() {
  const grid = byId("gacCounterGrid");
  if (!grid) return;
  const cards = [...grid.querySelectorAll(".gac-counter-card")].filter((card) => card.dataset.datacronFit !== "done");
  if (!cards.length) return;

  const myCode = allyCode(byId("allyCode")?.value);
  if (!/^\d{9}$/.test(myCode)) return;
  const token = ++refreshToken;

  let roster;
  let context;
  try {
    [roster, context] = await Promise.all([
      fetchJson(`/api/player/${myCode}`),
      loadEligibilityContext(),
    ]);
  } catch {
    if (token !== refreshToken) return;
    for (const card of cards) {
      card.dataset.datacronFit = "done";
      renderUnknown(card, "catalog or live roster evidence unavailable");
    }
    return;
  }
  if (token !== refreshToken) return;

  const datacrons = Array.isArray(roster?.datacrons) ? roster.datacrons : null;
  for (const card of cards) {
    card.dataset.datacronFit = "done";
    if (datacrons === null) {
      renderUnknown(card, "detailed live datacrons unavailable");
      continue;
    }
    if (!datacrons.length) {
      renderUnknown(card, "no owned datacrons returned by the live roster");
      continue;
    }

    const resolvedSquad = squadFromCard(card, roster);
    if (!resolvedSquad.known) {
      renderUnknown(card, resolvedSquad.reason);
      continue;
    }

    const coverage = bestCoverage(datacrons, resolvedSquad.squad, context.unitIndex, context.datacronCatalog);
    if (!coverage) {
      renderUnknown(card, "no fully resolved owned ability-target datacron matches this squad yet");
      continue;
    }
    renderCoverage(card, coverage, context.datacronCatalog);
  }
}

function resetCards() {
  document.querySelectorAll("#gacCounterGrid .gac-counter-card").forEach((card) => {
    card.dataset.datacronFit = "";
    delete card.dataset.datacronId;
    delete card.dataset.datacronCoverage;
  });
}

function ensureMounted() {
  injectStyles();
  const grid = byId("gacCounterGrid");
  if (!grid || grid.dataset.datacronEligibilityBound === "true") return;
  grid.dataset.datacronEligibilityBound = "true";
  new MutationObserver(() => {
    const hasPending = [...grid.querySelectorAll(".gac-counter-card")].some((card) => card.dataset.datacronFit !== "done");
    if (hasPending) void enhanceCards();
  }).observe(grid, { childList: true, subtree: true });
  resetCards();
  void enhanceCards();
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });

export { blockedSummary, loadoutRecommendation, resolvedAbilityNames, squadFromCard };