import { readBoardPosition, zoneLabel } from "./gac-board-position.js";

const state = { pending: null, timer: null };

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function nextDisplaySlot(value) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 1 || slot >= 100) return null;
  return slot + 1;
}
function saveNextEligible(position, saveDisabled, pending) {
  return Boolean(position?.specified && position?.complete && nextDisplaySlot(position.displaySlot) && saveDisabled !== true && !pending);
}

function currentPosition() {
  return readBoardPosition(byId("gacDefenseZone")?.value, byId("gacDefenseSlot")?.value);
}

function injectStyles() {
  if (document.querySelector('style[data-gac-save-next-slot="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacSaveNextSlot = "true";
  style.textContent = `
    .gac-board-persistence-controls.gac-has-save-next { grid-template-columns:minmax(0,1fr) auto auto auto; }
    #gacSaveNextDefense { min-height:34px; border:1px solid rgba(100,197,255,.38); border-radius:.48rem; padding:.3rem .52rem; background:rgba(35,102,146,.15); color:#b7e4ff; font-size:.58rem; font-weight:850; cursor:pointer; white-space:nowrap; }
    #gacSaveNextDefense:hover:not(:disabled) { border-color:rgba(113,211,255,.6); background:rgba(39,125,172,.24); color:#e1f6ff; }
    #gacSaveNextDefense:disabled { opacity:.38; cursor:not-allowed; }
    @media(max-width:720px){.gac-board-persistence-controls.gac-has-save-next{grid-template-columns:1fr}#gacSaveNextDefense{width:100%}}
  `;
  document.head.append(style);
}

function updateButton() {
  const button = byId("gacSaveNextDefense");
  const save = byId("gacSaveDefense");
  if (!button || !save) return;
  const position = currentPosition();
  const eligible = saveNextEligible(position, save.disabled, state.pending);
  button.disabled = !eligible;
  button.textContent = state.pending ? "Saving + Advancing…" : "Save + Next Slot";
  button.title = position?.specified && position?.complete
    ? (nextDisplaySlot(position.displaySlot) ? "Save this verified defense, then clear the editor and advance to the next slot in the same zone." : "Slot 100 has no automatic next slot; use Save Current Defense.")
    : "Enter both board zone and slot to use Save + Next Slot.";
}

function clearEditorAndAdvance(pending) {
  const picker = byId("gacDefensePicker");
  const leader = byId("gacDefenseLeader");
  const datacron = byId("gacDefenseDatacron");
  const saved = byId("gacSavedDefense");
  const zone = byId("gacDefenseZone");
  const slot = byId("gacDefenseSlot");
  const status = byId("gacDefenseDatacronStatus");
  const nextSlot = nextDisplaySlot(pending.displaySlot);

  for (const input of picker?.querySelectorAll?.('input[type="checkbox"]') || []) input.checked = false;
  picker?.dispatchEvent?.(new Event("change", { bubbles: true }));
  if (leader) {
    leader.value = "";
    leader.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (datacron) {
    datacron.value = "";
    datacron.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (saved) {
    saved.value = "";
    saved.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (zone) zone.value = pending.zone;
  if (slot) {
    slot.value = nextSlot ? String(nextSlot) : "";
    slot.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (status) status.textContent = nextSlot
    ? `Defense saved. Ready for ${zoneLabel(pending.zone)} Slot ${nextSlot}. Select the next squad and visible datacron.`
    : "Defense saved. Automatic slot advance is complete; choose the next zone/slot manually.";
  const first = picker?.querySelector?.('input[type="checkbox"]:not(:disabled)');
  first?.focus?.();
}

function clearPending() {
  clearTimeout(state.timer);
  state.timer = null;
  state.pending = null;
  updateButton();
}

function completePending() {
  const pending = state.pending;
  if (!pending) return;
  clearTimeout(state.timer);
  state.timer = null;
  state.pending = null;
  clearEditorAndAdvance(pending);
  updateButton();
}

function startSaveNext() {
  const save = byId("gacSaveDefense");
  const round = validRound(byId("gacBracketRound")?.value);
  const position = currentPosition();
  if (!save || !round || !saveNextEligible(position, save.disabled, state.pending)) return;
  state.pending = Object.freeze({ round, zone: position.zone, displaySlot: Number(position.displaySlot) });
  updateButton();
  save.click();
  state.timer = setTimeout(() => {
    state.pending = null;
    state.timer = null;
    updateButton();
  }, 10_000);
}

function handleBoardEvidence(event) {
  const pending = state.pending;
  if (!pending) return;
  const detail = event?.detail || {};
  if (clean(detail.owner).toLowerCase() !== "opponent") return;
  if (validRound(detail.round) !== pending.round) return;
  if (!["loaded", "saved", "updated"].includes(clean(detail.action).toLowerCase())) return;
  completePending();
}

function mount() {
  injectStyles();
  const save = byId("gacSaveDefense");
  const controls = save?.closest?.(".gac-board-persistence-controls");
  if (!save || !controls) return false;
  controls.classList.add("gac-has-save-next");
  let button = byId("gacSaveNextDefense");
  if (!button) {
    button = document.createElement("button");
    button.id = "gacSaveNextDefense";
    button.type = "button";
    button.textContent = "Save + Next Slot";
    save.insertAdjacentElement("afterend", button);
    button.addEventListener("click", startSaveNext);
  }
  if (save.dataset.saveNextObserverBound !== "true") {
    save.dataset.saveNextObserverBound = "true";
    new MutationObserver(updateButton).observe(save, { attributes: true, attributeFilter: ["disabled"] });
  }
  for (const id of ["gacDefenseZone", "gacDefenseSlot", "gacMode", "gacDefenseLeader", "gacDefenseDatacron"]) {
    const element = byId(id);
    if (element && element.dataset.saveNextBound !== "true") {
      element.dataset.saveNextBound = "true";
      element.addEventListener("change", updateButton);
      element.addEventListener("input", updateButton);
    }
  }
  const picker = byId("gacDefensePicker");
  if (picker && picker.dataset.saveNextBound !== "true") {
    picker.dataset.saveNextBound = "true";
    picker.addEventListener("change", updateButton);
  }
  updateButton();
  return true;
}

function ensureMounted() {
  if (!mount()) setTimeout(mount, 0);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("gac-board-evidence-updated", handleBoardEvidence);
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => {
    clearPending();
    setTimeout(ensureMounted, 0);
  });
  new MutationObserver(() => {
    if (!byId("gacSaveNextDefense")) mount();
  }).observe(document.documentElement, { childList: true, subtree: true });
}

export { handleBoardEvidence, nextDisplaySlot, saveNextEligible, validRound };
