import {
  bestCoverage,
  datacronLabel,
  loadEligibilityContext,
} from "./gac-datacron-eligibility.js";

let refreshToken = 0;

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function normalizedName(value) { return clean(value).toLowerCase().replace(/\s+/g, " "); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.querySelector('link[data-gac-datacron-counter-fit="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-datacron-counter-eligibility.css?v=20260819-gacdcfit1";
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
  if (value === "combat-type-mismatch") return "combat type mismatch";
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

function renderUnknown(card, message) {
  card.querySelector(".gac-datacron-counter-fit")?.remove();
  const output = document.createElement("div");
  output.className = "gac-datacron-counter-fit is-unknown";
  output.innerHTML = `<strong>Datacron benefit coverage:</strong> ${escapeHtml(message)}<small>Coverage is separate from counter strength; unknown evidence is never scored as zero.</small>`;
  card.append(output);
}

function renderCoverage(card, coverage, catalog) {
  card.querySelector(".gac-datacron-counter-fit")?.remove();
  const full = coverage.eligibleMembers === coverage.squadSize;
  const output = document.createElement("div");
  output.className = `gac-datacron-counter-fit ${full ? "is-full" : "is-partial"}`;
  const label = datacronLabel(coverage.datacron, catalog);
  const blocked = blockedSummary(coverage);
  output.innerHTML = `
    <strong>Best verified datacron coverage:</strong> ${escapeHtml(label)} · ${coverage.eligibleMembers}/${coverage.squadSize} members receive ≥1 unlocked ability target${coverage.leaderEligible === true ? " · leader eligible" : ""}
    ${blocked ? `<small>${escapeHtml(blocked)}</small>` : `<small>Eligibility/coverage only. Ability mechanics and combat strength are not yet scored.</small>`}`;
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

export { blockedSummary, squadFromCard };
