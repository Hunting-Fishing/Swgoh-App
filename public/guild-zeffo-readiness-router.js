const ZEFFO_ROUTE = "/guild/zeffo";
const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

const state = { rendering: false, renderedKey: "" };

function currentAllyCode() {
  const query = digits(new URLSearchParams(location.search).get("allyCode"));
  const input = digits(document.getElementById("allyCode")?.value);
  let stored = "";
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || "";
}

function routeUrl(path = ZEFFO_ROUTE) {
  const allyCode = currentAllyCode();
  return allyCode ? `${path}?allyCode=${encodeURIComponent(allyCode)}` : path;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

function ensureNavLink() {
  const nav = document.querySelector(".guild-route-nav");
  if (!nav) return;
  let link = document.getElementById("guildZeffoReadinessNav");
  if (!link) {
    link = document.createElement("a");
    link.id = "guildZeffoReadinessNav";
    link.textContent = "TB Readiness";
    const tb = [...nav.querySelectorAll("a")].find((row) => String(row.getAttribute("href") || "").startsWith("/guild/tb"));
    if (tb?.nextSibling) nav.insertBefore(link, tb.nextSibling); else nav.appendChild(link);
  }
  link.href = routeUrl();
  const active = location.pathname.replace(/\/+$/, "") === ZEFFO_ROUTE;
  link.classList.toggle("active", active);
  if (active) for (const other of nav.querySelectorAll("a:not(#guildZeffoReadinessNav)")) other.classList.remove("active");
}

function injectOverviewCard() {
  if (location.pathname.replace(/\/+$/, "") !== "/guild") return;
  const grid = document.querySelector(".guild-route-card-grid");
  if (!grid || document.getElementById("guildZeffoOverviewCard")) return;
  const article = document.createElement("article");
  article.id = "guildZeffoOverviewCard";
  article.className = "guild-capability-card";
  article.innerHTML = `<div class="kicker">TB OFFICER TOOL</div><div class="guild-capability-title"><h3>TB Mission Readiness</h3><span>LIVE GUILD</span></div><p>Profile-first readiness boards for Zeffo / Bracca, Mandalore, Reva and Wat Tambor, with exact member requirements and officer action lists.</p><a class="guild-zeffo-card-link" href="${escapeAttr(routeUrl())}">Open TB Readiness →</a>`;
  const tbCard = [...grid.children].find((row) => row.textContent?.includes("TB Command"));
  if (tbCard?.nextSibling) grid.insertBefore(article, tbCard.nextSibling); else grid.appendChild(article);
}

function injectTbLink() {
  if (location.pathname.replace(/\/+$/, "") !== "/guild/tb") return;
  const heading = document.querySelector(".guild-route-page-heading");
  if (!heading || document.getElementById("guildTbZeffoReadinessLink")) return;
  const link = document.createElement("a");
  link.id = "guildTbZeffoReadinessLink";
  link.className = "guild-zeffo-tb-link";
  link.href = routeUrl();
  link.textContent = "TB Mission Readiness →";
  heading.appendChild(link);
}

async function renderRoute(force = false) {
  if (location.pathname.replace(/\/+$/, "") !== ZEFFO_ROUTE || state.rendering) return;
  const target = document.getElementById("guildRouteContent");
  const allyCode = currentAllyCode();
  if (!target || allyCode.length !== 9) return;
  const key = `${allyCode}|${location.search}`;
  if (!force && state.renderedKey === key && target.dataset.guildZeffoMounted === "true") return;

  state.rendering = true;
  target.dataset.guildZeffoMounted = "true";
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Loading live TB mission readiness…</div></section>';
  try {
    const [guildBody, module] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`),
      import("./guild-tb-readiness-page.js"),
    ]);
    await module.renderGuildTbReadinessPage({ target, guildBody, allyCode });
    state.renderedKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || "TB mission readiness is unavailable.")}</div></section>`;
  } finally {
    state.rendering = false;
  }
}

function postRender() {
  ensureNavLink();
  injectOverviewCard();
  injectTbLink();
  renderRoute(false);
}

function install() {
  if (!location.pathname.startsWith("/guild")) return;
  postRender();
  const observer = new MutationObserver(() => postRender());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:guild-command-snapshot", () => {
    state.renderedKey = "";
    setTimeout(() => renderRoute(true), 0);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);
