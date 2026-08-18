import "./guild-operations-router.js";
import "./guild-operations-publish-enhancer.js";

const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";
const TW_ROUTES = Object.freeze([
  ["overview", "/guild/tw", "TW Overview"],
  ["teams", "/guild/tw/teams", "Team Coverage"],
  ["members", "/guild/tw/members", "Members"],
  ["bottlenecks", "/guild/tw/bottlenecks", "Bottlenecks"],
]);

const state = {
  catalog: null,
  renderedKey: "",
  rendering: false,
};

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function isTwRoute() {
  const path = location.pathname.replace(/\/+$/, "");
  return path === "/guild/tw" || path.startsWith("/guild/tw/");
}

function sectionFromPath() {
  const normalized = location.pathname.replace(/\/+$/, "");
  return TW_ROUTES.find(([, path]) => path === normalized)?.[0] || "overview";
}

function currentAllyCode() {
  const params = new URLSearchParams(location.search);
  const query = digits(params.get("allyCode"));
  const input = digits(document.getElementById("allyCode")?.value);
  let stored = "";
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || "";
}

function routeUrl(path) {
  const code = currentAllyCode();
  return code.length === 9 ? `${path}?allyCode=${encodeURIComponent(code)}` : path;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson("/data/catalog.json?guild-tw-capability=1");
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  return state.catalog;
}

function fixGuildNav() {
  const nav = document.querySelector(".guild-route-nav");
  if (!nav) return false;
  for (const link of nav.querySelectorAll("a")) {
    const href = String(link.getAttribute("href") || "");
    const isTw = href.startsWith("/guild/tw") && !href.startsWith("/guild/tw/");
    link.classList.toggle("active", isTw);
  }
  return true;
}

function ensureSubnav() {
  const guildNav = document.querySelector(".guild-route-nav");
  if (!guildNav) return false;
  let nav = document.getElementById("guildTwSubnav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "guildTwSubnav";
    nav.className = "guild-tw-subnav";
    nav.setAttribute("aria-label", "Territory Wars Command");
    guildNav.insertAdjacentElement("afterend", nav);
  }
  const active = sectionFromPath();
  const allyCode = currentAllyCode();
  const renderKey = `${active}|${allyCode}`;
  if (nav.dataset.renderKey === renderKey) return true;
  nav.dataset.renderKey = renderKey;
  nav.innerHTML = TW_ROUTES.map(([id, path, label]) => `<a class="${id === active ? "active" : ""}" href="${routeUrl(path)}">${escapeHtml(label)}</a>`).join("");
  return true;
}

async function renderTwRoute(force = false) {
  if (!isTwRoute() || state.rendering) return;
  const target = document.getElementById("guildRouteContent");
  const allyCode = currentAllyCode();
  if (!target || allyCode.length !== 9) return;
  const section = sectionFromPath();
  const key = `${allyCode}|${section}|${location.search}`;
  if (!force && state.renderedKey === key && target.dataset.guildTwCapability === "true") return;

  state.rendering = true;
  target.dataset.guildTwCapability = "true";
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Building guild Territory War roster capability…</div></section>';
  try {
    const [guildBody, catalog, module] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`),
      loadCatalog(),
      import("./guild-tw-capability-page.js"),
    ]);
    module.renderGuildTwCapabilityPage({ target, guildBody, catalog, allyCode, section });
    state.renderedKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || "Guild TW capability is unavailable.")}</div></section>`;
  } finally {
    state.rendering = false;
  }
}

function postRender() {
  if (!isTwRoute()) return;
  fixGuildNav();
  ensureSubnav();
  renderTwRoute(false);
}

function install() {
  if (!isTwRoute()) return;
  postRender();
  const observer = new MutationObserver(() => postRender());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:guild-command-snapshot", () => {
    state.renderedKey = "";
    const nav = document.getElementById("guildTwSubnav");
    if (nav) nav.dataset.renderKey = "";
    setTimeout(() => renderTwRoute(true), 0);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);
