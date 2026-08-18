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
    // Journey Tracker owns the Farm shell, so it must initialize first.
    await import("/journey-tracker-v2.js?v=20260819-account-goals1");
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    // These modules enhance the shell but no longer need to exist while Farm is hidden.
    await Promise.all([
      import("/farm-material-drilldown.js?v=20260815-pro14"),
      import("/farm-master-plan-pro.js?v=20260815-lazy1"),
      import("/farm-journey-map-pro.js?v=20260815-pro14"),
    ]);

    // Eligibility depends on the Journey Map shell being installed.
    await import("/journey-event-eligibility-pro.js?v=20260815-pro13");
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
    // Navigation switches panels synchronously; feature loading then happens asynchronously.
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
