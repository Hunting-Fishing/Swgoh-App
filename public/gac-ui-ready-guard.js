import './gac-matchup-soft-source.js';

const PANEL_SELECTOR = '[data-workspace-panel="gac"]';
const PLANNER_SELECTOR = '[data-gac-manual-counter-planner]';

const state = { scheduled: false };

function installRecoveryStyle() {
  if (document.querySelector('style[data-gac-recovery-style]')) return;
  const style = document.createElement('style');
  style.dataset.gacRecoveryStyle = 'true';
  style.textContent = `
    #gacCommandCenterPro{display:none!important}
    [data-workspace-panel="gac"]{min-height:0!important}
    [data-workspace-panel="gac"]>*{visibility:visible!important;pointer-events:auto!important}
    [data-workspace-panel="gac"]::after{display:none!important;content:none!important}
  `;
  document.head.appendChild(style);
}

function ensureCompatibilityAnchor() {
  if (document.getElementById('gacCommandCenterPro')) return true;
  const panel = document.querySelector(PANEL_SELECTOR);
  const host = panel?.querySelector('#workspaceGacBody') || panel;
  if (!host) return false;
  const anchor = document.createElement('section');
  anchor.id = 'gacCommandCenterPro';
  anchor.hidden = true;
  anchor.setAttribute('aria-hidden', 'true');
  anchor.dataset.gacCompatibilityAnchor = 'true';
  anchor.className = 'gac-command-center gac-compatibility-anchor';
  host.insertAdjacentElement('afterend', anchor);
  return true;
}

function syncReadyState() {
  installRecoveryStyle();
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) return false;
  ensureCompatibilityAnchor();
  const planner = document.querySelector(PLANNER_SELECTOR);
  if (planner?.isConnected) {
    panel.dataset.gacUiReady = 'true';
    delete panel.dataset.gacUiTimeout;
    return true;
  }
  panel.dataset.gacUiReady = 'booting';
  delete panel.dataset.gacUiTimeout;
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
  installRecoveryStyle();
  document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('swgoh:workspace-activated', scheduleSync);
  window.addEventListener('swgoh:gac-battlefield-ready', scheduleSync);
  new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes?.length || record.removedNodes?.length)) return;
    scheduleSync();
  }).observe(document.documentElement, { childList: true, subtree: true });
  scheduleSync();
}

export { ensureCompatibilityAnchor, installRecoveryStyle, syncReadyState };
