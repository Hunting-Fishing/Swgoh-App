import { ROTE_VISUAL_ASSETS, TB_MISSION_VISUAL_ASSETS } from "./tb-visual-assets-data.js";

const NATIVE_TARGETS = Object.freeze([
  Object.freeze({ title: "Roster Commander", status: "LIVE", icon: "◉", action: "roster", description: "Power-user filtering across GP, progression, mods, abilities, factions, roles and ROTE demand." }),
  Object.freeze({ title: "Squad Workbench", status: "LIVE", icon: "◆", action: "squads", description: "Build and save owned squads, inspect composition metrics and move from roster pressure to team construction." }),
  Object.freeze({ title: "ROTE Player Readiness", status: "LIVE", icon: "♜", action: "guild", image: ROTE_VISUAL_ASSETS.map, description: "Compare the loaded player and Guild against versioned ROTE requirements and mission readiness evidence." }),
  Object.freeze({ title: "Guild ROTE Operations", status: "LIVE", icon: "⬢", action: "guild", image: TB_MISSION_VISUAL_ASSETS.operations, description: "Guild roster coverage, scarcity, Operations planning and officer workflows." }),
  Object.freeze({ title: "Journey Guide", status: "LIVE", icon: "✦", action: "journey", image: TB_MISSION_VISUAL_ASSETS.special, description: "Legacy Journey readiness plus current 2026 Journey and Era Guide evidence in one visual map." }),
  Object.freeze({ title: "Gear & Relic Planner", status: "LIVE", icon: "⚙", action: "farm", description: "Compare live progression with target gear and Relic requirements without inventing inventory balances." }),
  Object.freeze({ title: "Equipped Mod Audit", status: "LIVE", icon: "⬡", action: "mods", description: "Inspect public equipped mods, primaries, secondaries, speed and character coverage." }),
  Object.freeze({ title: "Mod Move Optimizer", status: "LIVE", icon: "⇄", action: "mods", description: "Priority-weighted redistribution inside the public equipped-mod pool." }),
  Object.freeze({ title: "GAC Scout / Compare", status: "BUILDING", icon: "⚔", action: "gac", description: "Opponent evidence, matchup deltas, board state and sourced tactical planning." }),
  Object.freeze({ title: "Event Calendar", status: "NEXT", icon: "▣", action: "events", description: "Recurring events, eligibility and roster readiness in one native calendar." }),
  Object.freeze({ title: "Datacron Analyzer", status: "BUILDING", icon: "◇", action: "datacrons", description: "Current Datacron inventory, resolved effects and matchup truth where evidence is available." }),
  Object.freeze({ title: "Conquest Planner", status: "PLANNED", icon: "◎", description: "Sector and feat planning tied to owned characters and viable squads." }),
  Object.freeze({ title: "Raid Planner", status: "PLANNED", icon: "☄", description: "Raid eligibility, teams, Relic gates and score planning from live roster evidence." }),
  Object.freeze({ title: "Assault Battle Readiness", status: "PLANNED", icon: "⚑", description: "Event-by-event eligible factions and strongest qualifying teams." }),
]);

const EVENT_TARGETS = Object.freeze([
  Object.freeze({ title: "Journey Guide", status: "LIVE", icon: "✦", action: "journey", image: TB_MISSION_VISUAL_ASSETS.special, description: "Legacy unlock readiness plus current 2026 Journey / Era Guide evidence." }),
  Object.freeze({ title: "Rise of the Empire", status: "LIVE", icon: "♜", action: "guild", image: ROTE_VISUAL_ASSETS.map, description: "ROTE map, Operations, mission coverage and Guild command." }),
  Object.freeze({ title: "Territory War", status: "LIVE", icon: "⚔", action: "guild", description: "Guild TW capability and current command workflows." }),
  Object.freeze({ title: "Grand Arena", status: "LIVE", icon: "◈", action: "gac", description: "Current opponent, board evidence and attack planning." }),
  Object.freeze({ title: "Assault Battles", status: "NEXT", icon: "⚑", image: TB_MISSION_VISUAL_ASSETS.combat, description: "Eligible factions, event tiers and strongest qualifying teams." }),
  Object.freeze({ title: "Proving Grounds", status: "PLANNED", icon: "◉", image: TB_MISSION_VISUAL_ASSETS.special, description: "Event teams and readiness against the loaded roster." }),
  Object.freeze({ title: "Conquest", status: "PLANNED", icon: "◎", description: "Feat requirements mapped to owned units and squads." }),
  Object.freeze({ title: "Raids", status: "PLANNED", icon: "☄", description: "Eligibility, raid teams and progression." }),
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
const escapeAttr = escapeHtml;

function statusTone(status) {
  const value = String(status || "").toUpperCase();
  if (value === "LIVE") return "live";
  if (value === "BUILDING") return "building";
  if (value === "NEXT") return "next";
  return "planned";
}

function visualCard(item) {
  const actionable = Boolean(item.action);
  return `<article class="ccv2-library-card ${item.image ? "has-image" : ""}" ${item.image ? `style="--library-image:url('${escapeAttr(item.image)}')"` : ""}>
    <div class="ccv2-library-card-top"><span class="ccv2-library-icon" aria-hidden="true">${escapeHtml(item.icon || "•")}</span><span class="ccv2-library-status ${statusTone(item.status)}">${escapeHtml(item.status)}</span></div>
    <div class="ccv2-library-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div>
    ${actionable ? `<button type="button" data-resource-action="${escapeAttr(item.action)}">Open</button>` : '<span class="ccv2-library-pending">Not exposed as live data yet</span>'}
  </article>`;
}

function compactHeader(kicker, title, copy) {
  return `<section class="card workspace-intro ccv2-library-header"><div><div class="kicker">${escapeHtml(kicker)}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div></section>`;
}

function replaceEventsPanel() {
  const panel = document.querySelector('[data-workspace-panel="events"]');
  if (!panel || panel.dataset.nativeEventsReady === "true") return false;
  panel.dataset.nativeEventsReady = "true";
  panel.innerHTML = `${compactHeader(
    "EVENT COMMAND",
    "Events & Journey Guide",
    "Open the live modes immediately. Planned modes remain visible as roadmap context but never masquerade as current game data."
  )}<section class="ccv2-library-grid ccv2-event-grid">${EVENT_TARGETS.map(visualCard).join("")}</section>`;
  return true;
}

function replaceResourcesPanel() {
  const panel = document.querySelector('[data-workspace-panel="resources"]');
  if (!panel || panel.dataset.resourceLibraryReady === "true") return false;
  panel.dataset.resourceLibraryReady = "true";
  panel.innerHTML = `${compactHeader(
    "COMMAND CENTER TOOL LIBRARY",
    "Tools & Resources",
    "A compact status map of native Command Center capabilities. LIVE means the workflow is available now; BUILDING, NEXT and PLANNED remain explicitly non-live."
  )}<section class="ccv2-library-grid">${NATIVE_TARGETS.map(visualCard).join("")}</section>`;
  return true;
}

function openWorkspace(id) {
  document.querySelector(`button[data-workspace-tab="${CSS.escape(id)}"]`)?.click();
}

function openJourney() {
  openWorkspace("farm");
  let attempts = 0;
  const activate = () => {
    const button = document.querySelector('[data-farm-view="map"]');
    if (button) return button.click();
    attempts += 1;
    if (attempts < 12) setTimeout(activate, 100);
  };
  setTimeout(activate, 80);
}

function runAction(action) {
  if (action === "journey") return openJourney();
  openWorkspace(action);
}

function bindActions() {
  for (const button of document.querySelectorAll("[data-resource-action]")) {
    if (button.dataset.resourceActionBound === "true") continue;
    button.dataset.resourceActionBound = "true";
    button.addEventListener("click", () => runAction(button.dataset.resourceAction));
  }
}

function enhanceNativeWorkspaces() {
  replaceEventsPanel();
  replaceResourcesPanel();
  bindActions();
  return Boolean(
    document.querySelector('[data-workspace-panel="events"][data-native-events-ready="true"]')
    && document.querySelector('[data-workspace-panel="resources"][data-resource-library-ready="true"]')
  );
}

if (!enhanceNativeWorkspaces()) {
  const observer = new MutationObserver(() => {
    if (enhanceNativeWorkspaces()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
