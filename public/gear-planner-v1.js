import { gearRelicPlan, gearRelicStatus } from "./gear-planner.js";

const CACHE_MS = 25_000;
const state = {
  catalog: [],
  catalogMap: new Map(),
  liveBody: null,
  allyCode: "",
  fetchedAt: 0,
  initialized: false,
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
const formatNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat().format(numeric) : "N/A";
};

function humanizeEquipment(value) {
  return String(value || "")
    .replace(/^equipment[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const response = await fetch("/data/catalog.json?gear-planner=1", { cache: "no-store" });
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

  if (!force && state.liveBody && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) {
    return state.liveBody;
  }

  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.liveBody = body;
  state.allyCode = allyCode;
  state.fetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.fetchedAt };
  return body;
}

function characterRoster(body) {
  return (Array.isArray(body?.units) ? body.units : [])
    .filter((unit) => String(unit?.unitType || "Character") !== "Ship")
    .slice()
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0) || String(a.name || "").localeCompare(String(b.name || "")));
}

function targetValues() {
  const relic = Math.max(0, Math.min(15, Number($("gearTargetRelic")?.value || 0)));
  const requestedGear = Math.max(1, Math.min(13, Number($("gearTargetTier")?.value || 13)));
  const gear = relic > 0 ? 13 : requestedGear;
  if ($("gearTargetTier")) $("gearTargetTier").value = String(gear);
  return { gear, relic };
}

function currentLabel(unit) {
  const gear = Number(unit?.gear || 0);
  const relic = Number(unit?.relic || 0);
  return relic > 0 ? `G${gear || 13} · R${relic}` : `G${gear || 0}`;
}

function targetLabel(target) {
  return target.relic > 0 ? `G13 · R${target.relic}` : `G${target.gear}`;
}

function summaryCard(label, value) {
  return `<div class="workspace-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function tierTable(plan) {
  if (!plan.tierRows.length) {
    return '<div class="workspace-note">No additional gear tiers are required before this target.</div>';
  }

  return `
    <table class="workspace-table">
      <thead><tr><th>Gear Tier</th><th>Static Slot Requirements</th><th>What We Know</th></tr></thead>
      <tbody>
        ${plan.tierRows.map((row) => `
          <tr>
            <td><strong>G${row.tier}</strong></td>
            <td>${row.equipment.length ? row.equipment.map((item) => escapeHtml(humanizeEquipment(item))).join(" · ") : "No slot definitions returned"}</td>
            <td>${row.currentTier
              ? "Current tier: equipped-slot completion is not yet normalized by the gateway."
              : `${row.pieceCount} full slot requirement${row.pieceCount === 1 ? "" : "s"} from versioned game data.`}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function selectOptions(roster, selectedBaseId = "") {
  return roster.map((unit) => `
    <option value="${escapeAttr(unit.baseId)}"${String(unit.baseId) === selectedBaseId ? " selected" : ""}>
      ${escapeHtml(unit.name || unit.baseId)} · ${escapeHtml(currentLabel(unit))} · ${formatNumber(unit.power)} GP
    </option>
  `).join("");
}

async function renderPlanner(force = false) {
  const status = $("gearPlannerStatus");
  const output = $("gearPlannerOutput");
  const select = $("gearPlannerUnit");
  const queue = $("gearUpgradeQueue");
  if (!status || !output || !select || !queue) return;

  await loadCatalog();
  const body = await loadLive(force);
  if (!body) {
    status.textContent = "Enter and load a 9-digit Ally Code, then open Gear / Relic to plan live progression.";
    output.innerHTML = "";
    queue.innerHTML = "";
    select.innerHTML = '<option value="">Load an Ally Code first</option>';
    return;
  }

  const roster = characterRoster(body);
  const previous = select.value;
  const selected = roster.some((unit) => String(unit.baseId) === previous)
    ? previous
    : String(roster[0]?.baseId || "");
  select.innerHTML = selectOptions(roster, selected);
  select.value = selected;
  status.textContent = `${formatNumber(roster.length)} owned characters loaded for ${body.player?.name || body.player?.allyCode || "this player"}.`;
  renderSelectedUnit(body);
}

function renderSelectedUnit(body = state.liveBody) {
  const output = $("gearPlannerOutput");
  const queue = $("gearUpgradeQueue");
  const selectedBaseId = $("gearPlannerUnit")?.value || "";
  if (!output || !queue || !body || !selectedBaseId) return;

  const live = characterRoster(body).find((unit) => String(unit.baseId) === selectedBaseId);
  const staticUnit = state.catalogMap.get(selectedBaseId) || { baseId: selectedBaseId, name: live?.name || selectedBaseId, unitType: "Character", gearTiers: [] };
  const target = targetValues();
  const plan = gearRelicPlan(live, staticUnit, target);

  output.innerHTML = `
    <div class="tracker-heading">
      <div>
        <span class="tracker-label">LIVE GEAR + RELIC PLAN</span>
        <h3>${escapeHtml(live?.name || staticUnit.name || selectedBaseId)}</h3>
        <p class="workspace-note">${escapeHtml(currentLabel(live))} → ${escapeHtml(targetLabel(target))}</p>
      </div>
      <button type="button" data-inspect-base-id="${escapeAttr(selectedBaseId)}">Inspect Unit</button>
    </div>
    <div class="workspace-grid">
      ${summaryCard("Current", currentLabel(live))}
      ${summaryCard("Target", targetLabel(target))}
      ${summaryCard("Gear Tiers Remaining", plan.gearTiersRemaining)}
      ${summaryCard("Relic Levels Remaining", plan.relicLevelsRemaining)}
      ${summaryCard("Known Full Future Gear Slots", plan.knownFuturePieces)}
      ${summaryCard("Status", gearRelicStatus(plan))}
    </div>
    ${plan.relicLockedByGear ? '<p class="workspace-note"><strong>Relic gate:</strong> this character must reach Gear 13 before relic levels can be applied.</p>' : ""}
    <div class="kicker" style="margin-top:18px">VERSIONED GEAR REQUIREMENTS</div>
    ${tierTable(plan)}
    <p class="workspace-note"><strong>Inventory boundary:</strong> this planner does not subtract unequipped gear, salvage, signal data or relic materials because those account inventories are not available in the public player response. It reports live progression plus static game requirements only.</p>
  `;

  renderQueue(body, target, selectedBaseId);
}

function renderQueue(body, target, selectedBaseId) {
  const queue = $("gearUpgradeQueue");
  if (!queue) return;
  const rows = characterRoster(body)
    .map((live) => {
      const staticUnit = state.catalogMap.get(String(live.baseId)) || { unitType: "Character", gearTiers: [] };
      return { live, plan: gearRelicPlan(live, staticUnit, target) };
    })
    .filter(({ plan }) => !plan.complete)
    .sort((a, b) => Number(b.live.power || 0) - Number(a.live.power || 0))
    .slice(0, 30);

  queue.innerHTML = rows.length ? `
    <div class="kicker">ROSTER UPGRADE QUEUE</div>
    <h3>Highest-GP characters below ${escapeHtml(targetLabel(target))}</h3>
    <p class="workspace-note">This is a progression queue ordered by current GP, not a meta or farming recommendation.</p>
    <table class="workspace-table">
      <thead><tr><th>Character</th><th>GP</th><th>Current</th><th>Remaining</th><th></th></tr></thead>
      <tbody>${rows.map(({ live, plan }) => `
        <tr${String(live.baseId) === selectedBaseId ? ' class="selected"' : ""}>
          <td><strong>${escapeHtml(live.name || live.baseId)}</strong></td>
          <td>${formatNumber(live.power)}</td>
          <td>${escapeHtml(currentLabel(live))}</td>
          <td>${escapeHtml(gearRelicStatus(plan))}</td>
          <td><button type="button" data-gear-select="${escapeAttr(live.baseId)}">Plan</button></td>
        </tr>
      `).join("")}</tbody>
    </table>
  ` : `<div class="workspace-note">Every owned character already meets ${escapeHtml(targetLabel(target))}.</div>`;

  for (const button of queue.querySelectorAll("button[data-gear-select]")) {
    button.addEventListener("click", () => {
      if ($("gearPlannerUnit")) $("gearPlannerUnit").value = button.dataset.gearSelect || "";
      renderSelectedUnit(body);
      $("gearPlannerOutput")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function activateGearWorkspace(pushHash = true) {
  for (const panel of document.querySelectorAll("[data-workspace-panel]")) {
    panel.hidden = panel.dataset.workspacePanel !== "gear";
  }
  for (const button of document.querySelectorAll("button[data-workspace-tab]")) {
    const active = button.dataset.workspaceTab === "gear";
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  if (pushHash && location.hash !== "#gear") history.replaceState(null, "", "#gear");
  localStorage.setItem("swgoh:workspace-tab", "gear");
  renderPlanner(false).catch(showError);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showError(error) {
  const output = $("gearPlannerOutput");
  const status = $("gearPlannerStatus");
  const message = error?.message || "Gear / Relic planner data is unavailable.";
  if (status) status.textContent = message;
  if (output) output.innerHTML = `<div class="workspace-error">${escapeHtml(message)}</div>`;
}

function buildPanel() {
  const tabs = $("workspaceTabs");
  if (!tabs || $("workspace-gear")) return false;
  const farmButton = tabs.querySelector('button[data-workspace-tab="farm"]');
  const button = document.createElement("button");
  button.type = "button";
  button.className = "workspace-tab";
  button.dataset.workspaceTab = "gear";
  button.textContent = "Gear / Relic";
  button.setAttribute("aria-controls", "workspace-gear");
  button.setAttribute("aria-selected", "false");
  if (farmButton?.nextSibling) tabs.insertBefore(button, farmButton.nextSibling);
  else tabs.appendChild(button);

  const panel = document.createElement("section");
  panel.id = "workspace-gear";
  panel.className = "workspace-panel";
  panel.dataset.workspacePanel = "gear";
  panel.hidden = true;
  panel.innerHTML = `
    <section class="card workspace-intro">
      <div class="kicker">LIVE PROGRESSION PLANNING</div>
      <h2>Gear &amp; Relic Planner</h2>
      <p>Compare an owned character's live gear/relic state with a target, then use versioned game data to see the remaining full gear tiers. The planner never invents private inventory balances.</p>
    </section>
    <section class="card tracker-builder">
      <div>
        <div class="kicker">TARGET BUILDER</div>
        <h3>Plan a character upgrade</h3>
        <p class="workspace-note">A relic target automatically requires Gear 13.</p>
      </div>
      <form id="gearPlannerForm" class="tracker-form">
        <label>Owned Character
          <select id="gearPlannerUnit"><option value="">Load an Ally Code first</option></select>
        </label>
        <label>Target Gear
          <input id="gearTargetTier" type="number" min="1" max="13" value="13">
        </label>
        <label>Target Relic
          <input id="gearTargetRelic" type="number" min="0" max="15" value="7">
        </label>
        <button type="submit">Analyze</button>
      </form>
      <div id="gearPlannerStatus" class="workspace-note">Load an Ally Code to build a live progression plan.</div>
    </section>
    <section id="gearPlannerOutput" class="card workspace-intro"></section>
    <section id="gearUpgradeQueue" class="card workspace-intro"></section>
  `;

  const farmPanel = document.querySelector('[data-workspace-panel="farm"]');
  const parent = farmPanel?.parentNode || tabs.parentNode;
  if (farmPanel?.nextSibling) parent.insertBefore(panel, farmPanel.nextSibling);
  else parent.appendChild(panel);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    activateGearWorkspace(true);
  });
  $("gearPlannerForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderSelectedUnit();
  });
  $("gearPlannerUnit")?.addEventListener("change", () => renderSelectedUnit());
  $("gearTargetTier")?.addEventListener("change", () => renderSelectedUnit());
  $("gearTargetRelic")?.addEventListener("change", () => renderSelectedUnit());

  document.addEventListener("click", (event) => {
    const known = event.target.closest('button[data-workspace-tab]:not([data-workspace-tab="gear"])');
    if (known) button.classList.remove("active");
  });

  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#gear") activateGearWorkspace(false);
  });

  $("allyForm")?.addEventListener("submit", () => {
    state.liveBody = null;
    state.fetchedAt = 0;
    if (location.hash.toLowerCase() === "#gear") {
      setTimeout(() => renderPlanner(true).catch(showError), 350);
    }
  });

  state.initialized = true;
  if (location.hash.toLowerCase() === "#gear") activateGearWorkspace(false);
  return true;
}

if (!buildPanel()) {
  const observer = new MutationObserver(() => {
    if (buildPanel()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
