import "./tb-war-room-entry.js";
import "./tb-mission-evidence.js";

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

function activateRoute() {
  const path = location.pathname;
  if (!path.startsWith("/guild/")) return;
  const match = path.match(/^\/guild\/units\/([^/]+)$/);
  if (!match) return;
  const baseId = decodeURIComponent(match[1]);
  openUnit(baseId);
}

async function openUnit(baseId) {
  if (state.rendering || !baseId) return;
  state.rendering = true;
  try {
    const catalog = await loadCatalog();
    const unit = catalog.find((row) => String(row?.baseId || "") === baseId);
    if (!unit) throw new Error(`Unit ${baseId} is not available in the current catalog.`);
    const host = document.getElementById("guildRouteContent");
    if (!host) return;
    host.innerHTML = `<section class="guild-route-page-heading"><div><span>UNIT MATRIX</span><h2>${escapeHtml(unit.name || unit.baseId)}</h2><p>Command Center unit detail sourced from the current catalog and verified Guild roster.</p></div><a href="${escapeAttr(routeUrl('/guild/units'))}">← Back to Unit Matrix</a></section><div class="guild-unit-route-card"><div class="guild-unit-route-avatar">${unit.portraitUrl ? `<img src="${escapeAttr(unit.portraitUrl)}" alt="${escapeAttr(unit.name || unit.baseId)}">` : escapeHtml((unit.name || unit.baseId).slice(0, 2).toUpperCase())}</div><div class="guild-unit-route-main"><span>${escapeHtml(unit.combatType || 'UNIT')}</span><h3>${escapeHtml(unit.name || unit.baseId)}</h3><p>${escapeHtml(unit.description || 'No unit description is available in the current catalog.')}</p><div class="guild-unit-route-tags">${Array.isArray(unit.categories) ? unit.categories.slice(0, 12).map((tag) => `<b>${escapeHtml(tag)}</b>`).join('') : ''}</div></div></div>`;
    state.renderedKey = baseId;
  } catch (error) {
    const host = document.getElementById("guildRouteContent");
    if (host) host.innerHTML = `<div class="guild-route-error"><strong>Unit route unavailable</strong><span>${escapeHtml(error.message)}</span></div>`;
  } finally {
    state.rendering = false;
  }
}

function intercept(event) {
  const link = event.target.closest('a[href]');
  if (!link) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/guild/units/')) return;
  event.preventDefault();
  history.pushState({}, '', `${url.pathname}${url.search}`);
  activateRoute();
}

if (typeof window !== "undefined") {
  document.addEventListener("click", intercept);
  window.addEventListener("popstate", activateRoute);
  window.addEventListener("swgoh:guild-command-snapshot", activateRoute);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", activateRoute, { once: true });
  else activateRoute();
}
