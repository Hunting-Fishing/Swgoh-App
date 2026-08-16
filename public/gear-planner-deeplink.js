const MAX_RELIC = 15;
const MAX_GEAR = 13;

export function normalizeGearPlanRequest(detail = {}) {
  const baseId = String(detail.baseId || "").trim();
  const requestedRelic = detail.relic == null ? null : Number(detail.relic);
  const requestedGear = detail.gear == null ? null : Number(detail.gear);
  const relic = requestedRelic == null || !Number.isFinite(requestedRelic)
    ? null
    : Math.max(0, Math.min(MAX_RELIC, Math.trunc(requestedRelic)));
  let gear = requestedGear == null || !Number.isFinite(requestedGear)
    ? null
    : Math.max(1, Math.min(MAX_GEAR, Math.trunc(requestedGear)));
  if (relic != null && relic > 0) gear = MAX_GEAR;
  return Object.freeze({ baseId, relic, gear });
}

function gearTab() {
  return document.querySelector('button[data-workspace-tab="gear"]');
}

function selectHasUnit(select, baseId) {
  return [...(select?.options || [])].some((option) => String(option.value) === baseId);
}

function waitForOwnedUnit(baseId, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const immediate = document.getElementById("gearPlannerUnit");
    if (immediate && selectHasUnit(immediate, baseId)) {
      resolve(immediate);
      return;
    }

    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const select = document.getElementById("gearPlannerUnit");
      if (select && selectHasUnit(select, baseId)) finish(select);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => finish(null), timeoutMs);
  });
}

function dispatchResult(request, ok, reason = "") {
  window.dispatchEvent(new CustomEvent("swgoh:gear-plan-unit-result", {
    detail: Object.freeze({ ...request, ok: Boolean(ok), reason: String(reason || "") }),
  }));
}

export async function openGearPlan(detail = {}) {
  const request = normalizeGearPlanRequest(detail);
  if (!request.baseId) {
    dispatchResult(request, false, "missing-base-id");
    return false;
  }

  const tab = gearTab();
  if (!tab) {
    dispatchResult(request, false, "gear-workspace-unavailable");
    return false;
  }
  tab.click();

  const select = await waitForOwnedUnit(request.baseId);
  if (!select) {
    dispatchResult(request, false, "unit-not-owned-or-roster-not-loaded");
    return false;
  }

  select.value = request.baseId;
  const gearInput = document.getElementById("gearTargetTier");
  const relicInput = document.getElementById("gearTargetRelic");
  if (request.gear != null && gearInput) gearInput.value = String(request.gear);
  if (request.relic != null && relicInput) relicInput.value = String(request.relic);

  select.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("gearPlannerOutput")?.scrollIntoView({ behavior: "smooth", block: "start" });
  dispatchResult(request, true, "");
  return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("swgoh:gear-plan-unit", (event) => {
    openGearPlan(event.detail || {}).catch(() => {
      const request = normalizeGearPlanRequest(event.detail || {});
      dispatchResult(request, false, "planner-open-failed");
    });
  });
}
