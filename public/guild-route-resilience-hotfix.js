const BUILTIN_GUILD_ROUTES = Object.freeze({
  "/guild": ["GUILD OVERVIEW", "Guild Capability Dashboard"],
  "/guild/members": ["GUILD ROSTER", "Current Guild Members"],
  "/guild/tb": ["TERRITORY BATTLES", "TB Officer Command"],
  "/guild/tw": ["TERRITORY WARS", "TW Guild Command"],
  "/guild/raids": ["RAIDS", "Raid Guild Command"],
});

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function normalizedPath(pathname = location.pathname) {
  const clean = String(pathname || "/guild").replace(/\/+$/, "");
  return clean || "/guild";
}

function builtInRoute(pathname = location.pathname) {
  return BUILTIN_GUILD_ROUTES[normalizedPath(pathname)] || null;
}

function guildHealth() {
  try {
    return typeof window.__swgohGuildRouteHealth === "function" ? window.__swgohGuildRouteHealth() : null;
  } catch {
    return null;
  }
}

function snapshotReady() {
  return guildHealth()?.snapshotReady === true;
}

function updateActiveNav(pathname) {
  const current = normalizedPath(pathname);
  for (const link of document.querySelectorAll("a[data-guild-route-nav]")) {
    const target = normalizedPath(link.dataset.guildRoutePath || new URL(link.href, location.href).pathname);
    link.classList.toggle("active", target === current);
  }
}

function retryGuildLoad() {
  const retry = document.getElementById("guildRouteRetry");
  if (retry) {
    retry.click();
    return;
  }
  const refresh = document.getElementById("guildRouteRefreshNow");
  if (refresh) {
    refresh.click();
    return;
  }
  const form = document.getElementById("allyForm");
  if (form?.requestSubmit) form.requestSubmit();
}

function renderDegradedRoute(pathname = location.pathname) {
  if (snapshotReady()) return;
  const route = builtInRoute(pathname);
  const target = document.getElementById("guildRouteContent");
  if (!route || !target) return;
  const [kicker, title] = route;
  const signature = `degraded:${normalizedPath(pathname)}`;
  if (target.dataset.guildRouteDegraded === signature && target.querySelector("[data-guild-resilience-panel]")) return;
  target.dataset.guildRouteDegraded = signature;
  target.innerHTML = `
    <section class="guild-route-page-heading">
      <div><div class="kicker">${escapeHtml(kicker)}</div><h2>${escapeHtml(title)}</h2><p>The Guild shell is available, but live roster data has not loaded successfully yet.</p></div>
    </section>
    <section class="guild-page-card" data-guild-resilience-panel>
      <div class="workspace-error">
        <strong>Guild data is temporarily unavailable.</strong>
        <span>You can continue moving between Guild sections. Retry the live guild load without reloading the whole site.</span>
        <button type="button" data-guild-resilience-retry>Retry Guild Data</button>
      </div>
    </section>`;
  target.querySelector("[data-guild-resilience-retry]")?.addEventListener("click", retryGuildLoad);
}

function navigateWhileDegraded(url) {
  history.pushState({ guildRouteRecovery: true }, "", `${url.pathname}${url.search}`);
  updateActiveNav(url.pathname);
  // Keep the canonical Guild router's private route state synchronized without a document reload.
  window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  renderDegradedRoute(url.pathname);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function install() {
  if (!location.pathname.startsWith("/guild")) return;

  document.addEventListener("click", (event) => {
    if (snapshotReady()) return;
    const link = event.target.closest?.("a[data-guild-route-nav]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !builtInRoute(url.pathname)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateWhileDegraded(url);
  }, true);

  window.addEventListener("popstate", () => {
    if (!snapshotReady()) {
      updateActiveNav(location.pathname);
      renderDegradedRoute(location.pathname);
    }
  });

  window.addEventListener("swgoh:guild-command-snapshot", () => {
    const target = document.getElementById("guildRouteContent");
    if (target) delete target.dataset.guildRouteDegraded;
  });

  const observer = new MutationObserver(() => {
    if (!snapshotReady() && document.getElementById("guildRouteRoot")) renderDegradedRoute(location.pathname);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  renderDegradedRoute(location.pathname);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
