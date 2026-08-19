import { dispatchBoardEvidenceUpdated } from "./gac-board-evidence-events.js";

const state = { bound: false, timer: null };

function byId(id) { return document.getElementById(id); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function savedDefenseCount(select) {
  if (!select?.options) return 0;
  return [...select.options].filter((option) => Number.isInteger(Number(option.value)) && Number(option.value) > 0).length;
}
function publish() {
  const select = byId("gacSavedDefense");
  const round = validRound(byId("gacBracketRound")?.value);
  dispatchBoardEvidenceUpdated({
    owner: "opponent",
    round,
    action: "loaded",
    defenseCount: savedDefenseCount(select),
  });
}
function schedulePublish(delay = 40) {
  clearTimeout(state.timer);
  state.timer = setTimeout(publish, Math.max(0, delay));
}
function bindSavedDefenseSelect() {
  const select = byId("gacSavedDefense");
  if (!select || select.dataset.boardEvidenceRefreshBound === "true") return false;
  select.dataset.boardEvidenceRefreshBound = "true";
  new MutationObserver(() => schedulePublish()).observe(select, { childList: true, subtree: true, characterData: true });
  schedulePublish(0);
  return true;
}
function ensureMounted() {
  if (bindSavedDefenseSelect()) state.bound = true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  new MutationObserver(() => {
    if (!state.bound || !byId("gacSavedDefense")) {
      state.bound = false;
      ensureMounted();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

export { savedDefenseCount, validRound };
