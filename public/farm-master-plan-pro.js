import { JOURNEY_PRESETS, journeyPresetById } from "./farm-presets.js";
import { buildMasterFarmPlan } from "./farm-master-plan.js";

const state = {
  catalog: [],
  catalogMap: new Map(),
  liveBody: null,
  allyCode: "",
  fetchedAt: 0,
  initialized: false,
};

const CACHE_MS = 25_000;
const NUMBER = new Intl.NumberFormat();
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function storageKey() {
  return `swgoh:journey-tracker:v2:${digits($("allyCode")?.value) || state.allyCode || "default"}`;
}

function trackedEvents() {
  try {
    const ids = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    return Array.isArray(ids) ? ids.map((id) => journeyPresetById(id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const response = await fetch("/data/catalog.json?farm-master=1", { cache: "no-store" });
  if (!response.ok) throw new Error(`Game catalog returned HTTP ${response.status}`);
  const body = await response.json();
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  state.catalogMap = new Map(state.catalog.map((unit) => [String(unit.baseId), unit]));
  return state.catalog;
}

async function loadLive(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < CACHE_MS) {
    state.liveBody = shared.body;
    state.allyCode = allyCode;
    state.fetchedAt = Number(shared.fetchedAt || Date.now());
    return shared.body;
  }
  if (!force && state.liveBody && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) return state.liveBody;
  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.liveBody = body;
  state.allyCode = allyCode;
  state.fetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.fetchedAt };
  return body;
}

function tone(percent, complete = false) {
  if (complete) return "ready";
  if (Number(percent) >= 80) return "close";
  if (Number(percent) >= 50) return "building";
  return "far";
}

function ensurePanel() {
  const farmPanel = $("workspace-farm");
  const status = $("journeyLiveStatus");
  if (!farmPanel || !status) return null;
  let panel = $("farmMasterPlan");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "farmMasterPlan";
  panel.className = "card farm-master-plan";
  status.insertAdjacentElement("afterend", panel);
  return panel;
}

function stat(label, value, emphasis = "") {
  return `<div class="farm-master-stat ${emphasis}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function farmReadiness(plan) {
  return plan.farmSummaries.map((farm) => {
    const farmTone = tone(farm.percent, farm.complete);
    return `
      <div class="farm-master-farm tone-${farmTone}">
        <div><strong>${escapeHtml(farm.name)}</strong><span>${farm.completeCount}/${farm.total} ready</span></div>
        <b>${farm.percent}%</b>
        <div class="farm-master-mini-progress"><span style="width:${farm.percent}%"></span></div>
      </div>`;
  }).join("");
}

function materialGroup(plan, category, title, subtitle) {
  const materials = plan.materials.filter((material) => material.category === category);
  if (!materials.length) return "";
  return `
    <section class="farm-master-material-group">
      <div class="farm-master-section-head">
        <div><span>${escapeHtml(subtitle)}</span><h4>${escapeHtml(title)}</h4></div>
        <b>${materials.length} type${materials.length === 1 ? "" : "s"}</b>
      </div>
      <div class="farm-master-material-grid">
        ${materials.map((material) => `
          <article class="farm-master-material ${escapeAttr(category)}">
            <div><strong>${escapeHtml(material.name)}</strong><b>${NUMBER.format(material.quantity)}</b></div>
            <span>${escapeHtml(material.route || "Game source")}</span>
            <small>${escapeHtml(material.source || "Source not mapped")}</small>
          </article>`).join("")}
      </div>
    </section>`;
}

function targetView(target, index) {
  const staticUnit = state.catalogMap.get(target.baseId) || {};
  const name = target.unit?.name || staticUnit.name || target.baseId;
  const image = target.unit?.image || staticUnit.image || "";
  const gaps = [];
  if (!target.owned) gaps.push("Acquire unit");
  if (target.starsRemaining > 0) gaps.push(`${target.starsRemaining} star${target.starsRemaining === 1 ? "" : "s"}`);
  if (target.gearPlan.tiersRemaining > 0) gaps.push(`${target.gearPlan.tiersRemaining} gear tier${target.gearPlan.tiersRemaining === 1 ? "" : "s"}`);
  if (target.relicPlan.levelsRemaining > 0) gaps.push(`${target.relicPlan.levelsRemaining} relic level${target.relicPlan.levelsRemaining === 1 ? "" : "s"}`);
  const targetTone = tone(target.progress.percent, target.complete);
  const plannerAllowed = target.owned && target.requirement.type !== "STAR";
  return `
    <article class="farm-master-priority tone-${targetTone} ${index === 0 ? "top-priority" : ""}">
      <div class="farm-master-rank">${index === 0 ? "NEXT" : `#${index + 1}`}</div>
      <div class="farm-master-unit">
        ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="farm-master-avatar">?</span>'}
        <div>
          <div class="farm-master-unit-title">
            <strong>${escapeHtml(name)}</strong>
            ${target.shared ? `<span class="farm-master-shared">Advances ${target.impactCount} farms</span>` : ""}
          </div>
          <span>${escapeHtml(target.currentLabel)} → <b>${escapeHtml(target.targetLabel)}</b></span>
          <small>${escapeHtml(gaps.length ? gaps.join(" · ") : "Requirement ready")}</small>
        </div>
      </div>
      <div class="farm-master-impact">
        <strong>${target.progress.percent}%</strong>
        <span>${target.impactCount} farm${target.impactCount === 1 ? "" : "s"}</span>
      </div>
      <div class="farm-master-priority-progress"><span style="width:${target.progress.percent}%"></span></div>
      <div class="farm-master-tags">${target.farmNames.map((farm) => `<span>${escapeHtml(farm)}</span>`).join("")}</div>
      <div class="farm-master-actions">
        <button type="button" data-inspect-base-id="${escapeAttr(target.baseId)}">Inspect</button>
        ${plannerAllowed ? `<button type="button" class="primary" data-master-open-planner data-base-id="${escapeAttr(target.baseId)}" data-target-gear="${target.requirement.type === "RELIC" ? 13 : target.requirement.tier}" data-target-relic="${target.requirement.type === "RELIC" ? target.requirement.tier : 0}">Plan Upgrade</button>` : ""}
      </div>
    </article>`;
}

function priorityQueue(plan) {
  if (!plan.queue.length) return '<div class="farm-master-complete">All unique requirements across the tracked farms are complete.</div>';
  const first = plan.queue.slice(0, 12);
  const rest = plan.queue.slice(12);
  return `
    <div class="farm-master-priority-list">${first.map(targetView).join("")}</div>
    ${rest.length ? `<details class="farm-master-more"><summary>Show ${rest.length} more farming priorities</summary><div class="farm-master-priority-list">${rest.map((target, index) => targetView(target, index + 12)).join("")}</div></details>` : ""}`;
}

function copyText(plan) {
  const lines = [
    "MASTER FARM PLAN",
    `Tracked farms\t${plan.farmSummaries.map((farm) => farm.name).join(", ")}`,
    `Unique targets\t${plan.uniqueTargetCount}`,
    `Still needed\t${plan.incompleteTargetCount}`,
    "",
    "EXACT RELIC SHOPPING LIST",
    "Material\tQuantity\tRoute",
    ...plan.materials.map((material) => `${material.name}\t${material.quantity}\t${material.route || ""}`),
    "",
    "UPGRADE PRIORITY",
    "Rank\tUnit\tCurrent\tTarget\tReadiness\tFarms advanced\tTracked farms",
    ...plan.queue.map((target, index) => {
      const name = target.unit?.name || state.catalogMap.get(target.baseId)?.name || target.baseId;
      return `${index + 1}\t${name}\t${target.currentLabel}\t${target.targetLabel}\t${target.progress.percent}%\t${target.impactCount}\t${target.farmNames.join(", ")}`;
    }),
  ];
  return lines.join("\n");
}

async function copyPlan(button) {
  const body = state.liveBody;
  if (!body) return;
  const events = trackedEvents();
  const units = [...(body.units || []), ...(body.ships || [])];
  const plan = buildMasterFarmPlan(events, units);
  await navigator.clipboard.writeText(copyText(plan));
  const original = button.textContent;
  button.textContent = "Copied ✓";
  setTimeout(() => { button.textContent = original; }, 1400);
}

function openGearPlanner(button) {
  const baseId = button.dataset.baseId || "";
  const targetGear = Number(button.dataset.targetGear || 13);
  const targetRelic = Number(button.dataset.targetRelic || 0);
  if (location.hash !== "#gear") location.hash = "gear";
  let attempts = 0;
  const selectWhenReady = () => {
    attempts += 1;
    const select = $("gearPlannerUnit");
    const form = $("gearPlannerForm");
    const hasOption = select && [...select.options].some((option) => option.value === baseId);
    if (hasOption && form) {
      select.value = baseId;
      if ($("gearTargetTier")) $("gearTargetTier").value = String(Math.max(1, targetGear));
      if ($("gearTargetRelic")) $("gearTargetRelic").value = String(Math.max(0, targetRelic));
      form.requestSubmit();
      $("gearPlannerOutput")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (attempts < 25) setTimeout(selectWhenReady, 120);
  };
  setTimeout(selectWhenReady, 80);
}

async function renderMasterPlan(force = false) {
  const panel = ensurePanel();
  if (!panel) return;
  const events = trackedEvents();
  const allyCode = digits($("allyCode")?.value);

  if (allyCode.length !== 9) {
    panel.innerHTML = `
      <div class="farm-master-empty"><div class="kicker">MASTER FARMING PLAN</div><h3>Load an Ally Code</h3><p>Track one or more farms, then the app will combine their remaining requirements into one deduplicated shopping list and upgrade queue.</p></div>`;
    return;
  }
  if (!events.length) {
    panel.innerHTML = `
      <div class="farm-master-empty"><div class="kicker">MASTER FARMING PLAN</div><h3>Track at least one farm</h3><p>The master plan will combine every tracked Journey target and avoid double-counting shared characters.</p></div>`;
    return;
  }

  panel.innerHTML = '<div class="farm-master-loading">Building combined farming plan…</div>';
  await loadCatalog();
  const body = await loadLive(force);
  if (!body) return;
  const units = [...(body.units || []), ...(body.ships || [])];
  const plan = buildMasterFarmPlan(events, units);

  panel.innerHTML = `
    <header class="farm-master-head">
      <div>
        <div class="kicker">ALL TRACKED FARMS · DEDUPED</div>
        <h2>Master Farming Plan</h2>
        <p>One shopping list for ${plan.farmCount} tracked farm${plan.farmCount === 1 ? "" : "s"}. Shared characters are counted once at the highest target they need to satisfy.</p>
      </div>
      <button type="button" class="farm-master-copy" data-master-copy>Copy Master Plan</button>
    </header>

    <div class="farm-master-stats">
      ${stat("Tracked Farms", plan.farmCount)}
      ${stat("Unique Targets", plan.uniqueTargetCount)}
      ${stat("Still Needed", plan.incompleteTargetCount, "warning")}
      ${stat("Shared Targets", plan.sharedTargetCount, plan.sharedTargetCount ? "shared" : "")}
      ${stat("Relic Levels Left", plan.totalRelicLevelsRemaining)}
      ${stat("Gear Tiers Left", plan.totalGearTiersRemaining)}
    </div>

    <section class="farm-master-section">
      <div class="farm-master-section-head">
        <div><span>TRACKED FARM READINESS</span><h3>Unlock Progress</h3></div>
        <b>${plan.completeTargetCount}/${plan.uniqueTargetCount} unique targets ready</b>
      </div>
      <div class="farm-master-farms">${farmReadiness(plan)}</div>
    </section>

    <section class="farm-master-section shopping">
      <div class="farm-master-section-head">
        <div><span>EXACT RELIC TOTALS</span><h3>Master Shopping List</h3></div>
        <b>${plan.materials.length} material types</b>
      </div>
      <p class="farm-master-note">Totals are calculated from each unique character's current relic level to the highest target required by any tracked farm. They are gross requirements because public Comlink does not expose your inventory balances.</p>
      ${plan.materials.length ? [
        materialGroup(plan, "currency", "Credits", "CURRENCY"),
        materialGroup(plan, "signal", "Signal Data", "CANTINA FARMING"),
        materialGroup(plan, "scrap", "Relic Scrap", "SCAVENGER / HIGH-END SOURCES"),
      ].join("") : '<div class="farm-master-complete">No additional relic materials are required for the currently tracked targets.</div>'}
    </section>

    <section class="farm-master-section priorities">
      <div class="farm-master-section-head">
        <div><span>WHAT TO UPGRADE NEXT</span><h3>Combined Priority Queue</h3></div>
        <b>${plan.incompleteTargetCount} unfinished unique targets</b>
      </div>
      <p class="farm-master-note">Priority is deterministic: units advancing multiple tracked farms first, then owned/actionable units, then the closest requirements. Gear debt is shown as full tiers; exact unequipped gear inventory is not available publicly.</p>
      ${priorityQueue(plan)}
    </section>
  `;
}

function showError(error) {
  const panel = ensurePanel();
  if (panel) panel.innerHTML = `<div class="farm-master-error">${escapeHtml(error?.message || "Master farming plan is unavailable.")}</div>`;
}

function scheduleRender(delay = 120, force = false) {
  setTimeout(() => renderMasterPlan(force).catch(showError), delay);
}

function init() {
  if (state.initialized) return;
  const panel = ensurePanel();
  if (!panel) {
    setTimeout(init, 80);
    return;
  }
  state.initialized = true;

  document.addEventListener("click", (event) => {
    const copy = event.target.closest?.("[data-master-copy]");
    if (copy) {
      copyPlan(copy).catch(showError);
      return;
    }
    const planner = event.target.closest?.("[data-master-open-planner]");
    if (planner) {
      event.preventDefault();
      openGearPlanner(planner);
      return;
    }
    if (event.target.closest?.("[data-track-journey], [data-untrack-journey], #journeyTrackSelected")) scheduleRender(160, false);
  });

  $("allyForm")?.addEventListener("submit", () => {
    state.liveBody = null;
    state.fetchedAt = 0;
    scheduleRender(650, true);
  });
  document.querySelector("[data-workspace-tab='farm']")?.addEventListener("click", () => scheduleRender(60, false));
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith("swgoh:journey-tracker:v2:")) scheduleRender(50, false);
  });

  renderMasterPlan(false).catch(showError);
}

init();