(() => {
  const cssHref = "/tb-command-center.css?v=20260815-tb1";
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);
  }

  import("/tb-command-center.js?v=20260815-tb1").catch((error) => {
    console.error("TB Command Center failed to load", error);
  });

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