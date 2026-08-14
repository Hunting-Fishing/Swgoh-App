const RESOURCES = [
  {
    category: "Farming & Journey",
    title: "The Don Project",
    description: "Concise Ally Code farm tracking with preset and custom farms. Reference model for requirement-vs-roster progress.",
    url: "https://thedonproject.com/swgoh/index.cgi",
  },
  {
    category: "Farming & Journey",
    title: "Journey Guide Visualizer",
    description: "Visualizes Journey Guide unlock paths and eligible requirement units from an Ally Code.",
    url: "https://apinchofcode.com/swgoh/",
  },
  {
    category: "Farming & Gear",
    title: "SWGOH Events Gear Tracker",
    description: "Character gear requirement and accumulation planning reference.",
    url: "https://gear.swgohevents.com/",
  },
  {
    category: "Roster Planning",
    title: "MoofCode SWGOH Tools",
    description: "Roster detail, gear planning/export and side-by-side Grand Arena roster comparison.",
    url: "https://swgoh.moofcode.com/",
  },
  {
    category: "Mods",
    title: "Grandivory Mods Optimizer",
    description: "Dedicated Ally Code mod optimization and character-priority planning tool.",
    url: "https://mods-optimizer.swgoh.grandivory.com/",
  },
  {
    category: "Ships",
    title: "Imperial Fleet Ship Stats Calculator",
    description: "Projects how pilot rarity, abilities and progression affect ship statistics.",
    url: "https://playbook.cafe/imperialfleet/tools/shipcalc/",
  },
  {
    category: "Events",
    title: "SWGOH Events",
    description: "Event cycles, permanent events, readiness tools and panic-farm planning.",
    url: "https://swgohevents.com/",
  },
  {
    category: "Guides",
    title: "SWGOH4.LIFE",
    description: "Community event, conquest and gameplay guides with videos and commentary.",
    url: "https://swgoh4.life/",
  },
  {
    category: "Guides",
    title: "SWGOH Wiki",
    description: "Reference for units, ships, gear, relics, mods, events, raids, Territory Battles, Territory Wars and mechanics.",
    url: "https://swgoh.wiki/wiki/Main_Page",
  },
  {
    category: "Events",
    title: "Proving Grounds Guide",
    description: "Organized Proving Grounds team/video reference maintained as a Trello board.",
    url: "https://trello.com/b/KbmP61P0/swgoh-proving-grounds",
  },
  {
    category: "Guild / Teams",
    title: "SWGOH Team Manager",
    description: "Community team-management and recruitment tool reference.",
    url: "https://swgohteammanager.com/",
  },
  {
    category: "Core Reference",
    title: "SWGOH.GG",
    description: "Roster, unit, GAC, guild and game-information reference.",
    url: "https://swgoh.gg/",
  },
  {
    category: "Developer Data",
    title: "SWGOH Comlink",
    description: "Open-source game/player data interface used by Roster Command's live data pipeline.",
    url: "https://github.com/swgoh-utils/swgoh-comlink",
  },
  {
    category: "Directory",
    title: "Community SWGOH Tools Directory",
    description: "Large community-maintained Reddit index of roster, mod, event, guild, GAC, fleet and guide tools.",
    url: "https://www.reddit.com/r/SWGalaxyOfHeroes/comments/1c7oo0k/all_the_swgoh_tools_and_resources_in_one_place/",
  },
];

const NATIVE_TARGETS = [
  ["Farm Tracker", "LIVE", "Custom requirement targets are already live. Preset Journey/GL/TB/Raid definitions are next."],
  ["Journey Visualizer", "BUILDING", "Generate unlock paths from versioned Journey Guide and requirement definitions."],
  ["Gear & Relic Planner", "PLANNED", "Calculate remaining full gear, salvage and relic requirements from current unit progression."],
  ["Mods Optimizer", "PLANNED", "Start with current-game mod recommendations and equipped-mod quality; never invent inaccessible mod inventory."],
  ["GAC Scout / Compare", "PLANNED", "Opponent-vs-player roster differences, team coverage, omicrons and counter planning."],
  ["Ship Projection", "PLANNED", "Separate intrinsic ship progression from pilot-driven stat projections."],
  ["Event Calendar", "PLANNED", "Current event cycles, permanent Journey events, Proving Grounds and Assault Battle planning."],
  ["Guild Operations", "PLANNED", "Cached guild snapshot for member readiness, ROTE operations and Territory War planning."],
  ["Datacron Analyzer", "PLANNED", "Set, level and affix analysis once individual public datacron records are preserved by the gateway."],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function card(resource) {
  return `
    <article class="resource-card">
      <span class="tracker-label">${escapeHtml(resource.category)}</span>
      <h3>${escapeHtml(resource.title)}</h3>
      <p>${escapeHtml(resource.description)}</p>
      <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Open resource ↗</a>
    </article>
  `;
}

function enhanceResources() {
  const panel = document.querySelector('[data-workspace-panel="resources"]');
  if (!panel || panel.dataset.resourceLibraryReady === "true") return false;
  panel.dataset.resourceLibraryReady = "true";

  // The initial workspace controller supplies a small starter library. Replace
  // that starter body with the broader, categorized reference set.
  const starter = [...panel.querySelectorAll("section.card.workspace-intro")].slice(1);
  for (const section of starter) section.remove();

  const targets = document.createElement("section");
  targets.className = "card workspace-intro";
  targets.innerHTML = `
    <div class="kicker">NATIVE FEATURE TARGETS</div>
    <h2>What Roster Command should absorb</h2>
    <p>External tools remain linked while their highest-value workflows are progressively implemented against our live Comlink roster and versioned game database.</p>
    <div class="workspace-grid" style="margin-top:14px">
      ${NATIVE_TARGETS.map(([title, status, description]) => `
        <article class="workspace-data-card">
          <span>${escapeHtml(status)}</span>
          <strong>${escapeHtml(title)}</strong>
          <p class="workspace-note">${escapeHtml(description)}</p>
        </article>
      `).join("")}
    </div>
  `;

  const library = document.createElement("section");
  library.className = "card workspace-intro";
  library.innerHTML = `
    <div class="kicker">COMMUNITY TOOLBOX</div>
    <h2>Reference library</h2>
    <p>Use these directly while we build equivalent native workflows. They are references and integrations targets, not dependencies for live player data.</p>
    <div class="resource-grid" style="margin-top:14px">
      ${RESOURCES.map(card).join("")}
    </div>
  `;

  panel.append(targets, library);
  return true;
}

if (!enhanceResources()) {
  const observer = new MutationObserver(() => {
    if (enhanceResources()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
