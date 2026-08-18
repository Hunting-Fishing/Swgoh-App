const state = {
  requestId: 0,
  loadedFor: "",
  bracket: null,
};

function byId(id) { return document.getElementById(id); }
function allyCode(value) { return String(value || "").replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
function formatAllyCode(value) { return allyCode(value).replace(/(\d{3})(?=\d)/g, "$1-"); }

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-bracket-fallback="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-bracket-fallback.css?v=20260818-gac-bracket1";
  link.dataset.gacBracketFallback = "true";
  document.head.append(link);
}

function setBusy(busy) {
  const button = byId("gacFindBracketButton");
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? "Scanning Live Brackets…" : "Find My Live Bracket";
}

function setError(message = "") {
  const output = byId("gacBracketError");
  if (!output) return;
  output.textContent = message;
  output.classList.toggle("gac-hidden", !message);
}

function selectOpponent(entry) {
  const code = allyCode(entry?.allyCode);
  if (!/^\d{9}$/.test(code)) {
    setError(`${entry?.name || "This player"} was found in the bracket, but their Ally Code could not be resolved from the public profile.`);
    return;
  }
  const input = byId("gacOpponentCode");
  if (!input) return;
  input.value = formatAllyCode(code);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  byId("gacMatchupForm")?.requestSubmit?.();
  byId("gacComparison")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function renderBracket() {
  const output = byId("gacBracketGrid");
  const meta = byId("gacBracketMeta");
  if (!output || !meta) return;
  const bracket = state.bracket;
  if (!bracket) {
    meta.textContent = "Public Comlink does not expose exact current-round pairings. Scan your live bracket, then select the opponent shown in-game.";
    output.innerHTML = `<div class="workspace-note">No bracket loaded yet.</div>`;
    return;
  }
  const opponents = Array.isArray(bracket.opponents) ? bracket.opponents : [];
  meta.textContent = `${bracket.league || "GAC"} · bracket ${Number(bracket.bracketIndex ?? 0)} · ${opponents.length} other bracket players · ${bracket.lookup?.method === "rank-hint" ? "fast rank lookup" : "live bracket scan"}`;
  if (!opponents.length) {
    output.innerHTML = `<div class="workspace-note">Your bracket was found, but no opponent profiles were returned.</div>`;
    return;
  }
  output.innerHTML = opponents.map((entry, index) => {
    const code = allyCode(entry?.allyCode);
    const available = /^\d{9}$/.test(code);
    return `
      <article class="gac-bracket-opponent ${available ? "" : "is-unresolved"}">
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
        <button type="button" class="gac-action gac-bracket-select" data-bracket-opponent="${index}" ${available ? "" : "disabled"}>Use Opponent</button>
      </article>`;
  }).join("");
  output.querySelectorAll(".gac-bracket-select").forEach((button) => {
    button.addEventListener("click", () => selectOpponent(opponents[Number(button.dataset.bracketOpponent)]));
  });
}

async function loadBracket() {
  const code = allyCode(byId("allyCode")?.value);
  if (!/^\d{9}$/.test(code)) {
    setError("Load your 9-digit Ally Code at the top of Command Center first.");
    return;
  }
  const requestId = ++state.requestId;
  setError("");
  setBusy(true);
  try {
    const bracket = await fetchJson(`/api/gac/bracket/by-player/${code}`);
    if (requestId !== state.requestId) return;
    state.loadedFor = code;
    state.bracket = bracket;
    renderBracket();
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
  button.textContent = "Find My Live Bracket";
  button.addEventListener("click", () => void loadBracket());
  form.append(button);

  const panel = document.createElement("section");
  panel.className = "gac-bracket-panel";
  panel.innerHTML = `
    <div class="gac-bracket-heading">
      <div>
        <div class="kicker">LIVE 8-PLAYER BRACKET</div>
        <h4>Opponent Discovery</h4>
        <p id="gacBracketMeta">Public Comlink does not expose exact current-round pairings. Scan your live bracket, then select the opponent shown in-game.</p>
      </div>
      <span class="gac-bracket-truth">PUBLIC DATA · NO GUESSING</span>
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
    renderBracket();
  }
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
byId("allyForm")?.addEventListener("submit", () => setTimeout(ensureMounted, 600));
new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
