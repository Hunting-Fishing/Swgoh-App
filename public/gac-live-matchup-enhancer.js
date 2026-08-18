import { planBoardCounters } from "./gac-counter-engine.js";

const number = new Intl.NumberFormat("en-US");
const state = {
  matchup: null,
  mine: null,
  opponent: null,
  requestId: 0,
  autoAttemptedFor: "",
};

function byId(id) { return document.getElementById(id); }
function allyCode(value) { return String(value || "").replace(/\D/g, "").slice(0, 9); }
function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

async function fetchRoster(code) {
  const body = await fetchJson(`/api/player/${code}`);
  if (!body?.player || !Array.isArray(body?.units)) throw new Error("The live roster response was incomplete.");
  return body;
}

function rosterIndex(roster) {
  return new Map((roster?.units || []).map((unit) => [String(unit?.baseId || ""), unit]));
}

function unitPortrait(unit, fallbackId = "") {
  const name = unit?.name || fallbackId || "Unknown";
  const src = String(unit?.image || "").trim();
  return src
    ? `<span class="gac-live-unit" title="${escapeAttr(name)}"><img src="${escapeAttr(src)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`
    : `<span class="gac-live-unit" title="${escapeAttr(name)}"><span class="gac-live-unit-placeholder">${escapeHtml(String(name).slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}

function formatAllyCode(value) {
  return allyCode(value).replace(/(\d{3})(?=\d)/g, "$1-");
}

function phaseLabel(matchup) {
  const round = n(matchup?.event?.round);
  const status = String(matchup?.event?.status || "LIVE").trim().toUpperCase();
  return `${round ? `ROUND ${round}` : "CURRENT ROUND"} · ${status || "LIVE"}`;
}

function defenseLabel(squad, index) {
  const zone = String(squad?.zone || "").trim();
  const slot = squad?.slot == null ? "" : ` · SLOT ${Number(squad.slot) + 1}`;
  return zone ? `${zone}${slot}` : `DEFENSE ${index + 1}${slot}`;
}

function committedDefenseIds(matchup) {
  return (matchup?.defense?.mine || []).flatMap((squad) => Array.isArray(squad?.members) ? squad.members : []);
}

function renderLiveSummary() {
  const output = byId("gacLiveMatchupSummary");
  if (!output) return;
  const matchup = state.matchup;
  if (!matchup) {
    output.innerHTML = `<div class="workspace-note">Load your roster, then use <strong>Detect Current Matchup</strong>. Manual opponent Ally Code entry remains available as a fallback.</div>`;
    return;
  }
  const mine = matchup?.matchup?.me || {};
  const opponent = matchup?.matchup?.opponent || {};
  const delta = matchup?.matchup?.delta || {};
  const visible = (matchup?.defense?.opponent || []).length;
  output.innerHTML = `
    <div class="gac-live-round-banner">
      <div><span>LIVE GAC</span><strong>${escapeHtml(phaseLabel(matchup))}</strong></div>
      <div><span>MATCHUP</span><strong>${escapeHtml(mine.name || "You")} <b>VS</b> ${escapeHtml(opponent.name || "Opponent")}</strong></div>
      <div><span>FORMAT</span><strong>${escapeHtml(matchup.format || "5v5")}</strong></div>
      <div><span>VISIBLE DEFENSES</span><strong>${number.format(visible)}</strong></div>
    </div>
    <div class="gac-live-delta-strip">
      <div><span>GP Δ</span><strong>${signed(delta.galacticPower)}</strong></div>
      <div><span>CHAR GP Δ</span><strong>${signed(delta.characterGalacticPower)}</strong></div>
      <div><span>RELIC SCORE Δ</span><strong>${signed(delta.relicScore)}</strong></div>
      <div><span>OMICRON Δ</span><strong>${signed(delta.omicrons)}</strong></div>
      <div><span>ZETA Δ</span><strong>${signed(delta.zetas)}</strong></div>
      <div><span>ULTIMATE Δ</span><strong>${signed(delta.ultimates)}</strong></div>
    </div>
    <div class="gac-live-source-line">${escapeHtml(matchup?.defense?.visibility === "live-defense-visible" ? "Opponent board placements detected from the live GAC payload." : "The live source resolved the opponent, but did not expose current defense placements. Use the manual defense selector below.")}</div>`;
}

function signed(value) {
  const numeric = n(value);
  return numeric > 0 ? `+${number.format(numeric)}` : numeric < 0 ? `−${number.format(Math.abs(numeric))}` : "0";
}

function defenseUnits(squad) {
  const index = rosterIndex(state.opponent);
  return (squad?.members || []).map((id) => index.get(String(id || ""))).filter(Boolean);
}

function abilityReadinessLabel(recommendation) {
  const readiness = recommendation?.abilityReadiness;
  if (!readiness?.known) return "Ability data incomplete";
  return `Ability ${number.format(n(readiness.score))}%`;
}

function renderBoardPlanner() {
  const output = byId("gacBoardPlannerGrid");
  if (!output) return;
  const defenses = state.matchup?.defense?.opponent || [];
  if (!state.mine || !state.opponent || !defenses.length) {
    output.innerHTML = `<div class="workspace-note">No live defense placements are currently available. The manual defense selector and single-squad counter engine remain active below.</div>`;
    return;
  }
  const size = state.matchup?.format === "3v3" ? 3 : 5;
  const plan = planBoardCounters(state.mine, state.opponent, defenses, {
    size,
    excludeBaseIds: committedDefenseIds(state.matchup),
  });
  const enemyIndex = rosterIndex(state.opponent);
  output.innerHTML = plan.map((assignment, index) => {
    const squad = assignment.defense;
    const enemy = (squad?.members || []).map((id) => enemyIndex.get(String(id || ""))).filter(Boolean);
    const recommendation = assignment.recommendation;
    const enemyUnits = enemy.length
      ? enemy.map((unit) => unitPortrait(unit)).join("")
      : (squad?.members || []).map((id) => unitPortrait(null, id)).join("");
    const attackerUnits = recommendation?.squad?.length
      ? recommendation.squad.map((unit) => unitPortrait(unit)).join("")
      : `<div class="gac-board-no-counter">No non-overlapping roster-fit squad available.</div>`;
    const strategy = escapeHtml(assignment.allocationReason || "Board-wide allocation unavailable.");
    return `
      <article class="gac-board-card">
        <div class="gac-board-card-head">
          <div><span>${escapeHtml(defenseLabel(squad, index))}</span><strong>${escapeHtml(enemy[0]?.name || squad?.leaderBaseId || "Enemy defense")}</strong></div>
          <button type="button" class="gac-action gac-board-analyze" data-defense-index="${assignment.defenseIndex}">Analyze Squad</button>
        </div>
        <div class="gac-board-lane">
          <div><span class="gac-board-caption">ENEMY</span><div class="gac-board-units">${enemyUnits}</div></div>
          <div class="gac-board-arrow">→</div>
          <div><span class="gac-board-caption">STRATEGIC COUNTER</span><div class="gac-board-units">${attackerUnits}</div></div>
        </div>
        ${recommendation ? `
          <div class="gac-board-metrics">
            <strong>${escapeHtml(recommendation.confidence)}</strong>
            <span>Fit ${number.format(recommendation.score)}</span>
            <span>Allocation ${number.format(Math.round(n(assignment.allocationScore)))}</span>
            <span>Relic Δ ${signed(recommendation.relicDelta)}</span>
            <span>Fastest ${signed(recommendation.speedEdge)}</span>
            <span>${escapeHtml(recommendation.speedProfile?.label || "Speed N/A")}</span>
            <span>${escapeHtml(abilityReadinessLabel(recommendation))}</span>
            <span>Scarcity −${number.format(Math.round(n(assignment.scarcityPenalty)))}</span>
            <span>Overkill −${number.format(Math.round(n(assignment.overkillPenalty)))}</span>
            <span>${number.format(assignment.alternativesRemaining)} alternates</span>
          </div>
          <div class="gac-board-strategy"><span>COMMAND CENTER LOGIC</span><strong>${strategy}</strong></div>` : `<div class="gac-board-strategy gac-board-strategy-risk"><span>COMMAND CENTER LOGIC</span><strong>${strategy}</strong></div>`}
      </article>`;
  }).join("");
  output.querySelectorAll(".gac-board-analyze").forEach((button) => {
    button.addEventListener("click", () => selectDefenseForDetailedAnalysis(Number(button.dataset.defenseIndex)));
  });
}

function setLiveBusy(busy, label = "") {
  const button = byId("gacDetectMatchupButton");
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? (label || "Scanning GAC…") : "Detect Current Matchup";
  }
}

function setLiveError(message = "") {
  const output = byId("gacLiveMatchupError");
  if (!output) return;
  output.textContent = message;
  output.classList.toggle("gac-hidden", !message);
}

async function detectCurrentMatchup({ automatic = false } = {}) {
  const mineCode = allyCode(byId("allyCode")?.value);
  if (!/^\d{9}$/.test(mineCode)) {
    if (!automatic) setLiveError("Load your 9-digit Ally Code at the top of Command Center first.");
    return;
  }
  const requestId = ++state.requestId;
  setLiveError("");
  setLiveBusy(true, "Resolving opponent…");
  try {
    const matchup = await fetchJson(`/api/gac/matchup/${mineCode}`);
    if (requestId !== state.requestId) return;
    const opponentCode = allyCode(matchup?.matchup?.opponent?.allyCode);
    if (!/^\d{9}$/.test(opponentCode)) throw new Error("The live event resolved an opponent but did not expose a usable Ally Code.");

    const opponentInput = byId("gacOpponentCode");
    if (opponentInput) opponentInput.value = formatAllyCode(opponentCode);
    const mode = byId("gacMode");
    if (mode) {
      mode.value = matchup?.format === "3v3" ? "3" : "5";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setLiveBusy(true, "Loading both rosters…");
    const [mine, opponent] = await Promise.all([fetchRoster(mineCode), fetchRoster(opponentCode)]);
    if (requestId !== state.requestId) return;
    state.matchup = matchup;
    state.mine = mine;
    state.opponent = opponent;
    renderLiveSummary();
    renderBoardPlanner();

    byId("gacMatchupForm")?.requestSubmit?.();
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.matchup = null;
    state.mine = null;
    state.opponent = null;
    renderLiveSummary();
    renderBoardPlanner();
    if (!automatic || !/did not expose|resolvable current opponent/i.test(String(error?.message || ""))) {
      setLiveError(error?.message || "The current GAC matchup could not be resolved.");
    }
  } finally {
    if (requestId === state.requestId) setLiveBusy(false);
  }
}

function clearDefenseSelection() {
  const picker = byId("gacDefensePicker");
  if (!picker) return;
  picker.querySelectorAll('input[type="checkbox"]:checked').forEach((input) => {
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function selectDefenseForDetailedAnalysis(index) {
  const squad = state.matchup?.defense?.opponent?.[index];
  if (!squad) return;
  const mode = byId("gacMode");
  const size = state.matchup?.format === "3v3" ? 3 : 5;
  if (mode && Number(mode.value) !== size) {
    mode.value = String(size);
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  clearDefenseSelection();
  const picker = byId("gacDefensePicker");
  if (!picker) return;
  for (const id of (squad.members || []).slice(0, size)) {
    const input = [...picker.querySelectorAll('input[type="checkbox"]')].find((candidate) => candidate.value === id);
    if (!input) continue;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const leader = byId("gacDefenseLeader");
  if (leader && squad.leaderBaseId) {
    leader.value = squad.leaderBaseId;
    leader.dispatchEvent(new Event("change", { bubbles: true }));
  }
  byId("gacCounterGrid")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-live-matchup="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-live-matchup-enhancer.css?v=20260819-gac-counter2";
  link.dataset.gacLiveMatchup = "true";
  document.head.append(link);
}

function mountEnhancer() {
  injectStylesheet();
  const form = byId("gacMatchupForm");
  const comparison = byId("gacComparison");
  if (!form || !comparison || byId("gacDetectMatchupButton")) return false;

  const button = document.createElement("button");
  button.id = "gacDetectMatchupButton";
  button.type = "button";
  button.className = "gac-live-detect";
  button.textContent = "Detect Current Matchup";
  button.addEventListener("click", () => void detectCurrentMatchup());
  form.prepend(button);

  const live = document.createElement("section");
  live.className = "gac-live-matchup-panel";
  live.innerHTML = `
    <div id="gacLiveMatchupError" class="gac-error gac-hidden"></div>
    <div id="gacLiveMatchupSummary"></div>
    <div class="gac-live-board-heading">
      <div><div class="kicker">WHOLE-BOARD ATTACK PLAN</div><h4>Allocate counters across the board without burning scarce squads</h4><p>Characters placed on your defense are excluded. The planner evaluates speed risk, ability readiness, overkill and future counter scarcity; attackers cannot be reused.</p></div>
    </div>
    <div id="gacBoardPlannerGrid" class="gac-board-planner-grid"><div class="workspace-note">Detect the current matchup to build the board plan.</div></div>`;
  comparison.insertAdjacentElement("beforebegin", live);
  renderLiveSummary();

  const code = allyCode(byId("allyCode")?.value);
  if (/^\d{9}$/.test(code) && state.autoAttemptedFor !== code) {
    state.autoAttemptedFor = code;
    void detectCurrentMatchup({ automatic: true });
  }
  return true;
}

function ensureMounted() {
  if (mountEnhancer()) return;
  if (byId("gacDetectMatchupButton")) {
    const code = allyCode(byId("allyCode")?.value);
    if (/^\d{9}$/.test(code) && state.autoAttemptedFor !== code) {
      state.autoAttemptedFor = code;
      void detectCurrentMatchup({ automatic: true });
    }
  }
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
byId("allyForm")?.addEventListener("submit", () => setTimeout(ensureMounted, 600));
new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
