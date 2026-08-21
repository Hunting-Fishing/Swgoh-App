const BOARD_EDITOR_TRIGGER_SELECTOR = [
  '[data-gac-board-v2-squad-slot]',
  '[data-gac-board-v2-fleet-slot]',
  '[data-gac-board-v2-fleet-edit]',
].join(',');

function createBoardEditorClickStabilizer(options = {}) {
  const replaying = new WeakSet();
  const schedule = typeof options.schedule === 'function'
    ? options.schedule
    : (callback) => setTimeout(callback, 0);

  return function stabilizeBoardEditorClick(event) {
    const trigger = event?.target?.closest?.(BOARD_EDITOR_TRIGGER_SELECTOR);
    if (!trigger) return false;

    // The deferred replay must be allowed to reach the normal Board v2 handler.
    if (replaying.has(trigger)) {
      replaying.delete(trigger);
      return false;
    }

    if (trigger.isConnected === false) return false;

    // Board v2 currently opens the editor by re-rendering the manual-board host.
    // Doing that while the original click is still propagating can let later
    // document handlers act on the newly mounted editor and immediately dismiss
    // or redraw it. End the original event first, then replay the same control.
    event.preventDefault?.();
    event.stopImmediatePropagation?.();

    schedule(() => {
      if (trigger.isConnected === false || typeof trigger.click !== 'function') return;
      replaying.add(trigger);
      try {
        trigger.click();
      } finally {
        // A synchronous replay removes itself when this handler sees the
        // replayed event. Keep this cleanup for detached/test triggers too.
        replaying.delete(trigger);
      }
    });
    return true;
  };
}

const stabilizeBoardEditorClick = createBoardEditorClickStabilizer();

if (typeof document !== 'undefined') {
  // Loaded after Board v2 + Capture Queue. Capture Queue still sees the original
  // click first; Board v2 receives only the deferred replay after propagation
  // has completed, which keeps squad and fleet editors mounted.
  document.addEventListener('click', stabilizeBoardEditorClick, true);
}

export {
  BOARD_EDITOR_TRIGGER_SELECTOR,
  createBoardEditorClickStabilizer,
  stabilizeBoardEditorClick,
};
