(() => {
  const $ = (id) => document.getElementById(id);

  function panelFor(id) {
    return document.querySelector(`[data-workspace-panel="${CSS.escape(String(id || ""))}"]`);
  }

  function activate(id, { pushHash = true } = {}) {
    const target = panelFor(id);
    if (!target) return false;

    for (const panel of document.querySelectorAll("[data-workspace-panel]")) {
      panel.hidden = panel !== target;
    }
    for (const button of document.querySelectorAll("button[data-workspace-tab]")) {
      const active = button.dataset.workspaceTab === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (pushHash && location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
    try { localStorage.setItem("swgoh:workspace-tab", id); } catch {}

    window.dispatchEvent(new CustomEvent("swgoh:workspace-activated", { detail: { id } }));
    window.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("button[data-workspace-tab]");
    if (!button) return;
    const id = String(button.dataset.workspaceTab || "");
    if (!id || !panelFor(id)) return;

    // Capture-phase navigation happens before any feature module's bubble handler.
    // We do not stop propagation: Gear/ROTE/etc. still receive their own click and
    // can lazily fetch workspace-specific data after the panel changes.
    event.preventDefault();
    activate(id, { pushHash: true });
  }, true);

  window.addEventListener("hashchange", () => {
    const id = location.hash.replace(/^#/, "").toLowerCase();
    if (id) activate(id, { pushHash: false });
  });

  window.__swgohActivateWorkspace = (id) => activate(String(id || ""), { pushHash: true });
  window.__swgohNavigationHealth = () => ({
    tabs: $("workspaceTabs")?.querySelectorAll("button[data-workspace-tab]").length || 0,
    panels: document.querySelectorAll("[data-workspace-panel]").length,
    active: document.querySelector("button[data-workspace-tab].active")?.dataset.workspaceTab || "",
  });
})();
