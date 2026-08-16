const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";
const RAID_ROUTES = Object.freeze([
  ["overview", "/guild/raids", "Raid Overview"],
  ["order66", "/guild/raids/order-66", "Order 66"],
  ["members", "/guild/raids/members", "Members"],
  ["units", "/guild/raids/units", "Eligible Units"],
  ["milestones", "/guild/raids/milestones", "Milestones"],
]);

const state = { catalog: null, renderedKey: "", rendering: false };
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function isRaidRoute() {
  const path = location.pathname.replace(/\/+$/, "");
  return path === "/guild/raids" || path.startsWith("/guild/raids/");
}

function sectionFromPath() {
  const path = location.pathname.replace(/\/+$/, "");
  return RAID_ROUTES.find(([, route]) => route === path)?.[0] || "overview";
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
  const body = await fetchJson("/data/catalog.json?guild-raid-order66=1");
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  return state.catalog;
}

function fixGuildNav() {
  const nav = document.querySelector(".guild-route-nav");
  if (!nav) return false;
  for (const link of nav.querySelectorAll("a")) {
    const href = String(link.getAttribute("href") || "");
    const isRaid = href.startsWith("/guild/raids") && !href.startsWith("/guild/raids/");
    link.classList.toggle("active", isRaid);
  }
  return true;
}

function ensureSubnav() {
  const guildNav = document.querySelector(".guild-route-nav");
  if (!guildNav) return false;
  let nav = document.getElementById("guildRaidSubnav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "guildRaidSubnav";
    nav.className = "guild-raid-subnav";
    nav.setAttribute("aria-label", "Guild Raid Command");
    guildNav.insertAdjacentElement("afterend", nav);
  }
  const active = sectionFromPath();
  const renderKey = `${active}|${currentAllyCode()}`;
  if (nav.dataset.renderKey === renderKey) return true;
  nav.dataset.renderKey = renderKey;
  nav.innerHTML = RAID_ROUTES.map(([id, path, label]) => `<a class="${id === active ? "active" : ""}" href="${routeUrl(path)}">${escapeHtml(label)}</a>`).join("");
  return true;
}

async function renderRaidRoute(force = false) {
  if (!isRaidRoute() || state.rendering) return;
  const target = document.getElementById("guildRouteContent");
  const allyCode = currentAllyCode();
  if (!target || allyCode.length !== 9) return;
  const section = sectionFromPath();
  const key = `${allyCode}|${section}|${location.search}`;
  if (!force && state.renderedKey === key && target.dataset.guildRaidCapability === "true") return;

  state.rendering = true;
  target.dataset.guildRaidCapability = "true";
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Building guild Order 66 raid capability…</div></section>';
  try {
    const [guildBody, catalog, module] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`),
      loadCatalog(),
      import("./guild-raid-order66-page.js"),
    ]);
    module.renderGuildOrder66Page({ target, guildBody, catalog, allyCode, section });
    state.renderedKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || "Guild Raid capability is unavailable.")}</div></section>`;
  } finally {
    state.rendering = false;
  }
}

function postRender() {
  if (!isRaidRoute()) return;
  fixGuildNav();
  ensureSubnav();
  renderRaidRoute(false);
}

function install() {
  if (!isRaidRoute()) return;
  postRender();
  const observer = new MutationObserver(() => postRender());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:guild-command-snapshot", () => {
    state.renderedKey = "";
    const nav = document.getElementById("guildRaidSubnav");
    if (nav) nav.dataset.renderKey = "";
    setTimeout(() => renderRaidRoute(true), 0);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);
