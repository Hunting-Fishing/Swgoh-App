const state = { requestId: 0, timer: null };
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

function deriveReadiness(input = {}) {
  const playerReady = input.playerReady === true;
  const round = validRound(input.round);
  const signedIn = input.authStatus !== "required";
  const pairingConfirmed = input.pairingStatus === "confirmed";
  const enemyCount = Math.max(0, Number(input.enemyCount || 0));
  const ownCount = Math.max(0, Number(input.ownCount || 0));
  const assignmentCount = Math.max(0, Number(input.assignmentCount || 0));
  const currentEventAvailable = input.currentEventAvailable !== false;

  const gates = [
    {
      id: "roster",
      label: "Load Roster",
      state: playerReady ? "complete" : "action",
      detail: playerReady ? "9-digit player context ready." : "Load your Ally Code before opening GAC operations.",
    },
    {
      id: "round",
      label: "Select Round",
      state: !playerReady ? "blocked" : round ? "complete" : "action",
      detail: round ? `Round ${round} selected.` : "Select the current Round 1, 2, or 3.",
    },
    {
      id: "auth",
      label: "Verified Owner",
      state: !playerReady || !round ? "blocked" : signedIn ? "complete" : "action",
      detail: signedIn ? "Authenticated War Room read path available." : "Sign in with the account that verified this Ally Code.",
    },
    {
      id: "pairing",
      label: "Current Opponent",
      state: !playerReady || !round || !signedIn ? "blocked" : !currentEventAvailable ? "blocked" : pairingConfirmed ? "complete" : "action",
      detail: pairingConfirmed
        ? clean(input.opponentName) || clean(input.opponentAllyCode) || "Current opponent verified for this event and round."
        : !currentEventAvailable
          ? "No current GAC event is available from the live context."
          : "Resolve the live bracket, select the in-game opponent, and save the pairing.",
    },
    {
      id: "enemy-board",
      label: "Enemy Board",
      state: !pairingConfirmed ? "blocked" : enemyCount > 0 ? "complete" : "action",
      detail: enemyCount > 0 ? `${number.format(enemyCount)} verified enemy defense${enemyCount === 1 ? "" : "s"} saved.` : "Save each visible enemy defense before whole-board allocation.",
    },
    {
      id: "own-defense",
      label: "Your Defense Reserve",
      state: !pairingConfirmed ? "blocked" : ownCount > 0 ? "complete" : "optional",
      detail: ownCount > 0 ? `${number.format(ownCount)} of your defensive squads reserved.` : "Optional but recommended: save your own defenses so those characters cannot be spent on offense.",
    },
    {
      id: "war-room",
      label: "War Room",
      state: enemyCount <= 0 ? "blocked" : assignmentCount > 0 ? "complete" : "ready",
      detail: assignmentCount > 0 ? `${number.format(assignmentCount)} attack plan${assignmentCount === 1 ? "" : "s"} tracked.` : "Board is ready. Lock the first recommended counter when you are ready to attack.",
    },
  ];

  const actionable = gates.find((gate) => gate.state === "action");
  const overall = !playerReady
    ? "load-roster"
    : !round
      ? "select-round"
      : !signedIn
        ? "sign-in"
        : !pairingConfirmed
          ? "confirm-opponent"
          : enemyCount <= 0
            ? "save-enemy-board"
            : assignmentCount <= 0
              ? "ready-to-plan"
              : "active";
  return Object.freeze({
    overall,
    ready: enemyCount > 0 && pairingConfirmed && signedIn && playerReady && Boolean(round),
    actionableGate: actionable?.id || "",
    gates: Object.freeze(gates.map((gate) => Object.freeze(gate))),
  });
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function mount() {
  if (byId("gacRoundReadiness")) return byId("gacRoundReadiness");
  const anchor = document.querySelector(".gac-bracket-panel") || document.querySelector(".gac-live-matchup-panel") || byId("gacComparison");
  if (!anchor) return null;
  const panel = document.createElement("section");
  panel.id = "gacRoundReadiness";
  panel.className = "gac-round-readiness";
  panel.innerHTML = `<div class="gac-readiness-head"><div><div class="kicker">GAC ROUND ACTIVATION</div><h4>War Room Readiness</h4></div><span id="gacReadinessState">CHECKING</span></div><div id="gacReadinessSummary">Checking verified current-round state…</div><div id="gacReadinessGates" class="gac-readiness-gates"></div>`;
  anchor.insertAdjacentElement("afterend", panel);
  return panel;
}

function statusLabel(value) {
  if (value === "complete") return "READY";
  if (value === "ready") return "GO";
  if (value === "optional") return "OPTIONAL";
  if (value === "action") return "ACTION";
  return "LOCKED";
}

function actionFor(gateId) {
  if (gateId === "roster") return { label: "Load Roster", target: "allyCode", click: "loadButton" };
  if (gateId === "round") return { label: "Select Round", target: "gacBracketRound" };
  if (gateId === "pairing") return { label: "Resolve Opponent", target: "gacFindBracketButton", click: "gacFindBracketButton" };
  if (gateId === "enemy-board") return { label: "Save Enemy Defense", target: "gacDefensePicker" };
  if (gateId === "own-defense") return { label: "Reserve My Defense", target: "gacOwnDefenseReserve" };
  if (gateId === "war-room") return { label: "Open War Room", target: "gacBoardPlannerGrid" };
  return null;
}

function render(model, context = {}) {
  const panel = mount();
  if (!panel) return;
  const stateChip = byId("gacReadinessState");
  const summary = byId("gacReadinessSummary");
  const gates = byId("gacReadinessGates");
  if (!stateChip || !summary || !gates) return;
  stateChip.textContent = model.overall === "active" ? "ACTIVE" : model.overall === "ready-to-plan" ? "READY TO PLAN" : "SETUP REQUIRED";
  stateChip.dataset.state = model.overall;
  const opponent = clean(context.opponentName || context.opponentAllyCode);
  summary.innerHTML = model.ready
    ? `<strong>${opponent ? `${escapeHtml(opponent)} · ` : ""}Round ${context.round}</strong> · current-round prerequisites are verified.`
    : `<strong>Next required gate:</strong> ${escapeHtml(model.gates.find((gate) => gate.id === model.actionableGate)?.label || "Complete GAC setup")}.`;
  gates.innerHTML = model.gates.map((gate) => {
    const action = ["action", "optional", "ready"].includes(gate.state) ? actionFor(gate.id) : null;
    return `<article class="gac-readiness-gate is-${escapeHtml(gate.state)}" data-readiness-gate="${escapeHtml(gate.id)}">
      <div class="gac-readiness-number">${statusLabel(gate.state)}</div>
      <div><strong>${escapeHtml(gate.label)}</strong><span>${escapeHtml(gate.detail)}</span></div>
      ${action ? `<button type="button" data-readiness-target="${escapeHtml(action.target || "")}" data-readiness-click="${escapeHtml(action.click || "")}">${escapeHtml(action.label)}</button>` : ""}
    </article>`;
  }).join("");
}

async function probe() {
  const panel = mount();
  if (!panel) return;
  const requestId = ++state.requestId;
  const mine = allyCode(byId("allyCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  const base = { playerReady: /^\d{9}$/.test(mine), round, authStatus: "unknown", pairingStatus: "unknown", enemyCount: 0, ownCount: 0, assignmentCount: 0 };
  if (!base.playerReady || !round) {
    render(deriveReadiness(base), { round });
    return;
  }

  let warRoom;
  try {
    warRoom = await fetchJson(`/api/gac/attack-plan/${mine}?round=${round}`);
    base.authStatus = "ok";
    base.pairingStatus = "confirmed";
    base.assignmentCount = Array.isArray(warRoom?.assignments) ? warRoom.assignments.length : 0;
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (Number(error?.status) === 401 || Number(error?.status) === 403) base.authStatus = "required";
    else if (Number(error?.status) === 404 && /current GAC event/i.test(error?.message || "")) base.currentEventAvailable = false;
    else if ([400, 409].includes(Number(error?.status))) {
      base.authStatus = "ok";
      base.pairingStatus = "missing";
    } else {
      base.authStatus = "ok";
      base.pairingStatus = "missing";
    }
    render(deriveReadiness(base), { round });
    return;
  }

  try {
    const [enemyBoard, ownBoard] = await Promise.all([
      fetchJson(`/api/gac/current-board/${mine}/defense?round=${round}`),
      fetchJson(`/api/gac/current-board/${mine}/my-defense?round=${round}`),
    ]);
    if (requestId !== state.requestId) return;
    base.enemyCount = Array.isArray(enemyBoard?.defenses) ? enemyBoard.defenses.length : 0;
    base.ownCount = Array.isArray(ownBoard?.defenses) ? ownBoard.defenses.length : 0;
    const opponent = warRoom?.opponent || enemyBoard?.opponent || {};
    render(deriveReadiness(base), {
      round,
      opponentName: opponent?.name,
      opponentAllyCode: opponent?.allyCode,
    });
  } catch {
    if (requestId !== state.requestId) return;
    render(deriveReadiness(base), { round, opponentName: warRoom?.opponent?.name, opponentAllyCode: warRoom?.opponent?.allyCode });
  }
}

function scheduleProbe(delay = 250) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void probe(), Math.max(0, delay));
}

function bind() {
  if (document.documentElement.dataset.gacReadinessBound === "true") return;
  document.documentElement.dataset.gacReadinessBound = "true";
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacBracketRound", "gacOpponentCode"].includes(event.target?.id)) scheduleProbe(150);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-readiness-target]");
    if (button) {
      const target = byId(button.dataset.readinessTarget);
      const clickTarget = byId(button.dataset.readinessClick);
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target?.focus?.();
      clickTarget?.click?.();
      scheduleProbe(1500);
      return;
    }
    if (["gacFindBracketButton", "gacSaveDefense", "gacSaveOwnDefense"].includes(event.target?.id) || event.target?.closest?.("[data-war-action]")) {
      scheduleProbe(1800);
    }
  });
  window.addEventListener("gac-war-room-updated", () => scheduleProbe(250));
  window.addEventListener("gac-board-evidence-updated", () => scheduleProbe(250));
  window.addEventListener("hashchange", () => scheduleProbe(250));
}

function ensureMounted() {
  mount();
  bind();
  scheduleProbe(100);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  new MutationObserver(() => mount()).observe(document.documentElement, { childList: true, subtree: true });
}

export { allyCode, deriveReadiness, validRound };
