const NATIVE_TARGETS = [
  ["Roster Commander", "LIVE", "Power-user filtering across live GP, progression, mods, ability investment, faction, role and current ROTE Operations demand with reusable saved views."],
  ["Squad Workbench", "LIVE", "Build and save owned 3v3/5v5 squads, inspect composition metrics and jump from roster/ROTE demand directly into team construction."],
  ["ROTE Player Readiness", "LIVE", "Compare the loaded Ally Code against current versioned ROTE Operations requirements phase by phase, including exact character relic and ship rarity gates."],
  ["Guild ROTE Operations", "LIVE", "Hydrate and cache the public guild roster, compare every member against exact ROTE Operation slots, surface scarcity and generate an officer assignment draft with deployment constraints."],
  ["Farm Tracker", "LIVE", "Journey and Galactic Legend requirement tracking against the loaded Ally Code: unlock state, stars, level, gear, relic and completion percentage."],
  ["Journey Visualizer", "BUILDING", "Show prerequisite chains and which earlier Journey unlocks feed the selected target."],
  ["Gear & Relic Planner", "LIVE", "Compare live gear/relic progression with a target and show remaining versioned gear-tier requirements without inventing private inventory balances."],
  ["Equipped Mod Audit", "LIVE", "Inspect every public equipped 1–6 dot mod, including lower-pip investment, level-15 coverage, primary/secondary stats, speed secondaries and character-by-character mod coverage. Unequipped inventory is never fabricated."],
  ["Mod Move Optimizer", "NEXT", "Build character-specific equipped-mod recommendations and move plans on top of the factual all-pip audit without pretending unequipped inventory is public."],
  ["GAC Scout / Compare", "NEXT", "Player-vs-opponent roster differences, omicrons, team coverage and counter planning."],
  ["Ship Projection", "PLANNED", "Separate ship progression from pilot-driven stat contribution and fleet readiness."],
  ["Event Calendar", "PLANNED", "Current events, Proving Grounds, Assault Battles, recurring events and roster readiness in one native calendar."],
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
          ["ROTE Operations", "LIVE IN ROTE", "Current operation demand and exact player coverage are available in the dedicated ROTE workspace."],
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
