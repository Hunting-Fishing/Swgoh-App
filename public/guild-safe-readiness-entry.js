const READINESS_PATH = "/guild/zeffo";
const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let rendering = false;
let renderedKey = "";

function currentAllyCode() {
  const query = digits(new URLSearchParams(location.search).get("allyCode"));
  const input = digits(document.getElementById("allyCode")?.value);
  let stored = "";
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || "";
}

function readinessUrl() {
  const code = currentAllyCode();
  return code ? `${READINESS_PATH}?allyCode=${encodeURIComponent(code)}` : READINESS_PATH;
}

function ensureNav() {
  const nav = document.querySelector(".guild-route-nav");
  if (!nav) return false;
  let link = document.getElementById("guildSafeReadinessNav");
  if (!link) {
    link = document.createElement("a");
    link.id = "guildSafeReadinessNav";
    link.textContent = "TB Readiness";
    const tb = [...nav.querySelectorAll("a")].find((row) => String(row.dataset.guildRoutePath || row.getAttribute("href") || "").startsWith("/guild/tb"));
    if (tb?.nextSibling) nav.insertBefore(link, tb.nextSibling); else nav.appendChild(link);
  }
  link.href = readinessUrl();
  const active = location.pathname.replace(/\/+$/, "") === READINESS_PATH;
  link.classList.toggle("active", active);
  if (active) {
    for (const other of nav.querySelectorAll("a:not(#guildSafeReadinessNav)")) other.classList.remove("active");
  }
  return true;
}

async function renderReadiness(force = false) {
  if (location.pathname.replace(/\/+$/, "") !== READINESS_PATH || rendering) return;
  const target = document.getElementById("guildRouteContent");
  const allyCode = currentAllyCode();
  if (!target || allyCode.length !== 9) return;
  const key = `${allyCode}|${location.search}`;
  if (!force && renderedKey === key) return;
  rendering = true;
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Loading live TB mission readiness…</div></section>';
  try {
    const [response, module] = await Promise.all([
      fetch(`/api/guild/by-player/${allyCode}/roster`, { cache: "no-store" }),
      import("./guild-tb-readiness-page.js"),
    ]);
    const guildBody = await response.json();
    if (!response.ok) throw new Error(guildBody?.error || `Guild roster returned HTTP ${response.status}`);
    await module.renderGuildTbReadinessPage({ target, guildBody, allyCode });
    renderedKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || "TB mission readiness is unavailable.")}</div></section>`;
  } finally {
    rendering = false;
  }
}

function refresh(force = false) {
  ensureNav();
  renderReadiness(force);
}

function install() {
  if (!location.pathname.startsWith("/guild")) return;
  refresh(false);
  for (const delay of [50, 150, 350, 800, 1500]) setTimeout(() => refresh(false), delay);
  window.addEventListener("swgoh:guild-command-snapshot", () => {
    renderedKey = "";
    refresh(true);
  });
  window.addEventListener("swgoh:guild-route-changed", () => refresh(false));
  window.addEventListener("popstate", () => refresh(false));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
