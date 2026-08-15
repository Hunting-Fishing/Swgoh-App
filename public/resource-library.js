const NATIVE_TARGETS = [
  ["Roster Commander", "LIVE", "Power-user filtering across live GP, progression, mods, ability investment, faction, role and current ROTE Operations demand with reusable saved views."],
  ["Squad Workbench", "LIVE", "Build and save owned 3v3/5v5 squads, inspect composition metrics and jump from roster/ROTE demand directly into team construction."],
  ["ROTE Player Readiness", "LIVE", "Compare the loaded Ally Code against current versioned ROTE Operations requirements phase by phase, including exact character relic and ship rarity gates."],
  ["Guild ROTE Operations", "LIVE", "Hydrate and cache the public guild roster, compare every member against exact ROTE Operation slots, surface scarcity and generate an officer assignment draft with deployment constraints."],
  ["Farm Tracker", "LIVE", "Journey and Galactic Legend requirement tracking against the loaded Ally Code: unlock state, stars, level, gear, relic and completion percentage."],
  ["Journey Visualizer", "BUILDING", "Show prerequisite chains and which earlier Journey unlocks feed the selected target."],
  ["Gear & Relic Planner", "LIVE", "Compare live gear/relic progression with a target and show remaining versioned gear-tier requirements without inventing private inventory balances."],
  ["Equipped Mod Audit", "LIVE", "Inspect every public equipped 1–6 dot mod, including lower-pip investment, level-15 coverage, primary/secondary stats, speed secondaries and character-by-character mod coverage. Unequipped inventory is never fabricated."],
  ["Mod Move Optimizer", "LIVE", "Priority-weighted equipped-mod redistribution with Grandivory-style weights/locks and a HotUtils-style include, tune, review, save and export workflow. Recommendations stay inside the public equipped-mod pool."],
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

function buildResourcesPanel() {
  const panel = document.querySelector('[data-workspace-panel="resources"]');
  if (!panel || panel.dataset.resourceLibraryReady === "true") return Boolean(panel);
  panel.dataset.resourceLibraryReady = "true";
  const section = document.createElement("section");
  section.className = "card workspace-intro";
  section.innerHTML = `
    <div class="database-heading">
      <div>
        <div class="kicker">NATIVE FEATURE ROADMAP</div>
        <h2>Roster Command capabilities</h2>
        <p>Live means the feature operates from the current public player/game data available to this app. Planned items remain explicit instead of being simulated with mock data.</p>
      </div>
    </div>
    <div class="resource-grid">${NATIVE_TARGETS.map(targetCard).join("")}</div>
  `;
  panel.appendChild(section);
  return true;
}

if (!buildResourcesPanel()) {
  const observer = new MutationObserver(() => {
    if (buildResourcesPanel()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
