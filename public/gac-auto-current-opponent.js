const state = {
  requestId: 0,
  timer: null,
  attemptedOwner: "",
  appliedKey: "",
  applying: false,
  manualOpponentTouched: false,
};

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function formatAllyCode(value) { return allyCode(value).replace(/(\d{3})(?=\d)/g, "$1-"); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}

function exactPairingFromBracket(body = {}, ownerCode = "") {
  const resolution = body?.opponentResolution || {};
  const opponent = body?.currentOpponent || null;
  const code = allyCode(opponent?.allyCode);
  const owner = allyCode(ownerCode);
  const round = validRound(resolution?.round || body?.event?.round);
  if (resolution?.exact !== true || !/^\d{9}$/.test(code) || code === owner || !round) return null;
  const eventInstanceId = clean(resolution?.eventInstanceId || body?.event?.eventInstanceId);
  return Object.freeze({
    ownerAllyCode: owner,
    opponentAllyCode: code,
    opponentName: clean(opponent?.name) || "Current Opponent",
    round,
    eventInstanceId,
    source: clean(resolution?.source || resolution?.method || body?.source) || "exact-current-pairing",
    confidence: Number.isFinite(Number(resolution?.confidence)) ? Number(resolution.confidence) : null,
    key: `${eventInstanceId}|${round}|${code}`,
  });
}

function shouldAutoApplyPairing(pairing, options = {}) {
  if (!pairing) return false;
  const currentOpponent = allyCode(options.currentOpponent);
  if (options.appliedKey && options.appliedKey === pairing.key) return false;
  if (options.manualOpponentTouched === true && currentOpponent && currentOpponent !== pairing.opponentAllyCode) return false;
  return true;
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-auto-opponent="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-auto-current-opponent.css?v=20260820-gacauto1";
  link.dataset.gacAutoOpponent = "true";
  document.head.append(link);
}

function ensureStatus() {
  const form = byId("gacMatchupForm");
  if (!form) return null;
  let output = byId("gacAutoOpponentStatus");
  if (output) return output;
  output = document.createElement("div");
  output.id = "gacAutoOpponentStatus";
  output.className = "gac-auto-opponent-status is-idle";
  output.innerHTML = `<span>AUTO CURRENT MATCHUP</span><strong>Waiting for Ally Code</strong>`;
  const button = byId("gacFindBracketButton");
  if (button) button.insertAdjacentElement("afterend", output);
  else form.append(output);
  return output;
}

function setStatus(kind, title, detail = "") {
  const output = ensureStatus();
  if (!output) return;
  output.className = `gac-auto-opponent-status is-${kind}`;
  output.innerHTML = `<span>AUTO CURRENT MATCHUP</span><strong>${title}</strong>${detail ? `<small>${detail}</small>` : ""}`;
}

function applyExactPairing(pairing) {
  const opponentInput = byId("gacOpponentCode");
  const roundSelect = byId("gacBracketRound");
  const form = byId("gacMatchupForm");
  if (!opponentInput || !form) return false;
  const currentOpponent = allyCode(opponentInput.value);
  if (!shouldAutoApplyPairing(pairing, {
    currentOpponent,
    manualOpponentTouched: state.manualOpponentTouched,
    appliedKey: state.appliedKey,
  })) return false;

  state.applying = true;
  try {
    if (roundSelect && validRound(roundSelect.value) !== pairing.round) {
      roundSelect.value = String(pairing.round);
      roundSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const changedOpponent = currentOpponent !== pairing.opponentAllyCode;
    if (changedOpponent) {
      opponentInput.value = formatAllyCode(pairing.opponentAllyCode);
      opponentInput.dispatchEvent(new Event("input", { bubbles: true }));
      opponentInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    state.appliedKey = pairing.key;
    setStatus(
      "locked",
      `Round ${pairing.round} · ${pairing.opponentName}`,
      `${formatAllyCode(pairing.opponentAllyCode)} · exact pairing · ${pairing.source}`,
    );
    window.dispatchEvent(new CustomEvent("gac-current-opponent-auto-resolved", {
      detail: {
        ownerAllyCode: pairing.ownerAllyCode,
        opponentAllyCode: pairing.opponentAllyCode,
        round: pairing.round,
        eventInstanceId: pairing.eventInstanceId,
        source: pairing.source,
      },
    }));
    form.requestSubmit?.();
    return true;
  } finally {
    state.applying = false;
  }
}

async function resolveCurrentOpponent(options = {}) {
  const owner = allyCode(byId("allyCode")?.value);
  if (!/^\d{9}$/.test(owner)) {
    state.attemptedOwner = "";
    setStatus("idle", "Waiting for Ally Code");
    return null;
  }
  if (!options.force && state.attemptedOwner === owner) return null;
  state.attemptedOwner = owner;
  const requestId = ++state.requestId;
  setStatus("checking", "Checking live round and pairing…", "Only exact event/round evidence can auto-load an opponent.");
  try {
    const bracket = await fetchJson(`/api/gac/bracket/by-player/${owner}${options.refresh ? "?refresh=1" : ""}`);
    if (requestId !== state.requestId) return null;
    const pairing = exactPairingFromBracket(bracket, owner);
    if (!pairing) {
      setStatus("manual", "Exact pairing not exposed", "Use Resolve Current Opponent / bracket confirmation. No opponent was guessed.");
      return null;
    }
    const currentOpponent = allyCode(byId("gacOpponentCode")?.value);
    if (state.manualOpponentTouched && currentOpponent && currentOpponent !== pairing.opponentAllyCode) {
      setStatus("manual", "Manual opponent preserved", `Exact Round ${pairing.round} pairing is ${pairing.opponentName} · ${formatAllyCode(pairing.opponentAllyCode)}.`);
      return pairing;
    }
    applyExactPairing(pairing);
    return pairing;
  } catch (error) {
    if (requestId !== state.requestId) return null;
    if ([404, 409].includes(Number(error?.status))) {
      setStatus("manual", "Automatic pairing unavailable", "Use the existing bracket confirmation flow. No opponent was inferred.");
    } else {
      setStatus("degraded", "Live pairing check unavailable", "Manual opponent entry and bracket resolution remain available.");
    }
    return null;
  }
}

function schedule(delay = 200, options = {}) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void resolveCurrentOpponent(options), Math.max(0, delay));
}

function bindInputs() {
  const owner = byId("allyCode");
  if (owner && owner.dataset.gacAutoOpponentBound !== "true") {
    owner.dataset.gacAutoOpponentBound = "true";
    const reset = () => {
      state.attemptedOwner = "";
      state.appliedKey = "";
      state.manualOpponentTouched = false;
      schedule(280, { force: true });
    };
    owner.addEventListener("change", reset);
  }
  const opponent = byId("gacOpponentCode");
  if (opponent && opponent.dataset.gacAutoOpponentBound !== "true") {
    opponent.dataset.gacAutoOpponentBound = "true";
    opponent.addEventListener("input", () => {
      if (!state.applying) state.manualOpponentTouched = true;
    });
  }
}

function ensureMounted() {
  injectStylesheet();
  const form = byId("gacMatchupForm");
  if (!form) return;
  ensureStatus();
  bindInputs();
  schedule(220);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
  new MutationObserver(() => ensureMounted()).observe(document.documentElement, { childList: true, subtree: true });
}

export {
  allyCode,
  exactPairingFromBracket,
  formatAllyCode,
  shouldAutoApplyPairing,
  validRound,
};
