(() => {
  const cssHref = "/tb-command-center.css?v=20260815-tb7";
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);
  }

  import("/tb-command-center.js?v=20260815-tb7").catch((error) => {
    console.error("TB Command Center failed to load", error);
  });

  let roteMissionPromise = null;
  let tbCombatPromise = null;
  let kitIntelligencePromise = null;
  const loadTbEnhancements = () => {
    roteMissionPromise ||= import("/rote-mission-pro.js?v=20260815-rotemission1").catch((error) => {
      roteMissionPromise = null;
      console.error("ROTE exact mission intelligence failed to load", error);
    });
    tbCombatPromise ||= import("/tb-combat-overlay.js?v=20260815-tbcombat2").catch((error) => {
      tbCombatPromise = null;
      console.error("TB combat preparation failed to load", error);
    });
    return Promise.allSettled([roteMissionPromise, tbCombatPromise]);
  };

  const loadKitIntelligence = (baseId) => {
    if (baseId) window.__swgohKitInspectPending = String(baseId);
    kitIntelligencePromise ||= import("/kit-intelligence-ui.js?v=20260815-kit1").catch((error) => {
      kitIntelligencePromise = null;
      console.error("Character Kit Intelligence failed to load", error);
    });
    return kitIntelligencePromise;
  };

  window.addEventListener("swgoh:workspace-activated", (event) => {
    if (event.detail?.id === "rote") void loadTbEnhancements();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest('button[data-workspace-tab="rote"]')) void loadTbEnhancements();
  }, true);

  window.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-inspect-base-id],button[data-base-id],button[data-catalog-base-id],button[data-squad-base-id]");
    if (!trigger) return;
    const baseId = trigger.dataset.inspectBaseId || trigger.dataset.baseId || trigger.dataset.catalogBaseId || trigger.dataset.squadBaseId || "";
    if (baseId) void loadKitIntelligence(baseId);
  }, true);

  window.addEventListener("swgoh:replace-squad", (event) => {
    const baseIds = Array.isArray(event.detail?.baseIds) ? event.detail.baseIds.map(String).filter(Boolean).slice(0, 5) : [];
    if (!baseIds.length) return;

    document.querySelector('button[data-workspace-tab="squads"]')?.click();
    setTimeout(() => {
      const size = document.getElementById("proSquadSize");
      const name = document.getElementById("proSquadName");
      if (size) {
        size.value = String(Number(event.detail?.size) === 3 ? 3 : 5);
        size.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.getElementById("proClearSquad")?.click();
      if (name) name.value = String(event.detail?.name || "TB Mission Core");
      for (const baseId of baseIds) {
        window.dispatchEvent(new CustomEvent("swgoh:add-to-squad", { detail: { baseId } }));
      }
    }, 40);
  });
})();