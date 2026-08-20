(() => {
  const $ = (id) => document.getElementById(id);
  const ACTIVE_ALLY_STORAGE_KEY = "swgoh:active-ally-code";
  const GUILD_ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";
  const GUILD_ROUTE_MODULE = "/guild-route-pages.js?v=20260817-guildroutes1";

  function digits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 9);
  }

  function formatAllyCode(value) {
    const code = digits(value);
    return code.replace(/(\d{3})(?=\d)/g, "$1-");
  }

  function isGuildPath() {
    return location.pathname === "/guild" || location.pathname === "/guild/" || location.pathname.startsWith("/guild/");
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

  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
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

  function verifiedAccountLink(account = {}) {
    const links = Array.isArray(account?.playerLinks) ? account.playerLinks : [];
    return links.find((row) => row?.is_primary === true && row?.verification_status === "verified")
      || links.find((row) => row?.verification_status === "verified")
      || null;
  }

  function verifiedAccountAllyCode(account = {}) {
    return digits(verifiedAccountLink(account)?.player?.ally_code);
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
    if (!isGuildPath()) return false;
    const params = new URLSearchParams(location.search);
    if (digits(params.get("allyCode")) === code) return false;
    params.set("allyCode", code);
    const query = params.toString();
    location.replace(`${location.pathname}${query ? `?${query}` : ""}${location.hash || ""}`);
    return true;
  }

  function installShellStyles() {
    if ($("commandUnifiedShellStyles")) return;
    const style = document.createElement("style");
    style.id = "commandUnifiedShellStyles";
    style.textContent = `
      .command-global-topbar{position:sticky;top:0;z-index:1000;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 22px;background:rgba(5,9,20,.97);border-bottom:1px solid rgba(122,240,236,.16);backdrop-filter:blur(16px);font-family:inherit}
      .command-global-brand{display:inline-flex;align-items:center;gap:7px;color:#edf4ff;text-decoration:none;font-weight:900;letter-spacing:.04em;white-space:nowrap}.command-global-brand span{color:#72efe5}
      .command-global-nav{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.command-global-nav a,.command-global-nav button{appearance:none;border:1px solid rgba(126,164,211,.28);background:#0d1729;color:#c9d7eb;border-radius:999px;padding:8px 13px;font:700 12px/1 inherit;text-decoration:none;cursor:pointer}.command-global-nav a:hover,.command-global-nav button:hover,.command-global-nav a.active{border-color:#72efe5;color:#72efe5;background:#102337}
      .command-global-identity{max-width:270px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8399b7;font-size:11px;margin-left:4px}
      .command-guild-boot{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#050914;color:#eef5ff;font-family:inherit}.command-guild-boot-card{width:min(560px,calc(100vw - 36px));padding:38px;border:1px solid rgba(114,239,229,.28);border-radius:22px;background:linear-gradient(145deg,#091323,#0b1729);box-shadow:0 30px 100px rgba(0,0,0,.45);text-align:center}.command-guild-boot-kicker{color:#72efe5;font-size:11px;font-weight:900;letter-spacing:.19em}.command-guild-boot h1{margin:12px 0 8px;font-size:32px}.command-guild-boot p{margin:0;color:#93a8c4;line-height:1.6}.command-guild-boot-signal{width:52px;height:52px;margin:24px auto;border:2px solid rgba(114,239,229,.2);border-top-color:#72efe5;border-radius:50%;animation:commandSpin 1s linear infinite}@keyframes commandSpin{to{transform:rotate(360deg)}}
      .command-guild-boot.is-error .command-guild-boot-signal{animation:none;border-color:#ff7f8d}.command-guild-boot-actions{display:flex;gap:10px;justify-content:center;margin-top:20px}.command-guild-boot-actions a{color:#72efe5;text-decoration:none;border:1px solid rgba(114,239,229,.3);border-radius:999px;padding:9px 14px}
      body.command-unified-player .topbar .kicker{color:#72efe5}
      @media(max-width:760px){.command-global-topbar{align-items:flex-start;flex-direction:column}.command-global-nav{justify-content:flex-start}.command-global-identity{display:none}}
    `;
    document.head.appendChild(style);
  }

  function installUnifiedTopbar() {
    if (document.querySelector(".command-global-topbar")) return;
    installShellStyles();
    const header = document.createElement("header");
    header.className = "command-global-topbar";
    const guild = isGuildPath();
    header.innerHTML = `
      <a class="command-global-brand" href="/">SWGOH <span>Command Center</span></a>
      <nav class="command-global-nav" aria-label="Command Center">
        <a class="${guild ? "" : "active"}" href="/">Player</a>
        <a class="${guild ? "active" : ""}" href="/guild">Guild</a>
        <a href="/actions">Actions</a>
        <a href="/onboarding">Account</a>
        <span class="command-global-identity" data-command-account-identity>Checking command identity…</span>
        <button type="button" data-command-signout>Sign out</button>
      </nav>`;
    document.body.prepend(header);

    header.querySelector("[data-command-signout]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await requestJson("/api/auth/signout", { method: "POST", body: "{}" }); } catch {}
      location.assign("/login");
    });

    if (!guild) {
      document.body.classList.add("command-unified-player");
      const kicker = document.querySelector(".topbar .kicker");
      const title = document.querySelector(".topbar h1");
      if (kicker) kicker.textContent = "SWGOH COMMAND CENTER · PLAYER INTELLIGENCE";
      if (title) title.textContent = "Player Command Center";
    }
  }

  function updateUnifiedIdentity(account, code) {
    const node = document.querySelector("[data-command-account-identity]");
    if (!node) return;
    const link = verifiedAccountLink(account);
    const memberships = Array.isArray(account?.guildMemberships) ? account.guildMemberships : [];
    const membership = memberships.find((row) => row?.status === "active") || memberships[0] || null;
    const playerName = String(link?.player?.name || "Verified player").trim();
    const guildName = String(membership?.guild?.name || "").trim();
    node.textContent = `${playerName} · ${formatAllyCode(code)}${guildName ? ` · ${guildName}` : ""}`;
  }

  function tuneVerifiedRosterForm(code) {
    const form = $("allyForm");
    const input = $("allyCode");
    const label = form?.querySelector('label[for="allyCode"]');
    const button = $("loadButton");
    if (input) {
      input.value = formatAllyCode(code);
      input.setAttribute("aria-label", "Verified account Ally Code");
    }
    if (label && !isGuildPath()) label.textContent = "Verified Ally Code";
    if (button && !isGuildPath()) button.textContent = "Refresh My Roster";
  }

  function installGuildBootVeil() {
    if (!isGuildPath() || $("commandGuildBoot")) return;
    installShellStyles();
    const veil = document.createElement("div");
    veil.id = "commandGuildBoot";
    veil.className = "command-guild-boot";
    veil.innerHTML = `
      <div class="command-guild-boot-card">
        <div class="command-guild-boot-kicker">SWGOH COMMAND CENTER · GUILD</div>
        <h1>Opening Guild Command Center</h1>
        <div class="command-guild-boot-signal" aria-hidden="true"></div>
        <p>Loading your verified Guild identity, current roster authority, and officer workspace.</p>
      </div>`;
    document.body.appendChild(veil);

    const removeWhenReady = () => {
      if (!$("guildRouteRoot")) return false;
      veil.remove();
      return true;
    };
    if (removeWhenReady()) return;
    const observer = new MutationObserver(() => {
      if (removeWhenReady()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.setTimeout(() => {
      if (!document.body.contains(veil) || $("guildRouteRoot")) return;
      veil.classList.add("is-error");
      const card = veil.querySelector(".command-guild-boot-card");
      if (!card) return;
      card.innerHTML = `
        <div class="command-guild-boot-kicker">GUILD ROUTE DID NOT INITIALIZE</div>
        <h1>Guild workspace stopped safely</h1>
        <div class="command-guild-boot-signal" aria-hidden="true"></div>
        <p>The legacy Player/Roster interface has been blocked instead of showing the wrong workspace. Reload once; if the route still fails, use Action Center while Command Center records the route defect.</p>
        <div class="command-guild-boot-actions"><a href="${location.href}">Reload Guild</a><a href="/actions">Action Center</a></div>`;
    }, 8000);
  }

  function startGuildRouteEarly() {
    if (!isGuildPath()) return;
    installGuildBootVeil();
    import(GUILD_ROUTE_MODULE).catch((error) => {
      console.error("Guild route bootstrap failed:", error?.message || error);
    });
  }

  async function bootstrapAccountContext() {
    try {
      installUnifiedTopbar();
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
      updateUnifiedIdentity(account, code);
      tuneVerifiedRosterForm(code);

      window.dispatchEvent(new CustomEvent("swgoh:account-context-ready", {
        detail: { allyCode: code, source: "verified-account" },
      }));

      if (ensureGuildRouteContext(code)) return;

      const form = $("allyForm");
      if (form && !isGuildPath() && !window.__swgohAccountRosterAutoLoadStarted) {
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
    shell: "unified-authenticated-v1",
    guildRouteReady: Boolean($("guildRouteRoot")),
  });

  startGuildRouteEarly();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapAccountContext, { once: true });
  } else {
    queueMicrotask(bootstrapAccountContext);
  }
})();
