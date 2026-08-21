import './gac-war-room-v2.js';
import './asset-resilience.js';

const PANEL_SELECTOR = '[data-workspace-panel="gac"]';
const ROOT_SELECTOR = '[data-gacv2-root]';
const state = { timer: null, bound: false };

function ensureStyle() {
  if (document.querySelector('link[data-gac-main-section-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-main-section.css?v=20260822-gacmain1';
  link.dataset.gacMainSectionStyle = 'true';
  document.head.appendChild(link);
}

function enhanceWorkspaceIntro(panel) {
  const intro = [...panel.children].find((node) =>
    node.classList?.contains('workspace-intro') &&
    node.id !== 'workspaceGacBody' &&
    !node.matches?.('[data-gac-main-operations]')
  );
  if (!intro || intro.dataset.gacMainIntroEnhanced === 'true') return;
  const title = intro.querySelector('h2');
  const description = intro.querySelector('p');
  const kicker = intro.querySelector('.kicker');
  if (kicker) kicker.textContent = 'GRAND ARENA · TACTICAL COMMAND';
  if (title) title.textContent = 'GAC Command Center';
  if (description) description.textContent = 'Scout the current opponent, enter the board you actually see, allocate non-overlapping counters, lock Datacrons, execute attacks, recover from losses, and route the round through squads and fleets from one workspace.';
  intro.dataset.gacMainIntroEnhanced = 'true';
}

function ensureOperationsHost(panel) {
  let host = panel.querySelector(':scope > [data-gac-main-operations]');
  if (host) return host;
  host = document.createElement('section');
  host.className = 'gac-main-operations';
  host.dataset.gacMainOperations = 'true';
  host.innerHTML = `
    <header class="gac-main-operations-head">
      <div>
        <span>⚔ GAC WAR ROOM · LIVE ROUND OPERATIONS</span>
        <strong>Plan the whole board, then execute it here</strong>
        <small>Server-backed attack reservations, cleanup truth gates, Datacron locks, territory routing and canonical fleet operations remain authoritative.</small>
      </div>
      <nav aria-label="GAC War Room shortcuts">
        <button type="button" data-gac-main-open="matchup">Matchup</button>
        <button type="button" data-gac-main-open="board" class="primary">Board & Counters</button>
        <button type="button" data-gac-main-open="delta">Roster Delta</button>
        <button type="button" data-gac-main-open="history">Scouting</button>
      </nav>
    </header>
    <div data-gac-main-war-room-host></div>`;
  const stats = panel.querySelector(':scope > #workspaceGacBody');
  if (stats) stats.insertAdjacentElement('afterend', host);
  else panel.appendChild(host);
  return host;
}

function placeWarRoom(host) {
  const mount = host.querySelector('[data-gac-main-war-room-host]');
  if (!mount) return false;
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) {
    if (!mount.contains(root)) mount.appendChild(root);
    return true;
  }
  const legacy = document.getElementById('gacCommandCenterPro');
  if (legacy && !mount.contains(legacy)) {
    mount.appendChild(legacy);
    return true;
  }
  return false;
}

function mountMainGac() {
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) return false;
  ensureStyle();
  enhanceWorkspaceIntro(panel);
  const host = ensureOperationsHost(panel);
  placeWarRoom(host);
  panel.dataset.gacMainIntegrated = 'true';
  return true;
}

function openWarRoomTab(tab) {
  const root = document.querySelector(ROOT_SELECTOR);
  const button = root?.querySelector(`[data-gacv2-tab="${tab}"]`);
  if (!root || !button) return false;
  button.click();
  root.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  return true;
}

function schedule(delay = 40) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => mountMainGac(), Math.max(0, delay));
}

function bind() {
  if (state.bound) return;
  state.bound = true;
  document.addEventListener('click', (event) => {
    const shortcut = event.target.closest?.('[data-gac-main-open]');
    if (!shortcut) return;
    openWarRoomTab(shortcut.dataset.gacMainOpen);
  }, true);
  window.addEventListener('hashchange', () => {
    if (location.hash.toLowerCase() === '#gac') schedule(20);
  });
  document.addEventListener('DOMContentLoaded', () => schedule(20), { once: true });
  new MutationObserver(() => {
    const panel = document.querySelector(PANEL_SELECTOR);
    if (!panel) return;
    const host = panel.querySelector(':scope > [data-gac-main-operations]');
    const root = document.querySelector(ROOT_SELECTOR);
    if (!host || (root && !host.contains(root))) schedule(20);
    else if (!root && document.getElementById('gacCommandCenterPro')) schedule(20);
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedule(60);
}

if (typeof document !== 'undefined') bind();

export { enhanceWorkspaceIntro, ensureOperationsHost, mountMainGac, openWarRoomTab, placeWarRoom };
