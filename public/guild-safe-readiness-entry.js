import './guild-player-portrait-enhancer.js';

const READINESS_PATH = "/guild/zeffo";
const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";
const BASELINE_CONCURRENCY = 6;
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let rendering = false;
let renderedKey = "";
const playerBaselineCache = new Map();

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

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

function playerBaseline(allyCode) {
  const code = digits(allyCode);
  if (code.length !== 9) return Promise.resolve(null);
  if (!playerBaselineCache.has(code)) {
    playerBaselineCache.set(code, fetchJson(`/api/player/${code}/baseline`).catch((error) => ({ __error: error?.message || "Player baseline unavailable" })));
  }
  return playerBaselineCache.get(code);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, run));
  return results;
}

async function hydrateTbGuildRoster(guildBody, target) {
  const members = Array.isArray(guildBody?.members) ? guildBody.members : [];
  let completed = 0;
  let hydrated = 0;

  const detailedMembers = await mapWithConcurrency(members, BASELINE_CONCURRENCY, async (member) => {
    if (Array.isArray(member?.units) && member.units.length) {
      completed += 1;
      hydrated += 1;
      return member;
    }

    const code = digits(member?.allyCode);
    const baseline = code.length === 9 ? await playerBaseline(code) : null;
    completed += 1;
    const units = Array.isArray(baseline?.units) ? baseline.units : [];
    if (units.length) hydrated += 1;

    if (target && completed % 4 === 0) {
      const note = target.querySelector("[data-tb-hydration-progress]");
      if (note) note.textContent = `Fallback roster hydration… ${completed}/${members.length}`;
    }

    return {
      ...member,
      units,
      profileTitle: member?.profileTitle || baseline?.player?.profileTitle || "",
      playerPortrait: member?.playerPortrait || baseline?.player?.playerPortrait || "",
      rosterAvailable: member?.rosterAvailable === true || units.length > 0,
      tbRosterError: baseline?.__error || "",
      lastSyncedAt: baseline?.player?.updatedAt || baseline?.fetchedAt || member?.lastSyncedAt || "",
    };
  });

  return {
    ...guildBody,
    members: detailedMembers,
    hydration: {
      ...(guildBody?.hydration || {}),
      requested: members.length,
      hydrated,
      failed: Math.max(0, members.length - hydrated),
      complete: members.length > 0 && hydrated === members.length,
    },
    tbReadinessHydration: {
      source: "persisted-player-baselines-fallback",
      requested: members.length,
      hydrated,
      failed: Math.max(0, members.length - hydrated),
    },
  };
}

async function loadCompactTbGuildRoster(allyCode, target) {
  try {
    const overlay = await fetchJson(`/api/guild/by-player/${allyCode}/planning-overlay`);
    const compact = overlay?.tbReadinessRoster;
    if (Array.isArray(compact?.members) && compact.members.length) {
      const note = target?.querySelector("[data-tb-hydration-progress]");
      if (note) note.textContent = `Loaded compact TB progression for ${compact.members.length} guild members.`;
      return compact;
    }
    throw new Error("Compact Guild TB roster was not included in the planning response.");
  } catch {
    const summaryBody = await fetchJson(`/api/guild/by-player/${allyCode}/roster`);
    return hydrateTbGuildRoster(summaryBody, target);
  }
}

async function renderReadiness(force = false) {
  if (location.pathname.replace(/\/+$/, "") !== READINESS_PATH || rendering) return;
  const target = document.getElementById("guildRouteContent");
  const allyCode = currentAllyCode();
  if (!target || allyCode.length !== 9) return;
  const key = `${allyCode}|${location.search}`;
  if (!force && renderedKey === key) return;
  rendering = true;
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note" data-tb-hydration-progress>Loading compact Guild TB progression…</div></section>';
  try {
    const [guildBody, module] = await Promise.all([
      loadCompactTbGuildRoster(allyCode, target),
      import("./guild-tb-readiness-page.js"),
    ]);
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
