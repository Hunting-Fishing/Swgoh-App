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

function bindGuard() {
  const unwrap = () => unwrapBattlegroundShell();
  window.addEventListener('gac-war-room-updated', unwrap);
  window.addEventListener('gac-fleet-round-state-updated', unwrap);
  window.addEventListener('gac-board-evidence-updated', unwrap);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-gac-redesign-fleet-slot]')) unwrap();
  }, true);
}

if (typeof document !== 'undefined') bindGuard();

export { unwrapBattlegroundShell };