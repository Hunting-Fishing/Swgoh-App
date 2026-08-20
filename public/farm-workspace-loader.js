let loadPromise = null;
let loaded = false;

function farmRequested() {
  const panel = document.getElementById("workspace-farm");
  return Boolean(panel && !panel.hidden);
}

async function loadFarmWorkspace() {
  if (loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Canonicalize known legacy/typo Base IDs before any Farm/Journey renderer imports the shared presets.
    await import("/journey-preset-canonicalizer.js?v=20260820-farmv3c");

    // Journey Tracker owns durable track/untrack state underneath the visual command surface.
    await import("/journey-tracker-v2.js?v=20260820-farmv3c");
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    // Existing planning modules remain authoritative data producers underneath the tabbed workspace.
    await Promise.all([
      import("/farm-material-drilldown.js?v=20260815-pro14"),
      import("/farm-master-plan-pro.js?v=20260815-lazy1"),
      import("/farm-journey-map-pro.js?v=20260820-farmv3c"),
    ]);

    // Eligibility depends on the Journey shell being installed.
    await import("/journey-event-eligibility-pro.js?v=20260815-pro13");

    // Farm v3 owns canonical target/readiness state while retaining the durable tracker underneath.
    await import("/farm-tracker-v3-enhancer.js?v=20260820-farmv3c");

    // Load portrait-first tab styling before the final Farm Gallery controller paints.
    await import("/farm-gallery-style-loader.js?v=20260820-farmgallery1");
    await import("/farm-gallery-tabs.js?v=20260820-farmgallery1");

    // Alternate Journey Gallery presentation: current SWGOH-style Solo tiers / Guild Journeys / Galactic Legends.
    await import("/journey-tier-view.js?v=20260821-tier1");

    loaded = true;
    window.dispatchEvent(new CustomEvent("swgoh:farm-workspace-loaded"));
  })().catch((error) => {
    loadPromise = null;
    const panel = document.getElementById("workspace-farm");
    if (panel && farmRequested()) {
      const message = document.createElement("section");
      message.className = "card workspace-error";
      message.textContent = error?.message || "Farm workspace failed to load.";
      panel.appendChild(message);
    }
    throw error;
  });

  return loadPromise;
}

document.addEventListener("click", (event) => {
  if (event.target.closest?.('button[data-workspace-tab="farm"]')) {
    queueMicrotask(() => loadFarmWorkspace().catch(() => {}));
  }
}, true);

window.addEventListener("swgoh:workspace-activated", (event) => {
  if (event.detail?.id === "farm") loadFarmWorkspace().catch(() => {});
});

window.addEventListener("hashchange", () => {
  if (location.hash.toLowerCase() === "#farm") loadFarmWorkspace().catch(() => {});
});

if (location.hash.toLowerCase() === "#farm") loadFarmWorkspace().catch(() => {});

window.__swgohLoadFarmWorkspace = loadFarmWorkspace;
