import './gac-war-room-v2.js';

const PANEL_SELECTOR = '[data-workspace-panel="gac"]';
const ROOT_SELECTOR = '[data-gacv2-root]';
const state = { timer: null, bound: false };

const INTELLIGENCE_TARGETS = Object.freeze({
  board: Object.freeze({ tab: 'board', selector: '[data-gac-board-workspace],[data-gac-manual-counter-planner]' }),
  matrix: Object.freeze({ tab: 'board', selector: '[data-gac-counter-matrix]' }),
  execution: Object.freeze({ tab: 'board', selector: '[data-gac-board-optimization]' }),
  scouting: Object.freeze({ tab: 'board', selector: '[data-gac-scout-history]' }),
  datacrons: Object.freeze({ tab: 'board', selector: '[data-gac-datacron-matrix],[data-gac-datacron-readiness]' }),
});

function ensureStyle() {
  if (document.querySelector('link[data-gac-main-section-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-main-section.css?v=20260823-gacrelease2';
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

function intelligenceDeckMarkup() {
  return `<nav class="gac-main-intelligence-deck" aria-label="GAC Intelligence Command Deck">
    <button type="button" data-gac-intel-open="board"><span>01</span><strong>Current Board</strong><small>Enter visible defense truth</small></button>
    <button type="button" data-gac-intel-open="matrix"><span>02</span><strong>Counter Matrix</strong><small>Roster-aware evidence</small></button>
    <button type="button" data-gac-intel-open="execution" class="primary"><span>03</span><strong>Execution Plan</strong><small>Numbered attack queue</small></button>
    <button type="button" data-gac-intel-open="scouting"><span>04</span><strong>Scouting Intel</strong><small>Historical tendencies</small></button>
    <button type="button" data-gac-intel-open="datacrons"><span>05</span><strong>Datacrons</strong><small>Exact rolled-DC evidence</small></button>
  </nav>`;
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
        <button type="button" data-gac-main-open="history">Round History</button>
      </nav>
    </header>
    ${intelligenceDeckMarkup()}
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

function focusTarget(node) {
  if (!node) return false;
  node.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  node.classList.add('gac-main-focus-target');
  window.setTimeout(() => node.classList.remove('gac-main-focus-target'), 1600);
  return true;
}

function openIntelligenceSurface(key) {
  const target = INTELLIGENCE_TARGETS[key];
  if (!target) return false;
  openWarRoomTab(target.tab);

  let attempts = 0;
  const reveal = () => {
    const node = document.querySelector(target.selector);
    if (focusTarget(node)) return;
    attempts += 1;
    if (attempts < 10) {
      window.setTimeout(reveal, 80);
      return;
    }
    focusTarget(document.querySelector('[data-gac-board-workspace],[data-gac-manual-counter-planner]') || document.querySelector(ROOT_SELECTOR));
  };
  window.setTimeout(reveal, 40);
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
    const intelShortcut = event.target.closest?.('[data-gac-intel-open]');
    if (intelShortcut) {
      openIntelligenceSurface(intelShortcut.dataset.gacIntelOpen);
      return;
    }
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

export {
  INTELLIGENCE_TARGETS,
  enhanceWorkspaceIntro,
  ensureOperationsHost,
  focusTarget,
  mountMainGac,
  openIntelligenceSurface,
  openWarRoomTab,
  placeWarRoom,
};
