import { buildGuildRoteOperationSafety } from "./guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments, normalizeDonationPreference } from "./guild-rote-safe-planner.js";
import { buildGuildTbPhaseCommand, guildTbPhaseOptions, normalizeGuildTbPhase } from "./guild-tb-phase-command-model.js";

const state = {
  allyCode: "",
  guild: null,
  operations: null,
  catalog: null,
  safety: null,
  safePlan: null,
  command: null,
  phase: "P1",
  loading: false,
  loadedAt: 0,
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function currentRedundancyTarget() {
  const global = Number(window.__swgohGuildRoteRedundancyTarget);
  if (Number.isFinite(global)) return Math.max(1, Math.min(5, Math.floor(global)));
  try {
    const saved = Number(localStorage.getItem("swgoh:guild-rote-redundancy-target"));
    if (Number.isFinite(saved)) return Math.max(1, Math.min(5, Math.floor(saved)));
  } catch {
    // Optional browser storage.
  }
  return 2;
}

function guildId() {
  return String(state.guild?.guild?.id || "");
}

function readJson(key, fallback = {}) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function readPlannerControls() {
  const id = guildId();
  if (!id) return { locks: [], reservations: [], preferences: [], ignoredMembers: [] };
  const officer = readJson(`swgoh-roster-command:guild-rote-officer:${id}`, {});
  const safety = readJson(`swgoh-roster-command:guild-rote-safety:${id}`, {});
  return {
    locks: Array.isArray(officer?.locks) ? officer.locks : [],
    reservations: Array.isArray(officer?.reservations) ? officer.reservations : [],
    preferences: Array.isArray(safety?.preferences)
      ? safety.preferences.filter((row) => row?.memberId && row?.baseId && ["give", "keep"].includes(normalizeDonationPreference(row.preference)))
      : [],
    ignoredMembers: Array.isArray(safety?.ignoredMembers) ? safety.ignoredMembers : [],
  };
}

async function fetchJson(url, force = false) {
  if (force && window.__swgohFetchCache?.invalidate) {
    try { window.__swgohFetchCache.invalidate(url); } catch { /* optional cache */ }
  }
  const response = await fetch(url, { cache: force ? "reload" : "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson("/data/catalog.json?guild-tb-command=1");
  if (!Array.isArray(body?.units) || !body.units.length) throw new Error("Static unit catalog is unavailable for the Guild TB Command Board.");
  state.catalog = body.units;
  return state.catalog;
}

function recompute() {
  if (!state.guild || !state.operations || !state.catalog) return;
  const redundancyTarget = currentRedundancyTarget();
  const controls = readPlannerControls();
  state.safety = buildGuildRoteOperationSafety(state.guild, state.catalog, { redundancyTarget });
  state.safePlan = planGuildRoteSafeAssignments(state.guild, state.operations, {
    maxPerTerritory: 10,
    locks: controls.locks,
    reservations: controls.reservations,
    preferences: controls.preferences,
    ignoredMembers: controls.ignoredMembers,
    protections: state.safety.protections,
  });
  const phases = guildTbPhaseOptions(state.safety.coverage, state.safePlan);
  state.phase = normalizeGuildTbPhase(state.phase, phases[0] || "P1");
  if (!phases.includes(state.phase) && phases.length) state.phase = phases[0];
  state.command = buildGuildTbPhaseCommand({
    guildSnapshot: state.guild,
    coverage: state.safety.coverage,
    safePlan: state.safePlan,
    safety: state.safety,
    phase: state.phase,
  });
  render();
}

async function load(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9 || state.loading) {
    render();
    return;
  }
  if (!force && state.command && state.allyCode === allyCode && Date.now() - state.loadedAt < 25_000) {
    render();
    return;
  }

  state.loading = true;
  renderLoading();
  try {
    const [guild, operations, catalog] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`, force),
      state.operations && !force ? Promise.resolve(state.operations) : fetchJson("/api/rote/operations", force),
      loadCatalog(),
    ]);
    if (!Array.isArray(guild?.members)) throw new Error("The live guild response contains no member roster list.");
    if (!Array.isArray(operations?.slots) || !operations.slots.length) throw new Error("ROTE Operation requirements are unavailable.");
    state.allyCode = allyCode;
    state.guild = guild;
    state.operations = operations;
    state.catalog = catalog;
    state.loadedAt = Date.now();
    recompute();
  } catch (error) {
    state.command = null;
    renderError(error?.message || "Guild TB Command Board is unavailable.");
  } finally {
    state.loading = false;
  }
}

function installSurface() {
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel) return false;
  if ($("guildTbPhaseCommand")) return true;
  const section = document.createElement("section");
  section.id = "guildTbPhaseCommand";
  section.className = "card workspace-intro guild-tb-command";
  section.innerHTML = '<div class="workspace-note">Load an Ally Code to build the Guild TB Phase Command Board.</div>';
  const safeOperations = $("guildRoteSafeOperations");
  if (safeOperations?.parentNode === panel) panel.insertBefore(section, safeOperations);
  else {
    const firstCard = panel.querySelector(".pro-command-shell")?.closest("section") || panel.firstElementChild;
    if (firstCard?.nextSibling) panel.insertBefore(section, firstCard.nextSibling);
    else panel.appendChild(section);
  }
  return true;
}

function renderLoading() {
  const target = $("guildTbPhaseCommand");
  if (target) target.innerHTML = '<div class="workspace-note">Building phase command from live guild rosters, verified mission coverage, and mission-safe Operation assignments…</div>';
}

function renderError(message) {
  const target = $("guildTbPhaseCommand");
  if (target) target.innerHTML = `<div class="workspace-error">${escapeHtml(message)}</div>`;
}

function stat(label, value, tone = "") {
  return `<div class="guild-tb-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function alertRows() {
  const alerts = state.command?.alerts || [];
  if (!alerts.length) return '<div class="workspace-note">No critical phase alerts from the currently modeled roster evidence.</div>';
  return `<div class="guild-tb-alerts">${alerts.slice(0, 30).map((row) => `<div class="guild-tb-alert ${escapeAttr(row.severity)}"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.detail)}</span></div>`).join("")}</div>`;
}

function memberRows() {
  const rows = state.command?.members || [];
  if (!rows.length) return '<div class="workspace-note">No hydrated members are available.</div>';
  return `<div class="guild-tb-member-table-wrap"><table class="guild-tb-member-table"><thead><tr><th>Member</th><th>Mission Coverage</th><th>Operations</th><th>Protection</th><th>Officer Action</th></tr></thead><tbody>${rows.slice(0, 50).map((row) => {
    const missionTone = row.soleOwnerMissions ? "bad" : row.missionReady ? "good" : "";
    const opTone = row.riskyAssignments ? "bad" : row.operationAssignments ? "warn" : "";
    return `<tr>
      <td><strong>${escapeHtml(row.name)}</strong><small>${number(row.galacticPower)} GP · ${escapeHtml(row.allyCode || "No Ally Code")}</small></td>
      <td><span class="guild-tb-chip ${missionTone}">${number(row.missionReady)} exact-ready</span>${row.soleOwnerMissions ? `<span class="guild-tb-chip bad">${number(row.soleOwnerMissions)} sole-owner</span>` : ""}${row.closeMissions ? `<span class="guild-tb-chip warn">${number(row.closeMissions)} close</span>` : ""}</td>
      <td><span class="guild-tb-chip ${opTone}">${number(row.operationAssignments)} assigned</span>${row.riskyAssignments ? `<span class="guild-tb-chip bad">${number(row.riskyAssignments)} HELP</span>` : ""}</td>
      <td>${row.protectedUnits ? `<span class="guild-tb-chip warn">${number(row.protectedUnits)} protected</span>` : '<span class="guild-tb-chip">No exact protection</span>'}</td>
      <td>${row.allyCode ? `<button type="button" class="guild-tb-load-member" data-tb-member-ally="${escapeAttr(row.allyCode)}">Load Member</button>` : "—"}</td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}

function render() {
  installSurface();
  const target = $("guildTbPhaseCommand");
  if (!target) return;
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) {
    target.innerHTML = '<div class="kicker">GUILD OFFICER · TERRITORY BATTLE</div><h3>Phase Command Board</h3><p class="workspace-note">Load any guild member’s Ally Code to connect the live guild roster.</p>';
    return;
  }
  if (!state.command || !state.guild || !state.safety || !state.safePlan) return;

  const c = state.command;
  const s = c.summary;
  const phases = guildTbPhaseOptions(state.safety.coverage, state.safePlan);
  const operationTone = s.unfilledOperationSlots ? "bad" : s.riskyAssignments ? "warn" : "good";
  const missionTone = s.zeroCoverageMissions ? "bad" : s.singleOwnerMissions ? "warn" : "good";
  target.innerHTML = `
    <div class="guild-tb-command-head">
      <div><div class="kicker">GUILD OFFICER · TB PHASE COMMAND</div><h3>${escapeHtml(state.guild.guild?.name || "Guild")} · ${escapeHtml(c.phase)}</h3><p>One phase-level officer view combining verified mission-entry coverage with mission-safe Operation assignments. It highlights coverage holes, single-owner dependencies, roster-breaking donations, overloaded members, and the highest-impact farms.</p></div>
      <div class="guild-tb-command-actions"><button id="guildTbOpenRote" type="button">Open ROTE Map</button><button id="guildTbRefresh" type="button">Refresh Guild</button></div>
    </div>
    <div class="guild-tb-phase-tabs">${phases.map((phase) => `<button type="button" data-tb-phase="${escapeAttr(phase)}" class="${phase === c.phase ? "active" : ""}">${escapeHtml(phase)}</button>`).join("")}</div>
    <div class="guild-tb-command-grid">
      ${stat("Mission Coverage", `${s.exactCoveragePercent}%`, missionTone)}
      ${stat(`Redundancy ×${c.redundancyTarget}`, `${s.redundancyCoveragePercent}%`, s.redundancyCoveragePercent >= 80 ? "good" : "warn")}
      ${stat("Zero Coverage", number(s.zeroCoverageMissions), s.zeroCoverageMissions ? "bad" : "good")}
      ${stat("Single Owner", number(s.singleOwnerMissions), s.singleOwnerMissions ? "warn" : "good")}
      ${stat("Operation Coverage", `${s.operationCoveragePercent}%`, operationTone)}
      ${stat("Unfilled Slots", number(s.unfilledOperationSlots), s.unfilledOperationSlots ? "bad" : "good")}
      ${stat("HELP / Risk", number(s.riskyAssignments), s.riskyAssignments ? "bad" : "good")}
      ${stat("Protected Units", number(s.protectedUnits), s.protectedUnits ? "warn" : "")}
    </div>
    <div class="guild-tb-command-columns">
      <section class="guild-tb-command-panel"><h4>Officer Attention Queue</h4>${alertRows()}</section>
      <section class="guild-tb-command-panel"><h4>Member Phase Burden</h4>${memberRows()}</section>
    </div>
    <div class="guild-tb-command-foot"><strong>Evidence boundary:</strong> this board models roster capability and an officer planning draft. It does not claim that an Operation has actually been filled, a combat mission has actually been attempted, or a territory has actually been deployed in-game. Generic fleet gates remain partial where the selectable-ship rule is incomplete.</div>
  `;
  wire();
}

function loadMember(allyCode) {
  const input = $("allyCode");
  const form = $("allyForm");
  if (!input || !form || digits(allyCode).length !== 9) return;
  input.value = digits(allyCode);
  form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wire() {
  for (const button of document.querySelectorAll("#guildTbPhaseCommand [data-tb-phase]")) {
    button.addEventListener("click", () => {
      state.phase = normalizeGuildTbPhase(button.dataset.tbPhase, state.phase);
      state.command = buildGuildTbPhaseCommand({
        guildSnapshot: state.guild,
        coverage: state.safety.coverage,
        safePlan: state.safePlan,
        safety: state.safety,
        phase: state.phase,
      });
      render();
    });
  }
  $("guildTbRefresh")?.addEventListener("click", () => load(true));
  $("guildTbOpenRote")?.addEventListener("click", () => document.querySelector('button[data-workspace-tab="rote"]')?.click());
  for (const button of document.querySelectorAll("#guildTbPhaseCommand [data-tb-member-ally]")) button.addEventListener("click", () => loadMember(button.dataset.tbMemberAlly));
}

function install() {
  if (!installSurface()) {
    const observer = new MutationObserver(() => {
      if (installSurface()) {
        observer.disconnect();
        render();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.('button[data-workspace-tab="guild"]');
    if (tab) setTimeout(() => load(false), 0);
  }, true);
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.guild = null;
    state.safety = null;
    state.safePlan = null;
    state.command = null;
    state.loadedAt = 0;
    setTimeout(() => { if (location.hash.toLowerCase() === "#guild") load(true); }, 450);
  });
  window.addEventListener("swgoh:guild-rote-redundancy-target", () => {
    if (state.guild && state.operations && state.catalog) recompute();
  });
  window.addEventListener("storage", (event) => {
    if (!guildId() || !event.key?.includes(guildId())) return;
    if (event.key.includes("guild-rote-officer") || event.key.includes("guild-rote-safety")) recompute();
  });
  if (location.hash.toLowerCase() === "#guild") load(false);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
