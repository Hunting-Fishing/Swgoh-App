const ALLY_STORAGE_KEY = "swgoh:guild-route-ally-code";
const MEMBER_ROUTE_RE = /^\/guild\/members\/(\d{9})\/?$/;
const state = { catalog: null, operations: null, rendering: false, renderedKey: "" };

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function guildLookupAllyCode() {
  const params = new URLSearchParams(location.search);
  const query = digits(params.get("allyCode"));
  const input = digits(document.getElementById("allyCode")?.value);
  let stored = "";
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || "";
}

function targetMemberAllyCode() {
  return digits(location.pathname.match(MEMBER_ROUTE_RE)?.[1]);
}

function memberProfileUrl(memberAllyCode) {
  const guildCode = guildLookupAllyCode() || digits(memberAllyCode);
  const params = new URLSearchParams();
  if (guildCode.length === 9) params.set("allyCode", guildCode);
  return `/guild/members/${digits(memberAllyCode)}${params.toString() ? `?${params.toString()}` : ""}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson("/data/catalog.json?guild-member-command=1");
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  return state.catalog;
}

async function loadOperations() {
  if (state.operations) return state.operations;
  try { state.operations = await fetchJson("/api/rote/operations"); }
  catch { state.operations = { slots: [] }; }
  return state.operations;
}

async function loadPlanningOverlay(guildCode) {
  try {
    const overlay = await fetchJson(`/api/guild/by-player/${guildCode}/planning-overlay`);
    return overlay && typeof overlay === "object" ? overlay : { bound: false, source: "none", reason: "invalid-overlay" };
  } catch (error) {
    return {
      bound: false,
      durable: false,
      source: "none",
      reason: "overlay-request-failed",
      error: String(error?.message || "Planning overlay unavailable"),
      preferences: [],
      ignoredMembers: [],
      unavailableMembers: [],
    };
  }
}

function redundancyTarget() {
  let value = Number(window.__swgohGuildRoteRedundancyTarget || 0);
  if (!Number.isFinite(value) || value <= 0) {
    try { value = Number(localStorage.getItem("swgoh:guild-rote-redundancy-target") || 2); } catch { value = 2; }
  }
  return Math.max(1, Math.min(5, Number.isFinite(value) ? Math.floor(value) : 2));
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}

function planningControls(guildId, durableOverlay = {}) {
  if (!guildId) return { locks: [], reservations: [], preferences: [], ignoredMembers: [], planningOverlay: durableOverlay };
  const officer = readJson(`swgoh-roster-command:guild-rote-officer:${guildId}`);
  const safety = readJson(`swgoh-roster-command:guild-rote-safety:${guildId}`);
  const preferenceMap = new Map();
  for (const row of Array.isArray(safety?.preferences) ? safety.preferences : []) {
    if (!row?.memberId || !row?.baseId) continue;
    preferenceMap.set(`${String(row.memberId)}|${String(row.baseId).toUpperCase()}`, row);
  }
  for (const row of Array.isArray(durableOverlay?.preferences) ? durableOverlay.preferences : []) {
    if (!row?.memberId || !row?.baseId) continue;
    preferenceMap.set(`${String(row.memberId)}|${String(row.baseId).toUpperCase()}`, row);
  }
  const ignored = new Set((Array.isArray(safety?.ignoredMembers) ? safety.ignoredMembers : []).map(String));
  for (const memberId of Array.isArray(durableOverlay?.ignoredMembers) ? durableOverlay.ignoredMembers : []) ignored.add(String(memberId));
  return {
    locks: Array.isArray(officer?.locks) ? officer.locks : [],
    reservations: Array.isArray(officer?.reservations) ? officer.reservations : [],
    preferences: [...preferenceMap.values()],
    ignoredMembers: [...ignored],
    planningOverlay: durableOverlay,
  };
}

function fixGuildNav() {
  if (!MEMBER_ROUTE_RE.test(location.pathname)) return;
  const nav = document.querySelector(".guild-route-nav");
  if (!nav) return;
  for (const link of nav.querySelectorAll("a")) {
    const href = String(link.getAttribute("href") || "");
    link.classList.toggle("active", href.startsWith("/guild/members") && !href.startsWith("/guild/members/"));
  }
}

function enhanceMemberList() {
  if (location.pathname.replace(/\/+$/, "") !== "/guild/members") return;
  for (const row of document.querySelectorAll("tr[data-guild-member-id]")) {
    if (row.dataset.guildMemberProfileEnhanced === "true") continue;
    const code = digits(row.querySelector("td small")?.textContent);
    if (code.length !== 9) continue;
    row.dataset.guildMemberProfileEnhanced = "true";
    const cell = row.querySelector("td");
    if (!cell) continue;
    const link = document.createElement("a");
    link.className = "guild-member-profile-link";
    link.href = memberProfileUrl(code);
    link.textContent = "Guild Profile";
    link.addEventListener("click", (event) => event.stopPropagation());
    cell.appendChild(link);
  }
}

function enhanceModeMemberTables() {
  for (const selector of [".guild-tw-member-table tbody tr", ".guild-raid-member-table tbody tr"]) {
    for (const row of document.querySelectorAll(selector)) {
      if (row.dataset.guildMemberProfileEnhanced === "true") continue;
      const code = digits(row.querySelector("td small")?.textContent);
      if (code.length !== 9) continue;
      row.dataset.guildMemberProfileEnhanced = "true";
      const lastCell = row.lastElementChild;
      if (!lastCell) continue;
      const link = document.createElement("a");
      link.className = "guild-member-profile-link";
      link.href = memberProfileUrl(code);
      link.textContent = "Guild Profile";
      lastCell.appendChild(link);
    }
  }
}

async function renderMemberProfile(force = false) {
  if (!MEMBER_ROUTE_RE.test(location.pathname) || state.rendering) return;
  const target = document.getElementById("guildRouteContent");
  const memberCode = targetMemberAllyCode();
  const guildCode = guildLookupAllyCode() || memberCode;
  if (!target || memberCode.length !== 9 || guildCode.length !== 9) return;
  const key = `${guildCode}|${memberCode}`;
  if (!force && state.renderedKey === key && target.dataset.guildMemberCommand === "true") return;

  state.rendering = true;
  target.dataset.guildMemberCommand = "true";
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Building cross-mode guild member profile…</div></section>';
  try {
    const [guildBody, catalog, operations, durableOverlay, modelModule, pageModule] = await Promise.all([
      fetchJson(`/api/guild/by-player/${guildCode}/roster`),
      loadCatalog(),
      loadOperations(),
      loadPlanningOverlay(guildCode),
      import("./guild-member-command-model.js"),
      import("./guild-member-command-page.js"),
    ]);
    const controls = planningControls(String(guildBody?.guild?.id || ""), durableOverlay);
    const profile = modelModule.buildGuildMemberCommandProfile({
      guildSnapshot: guildBody,
      catalog,
      operations,
      targetMember: memberCode,
      redundancyTarget: redundancyTarget(),
      ...controls,
    });
    if (!profile) throw new Error("The requested Ally Code is not in the currently loaded guild roster.");
    pageModule.renderGuildMemberCommandPage({ target, profile });
    state.renderedKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || "Guild member profile is unavailable.")}</div></section>`;
  } finally {
    state.rendering = false;
  }
}

function postRender() {
  fixGuildNav();
  enhanceMemberList();
  enhanceModeMemberTables();
  renderMemberProfile(false);
}

function install() {
  if (!location.pathname.startsWith("/guild")) return;
  postRender();
  const observer = new MutationObserver(() => postRender());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:guild-command-snapshot", () => {
    state.renderedKey = "";
    setTimeout(() => renderMemberProfile(true), 0);
  });
  window.addEventListener("swgoh:guild-rote-redundancy-target", () => {
    if (MEMBER_ROUTE_RE.test(location.pathname)) {
      state.renderedKey = "";
      renderMemberProfile(true);
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);
