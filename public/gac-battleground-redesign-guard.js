function unwrapBattlegroundShell() {
  const root = document.querySelector('[data-gac-board-workspace] .gac-visible-board');
  const shell = root?.querySelector(':scope > [data-gac-redesign-shell]');
  if (!root || !shell) return false;
  const editor = shell.querySelector('[data-gac-board-editor-host]');
  const zones = shell.querySelector('.gac-visible-zones');
  if (editor) root.appendChild(editor);
  if (zones) root.appendChild(zones);
  shell.remove();
  return true;
}

function collapseLegacyPlanner() {
  const legacy = document.querySelector('[data-gac-manual-counter-planner]');
  if (!legacy || legacy.closest('[data-gac-redesign-legacy-tools]')) return false;
  const details = document.createElement('details');
  details.className = 'gac-redesign-legacy-tools';
  details.dataset.gacRedesignLegacyTools = 'true';
  details.innerHTML = '<summary>Advanced legacy roster tools <span>preserved fallback</span></summary>';
  legacy.insertAdjacentElement('beforebegin', details);
  details.appendChild(legacy);
  return true;
}

function bindGuard() {
  const unwrap = () => unwrapBattlegroundShell();
  window.addEventListener('gac-war-room-updated', unwrap);
  window.addEventListener('gac-fleet-round-state-updated', unwrap);
  window.addEventListener('gac-board-evidence-updated', unwrap);
  window.addEventListener('hashchange', unwrap);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-gac-redesign-fleet-slot]')) unwrap();
  }, true);
  new MutationObserver(() => collapseLegacyPlanner()).observe(document.documentElement, { childList:true, subtree:true });
  collapseLegacyPlanner();
}

if (typeof document !== 'undefined') bindGuard();

export { collapseLegacyPlanner, unwrapBattlegroundShell };