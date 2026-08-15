const NATIVE_TARGETS = [
  ["Farm Tracker", "LIVE", "Journey and Galactic Legend requirement tracking against the loaded Ally Code: unlock state, stars, level, gear, relic and completion percentage."],
  ["Journey Visualizer", "BUILDING", "Show prerequisite chains and which earlier Journey unlocks feed the selected target."],
  ["Gear & Relic Planner", "NEXT", "Calculate remaining gear tiers, relic levels and prerequisite units from current live progression."],
  ["Mods Optimizer", "NEXT", "Score equipped mods, compare current-game recommendations and build move plans from data we can actually access."],
  ["GAC Scout / Compare", "NEXT", "Player-vs-opponent roster differences, omicrons, team coverage and counter planning."],
  ["Ship Projection", "PLANNED", "Separate ship progression from pilot-driven stat contribution and fleet readiness."],
  ["Event Calendar", "PLANNED", "Current events, Proving Grounds, Assault Battles, recurring events and roster readiness in one native calendar."],
  ["Guild Operations", "PLANNED", "Cached guild snapshot for member readiness, ROTE operations and Territory War planning."],
  ["Datacron Analyzer", "PLANNED", "Set, level and affix analysis when individual public datacron records are preserved by the gateway."],
  ["Conquest Planner", "PLANNED", "Sector/feat planning tied directly to characters the player owns and teams capable of completing each feat."],
  ["Raid Planner", "PLANNED", "Raid eligibility, teams, relic gates and score planning from the live roster."],
  ["Assault Battle Readiness", "PLANNED", "Event-by-event eligible factions and the player's strongest qualifying teams."],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function targetCard([title, status, description]) {
  return `
    <article class="workspace-data-card">
      <span>${escapeHtml(status)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p class="workspace-note">${escapeHtml(description)}</p>
    </article>
  `;
}

function replaceEventsPanel() {
  const panel = document.querySelector('[data-workspace-panel="events"]');
  if (!panel || panel.dataset.nativeEventsReady === "true") return false;
  panel.dataset.nativeEventsReady = "true";
  panel.innerHTML = `
    <section class="card workspace-intro">
      <div class="kicker">NATIVE EVENT PLANNING</div>
      <h2>Events &amp; Guides</h2>
      <p>Roster Command will keep event planning inside the app. Journey requirements are now handled in Farm Tracker; this workspace will add recurring-event schedules, eligibility and live roster readiness without sending the player to another site.</p>
    </section>
    <section class="card workspace-intro">
      <div class="workspace-grid">
        ${[
          ["Journey Guide", "LIVE IN FARM TRACKER", "Choose an unlock target and compare its requirements with the loaded roster."],
          ["Assault Battles", "NEXT", "Eligible factions, tiers and strongest qualifying teams."],
          ["Proving Grounds", "PLANNED", "Event teams and readiness against the loaded roster."],
          ["Conquest", "PLANNED", "Feat requirements mapped to owned characters and squads."],
          ["Raids", "PLANNED", "Eligibility and raid-team progression."],
          ["Recurring Calendar", "PLANNED", "One native view for scheduled and recurring game events."],
        ].map(targetCard).join("")}
      </div>
    </section>
  `;
  return true;
}

function replaceResourcesPanel() {
  const panel = document.querySelector('[data-workspace-panel="resources"]');
  if (!panel || panel.dataset.resourceLibraryReady === "true") return false;
  panel.dataset.resourceLibraryReady = "true";
  panel.innerHTML = `
    <section class="card workspace-intro">
      <div class="kicker">ROSTER COMMAND FEATURE LIBRARY</div>
      <h2>Native tools we are building here</h2>
      <p>The community tools we researched are now product references only. Players stay inside Roster Command; each high-value workflow becomes a native workspace backed by our live Comlink roster and versioned game database.</p>
    </section>
    <section class="card workspace-intro">
      <div class="workspace-grid">
        ${NATIVE_TARGETS.map(targetCard).join("")}
      </div>
    </section>
  `;
  return true;
}

function enhanceNativeWorkspaces() {
  const eventsReady = replaceEventsPanel();
  const resourcesReady = replaceResourcesPanel();
  return eventsReady && resourcesReady;
}

if (!enhanceNativeWorkspaces()) {
  const observer = new MutationObserver(() => {
    if (enhanceNativeWorkspaces()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
