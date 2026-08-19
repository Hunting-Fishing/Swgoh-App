import "./tb-war-room-entry.js";

const UNIT_ROUTE = "/guild/units";
const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

const state = {
  catalog: null,
  catalogIds: null,
  rendering: false,
  renderedKey: "",
};

function currentAllyCode() {
  const params = new URLSearchParams(location.search);
  const query = digits(params.get("allyCode"));
  const input = digits(document.getElementById("allyCode")?.value);
  let stored = "";
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || "";
}

function routeUrl(path, extra = {}) {
  const params = new URLSearchParams();
  const allyCode = currentAllyCode();
  if (allyCode) params.set("allyCode", allyCode);
  for (const [key, value] of Object.entries(extra)) if (value != null && String(value) !== "") params.set(key, String(value));
  return `${path}${params.toString() ? `?${params.toString()}` : ""}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson("/data/catalog.json?guild-unit-router=1");
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  state.catalogIds = new Set(state.catalog.map((row) => String(row?.baseId || "")).filter(Boolean));
  return state.catalog;
}

function ensureNavLink() {
  const nav = document.querySelector(".guild-route-nav");
  if (!nav) return false;
  let link = document.getElementById("guildRouteUnitMatrixNav");
  if (!link) {
    link = document.createElement("a");
    link.id = "guildRouteUnitMatrixNav";
    link.dataset.guildUnitRoute = "true";
    link.textContent = "Unit Matrix";
    const tb = [...nav.querySelectorAll("a")].find((row) => String(row.getAttribute("href") || "").startsWith("/guild/tb"));
    if (tb) nav.insertBefore(link, tb); else nav.appendChild(link);
  }
  link.href = routeUrl(UNIT_ROUTE);
  const active = location.pathname.replace(/\/+$/, "") === UNIT_ROUTE;
  link.classList.toggle("active", active);
  if (active) for (const other of nav.querySelectorAll("a:not(#guildRouteUnitMatrixNav)")) other.classList.remove("active");
  return true;
}

function injectOverviewCard() {
  if (location.pathname.replace(/\/+$/, "") !== "/guild") return;
  const grid = document.querySelector(".guild-route-card-grid");
  if (!grid || document.getElementById("guildUnitMatrixOverviewCard")) return;
  const article = document.createElement("article");
  article.id = "guildUnitMatrixOverviewCard";
  article.className = "guild-capability-card";
  article.innerHTML = `<div class="kicker">UNIT OWNERSHIP</div><div class="guild-capability-title"><h3>Unit Matrix</h3><span>OPEN PAGE</span></div><p>Search any character or ship across every current guild member, then overlay ROTE Operation eligibility, donor safety, GIVE/KEEP and mission protection.</p><a class="guild-route-card-link" href="${escapeAttr(routeUrl(UNIT_ROUTE))}">Open Unit Matrix →</a>`;
  const tbCard = [...grid.children].find((row) => row.textContent?.includes("TB Command"));
  if (tbCard) grid.insertBefore(article, tbCard); else grid.appendChild(article);
}

function injectMembersLink() {
  if (location.pathname.replace(/\/+$/, "") !== "/guild/members") return;
  const heading = document.querySelector(".guild-route-page-heading");
  if (!heading || document.getElementById("guildMembersUnitMatrixLink")) return;
  const link = document.createElement("a");
  link.id = "guildMembersUnitMatrixLink";
  link.className = "guild-unit-tb-link";
  link.href = routeUrl(UNIT_ROUTE);
  link.textContent = "Open Unit Matrix →";
  heading.appendChild(link);
}

function phaseFromRow(row) {
  const first = String(row?.querySelector("td")?.textContent || "").trim().toUpperCase();
  return /^P[1-6]$/.test(first) ? first : "";
}

function enhanceTbTables() {
  if (location.pathname.replace(/\/+$/, "") !== "/guild/tb" || !state.catalogIds) return;
  const root = document.getElementById("guildPageTbTools") || document.getElementById("guildRouteContent");
  if (!root) return;
  for (const small of root.querySelectorAll("td small")) {
    if (small.dataset.guildUnitMatrixEnhanced === "true") continue;
    const baseId = String(small.textContent || "").trim();
    if (!state.catalogIds.has(baseId)) continue;
    small.dataset.guildUnitMatrixEnhanced = "true";
    const link = document.createElement("a");
    link.className = "guild-rote-unit-matrix-link";
    link.textContent = "Owners";
    link.href = routeUrl(UNIT_ROUTE, { phase: phaseFromRow(small.closest("tr")), unit: baseId });
    link.title = `Open guild ownership matrix for ${baseId}`;
    small.insertAdjacentElement("afterend", link);
  }
}

async function renderUnitRoute(force = false) {
  if (location.pathname.replace(/\/+$/, "") !== UNIT_ROUTE || state.rendering) return;
  const target = document.getElementById("guildRouteContent");
  const allyCode = currentAllyCode();
  if (!target || allyCode.length !== 9) return;
  const key = `${allyCode}|${location.search}`;
  if (!force && state.renderedKey === key && target.dataset.guildUnitMatrixMounted === "true") return;

  state.rendering = true;
  target.dataset.guildUnitMatrixMounted = "true";
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Loading guild unit ownership matrix…</div></section>';
  try {
    const [guildBody, catalog, module] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`),
      loadCatalog(),
      import("./guild-unit-matrix-page.js"),
    ]);
    await module.renderGuildUnitMatrixPage({ target, guildBody, catalog, allyCode });
    state.renderedKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || "Guild Unit Matrix is unavailable.")}</div></section>`;
  } finally {
    state.rendering = false;
  }
}

function postRenderEnhancements() {
  ensureNavLink();
  injectOverviewCard();
  injectMembersLink();
  enhanceTbTables();
  renderUnitRoute(false);
}

function installObserver() {
  const observer = new MutationObserver(() => postRenderEnhancements());
  observer.observe(document.body, { childList: true, subtree: true });
}

function install() {
  if (!location.pathname.startsWith("/guild")) return;
  loadCatalog().then(() => {
    postRenderEnhancements();
    installObserver();
  }).catch(() => installObserver());
  window.addEventListener("swgoh:guild-command-snapshot", () => {
    state.renderedKey = "";
    setTimeout(() => {
      postRenderEnhancements();
      renderUnitRoute(true);
    }, 0);
  });
  window.addEventListener("swgoh:guild-rote-redundancy-target", () => {
    if (location.pathname.replace(/\/+$/, "") === UNIT_ROUTE) {
      state.renderedKey = "";
      renderUnitRoute(true);
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);