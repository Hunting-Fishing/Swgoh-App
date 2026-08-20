(() => {
  const $ = (id) => document.getElementById(id);
  const ACTIVE_ALLY_STORAGE_KEY = "swgoh:active-ally-code";
  const GUILD_ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";

  function digits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 9);
  }

  function formatAllyCode(value) {
    const code = digits(value);
    return code.replace(/(\d{3})(?=\d)/g, "$1-");
  }

  function rememberAllyCode(value) {
    const code = digits(value);
    if (code.length !== 9) return "";
    try {
      localStorage.setItem(ACTIVE_ALLY_STORAGE_KEY, code);
      localStorage.setItem(GUILD_ALLY_STORAGE_KEY, code);
    } catch {}
    window.__swgohAccountAllyCode = code;
    return code;
  }

  async function requestJson(path) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body?.error || `${path} returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function verifiedAccountAllyCode(account = {}) {
    const links = Array.isArray(account?.playerLinks) ? account.playerLinks : [];
    const verified = links.find((row) => row?.is_primary === true && row?.verification_status === "verified")
      || links.find((row) => row?.verification_status === "verified")
      || null;
    return digits(verified?.player?.ally_code);
  }

  function currentReturnPath() {
    const path = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
    return path.startsWith("/") ? path : "/";
  }

  function redirectToLogin() {
    const next = encodeURIComponent(currentReturnPath());
    location.replace(`/login?next=${next}`);
  }

  function ensureGuildRouteContext(code) {
    if (!(location.pathname === "/guild" || location.pathname === "/guild/" || location.pathname.startsWith("/guild/"))) return false;
    const params = new URLSearchParams(location.search);
    if (digits(params.get("allyCode")) === code) return false;
    params.set("allyCode", code);
    const query = params.toString();
    location.replace(`${location.pathname}${query ? `?${query}` : ""}${location.hash || ""}`);
    return true;
  }

  async function bootstrapAccountContext() {
    try {
      const auth = await requestJson("/api/auth/status");
      if (!auth?.authenticated) {
        redirectToLogin();
        return;
      }

      const account = await requestJson("/api/account/status");
      const code = verifiedAccountAllyCode(account);
      if (code.length !== 9) {
        location.replace("/onboarding");
        return;
      }

      rememberAllyCode(code);
      const input = $("allyCode");
      if (input) input.value = formatAllyCode(code);

      window.dispatchEvent(new CustomEvent("swgoh:account-context-ready", {
        detail: { allyCode: code, source: "verified-account" },
      }));

      if (ensureGuildRouteContext(code)) return;

      const form = $("allyForm");
      if (form && !window.__swgohAccountRosterAutoLoadStarted) {
        window.__swgohAccountRosterAutoLoadStarted = true;
        form.requestSubmit();
      }
    } catch (error) {
      if (Number(error?.status) === 401) {
        redirectToLogin();
        return;
      }
      console.error("Command Center account context bootstrap failed:", error?.message || error);
    }
  }

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

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "allyForm") return;
    const code = rememberAllyCode($("allyCode")?.value);
    if (code) {
      window.dispatchEvent(new CustomEvent("swgoh:active-ally-code-changed", {
        detail: { allyCode: code, source: "roster-form" },
      }));
    }
  }, true);

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
    accountAllyCode: window.__swgohAccountAllyCode || "",
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapAccountContext, { once: true });
  } else {
    queueMicrotask(bootstrapAccountContext);
  }
})();
