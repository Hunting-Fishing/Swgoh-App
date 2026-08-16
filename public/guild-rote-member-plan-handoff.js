import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";

const state = {
  allyCode: "",
  catalogPromise: null,
  catalog: [],
  coverage: null,
  coverageKey: "",
  loading: false,
  scheduled: false,
};

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const normalize = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function currentRedundancyTarget() {
  const value = Number(window.__swgohGuildRoteRedundancyTarget || 2);
  return Math.max(1, Math.min(5, Number.isFinite(value) ? Math.trunc(value) : 2));
}

export function guildFarmPlanTarget(row = {}) {
  const unit = row.unit || null;
  if (!unit || String(unit.unitType || "Character") === "Ship") return null;
  const gap = row.maxGap || {};
  const relicGap = Math.max(0, Number(gap.relic || 0));
  const gearGap = Math.max(0, Number(gap.gear || 0));
  if (!relicGap && !gearGap) return null;
  const relic = Math.max(0, Number(unit.relic || 0)) + relicGap;
  const gear = relic > 0 ? 13 : Math.min(13, Math.max(1, Number(unit.gear || 1)) + gearGap);
  return Object.freeze({
    allyCode: digits(row.member?.allyCode),
    baseId: String(row.baseId || unit.baseId || ""),
    gear,
    relic,
  });
}

export function guildFarmKey(memberName, unitName) {
  return `${normalize(memberName)}|${normalize(unitName)}`;
}

export function snapshotMatchesAllyCode(snapshot, allyCode) {
  return digits(snapshot?.allyCode || snapshot?.body?.player?.allyCode) === digits(allyCode);
}

async function loadCatalog() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?guild-farm-handoff=1", { cache: "no-cache" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static catalog unavailable");
      state.catalog = body.units;
      return body.units;
    })
    .catch(() => []);
  return state.catalogPromise;
}

async function loadCoverage() {
  const allyCode = digits(document.getElementById("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const target = currentRedundancyTarget();
  const key = `${allyCode}:${state.catalog.length}:${target}`;
  if (state.coverage && state.coverageKey === key) return state.coverage;
  if (state.loading) return null;
  state.loading = true;
  try {
    const [catalog, response] = await Promise.all([
      loadCatalog(),
      fetch(`/api/guild/by-player/${allyCode}/roster`, { cache: "no-store" }),
    ]);
    const guild = await response.json();
    if (!response.ok || !Array.isArray(guild?.members)) return null;
    state.allyCode = allyCode;
    state.coverage = buildGuildRoteMissionCoverage(guild, catalog, { redundancyTarget: target });
    state.coverageKey = `${allyCode}:${catalog.length}:${target}`;
    return state.coverage;
  } finally {
    state.loading = false;
  }
}

function farmMap(coverage) {
  return new Map((coverage?.farms || []).map((row) => [guildFarmKey(row.member?.name, row.unitName), row]));
}

function loadedAllyCode() {
  return digits(document.getElementById("allyCode")?.value);
}

function annotateButton(button, row) {
  const target = guildFarmPlanTarget(row);
  const memberAllyCode = digits(row.member?.allyCode);
  const sameMember = memberAllyCode && memberAllyCode === loadedAllyCode();
  button.removeAttribute("data-guild-plan-member");
  button.removeAttribute("data-guild-load-member");
  button.removeAttribute("data-guild-plan-base-id");
  button.removeAttribute("data-guild-plan-gear");
  button.removeAttribute("data-guild-plan-relic");
  button.removeAttribute("data-guild-plan-ally-code");

  if (sameMember) {
    button.textContent = "Inspect Loaded Member";
    if (row.baseId) button.dataset.inspectBaseId = row.baseId;
    button.title = "This farm target belongs to the currently loaded Ally Code.";
    return;
  }

  button.removeAttribute("data-inspect-base-id");
  if (target?.allyCode && target.baseId) {
    button.textContent = "Plan Member Upgrade";
    button.dataset.guildPlanMember = "true";
    button.dataset.guildPlanAllyCode = target.allyCode;
    button.dataset.guildPlanBaseId = target.baseId;
    button.dataset.guildPlanGear = String(target.gear);
    button.dataset.guildPlanRelic = String(target.relic);
    button.title = `Load ${row.member?.name || "this guild member"} and open the exact Gear / Relic target.`;
    return;
  }

  if (memberAllyCode) {
    button.textContent = "Load Member Roster";
    button.dataset.guildLoadMember = "true";
    button.dataset.guildPlanAllyCode = memberAllyCode;
    button.title = `Load ${row.member?.name || "this guild member"}'s roster. This target cannot be sent to Gear Planner because it is a ship, acquisition, star, or power-only gap.`;
    return;
  }

  button.textContent = "Unit Reference Only";
  button.disabled = true;
  button.title = "This guild member has no usable Ally Code in the hydrated snapshot.";
}

async function enhanceFarmRows() {
  state.scheduled = false;
  const rows = [...document.querySelectorAll(".guild-farm-row")];
  if (!rows.length) return;
  const coverage = await loadCoverage();
  if (!coverage) return;
  const targets = farmMap(coverage);

  for (const element of rows) {
    const memberName = element.querySelector(".guild-farm-person strong")?.textContent || "";
    const unitName = element.querySelector(".guild-farm-unit strong")?.textContent || "";
    const target = targets.get(guildFarmKey(memberName, unitName));
    const button = element.querySelector(".guild-farm-inspect");
    if (!target || !button) continue;
    const signature = `${currentRedundancyTarget()}:${digits(target.member?.allyCode)}:${target.baseId}:${target.gapLabel}`;
    if (button.dataset.guildHandoffSignature === signature) continue;
    button.dataset.guildHandoffSignature = signature;
    annotateButton(button, target);
  }
}

function scheduleEnhance() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(() => enhanceFarmRows().catch(() => { state.scheduled = false; }));
}

function setAllyCode(allyCode) {
  const input = document.getElementById("allyCode");
  const code = digits(allyCode);
  if (!input || code.length !== 9) return false;
  input.value = code;
  return true;
}

function loadMemberRoster(allyCode) {
  if (!setAllyCode(allyCode)) return false;
  const form = document.getElementById("allyForm");
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return true;
}

function waitForLiveAllyCode(allyCode, timeoutMs = 10000) {
  const wanted = digits(allyCode);
  if (wanted.length !== 9) return Promise.resolve(false);
  if (snapshotMatchesAllyCode(window.__swgohLiveSnapshot, wanted)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (snapshotMatchesAllyCode(window.__swgohLiveSnapshot, wanted)) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function planMemberUpgrade(button) {
  const allyCode = digits(button.dataset.guildPlanAllyCode);
  const baseId = String(button.dataset.guildPlanBaseId || "");
  if (!allyCode || !baseId || !loadMemberRoster(allyCode)) return;
  const loaded = await waitForLiveAllyCode(allyCode);
  if (!loaded) return;
  window.dispatchEvent(new CustomEvent("swgoh:gear-plan-unit", {
    detail: {
      baseId,
      gear: Number(button.dataset.guildPlanGear || 13),
      relic: Number(button.dataset.guildPlanRelic || 0),
    },
  }));
}

function install() {
  loadCatalog();
  const observer = new MutationObserver(() => scheduleEnhance());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    const raw = event.target.closest?.(".guild-farm-inspect");
    if (raw && !raw.dataset.guildHandoffSignature) {
      event.preventDefault();
      event.stopImmediatePropagation();
      scheduleEnhance();
      return;
    }
    const plan = event.target.closest?.("[data-guild-plan-member]");
    if (plan) {
      event.preventDefault();
      event.stopImmediatePropagation();
      planMemberUpgrade(plan).catch(() => {});
      return;
    }
    const load = event.target.closest?.("[data-guild-load-member]");
    if (load) {
      event.preventDefault();
      event.stopImmediatePropagation();
      loadMemberRoster(load.dataset.guildPlanAllyCode);
    }
  }, true);

  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.coverage = null;
    state.coverageKey = "";
    setTimeout(scheduleEnhance, 500);
  });

  window.addEventListener("swgoh:guild-rote-redundancy-target", () => {
    state.coverage = null;
    state.coverageKey = "";
    setTimeout(scheduleEnhance, 0);
  });
  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#guild") setTimeout(scheduleEnhance, 200);
  });
  scheduleEnhance();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}