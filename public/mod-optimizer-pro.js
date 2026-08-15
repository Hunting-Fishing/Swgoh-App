import {
  MOD_OPTIMIZER_PRESETS,
  MOD_SET_COUNTS,
  buildDefaultOptimizerTargets,
  defaultPresetForUnit,
  optimizeEquippedMods,
} from "./mod-optimizer-engine.js";
import { buildCharacterModRows, flattenEquippedMods, statDisplay } from "./mods-audit.js";

const CACHE_MS = 60_000;
const state = {
  allyCode: "",
  liveBody: null,
  modBody: null,
  characters: [],
  mods: [],
  targets: [],
  plan: null,
  loading: false,
  targetShown: 120,
  moveShown: 200,
  tuneBaseId: "",
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "N/A";

function optimizerStorageKey() {
  return `swgoh:mod-optimizer:v1:${state.allyCode || digits($("allyCode")?.value) || "default"}`;
}

function savedSquadKey() {
  return `swgoh:squad-workbench:v1:${state.allyCode || digits($("allyCode")?.value) || "default"}`;
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional browser persistence */ }
}

function unitMap() {
  return new Map((state.liveBody?.units || []).map((unit) => [String(unit.baseId), unit]));
}

function targetById(baseId) {
  return state.targets.find((target) => String(target.baseId) === String(baseId));
}

function hydrateTargetState() {
  const units = state.liveBody?.units || [];
  const saved = readJson(optimizerStorageKey(), null);
  const defaults = buildDefaultOptimizerTargets(units, 12);
  if (!saved?.targets || !Array.isArray(saved.targets)) {
    state.targets = defaults;
    return;
  }
  const savedMap = new Map(saved.targets.map((target) => [String(target.baseId), target]));
  state.targets = defaults.map((target) => ({ ...target, ...(savedMap.get(String(target.baseId)) || {}) }));
  if ($("modOptDonorScope") && saved.options?.donorScope) $("modOptDonorScope").value = saved.options.donorScope;
  if ($("modOptMoveMode") && saved.options?.moveMode) $("modOptMoveMode").value = saved.options.moveMode;
}

function saveOptimizerSetup() {
  writeJson(optimizerStorageKey(), {
    targets: state.targets,
    options: {
      donorScope: $("modOptDonorScope")?.value || "all",
      moveMode: $("modOptMoveMode")?.value || "balanced",
    },
    savedAt: new Date().toISOString(),
  });
  setNotice("Optimizer setup saved locally for this Ally Code.", "ready");
}

function setNotice(message, kind = "") {
  const el = $("modOptNotice");
  if (!el) return;
  el.className = `workspace-note${kind ? ` ${kind}` : ""}`;
  el.textContent = message;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadData(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) throw new Error("Load a 9-digit Ally Code before running the optimizer.");
  const now = Date.now();
  const liveShared = window.__swgohLiveSnapshot;
  const modShared = window.__swgohModSnapshot;
  const live = !force && liveShared?.allyCode === allyCode && liveShared?.body && now - Number(liveShared.fetchedAt || 0) < CACHE_MS
    ? liveShared.body : await fetchJson(`/api/player/${allyCode}`);
  const mods = !force && modShared?.allyCode === allyCode && modShared?.body && now - Number(modShared.fetchedAt || 0) < CACHE_MS
    ? modShared.body : await fetchJson(`/api/mods/${allyCode}`);
  window.__swgohLiveSnapshot = { allyCode, body: live, fetchedAt: now };
  window.__swgohModSnapshot = { allyCode, body: mods, fetchedAt: now };

  const changed = state.allyCode !== allyCode;
  state.allyCode = allyCode;
  state.liveBody = live;
  state.modBody = mods;
  state.characters = buildCharacterModRows(live, mods);
  state.mods = flattenEquippedMods(state.characters);
  if (changed || !state.targets.length) hydrateTargetState();
  renderSavedSquads();
  renderTargets();
  renderPlan();
}

function setupOptimizer() {
  const panel = document.querySelector('[data-workspace-panel="mods"]');
  const viewSelect = $("modsProView");
  if (!panel || !viewSelect || $("modsOptimizerSection")) return false;

  if (![...viewSelect.options].some((option) => option.value === "optimizer")) {
    const option = document.createElement("option");
    option.value = "optimizer";
    option.textContent = "Move Optimizer";
    viewSelect.appendChild(option);
  }

  const section = document.createElement("section");
  section.id = "modsOptimizerSection";
  section.className = "mods-optimizer-section";
  section.hidden = true;
  section.innerHTML = `
    <section class="card workspace-intro mod-opt-hero">
      <div class="database-heading">
        <div>
          <div class="kicker">PRIORITY REMOD · EQUIPPED MOD POOL ONLY</div>
          <h2>Mod Move Optimizer</h2>
          <p>Build a deterministic roster remod from the equipped mods we can actually see. Characters are optimized in priority order; locked characters keep their loadout and their mods are removed from the donor pool.</p>
        </div>
        <div id="modOptStatus" class="status">Load an Ally Code</div>
      </div>
      <div class="mod-opt-reference">
        <strong>Reference model:</strong> Grandivory-style stat weighting + priority/lock behavior, combined with a HotUtils-style include → tune → review → save/export workflow. This app does not copy proprietary recommendations or perform in-game writes.
        <span><a href="https://mods-optimizer.swgoh.grandivory.com/" target="_blank" rel="noopener noreferrer">Grandivory ↗</a> · <a href="https://www.hotutils.com/" target="_blank" rel="noopener noreferrer">HotUtils ↗</a></span>
      </div>
      <div class="mod-opt-controls">
        <label>Donor Pool
          <select id="modOptDonorScope">
            <option value="all">All unlocked roster mods</option>
            <option value="included">Included characters only</option>
          </select>
        </label>
        <label>Move Strategy
          <select id="modOptMoveMode">
            <option value="balanced">Balanced moves / gains</option>
            <option value="aggressive">Maximum target score</option>
            <option value="minimal">Prefer current mods</option>
          </select>
        </label>
        <label>Saved Squad
          <select id="modOptSavedSquad"><option value="">Choose saved squad…</option></select>
        </label>
        <button id="modOptLoadSquad" type="button">Include Squad</button>
        <button id="modOptTop12" type="button">Top 12 GP</button>
        <button id="modOptClear" type="button">Clear Included</button>
        <button id="modOptSaveSetup" type="button">Save Setup</button>
        <button id="modOptRun" class="primary" type="button">Run Optimizer</button>
      </div>
      <p id="modOptNotice" class="workspace-note">The first 12 highest-GP characters are included by default. Review priority, profiles and locks before running.</p>
    </section>

    <section class="card workspace-intro">
      <div class="database-heading">
        <div><div class="kicker">CHARACTER PRIORITY</div><h3>Include, order, lock &amp; tune</h3><p>Lower priority number is optimized first. A lock protects the character's current equipped mods even if the character is not included as an optimization target.</p></div>
        <label class="mod-opt-search">Search<input id="modOptTargetSearch" placeholder="Character, role, faction…"></label>
      </div>
      <div id="modOptTargets"></div>
      <button id="modOptMoreTargets" class="catalog-more hidden" type="button">Show More Characters</button>
    </section>

    <section id="modOptReviewCard" class="card workspace-intro">
      <div id="modOptSummary"></div>
      <div id="modOptPlan"><div class="workspace-note">Run the optimizer to generate a reviewable assignment and move plan.</div></div>
    </section>

    <dialog id="modOptTuneDialog" class="details mod-opt-dialog">
      <button id="modOptTuneClose" class="close" type="button" aria-label="Close">×</button>
      <div class="kicker">CHARACTER-SPECIFIC TARGET</div>
      <h2 id="modOptTuneTitle">Tune target</h2>
      <p class="workspace-note">Weights use a Grandivory-inspired relative model. The engine normalizes each stat against this player's equipped-mod distribution before applying these 0–100 priorities.</p>
      <form id="modOptTuneForm">
        <div id="modOptWeightGrid" class="mod-opt-weight-grid"></div>
        <h3>Preferred Sets</h3>
        <div id="modOptSetGrid" class="mod-opt-set-grid"></div>
        <h3>Preferred Primaries</h3>
        <div class="mod-opt-primary-grid">
          <label>Arrow<input id="modOptPrimaryArrow" placeholder="Speed, Offense…"></label>
          <label>Triangle<input id="modOptPrimaryTriangle" placeholder="Critical Damage, Offense…"></label>
          <label>Circle<input id="modOptPrimaryCircle" placeholder="Protection, Health…"></label>
          <label>Cross<input id="modOptPrimaryCross" placeholder="Potency, Offense…"></label>
        </div>
        <div class="mod-opt-dialog-actions"><button id="modOptResetTune" type="button">Reset to Profile</button><button type="submit" class="primary">Save Character Target</button></div>
      </form>
    </dialog>
  `;
  panel.appendChild(section);

  viewSelect.addEventListener("change", syncView);
  $("modOptTargetSearch")?.addEventListener("input", () => { state.targetShown = 120; renderTargets(); });
  $("modOptMoreTargets")?.addEventListener("click", () => { state.targetShown += 120; renderTargets(); });
  $("modOptTop12")?.addEventListener("click", includeTop12);
  $("modOptClear")?.addEventListener("click", clearIncluded);
  $("modOptLoadSquad")?.addEventListener("click", includeSavedSquad);
  $("modOptSaveSetup")?.addEventListener("click", saveOptimizerSetup);
  $("modOptRun")?.addEventListener("click", runOptimizer);
  $("modOptDonorScope")?.addEventListener("change", () => { state.plan = null; renderPlan(); });
  $("modOptMoveMode")?.addEventListener("change", () => { state.plan = null; renderPlan(); });
  $("modOptTuneClose")?.addEventListener("click", () => $("modOptTuneDialog")?.close());
  $("modOptTuneDialog")?.addEventListener("click", (event) => { if (event.target === $("modOptTuneDialog")) $("modOptTuneDialog")?.close(); });
  $("modOptTuneForm")?.addEventListener("submit", saveTune);
  $("modOptResetTune")?.addEventListener("click", resetTune);
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.liveBody = null;
    state.modBody = null;
    state.characters = [];
    state.mods = [];
    state.targets = [];
    state.plan = null;
    setTimeout(() => { if (location.hash === "#mods" && $("modsProView")?.value === "optimizer") refreshOptimizer(true); }, 450);
  });
  document.querySelector('[data-workspace-tab="mods"]')?.addEventListener("click", () => {
    if ($("modsProView")?.value === "optimizer") refreshOptimizer(false);
  });

  syncView();
  return true;
}

function syncView() {
  const optimizer = $("modsProView")?.value === "optimizer";
  const section = $("modsOptimizerSection");
  if (!section) return;
  section.hidden = !optimizer;
  if ($("modsProOutput")) $("modsProOutput").style.display = optimizer ? "none" : "";
  if ($("modsProMore")) $("modsProMore").style.display = optimizer ? "none" : "";
  for (const id of ["modsProPips", "modsProFocus", "modsProSort", "modsProSearch"]) {
    const el = $(id);
    if (el?.closest("label")) el.closest("label").style.display = optimizer ? "none" : "";
  }
  if (optimizer) refreshOptimizer(false);
}

async function refreshOptimizer(force = false) {
  if (state.loading) return;
  const status = $("modOptStatus");
  state.loading = true;
  if (status) { status.textContent = "Loading optimizer data…"; status.className = "status"; }
  try {
    await loadData(force);
    if (status) { status.textContent = `${number(state.mods.length)} equipped mods ready`; status.className = "status ready"; }
  } catch (error) {
    if (status) { status.textContent = "Optimizer unavailable"; status.className = "status danger"; }
    setNotice(error.message || "Mod optimizer data could not be loaded.", "danger");
  } finally {
    state.loading = false;
  }
}

function targetRows() {
  const map = unitMap();
  const query = String($("modOptTargetSearch")?.value || "").trim().toLowerCase();
  return state.targets
    .map((target) => ({ target, unit: map.get(String(target.baseId)) }))
    .filter((row) => row.unit)
    .filter((row) => !query || [row.unit.name, row.unit.baseId, row.unit.role, ...(row.unit.factions || [])].join(" ").toLowerCase().includes(query))
    .sort((a, b) => Number(b.target.included) - Number(a.target.included) || Number(a.target.priority) - Number(b.target.priority) || Number(b.unit.power || 0) - Number(a.unit.power || 0));
}

function presetOptions(selected) {
  return Object.keys(MOD_OPTIMIZER_PRESETS).map((name) => `<option value="${escapeAttr(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`).join("");
}

function renderTargets() {
  const output = $("modOptTargets");
  if (!output || !state.liveBody) return;
  const rows = targetRows();
  const visible = rows.slice(0, state.targetShown);
  output.innerHTML = `
    <div class="pro-table-wrap"><table class="workspace-table mod-opt-target-table">
      <thead><tr><th>Use</th><th>Priority</th><th>Character</th><th>Role / Current</th><th>Profile</th><th>Min Mod Speed</th><th>Protect</th><th>Tune</th></tr></thead>
      <tbody>${visible.map(({ target, unit }) => `
        <tr class="${target.included ? "included" : ""}${target.locked ? " locked" : ""}">
          <td><input type="checkbox" data-opt-include="${escapeAttr(target.baseId)}" ${target.included ? "checked" : ""}></td>
          <td><input class="mod-opt-priority" type="number" min="1" max="999" value="${Number(target.priority || 1)}" data-opt-priority="${escapeAttr(target.baseId)}"></td>
          <td><strong>${escapeHtml(unit.name || unit.baseId)}</strong><small>${escapeHtml(unit.baseId)}</small></td>
          <td>${escapeHtml(unit.role || "Unknown")}<small>${number(unit.power)} GP · ${Number(unit.relic || 0) ? `R${Number(unit.relic)}` : `G${Number(unit.gear || 0)}`} · ${number(unit.speed)} SPD</small></td>
          <td><select data-opt-preset="${escapeAttr(target.baseId)}">${presetOptions(target.preset || defaultPresetForUnit(unit))}</select></td>
          <td><input class="mod-opt-speed-target" type="number" min="0" max="400" value="${Number(target.minSpeed || 0)}" data-opt-min-speed="${escapeAttr(target.baseId)}" title="Minimum speed contributed by the six selected mods, not final character speed"></td>
          <td><label class="mod-opt-lock"><input type="checkbox" data-opt-lock="${escapeAttr(target.baseId)}" ${target.locked ? "checked" : ""}> Lock</label></td>
          <td><button type="button" data-opt-tune="${escapeAttr(target.baseId)}">Tune${target.weights || target.desiredSets || target.primaries ? " *" : ""}</button></td>
        </tr>
      `).join("")}</tbody>
    </table></div>`;
  $("modOptMoreTargets")?.classList.toggle("hidden", rows.length <= state.targetShown);

  for (const input of output.querySelectorAll("[data-opt-include]")) input.addEventListener("change", () => mutateTarget(input.dataset.optInclude, { included: input.checked }));
  for (const input of output.querySelectorAll("[data-opt-priority]")) input.addEventListener("change", () => mutateTarget(input.dataset.optPriority, { priority: Math.max(1, Number(input.value || 1)) }));
  for (const input of output.querySelectorAll("[data-opt-min-speed]")) input.addEventListener("change", () => mutateTarget(input.dataset.optMinSpeed, { minSpeed: Math.max(0, Number(input.value || 0)) }));
  for (const input of output.querySelectorAll("[data-opt-lock]")) input.addEventListener("change", () => mutateTarget(input.dataset.optLock, { locked: input.checked }));
  for (const select of output.querySelectorAll("[data-opt-preset]")) select.addEventListener("change", () => mutateTarget(select.dataset.optPreset, { preset: select.value, weights: undefined, desiredSets: undefined, primaries: undefined }));
  for (const button of output.querySelectorAll("[data-opt-tune]")) button.addEventListener("click", () => openTune(button.dataset.optTune));
}

function mutateTarget(baseId, patch) {
  const target = targetById(baseId);
  if (!target) return;
  Object.assign(target, patch);
  state.plan = null;
  renderTargets();
  renderPlan();
}

function includeTop12() {
  const topIds = new Set((state.liveBody?.units || []).slice().sort((a, b) => Number(b.power || 0) - Number(a.power || 0)).slice(0, 12).map((unit) => String(unit.baseId)));
  let priority = 1;
  for (const target of state.targets) {
    target.included = topIds.has(String(target.baseId));
    if (target.included) target.priority = priority++;
  }
  state.plan = null;
  renderTargets();
  renderPlan();
}

function clearIncluded() {
  for (const target of state.targets) target.included = false;
  state.plan = null;
  renderTargets();
  renderPlan();
}

function readSavedSquads() {
  const saved = readJson(savedSquadKey(), []);
  return Array.isArray(saved) ? saved : [];
}

function renderSavedSquads() {
  const select = $("modOptSavedSquad");
  if (!select) return;
  const saved = readSavedSquads();
  select.innerHTML = `<option value="">Choose saved squad…</option>${saved.map((entry, index) => `<option value="${index}">${escapeHtml(entry.name || `Squad ${index + 1}`)} · ${(entry.members || []).length} units</option>`).join("")}`;
}

function includeSavedSquad() {
  const index = Number($("modOptSavedSquad")?.value);
  const entry = readSavedSquads()[index];
  if (!entry) return;
  const ids = (entry.members || []).map(String);
  let priority = 1;
  for (const id of ids) {
    const target = targetById(id);
    if (!target) continue;
    target.included = true;
    target.priority = priority++;
  }
  state.plan = null;
  renderTargets();
  renderPlan();
  setNotice(`Included ${ids.length} members from saved squad “${entry.name || "Squad"}”.`, "ready");
}

const TUNE_WEIGHT_FIELDS = [
  ["speed", "Speed"], ["healthFlat", "Health flat"], ["healthPct", "Health %"], ["protectionFlat", "Protection flat"], ["protectionPct", "Protection %"],
  ["offenseFlat", "Offense flat"], ["offensePct", "Offense %"], ["defenseFlat", "Defense flat"], ["defensePct", "Defense %"],
  ["critChance", "Critical Chance"], ["critDamage", "Critical Damage"], ["potency", "Potency"], ["tenacity", "Tenacity"], ["accuracy", "Accuracy"], ["critAvoidance", "Crit Avoidance"],
];

function profileForTarget(target, unit) {
  const presetName = target.preset && MOD_OPTIMIZER_PRESETS[target.preset] ? target.preset : defaultPresetForUnit(unit);
  const preset = MOD_OPTIMIZER_PRESETS[presetName];
  return {
    presetName,
    weights: { ...preset.weights, ...(target.weights || {}) },
    desiredSets: target.desiredSets || preset.desiredSets,
    primaries: { ...preset.primaries, ...(target.primaries || {}) },
  };
}

function openTune(baseId) {
  const target = targetById(baseId);
  const unit = unitMap().get(String(baseId));
  if (!target || !unit) return;
  state.tuneBaseId = String(baseId);
  const profile = profileForTarget(target, unit);
  $("modOptTuneTitle").textContent = `${unit.name || unit.baseId} · ${profile.presetName}`;
  $("modOptWeightGrid").innerHTML = TUNE_WEIGHT_FIELDS.map(([key, label]) => `<label>${escapeHtml(label)}<input type="number" min="0" max="100" step="1" value="${Number(profile.weights[key] || 0)}" data-opt-weight="${escapeAttr(key)}"></label>`).join("");
  $("modOptSetGrid").innerHTML = Object.keys(MOD_SET_COUNTS).map((setName) => `<label><input type="checkbox" value="${escapeAttr(setName)}" data-opt-set ${profile.desiredSets.includes(setName) ? "checked" : ""}> ${escapeHtml(setName)}</label>`).join("");
  for (const slot of ["Arrow", "Triangle", "Circle", "Cross"]) {
    const input = $(`modOptPrimary${slot}`);
    if (input) input.value = (profile.primaries[slot] || []).join(", ");
  }
  $("modOptTuneDialog")?.showModal();
}

function commaList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function saveTune(event) {
  event.preventDefault();
  const target = targetById(state.tuneBaseId);
  if (!target) return;
  target.weights = Object.fromEntries([...document.querySelectorAll("[data-opt-weight]")].map((input) => [input.dataset.optWeight, Math.max(0, Math.min(100, Number(input.value || 0)))]));
  target.desiredSets = [...document.querySelectorAll("[data-opt-set]:checked")].map((input) => input.value);
  target.primaries = {
    Arrow: commaList($("modOptPrimaryArrow")?.value),
    Triangle: commaList($("modOptPrimaryTriangle")?.value),
    Circle: commaList($("modOptPrimaryCircle")?.value),
    Cross: commaList($("modOptPrimaryCross")?.value),
  };
  state.plan = null;
  $("modOptTuneDialog")?.close();
  renderTargets();
  renderPlan();
}

function resetTune() {
  const target = targetById(state.tuneBaseId);
  if (!target) return;
  delete target.weights;
  delete target.desiredSets;
  delete target.primaries;
  openTune(state.tuneBaseId);
}

function runOptimizer() {
  if (!state.liveBody || !state.modBody) return;
  const included = state.targets.filter((target) => target.included);
  if (!included.length) {
    setNotice("Include at least one character before running the optimizer.", "danger");
    return;
  }
  setNotice("Calculating priority remod from the visible equipped-mod pool…");
  state.plan = optimizeEquippedMods({
    liveUnits: state.liveBody.units || [],
    mods: state.mods,
    targets: state.targets,
    options: {
      donorScope: $("modOptDonorScope")?.value || "all",
      moveMode: $("modOptMoveMode")?.value || "balanced",
      candidatesPerSlot: 20,
      beamWidth: 350,
    },
  });
  renderPlan();
  setNotice(`Plan ready: ${number(state.plan.summary.movedMods)} mod moves across ${number(state.plan.summary.donorCharacters)} donor characters. Review before making any in-game changes.`, "ready");
  $("modOptReviewCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function assignmentModSummary(assignment) {
  return assignment.mods.map((mod) => {
    const moved = String(mod.characterBaseId || "") !== String(assignment.baseId);
    return `<span class="mod-opt-mod-chip${moved ? " moved" : " kept"}">${escapeHtml(mod.slotName || "Slot")} · ${escapeHtml(mod.setName || "Set")} · ${Number(mod.pips || 0)}d${Number(mod.speedSecondary || 0) ? ` · +${number(mod.speedSecondary)} SPD` : ""}${moved ? ` ← ${escapeHtml(mod.characterName || mod.characterBaseId)}` : ""}</span>`;
  }).join("");
}

function renderPlan() {
  const summary = $("modOptSummary");
  const output = $("modOptPlan");
  if (!summary || !output) return;
  if (!state.plan) {
    summary.innerHTML = "";
    output.innerHTML = '<div class="workspace-note">Run the optimizer to generate a reviewable assignment and move plan.</div>';
    return;
  }
  const plan = state.plan;
  summary.innerHTML = `<div class="mods-summary-grid">
    ${summaryCard("Targets", number(plan.summary.selectedCharacters))}
    ${summaryCard("Locked", number(plan.summary.lockedCharacters))}
    ${summaryCard("Assigned Mods", number(plan.summary.assignedMods))}
    ${summaryCard("Mods Kept", number(plan.summary.preservedMods))}
    ${summaryCard("Moves", number(plan.summary.movedMods))}
    ${summaryCard("Donor Characters", number(plan.summary.donorCharacters))}
    ${summaryCard("+20 Speed Moves", number(plan.summary.highSpeedMoves))}
  </div>`;

  output.innerHTML = `
    ${plan.warnings.length ? `<div class="workspace-error"><strong>Plan warnings:</strong><br>${plan.warnings.map(escapeHtml).join("<br>")}</div>` : ""}
    <div class="database-heading mod-opt-review-head"><div><div class="kicker">REVIEW ASSIGNMENTS</div><h3>Proposed loadouts</h3><p>Assignments are processed in priority order. Asterisk-free scores are relative optimizer scores for this player's current mod pool, not a universal SWGOH rating.</p></div><div><button id="modOptCopy" type="button">Copy Move Plan TSV</button></div></div>
    <div class="mod-opt-assignment-list">${plan.assignments.map((assignment, index) => `
      <article class="mod-opt-assignment${assignment.locked ? " locked" : ""}">
        <header><div><span class="mod-opt-priority-pill">#${index + 1}</span><strong>${escapeHtml(assignment.name)}</strong><small>${escapeHtml(assignment.profile.preset)}${assignment.locked ? " · LOCKED" : ""}</small></div><div><strong>${assignment.modSpeed ? `+${number(assignment.modSpeed)} mod speed` : "0 mod speed"}</strong><small>${assignment.score == null ? "Current loadout preserved" : `Relative score ${number(assignment.score)}`}</small></div></header>
        <div class="mod-opt-chip-grid">${assignmentModSummary(assignment)}</div>
      </article>
    `).join("")}</div>
    <div class="database-heading"><div><div class="kicker">HOTUTILS-STYLE REVIEW STEP</div><h3>Manual move list</h3><p>Review every donor before changing mods in-game. This app does not log into SWGOH and cannot push the remod.</p></div></div>
    ${plan.moves.length ? `<div class="pro-table-wrap"><table class="workspace-table mod-opt-move-table"><thead><tr><th>#</th><th>To</th><th>From</th><th>Slot</th><th>Set / Pips</th><th>Primary</th><th>Speed</th><th>Mod ID</th></tr></thead><tbody>${plan.moves.slice(0, state.moveShown).map((move, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(move.toName)}</strong></td><td>${escapeHtml(move.fromName)}</td><td>${escapeHtml(move.slotName)}</td><td>${escapeHtml(move.setName)} · ${number(move.pips)}d</td><td>${escapeHtml(statDisplay(move.primaryStat))}</td><td>${move.speedSecondary ? `+${number(move.speedSecondary)}` : "—"}</td><td><small>${escapeHtml(move.modId)}</small></td></tr>`).join("")}</tbody></table></div>` : '<div class="workspace-note">No moves are required for the selected targets under this setup.</div>'}
    ${plan.moves.length > state.moveShown ? '<button id="modOptMoreMoves" class="catalog-more" type="button">Show More Moves</button>' : ""}
    <div class="mod-opt-donor-section"><h3>Donor impact</h3><div class="mod-opt-donor-grid">${plan.donors.length ? plan.donors.map((donor) => `<article><strong>${escapeHtml(donor.name)}</strong><span>${number(donor.out)} mod${donor.out === 1 ? "" : "s"} donated · +${number(donor.speedOut)} speed moved${donor.selected ? " · included target" : ""}</span></article>`).join("") : '<p class="workspace-note">No donor characters are affected.</p>'}</div></div>
    <p class="workspace-note"><strong>Inventory boundary:</strong> this optimizer can only redistribute equipped mods returned by the public player endpoint. HotUtils can manage unequipped inventory and perform account-side operations; this app cannot and does not claim that capability.</p>
  `;
  $("modOptCopy")?.addEventListener("click", copyMovePlan);
  $("modOptMoreMoves")?.addEventListener("click", () => { state.moveShown += 200; renderPlan(); });
}

function summaryCard(label, value) {
  return `<div class="mods-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

async function copyMovePlan() {
  if (!state.plan) return;
  const lines = [
    ["Priority", "To", "To Base ID", "From", "From Base ID", "Slot", "Set", "Pips", "Level", "Primary", "Speed Secondary", "Mod ID"].join("\t"),
    ...state.plan.moves.map((move) => {
      const priority = state.plan.assignments.findIndex((assignment) => assignment.baseId === move.toBaseId) + 1;
      return [priority, move.toName, move.toBaseId, move.fromName, move.fromBaseId, move.slotName, move.setName, move.pips, move.level, statDisplay(move.primaryStat), move.speedSecondary, move.modId].join("\t");
    }),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    setNotice(`Copied ${number(state.plan.moves.length)} proposed moves as TSV.`, "ready");
  } catch {
    setNotice("Clipboard access was blocked by the browser.", "danger");
  }
}

if (!setupOptimizer()) {
  const observer = new MutationObserver(() => {
    if (setupOptimizer()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
