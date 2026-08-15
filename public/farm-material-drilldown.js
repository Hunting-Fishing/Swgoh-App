import { gearGap, relicMaterialsBetween } from "./relic-material-guide.js";

const NUMBER = new Intl.NumberFormat();
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function numericText(value) {
  const match = String(value || "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function metricInfo(metric) {
  return {
    label: String(metric?.querySelector("span")?.textContent || "").trim(),
    current: numericText(metric?.querySelector("strong")?.textContent),
    required: numericText(metric?.querySelector("small")?.textContent),
  };
}

function requirementContext(metric) {
  const card = metric.closest(".farm-requirement");
  const gearMetric = [...(card?.querySelectorAll(".farm-metric") || [])].find((item) => metricInfo(item).label === "Gear");
  const relicMetric = [...(card?.querySelectorAll(".farm-metric") || [])].find((item) => metricInfo(item).label === "Relic");
  return {
    card,
    baseId: card?.dataset.inspectBaseId || "",
    name: String(card?.querySelector(".farm-unit-identity strong")?.textContent || card?.dataset.inspectBaseId || "Unit").trim(),
    gear: gearMetric ? metricInfo(gearMetric) : null,
    relic: relicMetric ? metricInfo(relicMetric) : null,
  };
}

function ensureDialog() {
  let dialog = $("farmMaterialDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "farmMaterialDialog";
  dialog.className = "farm-material-dialog";
  dialog.innerHTML = `
    <button type="button" class="farm-material-close" data-farm-material-close aria-label="Close requirement details">×</button>
    <div id="farmMaterialDialogBody"></div>
  `;
  document.body.appendChild(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-farm-material-close]")) dialog.close();
  });
  return dialog;
}

function sourceClass(category) {
  if (category === "signal") return "signal";
  if (category === "scrap") return "scrap";
  return "currency";
}

function materialCards(materials) {
  return materials.map((material) => `
    <article class="farm-material-item ${sourceClass(material.category)}">
      <div class="farm-material-item-head">
        <strong>${escapeHtml(material.name)}</strong>
        <b>${NUMBER.format(material.quantity)}</b>
      </div>
      <span>${escapeHtml(material.route || "Game source")}</span>
      <p>${escapeHtml(material.source || "Source not mapped")}</p>
    </article>
  `).join("");
}

function plannerButton(context, targetGear, targetRelic) {
  return `<button type="button" class="farm-open-planner" data-farm-open-gear-plan data-base-id="${escapeHtml(context.baseId)}" data-target-gear="${Number(targetGear || 13)}" data-target-relic="${Number(targetRelic || 0)}">Open this unit in Gear / Relic Planner</button>`;
}

function renderRelic(metric) {
  const info = metricInfo(metric);
  const context = requirementContext(metric);
  const plan = relicMaterialsBetween(info.current, info.required);
  const dialog = ensureDialog();
  const body = $("farmMaterialDialogBody");
  if (!body) return;

  const tierText = plan.tiers.length ? plan.tiers.map((tier) => `R${tier}`).join(" → ") : "Requirement already met";
  body.innerHTML = `
    <div class="kicker">RELIC REQUIREMENT CALCULATOR</div>
    <h2>${escapeHtml(context.name)}</h2>
    <div class="farm-material-hero">
      <div><span>Current</span><strong>R${plan.from}</strong></div>
      <i>→</i>
      <div><span>Journey target</span><strong>R${plan.to}</strong></div>
      <div><span>Levels remaining</span><strong>${plan.levelsRemaining}</strong></div>
    </div>
    ${plan.levelsRemaining ? `
      <section class="farm-material-section">
        <div class="farm-material-section-head"><div><span>Exact gross requirement</span><h3>${escapeHtml(tierText)}</h3></div><small>${plan.materials.length} material types</small></div>
        <div class="farm-material-grid">${materialCards(plan.materials)}</div>
      </section>
      <section class="farm-source-guide">
        <article><strong>Signal Data</strong><p>Farm directly in Cantina Battles. Fragmented: 8-C · Incomplete: 8-F · Flawed: 8-G. Newer Stage 9 nodes also contain mixed Signal Data.</p></article>
        <article><strong>Relic Scrap</strong><p>Carbonite Circuit Boards through Droid Brains are produced primarily at the Scavenger by converting eligible gear/salvage. Higher-end pieces also appear in stores and event/guild rewards.</p></article>
      </section>
    ` : '<div class="farm-material-complete">Relic requirement already complete.</div>'}
    <p class="farm-material-boundary"><strong>Inventory boundary:</strong> these are the total materials required from R${plan.from} to R${plan.to}. Public Comlink does not expose your material balances, so the app cannot subtract what you already have.</p>
    ${plannerButton(context, context.gear?.required || 13, plan.to)}
  `;
  dialog.showModal();
}

function renderGear(metric) {
  const info = metricInfo(metric);
  const context = requirementContext(metric);
  const plan = gearGap(info.current, info.required);
  const targetRelic = Number(context.relic?.required || 0);
  const dialog = ensureDialog();
  const body = $("farmMaterialDialogBody");
  if (!body) return;

  body.innerHTML = `
    <div class="kicker">GEAR REQUIREMENT</div>
    <h2>${escapeHtml(context.name)}</h2>
    <div class="farm-material-hero">
      <div><span>Current</span><strong>G${plan.from}</strong></div>
      <i>→</i>
      <div><span>Journey target</span><strong>G${plan.to}</strong></div>
      <div><span>Full tiers remaining</span><strong>${plan.tiersRemaining}</strong></div>
    </div>
    ${plan.complete
      ? `<div class="farm-material-complete">Gear requirement complete.${targetRelic > 0 && Number(context.relic?.current || 0) < targetRelic ? ` The remaining progression blocker is Relic ${targetRelic}.` : ""}</div>`
      : `<section class="farm-material-section"><div class="farm-material-section-head"><div><span>Remaining full gear tiers</span><h3>${plan.tiers.map((tier) => `G${tier}`).join(" → ")}</h3></div></div><p class="farm-material-copy">Open Gear / Relic Planner to see the versioned full-slot gear requirements for these tiers. The public player response does not expose unequipped gear inventory or reliable partial-slot quantities, so Farm Command does not fabricate an exact salvage balance.</p></section>`}
    ${plannerButton(context, plan.to, targetRelic)}
  `;
  dialog.showModal();
}

function openMetric(metric) {
  const label = metricInfo(metric).label;
  if (label === "Relic") renderRelic(metric);
  if (label === "Gear") renderGear(metric);
}

function openGearPlanner(button) {
  const baseId = button.dataset.baseId || "";
  const targetGear = Number(button.dataset.targetGear || 13);
  const targetRelic = Number(button.dataset.targetRelic || 0);
  $("farmMaterialDialog")?.close();
  if (location.hash !== "#gear") location.hash = "gear";

  let attempts = 0;
  const selectWhenReady = () => {
    attempts += 1;
    const select = $("gearPlannerUnit");
    const form = $("gearPlannerForm");
    const hasOption = select && [...select.options].some((option) => option.value === baseId);
    if (hasOption && form) {
      select.value = baseId;
      if ($("gearTargetTier")) $("gearTargetTier").value = String(Math.max(1, targetGear || 13));
      if ($("gearTargetRelic")) $("gearTargetRelic").value = String(Math.max(0, targetRelic));
      form.requestSubmit();
      $("gearPlannerOutput")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (attempts < 25) setTimeout(selectWhenReady, 120);
  };
  setTimeout(selectWhenReady, 80);
}

const normalizedJourneyIds = new Set();
function decorateFarm() {
  const panel = $("workspace-farm");
  if (!panel) return;

  for (const metric of panel.querySelectorAll(".farm-metric")) {
    const { label } = metricInfo(metric);
    if (!["Gear", "Relic"].includes(label)) continue;
    metric.classList.add("farm-metric-action");
    metric.setAttribute("role", "button");
    metric.setAttribute("tabindex", "0");
    metric.setAttribute("aria-label", `Open ${label} requirement details`);
    if (!metric.querySelector(".farm-metric-detail-label")) {
      const action = document.createElement("b");
      action.className = "farm-metric-detail-label";
      action.textContent = "Details ›";
      metric.appendChild(action);
    }
  }

  for (const controls of panel.querySelectorAll(".farm-filter-buttons")) {
    const needs = controls.querySelector('[data-journey-filter="needs"]');
    const blockers = controls.querySelector('[data-journey-filter="far"]');
    const all = controls.querySelector('[data-journey-filter="all"]');
    const journeyId = all?.dataset.journeyId || blockers?.dataset.journeyId || "";
    if (needs) needs.hidden = true;
    if (blockers && blockers.dataset.farmRelabeled !== "true") {
      const count = blockers.querySelector("span")?.textContent || "0";
      blockers.innerHTML = `Blockers <span>${escapeHtml(count)}</span>`;
      blockers.title = "Red and orange requirements: missing, far away, or still building";
      blockers.dataset.farmRelabeled = "true";
    }
    if (journeyId && !normalizedJourneyIds.has(journeyId) && needs?.classList.contains("active") && all) {
      normalizedJourneyIds.add(journeyId);
      setTimeout(() => all.click(), 0);
    }
  }

  for (const select of panel.querySelectorAll("[data-journey-sort]")) {
    const priority = select.querySelector('option[value="priority"]');
    if (priority) priority.textContent = "Lowest readiness first";
  }
}

document.addEventListener("click", (event) => {
  const planner = event.target.closest("[data-farm-open-gear-plan]");
  if (planner) {
    event.preventDefault();
    event.stopPropagation();
    openGearPlanner(planner);
    return;
  }

  const metric = event.target.closest(".farm-metric-action");
  if (!metric) return;
  event.preventDefault();
  event.stopPropagation();
  openMetric(metric);
}, true);

document.addEventListener("keydown", (event) => {
  const metric = event.target.closest?.(".farm-metric-action");
  if (!metric || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  openMetric(metric);
}, true);

const observer = new MutationObserver(decorateFarm);
observer.observe(document.body, { childList: true, subtree: true });
decorateFarm();
