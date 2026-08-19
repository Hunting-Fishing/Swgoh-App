import { dispatchBoardEvidenceUpdated } from "./gac-board-evidence-events.js";

const state = { busy: false };

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function selectedDefenseId(select) {
  const id = Number(select?.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function deleteDefensePayload(idInput, roundInput) {
  const id = Number(idInput);
  const round = validRound(roundInput);
  if (!Number.isInteger(id) || id <= 0 || !round) return null;
  return Object.freeze({ id, round });
}
function savedDefenseCount(select) {
  if (!select?.options) return 0;
  return [...select.options].filter((option) => selectedDefenseId({ value: option.value }) !== null).length;
}

async function deleteJson(pathname, payload) {
  const response = await fetch(pathname, {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function injectStyles() {
  if (document.querySelector('style[data-gac-enemy-defense-delete="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacEnemyDefenseDelete = "true";
  style.textContent = `
    .gac-board-persistence-controls.gac-has-delete { grid-template-columns:minmax(0,1fr) auto auto; }
    #gacDeleteSavedDefense { min-height:34px; border:1px solid rgba(230,98,98,.3); border-radius:.48rem; padding:.3rem .52rem; background:rgba(128,38,38,.1); color:#e9a0a0; font-size:.58rem; font-weight:800; cursor:pointer; white-space:nowrap; }
    #gacDeleteSavedDefense:hover:not(:disabled) { border-color:rgba(242,112,112,.52); background:rgba(145,45,45,.18); color:#ffc0c0; }
    #gacDeleteSavedDefense:disabled { opacity:.38; cursor:not-allowed; }
    @media(max-width:720px){.gac-board-persistence-controls.gac-has-delete{grid-template-columns:1fr}#gacDeleteSavedDefense{width:100%}}
  `;
  document.head.append(style);
}

function updateButton() {
  const select = byId("gacSavedDefense");
  const button = byId("gacDeleteSavedDefense");
  if (!button) return;
  button.disabled = state.busy || selectedDefenseId(select) === null;
  button.textContent = state.busy ? "Removing…" : "Remove Saved Defense";
}

function removeSelectedOption(id) {
  const select = byId("gacSavedDefense");
  if (!select) return 0;
  const option = [...select.options].find((entry) => Number(entry.value) === Number(id));
  option?.remove?.();
  select.value = "";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (savedDefenseCount(select) === 0) {
    select.disabled = true;
    select.innerHTML = `<option value="">Saved defenses · none this round</option>`;
  }
  return savedDefenseCount(select);
}

async function removeSelectedDefense() {
  const select = byId("gacSavedDefense");
  const mine = allyCode(byId("allyCode")?.value);
  const payload = deleteDefensePayload(selectedDefenseId(select), byId("gacBracketRound")?.value);
  if (!/^\d{9}$/.test(mine) || !payload || state.busy) return;

  const label = clean(select?.selectedOptions?.[0]?.textContent) || `Defense ${payload.id}`;
  const accepted = window.confirm(
    `Remove this saved current-board defense?\n\n${label}\n\n` +
    "A locked/in-progress War Room plan must be released first. Any defense with recorded attempt history is protected and cannot be deleted."
  );
  if (!accepted) return;

  state.busy = true;
  updateButton();
  const status = byId("gacDefenseDatacronStatus");
  if (status) status.textContent = "Checking War Room safety and removing saved defense…";
  try {
    const result = await deleteJson(`/api/gac/current-board/${mine}/defense`, payload);
    const defenseCount = removeSelectedOption(payload.id);
    if (status) status.textContent = `Saved defense removed from Round ${result?.round || payload.round}. The editor remains loaded so you can correct and re-save it if needed.`;
    dispatchBoardEvidenceUpdated({ owner: "opponent", round: payload.round, action: "deleted", defenseId: payload.id, defenseCount });
  } catch (error) {
    if (status) {
      if (Number(error?.status) === 409) status.textContent = `Defense not removed: ${error?.message || "War Room state must be preserved"}`;
      else if (Number(error?.status) === 401) status.textContent = "Sign in with the verified owner account before removing board evidence.";
      else status.textContent = `Defense not removed: ${error?.message || "request failed"}`;
    }
  } finally {
    state.busy = false;
    updateButton();
  }
}

function mount() {
  injectStyles();
  const select = byId("gacSavedDefense");
  const controls = select?.closest?.(".gac-board-persistence-controls");
  if (!select || !controls) return false;
  controls.classList.add("gac-has-delete");
  let button = byId("gacDeleteSavedDefense");
  if (!button) {
    button = document.createElement("button");
    button.id = "gacDeleteSavedDefense";
    button.type = "button";
    button.textContent = "Remove Saved Defense";
    controls.append(button);
    button.addEventListener("click", () => void removeSelectedDefense());
  }
  if (select.dataset.enemyDefenseDeleteBound !== "true") {
    select.dataset.enemyDefenseDeleteBound = "true";
    select.addEventListener("change", updateButton);
  }
  updateButton();
  return true;
}

function ensureMounted() {
  if (!mount()) setTimeout(mount, 0);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
  new MutationObserver(() => {
    if (!byId("gacDeleteSavedDefense")) mount();
  }).observe(document.documentElement, { childList: true, subtree: true });
}

export { deleteDefensePayload, savedDefenseCount, selectedDefenseId };
