const PANEL_SELECTOR = '[data-workspace-panel="gac"]';
const PLANNER_SELECTOR = '[data-gac-manual-counter-planner]';
const BOOT_TIMEOUT_MS = 6000;

const state = {
  scheduled: false,
  startedAt: Date.now(),
};

function syncReadyState() {
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) return false;
  const planner = document.querySelector(PLANNER_SELECTOR);
  if (planner?.isConnected) {
    panel.dataset.gacUiReady = 'true';
    delete panel.dataset.gacUiTimeout;
    return true;
  }
  delete panel.dataset.gacUiReady;
  if (Date.now() - state.startedAt >= BOOT_TIMEOUT_MS) panel.dataset.gacUiTimeout = 'true';
  return false;
}

function scheduleSync() {
  if (state.scheduled) return;
  state.scheduled = true;
  queueMicrotask(() => {
    state.scheduled = false;
    syncReadyState();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('swgoh:workspace-activated', scheduleSync);
  window.addEventListener('swgoh:gac-battlefield-ready', scheduleSync);
  new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes?.length || record.removedNodes?.length)) return;
    scheduleSync();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(scheduleSync, BOOT_TIMEOUT_MS + 50);
  scheduleSync();
}

export { BOOT_TIMEOUT_MS, syncReadyState };