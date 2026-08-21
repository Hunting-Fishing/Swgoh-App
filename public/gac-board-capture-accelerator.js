import { boardTerritories, normalizeRevealState, validFleetDraft } from './gac-board-v2-model.js';
import { captureQueue, captureStatus, restoreSummary } from './gac-board-capture-model.js';
import { boardSnapshot, requestBoardRefresh } from './gac-manual-board-workspace.js';
import { storageKey } from './gac-manual-board-context-bridge.js';

const AUTO_KEY = 'swgoh:gac-board:capture-auto';
const state = {
  autoAdvance: sessionStorage.getItem(AUTO_KEY) === '1',
  armed: false,
  baselineEntered: null,
  timer: null,
  refreshing: false,
};

const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function parseRows(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function parseObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function storageArgs(snapshot, scope = '') {
  return {
    owner: snapshot?.ownerCode || 'anonymous',
    opponent: snapshot?.opponentCode || 'manual',
    round: snapshot?.round || 0,
    formatName: snapshot?.format || '5v5',
    scope,
  };
}
function fleetDrafts(snapshot) {
  return parseRows(storageKey(storageArgs(snapshot, 'fleet'))).map(validFleetDraft).filter((row) => row.complete);
}
function revealState(snapshot, fleets = fleetDrafts(snapshot)) {
  let reveal = normalizeRevealState(parseObject(storageKey(storageArgs(snapshot, 'reveal'))));
  if ((snapshot?.defenses || []).some((row) => clean(row?.zone).toUpperCase() === 'BACK-BOTTOM')) {
    reveal = normalizeRevealState({ ...reveal, 'BACK-BOTTOM': true });
  }
  if (fleets.length) reveal = normalizeRevealState({ ...reveal, 'BACK-TOP': true });
  return reveal;
}
function canonicalFleets(snapshot) {
  const value = window.__gacFleetCanonicalState;
  if (!value || value.status !== 'canonical') return [];
  if (clean(value.ownerCode) !== clean(snapshot?.ownerCode) || clean(value.opponentCode) !== clean(snapshot?.opponentCode) || Number(value.round) !== Number(snapshot?.round)) return [];
  return Array.isArray(value.enemyFleets) ? value.enemyFleets : [];
}
function captureContext() {
  const snapshot = boardSnapshot();
  if (!snapshot?.rule) return null;
  const fleets = fleetDrafts(snapshot);
  const reveal = revealState(snapshot, fleets);
  const territories = boardTerritories(snapshot.rule, snapshot.defenses || [], fleets, reveal);
  const queue = captureQueue(territories);
  const restore = restoreSummary(snapshot.defenses || [], fleets, canonicalFleets(snapshot));
  return Object.freeze({ snapshot, fleets, reveal, territories, queue, restore, status: captureStatus(queue) });
}

function zoneLabel(zone) {
  const labels = {
    'FRONT-TOP': 'Front Top',
    'FRONT-BOTTOM': 'Front Bottom',
    'BACK-BOTTOM': 'Back Bottom',
    'BACK-TOP': 'Fleet Territory',
  };
  return labels[clean(zone).toUpperCase()] || clean(zone).replaceAll('-', ' ');
}
function nextLabel(target) {
  if (!target) return 'No visible empty slot';
  return `${zoneLabel(target.zone)} · Slot ${target.displaySlot} · ${target.kind === 'fleet' ? 'Fleet' : 'Squad'}`;
}
function restoreBadges(restore = {}) {
  return `<div class="gac-capture-restore">
    <span><small>SERVER SQUADS</small><b>${Number(restore.serverSquads || 0)}</b></span>
    <span><small>LOCAL SQUADS</small><b>${Number(restore.localSquads || 0)}</b></span>
    <span><small>CANONICAL FLEETS</small><b>${Number(restore.canonicalFleets || 0)}</b></span>
    <span><small>LOCAL FLEETS</small><b>${Number(restore.localFleets || 0)}</b></span>
  </div>`;
}
function markup(context) {
  const { queue, restore, status } = context;
  const canOpen = Boolean(queue.next);
  return `<section class="gac-board-capture-accelerator is-${escapeHtml(status.code)}" data-gac-board-capture>
    <header><div><span>CURRENT BOARD CAPTURE QUEUE</span><strong>${escapeHtml(status.label)}</strong><small>Exact visible slots only · hidden rear territories are never inferred or auto-revealed</small></div><div class="gac-capture-total"><b>${queue.totalEntered}/${queue.totalCapacity}</b><small>TOTAL CAPTURED</small></div></header>
    <div class="gac-capture-progress"><div><i style="--gac-capture-progress:${queue.visibleCapacity ? Math.min(100,(queue.visibleEntered/queue.visibleCapacity)*100) : 0}%"></i></div><b>${queue.visibleEntered}/${queue.visibleCapacity} visible slots captured</b><small>${queue.hiddenCapacity ? `${queue.hiddenCapacity} hidden slot${queue.hiddenCapacity===1?'':'s'} withheld` : 'All territory capacity is visible'}</small></div>
    <div class="gac-capture-next"><span>NEXT TARGET</span><strong>${escapeHtml(nextLabel(queue.next))}</strong></div>
    ${restoreBadges(restore)}
    <div class="gac-capture-actions">
      <button type="button" data-gac-capture-next ${canOpen?'':'disabled'}>⌖ OPEN NEXT EMPTY</button>
      <button type="button" class="${state.autoAdvance?'is-on':''}" data-gac-capture-auto>AUTO ADVANCE ${state.autoAdvance?'ON':'OFF'}</button>
      <button type="button" data-gac-capture-refresh ${state.refreshing?'disabled':''}>${state.refreshing?'RESTORING…':'↻ REFRESH / RESTORE'}</button>
    </div>
    <footer>Server-backed squad rows remain protected by the existing War Room plan/attempt mutation gate. Local drafts remain editable. Auto-advance only follows a user-opened empty slot after captured progress increases.</footer>
  </section>`;
}
function render() {
  const context = captureContext();
  const board = document.querySelector('[data-gac-board-v2]');
  if (!context || !board) return;
  board.querySelector('[data-gac-board-capture]')?.remove();
  const progress = board.querySelector('.gac-board-v2-progress');
  if (!progress) return;
  progress.insertAdjacentHTML('afterend', markup(context));
}

function targetButton(target) {
  if (!target) return null;
  if (target.kind === 'fleet') return document.querySelector(`[data-gac-board-v2-fleet-slot="${Number(target.slot)}"]`);
  return document.querySelector(`[data-gac-board-v2-squad-slot="${clean(target.zone)}|${Number(target.slot)}"]`);
}
function armAtCurrentProgress() {
  const context = captureContext();
  state.armed = true;
  state.baselineEntered = context?.queue?.visibleEntered ?? null;
}
function cancelArm() {
  state.armed = false;
  state.baselineEntered = null;
}
function openTarget(target, { arm = true } = {}) {
  const button = targetButton(target);
  if (!button) return false;
  if (arm && state.autoAdvance) armAtCurrentProgress();
  button.click();
  return true;
}
function openNext() {
  const context = captureContext();
  if (!context?.queue?.next) return false;
  return openTarget(context.queue.next, { arm: true });
}
async function refreshRestore() {
  cancelArm();
  state.refreshing = true;
  render();
  try { await requestBoardRefresh(true); }
  finally {
    state.refreshing = false;
    setTimeout(render, 80);
  }
}
function maybeAutoAdvance() {
  const context = captureContext();
  if (!context) return;
  const entered = context.queue.visibleEntered;
  const advanced = state.autoAdvance && state.armed && state.baselineEntered !== null && entered > state.baselineEntered;
  if (!advanced) {
    render();
    return;
  }
  cancelArm();
  render();
  if (!context.queue.next) return;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    const latest = captureContext();
    if (!latest?.queue?.next || !state.autoAdvance) return;
    openTarget(latest.queue.next, { arm: true });
  }, 220);
}

function bind() {
  if (document.documentElement.dataset.gacCaptureAcceleratorBound === 'true') return;
  document.documentElement.dataset.gacCaptureAcceleratorBound = 'true';
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-gac-capture-next]')) { openNext(); return; }
    if (event.target.closest?.('[data-gac-capture-auto]')) {
      state.autoAdvance = !state.autoAdvance;
      sessionStorage.setItem(AUTO_KEY, state.autoAdvance ? '1' : '0');
      if (!state.autoAdvance) cancelArm();
      render();return;
    }
    if (event.target.closest?.('[data-gac-capture-refresh]')) { void refreshRestore(); return; }
    const empty = event.target.closest?.('.gac-board-v2-slot.is-empty[data-gac-board-v2-squad-slot],.gac-board-v2-slot.is-empty[data-gac-board-v2-fleet-slot]');
    if (empty && state.autoAdvance) armAtCurrentProgress();
    if (event.target.closest?.('[data-gac-board-close],[data-gac-board-v2-fleet-close]')) cancelArm();
  }, true);
  window.addEventListener('gac-board-v2-rendered', maybeAutoAdvance);
  window.addEventListener('gac-fleet-canonical-updated', () => setTimeout(render, 60));
  window.addEventListener('gac-v2-matchup-loaded', () => { cancelArm(); setTimeout(render, 100); });
  window.addEventListener('gac-current-opponent-manually-confirmed', () => { cancelArm(); setTimeout(render, 100); });
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('[data-gacv2-round],[data-gacv2-opponent],[data-gacv2-mode],[data-gac-board-format],[data-gac-board-league]') || event.target?.id === 'allyCode') {
      cancelArm();setTimeout(render,120);
    }
  }, true);
  document.addEventListener('DOMContentLoaded', () => setTimeout(render, 280), { once: true });
  setTimeout(render, 420);
}
function injectStyle() {
  if (document.querySelector('link[data-gac-capture-accelerator-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-board-capture-accelerator.css?v=20260821-b07';
  link.dataset.gacCaptureAcceleratorStyle = 'true';
  document.head.appendChild(link);
}

if (typeof document !== 'undefined') { injectStyle(); bind(); }

export {
  captureContext,
  fleetDrafts,
  nextLabel,
  openNext,
  openTarget,
  revealState,
  storageArgs,
};
