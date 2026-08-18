import "./gac-scouting-enhancer.js";

const state = {
  requestId: 0,
  loadedFor: "",
  bracket: null,
  autoSelectedKey: "",
};

function byId(id) { return document.getElementById(id); }
function allyCode(value) { return String(value || "").replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
function formatAllyCode(value) { return allyCode(value).replace(/(\d{3})(?=\d)/g, "$1-"); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
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

async function postJson(pathname, payload) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-bracket-fallback="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-bracket-fallback.css?v=20260819-gac-confirm3";
  link.dataset.gacBracketFallback = "true";
  document.head.append(link);
}

function setBusy(busy) {
  const button = byId("gacFindBracketButton");
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? "Resolving Current Opponent…" : "Resolve Current Opponent";
}

function setError(message = "") {
  const output = byId("gacBracketError");
  if (!output) return;
  output.textContent = message;
  output.classList.toggle("gac-hidden", !message);
}

function selectOpponent(entry, options = {}) {
  const code = allyCode(entry?.allyCode);
  if (!/^\d{9}$/.test(code)) {
    setError(`${entry?.name || "This player"} was found in the bracket, but their Ally Code could not be resolved from the public profile.`);
    return false;
  }
  const input = byId("gacOpponentCode");
  if (!input) return false;
  const alreadySelected = allyCode(input.value) === code;
  input.value = formatAllyCode(code);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  if (!alreadySelected || options.forceSubmit) byId("gacMatchupForm")?.requestSubmit?.();
  if (options.scroll !== false) byId("gacComparison")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  return true;
}

function syncRoundControl() {
  const select = byId("gacBracketRound");
  if (!select) return;
  const exact = state.bracket?.opponentResolution?.exact === true;
  const serverRound = validRound(state.bracket?.opponentResolution?.round);
  if (serverRound) select.value = String(serverRound);
  select.disabled = exact || Boolean(serverRound);
  const source = byId("gacBracketRoundSource");
  if (!source) return;
  if (exact) source.textContent = "PAIRING LOCKED";
  else if (serverRound) source.textContent = "ROUND FROM LIVE CONTEXT";
  else source.textContent = "SELECT ROUND TO SAVE PAIRING";
}

function exactOpponentCard(bracket) {
  const entry = bracket?.currentOpponent;
  const resolution = bracket?.opponentResolution || {};
  const code = allyCode(entry?.allyCode);
  const round = Number(resolution?.round || 0);
  const confidence = Number(resolution?.confidence || 0);
  return `
    <article class="gac-bracket-opponent is-current-opponent">
      <div class="gac-bracket-opponent-index">R${round || "?"}</div>
      <div class="gac-bracket-opponent-main">
        <strong>${escapeHtml(entry?.name || "Current Opponent")}</strong>
        <span>Exact current pairing · ${escapeHtml(resolution?.source || "verified event/round evidence")}</span>
        <small>${code ? escapeHtml(formatAllyCode(code)) : "Ally Code unresolved"}${confidence ? ` · ${(confidence * 100).toFixed(0)}% evidence confidence` : ""}</small>
      </div>
      <div class="gac-bracket-opponent-score">
        <span>STATUS</span>
        <strong>LOCKED</strong>
      </div>
      <button type="button" class="gac-action gac-bracket-select" data-exact-opponent="true" ${code ? "" : "disabled"}>Load Matchup</button>
    </article>`;
}

function renderBracket() {
  const output = byId("gacBracketGrid");
  const meta = byId("gacBracketMeta");
  const truth = document.querySelector(".gac-bracket-truth");
  if (!output || !meta) return;
  const bracket = state.bracket;
  if (!bracket) {
    meta.textContent = "Resolve your live bracket. Exact current opponent is only auto-selected when event and round evidence match; otherwise choose the player shown in-game.";
    if (truth) truth.textContent = "PUBLIC DATA · NO GUESSING";
    output.innerHTML = `<div class="workspace-note">No bracket loaded yet.</div>`;
    syncRoundControl();
    return;
  }

  const opponents = Array.isArray(bracket.opponents) ? bracket.opponents : [];
  const exact = bracket?.opponentResolution?.exact === true && bracket?.currentOpponent;
  const source = bracket.source === "persisted-gac-bracket-index" ? "indexed bracket" : (bracket.lookup?.method === "rank-hint" ? "fast live lookup" : "live bracket scan");

  if (exact) {
    const round = Number(bracket.opponentResolution?.round || 0);
    meta.textContent = `${bracket.league || "GAC"} · bracket ${Number(bracket.bracketIndex ?? 0)} · Round ${round || "?"} exact opponent resolved · ${source}`;
    if (truth) truth.textContent = "EXACT PAIRING · EVIDENCE MATCH";
  } else {
    meta.textContent = `${bracket.league || "GAC"} · bracket ${Number(bracket.bracketIndex ?? 0)} · ${opponents.length} other bracket players · ${source} · public data does not expose the exact pairing`;
    if (truth) truth.textContent = "PUBLIC DATA · CONFIRM TO LOCK";
  }

  if (!opponents.length && !exact) {
    output.innerHTML = `<div class="workspace-note">Your bracket was found, but no opponent profiles were returned.</div>`;
    syncRoundControl();
    return;
  }

  const exactHtml = exact ? exactOpponentCard(bracket) : "";
  const listHtml = opponents.map((entry, index) => {
    const code = allyCode(entry?.allyCode);
    const available = /^\d{9}$/.test(code);
    const isExact = exact && code === allyCode(bracket.currentOpponent?.allyCode);
    return `
      <article class="gac-bracket-opponent ${available ? "" : "is-unresolved"} ${isExact ? "is-exact-member" : ""}">
        <div class="gac-bracket-opponent-index">${index + 1}</div>
        <div class="gac-bracket-opponent-main">
          <strong>${escapeHtml(entry?.name || "Unknown Player")}</strong>
          <span>${escapeHtml(entry?.guildName || "Guild not exposed")}</span>
          <small>${available ? escapeHtml(formatAllyCode(code)) : "Ally Code unresolved"}</small>
        </div>
        <div class="gac-bracket-opponent-score">
          <span>SCORE</span>
          <strong>${Number(entry?.score || 0).toLocaleString()}</strong>
        </div>
        <button type="button" class="gac-action gac-bracket-select" data-bracket-opponent="${index}" ${available ? "" : "disabled"}>${isExact ? "Exact Opponent" : "Use Opponent"}</button>
      </article>`;
  }).join("");

  output.innerHTML = `${exactHtml}${exact ? `<div class="gac-bracket-divider">OTHER PLAYERS IN THIS 8-PLAYER BRACKET</div>` : ""}${listHtml}`;
  output.querySelector('[data-exact-opponent="true"]')?.addEventListener("click", () => selectOpponent(bracket.currentOpponent, { forceSubmit: true }));
  output.querySelectorAll(".gac-bracket-select[data-bracket-opponent]").forEach((button) => {
    button.addEventListener("click", () => void useOpponent(opponents[Number(button.dataset.bracketOpponent)]));
  });
  syncRoundControl();
}

async function confirmOpponent(entry) {
  const ownCode = allyCode(byId("allyCode")?.value);
  const opponentCode = allyCode(entry?.allyCode);
  const round = validRound(byId("gacBracketRound")?.value);
  if (!ownCode || !opponentCode || !round) return null;

  const result = await postJson(`/api/gac/current-opponent/${ownCode}/confirm`, {
    opponentAllyCode: opponentCode,
    round,
  });
  state.bracket = {
    ...state.bracket,
    currentOpponent: result.opponent,
    opponentResolution: result.resolution,
  };
  state.autoSelectedKey = `${result.resolution?.eventInstanceId || ""}|${result.resolution?.round || ""}|${opponentCode}`;
  renderBracket();
  return result;
}

async function useOpponent(entry) {
  const selected = selectOpponent(entry, { forceSubmit: true });
  if (!selected || state.bracket?.opponentResolution?.exact === true) return;

  const round = validRound(byId("gacBracketRound")?.value);
  if (!round) {
    setError("Matchup loaded. Select the current Round 1, 2, or 3 first if you want Command Center to save this as the exact current pairing.");
    return;
  }

  try {
    setError("");
    await confirmOpponent(entry);
  } catch (error) {
    if (Number(error?.status) === 401) {
      setError("Matchup loaded. Sign in with the verified owner account to save this pairing for automatic resolution next time.");
      return;
    }
    if (Number(error?.status) === 403) {
      setError("Matchup loaded, but this signed-in account has not verified ownership of the loaded Ally Code, so the pairing was not saved.");
      return;
    }
    setError(`Matchup loaded, but the exact pairing was not saved: ${error?.message || "confirmation failed"}`);
  }
}

function autoSelectExactOpponent() {
  const bracket = state.bracket;
  if (bracket?.opponentResolution?.exact !== true || !bracket?.currentOpponent) return;
  const code = allyCode(bracket.currentOpponent?.allyCode);
  if (!code) return;
  const eventId = String(bracket?.opponentResolution?.eventInstanceId || bracket?.event?.eventInstanceId || "");
  const round = Number(bracket?.opponentResolution?.round || 0);
  const key = `${eventId}|${round}|${code}`;
  if (state.autoSelectedKey === key) return;
  state.autoSelectedKey = key;
  selectOpponent(bracket.currentOpponent, { forceSubmit: true, scroll: true });
}

async function loadBracket(options = {}) {
  const code = allyCode(byId("allyCode")?.value);
  if (!/^\d{9}$/.test(code)) {
    setError("Load your 9-digit Ally Code at the top of Command Center first.");
    return;
  }
  const requestId = ++state.requestId;
  setError("");
  setBusy(true);
  try {
    const bracket = await fetchJson(`/api/gac/bracket/by-player/${code}${options.refresh ? "?refresh=1" : ""}`);
    if (requestId !== state.requestId) return;
    state.loadedFor = code;
    state.bracket = bracket;
    renderBracket();
    autoSelectExactOpponent();
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.bracket = null;
    renderBracket();
    setError(error?.message || "The live GAC bracket could not be found.");
  } finally {
    if (requestId === state.requestId) setBusy(false);
  }
}

function mount() {
  injectStylesheet();
  const form = byId("gacMatchupForm");
  const comparison = byId("gacComparison");
  if (!form || !comparison || byId("gacFindBracketButton")) return false;

  const button = document.createElement("button");
  button.id = "gacFindBracketButton";
  button.type = "button";
  button.className = "gac-bracket-find";
  button.textContent = "Resolve Current Opponent";
  button.addEventListener("click", () => void loadBracket());
  form.append(button);

  const panel = document.createElement("section");
  panel.className = "gac-bracket-panel";
  panel.innerHTML = `
    <div class="gac-bracket-heading">
      <div>
        <div class="kicker">LIVE 8-PLAYER BRACKET</div>
        <h4>Opponent Discovery</h4>
        <p id="gacBracketMeta">Resolve your live bracket. Exact current opponent is only auto-selected when event and round evidence match; otherwise choose the player shown in-game.</p>
      </div>
      <div class="gac-bracket-controls">
        <label class="gac-bracket-round-control">
          <span>CURRENT ROUND</span>
          <select id="gacBracketRound">
            <option value="">Select</option>
            <option value="1">Round 1</option>
            <option value="2">Round 2</option>
            <option value="3">Round 3</option>
          </select>
          <small id="gacBracketRoundSource">SELECT ROUND TO SAVE PAIRING</small>
        </label>
        <span class="gac-bracket-truth">PUBLIC DATA · NO GUESSING</span>
      </div>
    </div>
    <div id="gacBracketError" class="gac-error gac-hidden"></div>
    <div id="gacBracketGrid" class="gac-bracket-grid"><div class="workspace-note">No bracket loaded yet.</div></div>`;

  const livePanel = document.querySelector(".gac-live-matchup-panel");
  if (livePanel) livePanel.insertAdjacentElement("afterend", panel);
  else comparison.insertAdjacentElement("beforebegin", panel);
  renderBracket();
  return true;
}

function ensureMounted() {
  mount();
  const code = allyCode(byId("allyCode")?.value);
  if (state.loadedFor && code && state.loadedFor !== code) {
    state.loadedFor = "";
    state.bracket = null;
    state.autoSelectedKey = "";
    const round = byId("gacBracketRound");
    if (round) round.value = "";
    renderBracket();
  }
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
byId("allyForm")?.addEventListener("submit", () => setTimeout(ensureMounted, 600));
new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
