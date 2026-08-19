function clean(value) { return String(value ?? "").trim(); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function boardEvidenceDetail(input = {}) {
  const owner = clean(input.owner).toLowerCase() === "player" ? "player" : "opponent";
  const action = clean(input.action).toLowerCase();
  const defenseId = Number(input.defenseId);
  return Object.freeze({
    owner,
    round: validRound(input.round),
    action: new Set(["saved", "deleted", "loaded"]).has(action) ? action : "updated",
    defenseId: Number.isInteger(defenseId) && defenseId > 0 ? defenseId : null,
  });
}
function dispatchBoardEvidenceUpdated(input = {}) {
  const detail = boardEvidenceDetail(input);
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return detail;
  window.dispatchEvent(new CustomEvent("gac-board-evidence-updated", { detail }));
  return detail;
}

export { boardEvidenceDetail, dispatchBoardEvidenceUpdated, validRound };
