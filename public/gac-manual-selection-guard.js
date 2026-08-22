import './gac-ui-ready-guard.js';
import './gac-canonical-faction-filter-ui.js';
import './gac-league-board-ui.js';
import './gac-full-battlefield.js';
import './gac-own-defense-slots.js?v=20260822-pro1';
import './gac-live-arena-leader-fix.js';
import './gac-live-arena-editor-side.js';
import './gac-ux-polish.js';

const REPLAY = Symbol('gac-manual-selection-replay');

function manualActionButton(target) {
  return target?.closest?.('[data-gac-manual-own-toggle],[data-gac-manual-enemy-toggle],[data-gac-manual-enemy-remove],[data-gac-manual-make-leader]') || null;
}

function installManualSelectionGuard() {
  if (window.__gacManualSelectionGuardInstalled) return;
  window.__gacManualSelectionGuardInstalled = true;
  window.addEventListener('click', (event) => {
    if (event?.[REPLAY]) return;
    const button = manualActionButton(event.target);
    if (!button || !button.closest?.('[data-gac-manual-counter-planner]')) return;
    if (!event.target?.closest?.('[data-inspect-base-id]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queueMicrotask(() => {
      if (!button.isConnected) return;
      const replay = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      Object.defineProperty(replay, REPLAY, { value: true });
      button.dispatchEvent(replay);
    });
  }, true);
}

if (typeof window !== 'undefined') installManualSelectionGuard();

export { installManualSelectionGuard, manualActionButton };
