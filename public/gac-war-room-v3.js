import './gac-war-room-provenance-inspector.js';
import './gac-manual-board-workspace.js';

const TAB_ORDER = ['matchup', 'board', 'delta', 'history', 'diagnostics'];

const state = {
  scheduled: false,
  enhancedRoot: null,
};

const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);

function injectStylesheet(href, key) {
  if (document.querySelector(`link[data-${key}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = 'true';
  document.head.appendChild(link);
}

function formatAllyCode(value) {
  const code = allyCode(value);
  return code.replace(/(\d{3})(?=\d)/g, '$1-');
}

function text(selector, root = document) {
  return clean(root.querySelector(selector)?.textContent);
}

function selectedDefenseCount(root) {
  const raw = text('[data-gacv2-defense-count]', root);
  const match = raw.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { selected: Number(match[1]), required: Number(match[2]) } : { selected: 0, required: 0 };
}

function hideSupersededWorkspaceScaffolding(root) {
  const panel = root.closest('[data-workspace-panel="gac"]');
  if (!panel) return;
  panel.classList.add('gacv3-workspace');

  const oldSummary = panel.querySelector(':scope > #workspaceGacBody');
  if (oldSummary && !oldSummary.contains(root)) oldSummary.classList.add('gacv3-superseded');

  for (const intro of panel.querySelectorAll(':scope > .workspace-intro')) {
    if (intro === root || intro.contains(root) || intro.id === 'gacCommandCenterPro') continue;
    intro.classList.add('gacv3-superseded');
  }
}

function addTabIcons(root) {
  const labels = {
    matchup: ['◈', 'Matchup'],
    board: ['⌖', 'Board & Counters'],
    delta: ['⇄', 'Roster Delta'],
    history: ['◷', 'Scouting & History'],
    diagnostics: ['⚙', 'Diagnostics'],
  };
  for (const id of TAB_ORDER) {
    const button = root.querySelector(`[data-gacv2-tab="${id}"]`);
    if (!button || button.dataset.gacv3Labelled === 'true') continue;
    const [icon, label] = labels[id];
    button.innerHTML = `<span class="gacv3-tab-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
    button.dataset.gacv3Labelled = 'true';
  }
}

function missionStripMarkup() {
  return `<div class="gacv3-mission-strip" data-gacv3-mission-strip>
    <div class="gacv3-mission-title"><span>TACTICAL HUD</span><strong>Round command state</strong></div>
    <div class="gacv3-mission-grid">
      <div class="gacv3-hud-cell" data-gacv3-hud="round"><span>ROUND</span><strong>—</strong><small>Awaiting event evidence</small></div>
      <div class="gacv3-hud-cell" data-gacv3-hud="format"><span>FORMAT</span><strong>5v5</strong><small>Board squad size</small></div>
      <div class="gacv3-hud-cell" data-gacv3-hud="opponent"><span>OPPONENT</span><strong>—</strong><small>Exact pairing not loaded</small></div>
      <div class="gacv3-hud-cell" data-gacv3-hud="board"><span>BOARD</span><strong>0/5</strong><small>No defense selected</small></div>
      <div class="gacv3-hud-cell" data-gacv3-hud="counter"><span>COUNTER MODE</span><strong>—</strong><small>Select visible defense</small></div>
    </div>
  </div>`;
}

function installMissionStrip(root) {
  if (root.querySelector('[data-gacv3-mission-strip]')) return;
  const setup = root.querySelector('.gacv2-setup');
  if (!setup) return;
  setup.insertAdjacentHTML('afterend', missionStripMarkup());
}

function updateHudCell(root, id, title, detail, stateName = '') {
  const cell = root.querySelector(`[data-gacv3-hud="${id}"]`);
  if (!cell) return;
  const strong = cell.querySelector('strong');
  const small = cell.querySelector('small');
  if (strong && strong.textContent !== title) strong.textContent = title;
  if (small && small.textContent !== detail) small.textContent = detail;
  cell.className = `gacv3-hud-cell${stateName ? ` is-${stateName}` : ''}`;
}

function updateMissionStrip(root) {
  const roundValue = clean(root.querySelector('[data-gacv2-round]')?.value);
  updateHudCell(
    root,
    'round',
    roundValue ? `ROUND ${roundValue}` : '—',
    roundValue ? 'Current round selected' : 'Awaiting event evidence',
    roundValue ? 'ready' : 'unknown',
  );

  const mode = Number(root.querySelector('[data-gacv2-mode]')?.value) === 3 ? 3 : 5;
  updateHudCell(root, 'format', `${mode}v${mode}`, 'Board squad size', 'ready');

  const opponentInput = allyCode(root.querySelector('[data-gacv2-opponent]')?.value);
  const matchupName = text('.gacv2-versus article.enemy strong', root);
  updateHudCell(
    root,
    'opponent',
    matchupName || (opponentInput ? formatAllyCode(opponentInput) : '—'),
    root.querySelector('.gacv2-versus') ? 'Roster comparison loaded' : (opponentInput ? 'Ally Code entered; comparison pending' : 'Exact pairing not loaded'),
    root.querySelector('.gacv2-versus') ? 'ready' : 'unknown',
  );

  const count = selectedDefenseCount(root);
  const boardComplete = count.required > 0 && count.selected === count.required;
  updateHudCell(
    root,
    'board',
    `${count.selected}/${count.required || mode}`,
    boardComplete ? 'Visible defense fully selected' : count.selected ? 'Partial visible defense selection' : 'No defense selected',
    boardComplete ? 'ready' : count.selected ? 'warn' : 'unknown',
  );

  const source = text('.gacv2-counter-source', root).toUpperCase();
  const hasEvidence = source.includes('HISTORICAL EVIDENCE');
  const hasFallback = source.includes('ROSTER-FIT FALLBACK');
  updateHudCell(
    root,
    'counter',
    hasEvidence ? 'EVIDENCE' : hasFallback ? 'ROSTER FIT' : '—',
    hasEvidence ? 'Historical counter evidence matched' : hasFallback ? 'Heuristic roster-fit fallback' : 'Select visible defense',
    hasEvidence ? 'ready' : hasFallback ? 'warn' : 'unknown',
  );

  root.classList.toggle('gacv3-board-ready', boardComplete);
  root.classList.toggle('gacv3-matchup-ready', Boolean(root.querySelector('.gacv2-versus')));
}

function bindMissionNavigation(root) {
  if (root.dataset.gacv3Bound === 'true') return;
  root.dataset.gacv3Bound = 'true';
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-gacv3-open-tab]');
    if (!action) return;
    root.querySelector(`[data-gacv2-tab="${action.dataset.gacv3OpenTab}"]`)?.click();
  });
}

function addQuickActions(root) {
  if (root.querySelector('[data-gacv3-actions]')) return;
  const top = root.querySelector('.gacv2-topline');
  if (!top) return;
  const actions = document.createElement('div');
  actions.className = 'gacv3-quick-actions';
  actions.dataset.gacv3Actions = 'true';
  actions.innerHTML = `
    <button type="button" data-gacv3-open-tab="board">⌖ Plan Attack</button>
    <button type="button" data-gacv3-open-tab="history">◷ Scout</button>
    <button type="button" data-gacv3-open-tab="diagnostics">⚙ Truth Gate</button>`;
  top.appendChild(actions);
}

function enhance(root) {
  if (!root) return;
  state.enhancedRoot = root;
  root.classList.add('gacv3-enhanced');
  hideSupersededWorkspaceScaffolding(root);
  addTabIcons(root);
  installMissionStrip(root);
  addQuickActions(root);
  bindMissionNavigation(root);
  updateMissionStrip(root);
}

function run() {
  state.scheduled = false;
  injectStylesheet('/command-center-layout-v3.css?v=20260821-layout3', 'cc-layout-v3');
  injectStylesheet('/gac-war-room-v3.css?v=20260821-gacv3', 'gac-war-room-v3');
  const root = document.querySelector('[data-gacv2-root]');
  if (root) enhance(root);
}

function schedule() {
  if (state.scheduled) return;
  state.scheduled = true;
  requestAnimationFrame(run);
}

if (typeof document !== 'undefined') {
  schedule();
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('swgoh:workspace-activated', schedule);
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

export { formatAllyCode, selectedDefenseCount, updateMissionStrip };
