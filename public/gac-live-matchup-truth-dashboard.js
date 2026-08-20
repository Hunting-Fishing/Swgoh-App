import { allyCode, truthDashboardModel } from "./gac-live-matchup-truth-model.js";

const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
let refreshTimer = null;
let requestId = 0;
let mounted = false;

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function formatCode(value) { return allyCode(value).replace(/(\d{3})(?=\d)/g, "$1-"); }
function rate(value) { return value == null ? "—" : percent.format(value); }
function statusClass(ok, warning = false) { return ok ? "is-ready" : warning ? "is-warning" : "is-blocked"; }

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

async function fetchOptional(pathname) {
  try {
    return { body: await fetchJson(pathname), status: 200, error: "" };
  } catch (error) {
    return { body: null, status: Number(error?.status || 0), error: clean(error?.message) };
  }
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-live-truth="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-live-matchup-truth-dashboard.css?v=20260820-truth1";
  link.dataset.gacLiveTruth = "true";
  document.head.append(link);
}

function ensurePanel() {
  const host = document.querySelector(".gac-live-matchup-panel");
  if (!host) return null;
  let panel = byId("gacLiveTruthDashboard");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "gacLiveTruthDashboard";
  panel.className = "gac-live-truth-dashboard";
  panel.innerHTML = `<div class="gac-truth-loading">Resolving current GAC truth…</div>`;
  const error = byId("gacLiveMatchupError");
  if (error?.parentElement === host && error.nextSibling) host.insertBefore(panel, error.nextSibling);
  else host.prepend(panel);
  return panel;
}

function rosterMetric(label, value) {
  return `<span><small>${escapeHtml(label)}</small><strong>${value == null ? "—" : escapeHtml(number.format(Number(value) || 0))}</strong></span>`;
}

function renderOpponentRoster(matchup, opponentRoster) {
  const rival = matchup?.matchup?.opponent || {};
  const units = Array.isArray(opponentRoster?.units) ? opponentRoster.units : [];
  return `
    <div class="gac-truth-roster-grid">
      ${rosterMetric("GP", rival.galacticPower)}
      ${rosterMetric("CHAR GP", rival.characterGalacticPower)}
      ${rosterMetric("UNITS", units.length || rival.units)}
      ${rosterMetric("RELIC CHARS", rival.relicCharacters)}
      ${rosterMetric("RELIC SCORE", rival.relicScore)}
      ${rosterMetric("ZETAS", rival.zetas)}
      ${rosterMetric("OMICRONS", rival.omicrons)}
      ${rosterMetric("ULTIMATES", rival.ultimates)}
    </div>`;
}

function renderRecordedHistory(model) {
  const rounds = model.rounds;
  const battle = model.history;
  const record = rounds.known
    ? `<strong>${number.format(rounds.wins)}W · ${number.format(rounds.losses)}L</strong><span>${rate(rounds.winRate)} recorded round win rate</span>`
    : `<strong>W/L —</strong><span>No sourced final round result available</span>`;
  const offenseSample = battle.offense.resolved
    ? `${number.format(battle.offense.wins)}W / ${number.format(battle.offense.losses)}L / ${number.format(battle.offense.draws)}D · ${rate(battle.offense.winRate)}`
    : "—";
  const defenseSample = battle.defense.resolved
    ? `${number.format(battle.defense.holds)} holds / ${number.format(battle.defense.beaten)} beaten · ${rate(battle.defense.holdRate)} hold rate`
    : "—";
  return `
    <div class="gac-truth-record">
      <div class="gac-truth-record-primary">${record}</div>
      <div class="gac-truth-record-metrics">
        <span><small>PERSISTED ROUNDS</small><strong>${number.format(rounds.rounds)}</strong></span>
        <span><small>RECORDED RESULTS</small><strong>${number.format(rounds.recordedResults)}</strong></span>
        <span><small>HISTORICAL BATTLE ROWS</small><strong>${number.format(battle.observedRows)}</strong></span>
      </div>
      <div class="gac-truth-history-lines">
        <div><b>Observed offense sample</b><span>${escapeHtml(offenseSample)}</span></div>
        <div><b>Observed defense sample</b><span>${escapeHtml(defenseSample)}</span></div>
      </div>
      <p>${escapeHtml(rounds.truthLabel)} ${escapeHtml(battle.truthLabel)}</p>
    </div>`;
}

function boardAction(model, savedBoardFetch) {
  if (model.board.source === "live") return "Current defense received automatically; current-board counters can be allocated for the visible squads.";
  if (model.board.source === "verified-manual") return "Manual board evidence is verified against this exact opponent and current round; saving another squad triggers War Room re-planning.";
  if (savedBoardFetch?.status === 401) return "The API is hiding the board. Sign in with the verified owner account, then enter the squads you see in-game.";
  return "The API is hiding the board. Enter each defense you see in-game; saved squads are validated against the opponent's live roster before use.";
}

function render(model, context = {}) {
  const panel = ensurePanel();
  if (!panel) return;
  const matchup = context.matchup || {};
  const opponent = matchup?.matchup?.opponent || {};
  const identityClass = statusClass(model.identity.exact);
  const mineClass = statusClass(model.rosters.mineLoaded);
  const opponentClass = statusClass(model.rosters.opponentLoaded);
  const historyClass = statusClass(model.history.known || model.rounds.known, true);
  const boardClass = statusClass(model.board.ready, true);
  const overallClass = model.actionable ? "is-ready" : model.identity.exact && model.rosters.mineLoaded && model.rosters.opponentLoaded ? "is-warning" : "is-blocked";
  const overallLabel = model.actionable
    ? "CURRENT-MATCHUP COUNTER ENGINE READY"
    : model.identity.exact && model.rosters.mineLoaded && model.rosters.opponentLoaded
      ? "WAITING FOR CURRENT DEFENSE"
      : "CURRENT MATCHUP NOT VERIFIED";
  const resolution = [model.identity.method, model.identity.source].filter(Boolean).join(" · ") || "source unavailable";

  panel.dataset.counterReady = String(model.actionable);
  document.documentElement.dataset.gacCurrentMatchupReady = String(model.actionable);
  panel.innerHTML = `
    <div class="gac-truth-titlebar">
      <div><span class="kicker">LIVE MATCHUP TRUTH GATE</span><h3>${escapeHtml(overallLabel)}</h3></div>
      <span class="gac-truth-master ${overallClass}">${model.actionable ? "ACTIONABLE" : "GATED"}</span>
    </div>
    <div class="gac-truth-gates">
      <div class="gac-truth-gate ${identityClass}"><span>01</span><div><small>EXACT OPPONENT</small><strong>${model.identity.exact ? `${escapeHtml(model.identity.opponentName || opponent.name || "Opponent")} · ${escapeHtml(formatCode(model.identity.opponentAllyCode))}` : "UNRESOLVED"}</strong><em>${escapeHtml(resolution)}</em></div></div>
      <div class="gac-truth-gate ${mineClass}"><span>02</span><div><small>YOUR LIVE ROSTER</small><strong>${model.rosters.mineLoaded ? "LOADED" : "NOT LOADED"}</strong><em>Current roster required for availability and roster-fit.</em></div></div>
      <div class="gac-truth-gate ${opponentClass}"><span>03</span><div><small>OPPONENT LIVE ROSTER</small><strong>${model.rosters.opponentLoaded ? "LOADED" : "NOT LOADED"}</strong><em>Used to validate entered defenses and matchup deltas.</em></div></div>
      <div class="gac-truth-gate ${historyClass}"><span>04</span><div><small>GAC HISTORY</small><strong>${model.history.known || model.rounds.known ? "EVIDENCE LOADED" : "LIMITED / UNKNOWN"}</strong><em>Unknown history never becomes 0%.</em></div></div>
      <div class="gac-truth-gate ${boardClass}"><span>05</span><div><small>CURRENT BOARD</small><strong>${escapeHtml(model.board.label)}</strong><em>${number.format(model.board.count)} known current defense${model.board.count === 1 ? "" : "s"}.</em></div></div>
    </div>
    <div class="gac-truth-opponent">
      <div class="gac-truth-section-head"><span>OPPONENT PROFILE</span><strong>${escapeHtml(model.identity.opponentName || opponent.name || "Current opponent")}</strong></div>
      ${renderOpponentRoster(matchup, context.opponentRoster)}
    </div>
    <div class="gac-truth-history">
      <div class="gac-truth-section-head"><span>GAC WIN / HOLD HISTORY</span><strong>source-separated</strong></div>
      ${renderRecordedHistory(model)}
    </div>
    <div class="gac-truth-board ${boardClass}">
      <div><span>CURRENT DEFENSE SOURCE</span><strong>${escapeHtml(model.board.label)}</strong><p>${escapeHtml(model.board.detail)}</p><p>${escapeHtml(boardAction(model, context.savedBoardFetch))}</p></div>
      ${model.board.source === "manual-required" ? `<button type="button" id="gacTruthEnterDefense">ENTER WHAT YOU SEE</button>` : ""}
    </div>
    <div class="gac-truth-policy ${overallClass}">
      <strong>${model.actionable ? "COUNTER POLICY: " : "NOT ACTIONABLE YET: "}${escapeHtml(model.recommendationMode.replace(/-/g, " ").toUpperCase())}</strong>
      <p>${model.actionable
        ? "Exact historical counter percentages remain observed results. The War Room then filters them through your live roster, current availability, Relics, Zetas, Omicrons, speed/ability evidence, Datacron eligibility and whole-board scarcity. If no exact historical evidence exists, the fallback is explicitly labeled roster-fit heuristic."
        : escapeHtml(model.blockers.join(" "))}</p>
    </div>`;

  byId("gacTruthEnterDefense")?.addEventListener("click", () => {
    const target = byId("gacDefensePicker") || byId("gacSavedBoardPlanner") || byId("gacCounterGrid");
    target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });

  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("gac-live-truth-updated", { detail: {
      actionable: model.actionable,
      opponentAllyCode: model.identity.opponentAllyCode,
      boardSource: model.board.source,
      boardCount: model.board.count,
      recommendationMode: model.recommendationMode,
    } }));
  }
}

function renderUnresolved(message) {
  const panel = ensurePanel();
  if (!panel) return;
  panel.dataset.counterReady = "false";
  document.documentElement.dataset.gacCurrentMatchupReady = "false";
  panel.innerHTML = `
    <div class="gac-truth-titlebar"><div><span class="kicker">LIVE MATCHUP TRUTH GATE</span><h3>CURRENT MATCHUP NOT VERIFIED</h3></div><span class="gac-truth-master is-blocked">GATED</span></div>
    <div class="gac-truth-unresolved"><strong>Exact current opponent is required before current-board recommendations are treated as actionable.</strong><p>${escapeHtml(message || "Use Detect Current Matchup or confirm the current event/round opponent.")}</p></div>`;
}

async function refreshTruth() {
  const panel = ensurePanel();
  if (!panel) return;
  const mineCode = allyCode(byId("allyCode")?.value);
  if (!mineCode) {
    renderUnresolved("Load your 9-digit Ally Code first.");
    return;
  }
  const thisRequest = ++requestId;
  panel.innerHTML = `<div class="gac-truth-loading">Verifying current opponent, both live rosters, GAC history and board source…</div>`;

  let matchup;
  try {
    matchup = await fetchJson(`/api/gac/matchup/${mineCode}`);
  } catch (error) {
    if (thisRequest !== requestId) return;
    renderUnresolved(error?.message || "The current GAC matchup could not be resolved.");
    return;
  }
  const opponentCode = allyCode(matchup?.matchup?.opponent?.allyCode);
  if (!opponentCode) {
    renderUnresolved("The current opponent did not resolve to a usable Ally Code.");
    return;
  }
  const round = Number(matchup?.event?.round || 0);
  const [mineFetch, opponentFetch, scoutingFetch, roundHistoryFetch, savedBoardFetch] = await Promise.all([
    fetchOptional(`/api/player/${mineCode}`),
    fetchOptional(`/api/player/${opponentCode}`),
    fetchOptional(`/api/gac/scouting/${opponentCode}?limit=2500&import=0`),
    fetchOptional(`/api/gac/history/${opponentCode}?limit=30`),
    round >= 1 && round <= 3
      ? fetchOptional(`/api/gac/current-board/${mineCode}/defense?round=${round}`)
      : Promise.resolve({ body: null, status: 0, error: "Current round unavailable." }),
  ]);
  if (thisRequest !== requestId) return;

  const mineRoster = mineFetch.body?.source === "live" ? mineFetch.body : mineFetch.body;
  const opponentRoster = opponentFetch.body?.source === "live" ? opponentFetch.body : opponentFetch.body;
  const model = truthDashboardModel({
    matchup,
    myAllyCode: mineCode,
    opponentAllyCode: opponentCode,
    mineRoster,
    opponentRoster,
    scouting: scoutingFetch.body,
    roundHistory: roundHistoryFetch.body,
    savedBoard: savedBoardFetch.body,
  });
  render(model, { matchup, mineRoster, opponentRoster, savedBoardFetch });
}

function scheduleRefresh(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshTruth(), delay);
}

function mount() {
  if (mounted) return;
  injectStylesheet();
  const tryMount = () => {
    if (!ensurePanel()) return false;
    mounted = true;
    const form = byId("gacMatchupForm");
    form?.addEventListener("submit", () => scheduleRefresh(120));
    window.addEventListener("gac-board-evidence-updated", () => scheduleRefresh(80));
    window.addEventListener("gac-current-opponent-updated", () => scheduleRefresh(80));
    const summary = byId("gacLiveMatchupSummary");
    if (summary && typeof MutationObserver !== "undefined") {
      new MutationObserver(() => scheduleRefresh(60)).observe(summary, { childList: true, subtree: true });
    }
    scheduleRefresh(0);
    return true;
  };
  if (tryMount()) return;
  const observer = new MutationObserver(() => {
    if (tryMount()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof document !== "undefined" && typeof window !== "undefined") mount();

export { refreshTruth };
