import {
  compareRosters,
  formatSigned,
  rankRosterFitSquads,
  unitDeltaRows,
} from "./gac-counter-engine.js";
import {
  abilityGapSummary,
  abilityTierDelta,
  abilityTierTotal,
} from "./gac-ability-intelligence.js";
import { rankEvidenceCounters } from "./gac-counter-evidence.js";

const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const state = {
  mine: null,
  opponent: null,
  selectedEnemyIds: new Set(),
  enemyLeaderId: "",
  mode: 5,
  counterRequest: 0,
  historyRequest: 0,
};

function byId(id) { return document.getElementById(id); }
function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function allyCode(value) { return String(value || "").replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
function signedClass(value) { return n(value) > 0 ? "gac-positive" : n(value) < 0 ? "gac-negative" : "gac-neutral"; }
function image(unit) {
  const src = unit?.image ? escapeAttr(unit.image) : "";
  return src ? `<img src="${src}" alt="" loading="lazy">` : `<span class="unit-placeholder">${escapeHtml(unit?.short || "?")}</span>`;
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

async function fetchOptionalJson(pathname) {
  try {
    return await fetchJson(pathname);
  } catch {
    return null;
  }
}

async function fetchRoster(code) {
  const body = await fetchJson(`/api/player/${code}`);
  if (body?.source !== "live" || !body?.player || !Array.isArray(body?.units)) {
    throw new Error("The live roster pipeline returned an unexpected response.");
  }
  return body;
}

function playerCard(summary, side) {
  const datacrons = summary.datacrons == null ? "" : ` · ${number.format(summary.datacrons)} datacrons`;
  return `
    <article class="gac-player-card ${side === "opponent" ? "enemy" : ""}">
      <span class="label">${side === "opponent" ? "Opponent" : "Your roster"}</span>
      <h4>${escapeHtml(summary.name)}</h4>
      <div class="rating">${escapeHtml(summary.league)} ${escapeHtml(summary.division)} · ${number.format(summary.skillRating || 0)} SR</div>
      <div class="gac-counter-meta">${number.format(summary.gp)} GP · ${number.format(summary.relicUnits)} relic characters · ${number.format(summary.omicrons)} omicrons · ${number.format(summary.zetas)} zetas${escapeHtml(datacrons)}</div>
    </article>`;
}

function deltaCard(label, value, suffix = "") {
  return `<div class="gac-delta"><span>${escapeHtml(label)}</span><strong class="${signedClass(value)}">${formatSigned(value)}${escapeHtml(suffix)}</strong></div>`;
}

function renderComparison() {
  const output = byId("gacComparison");
  if (!output || !state.mine || !state.opponent) return;
  const comparison = compareRosters(state.mine, state.opponent);
  const datacronDelta = comparison.delta.datacrons == null
    ? `<div class="gac-delta"><span>Datacrons</span><strong class="gac-neutral">N/A</strong></div>`
    : deltaCard("Datacron count", comparison.delta.datacrons);
  output.innerHTML = `
    <div class="gac-versus">
      ${playerCard(comparison.left, "mine")}
      <div class="gac-vs-mark">VS</div>
      ${playerCard(comparison.right, "opponent")}
    </div>
    <div class="gac-delta-grid">
      ${deltaCard("GP delta", comparison.delta.gp)}
      ${deltaCard("Skill rating", comparison.delta.skillRating)}
      ${deltaCard("Relic chars", comparison.delta.relicUnits)}
      ${deltaCard("Relic levels", comparison.delta.relicTotal)}
      ${deltaCard("Omicrons", comparison.delta.omicrons)}
      ${deltaCard("Zetas", comparison.delta.zetas)}
      ${deltaCard("R7+", comparison.delta.r7Plus)}
      ${deltaCard("R9+", comparison.delta.r9Plus)}
      ${deltaCard("6-dot mods", comparison.delta.sixDotMods)}
      ${deltaCard("Top speed", comparison.delta.topSpeed)}
      ${datacronDelta}
      ${deltaCard("Character GP", comparison.delta.characterGp)}
      ${deltaCard("Roster index", comparison.delta.combatValue)}
    </div>`;
  renderUnitDeltas();
  renderDefensePicker();
  void renderHistory();
}

function unitCell(unit) {
  if (!unit) return `<span class="gac-neutral">—</span>`;
  return `<strong>R${n(unit.relic)}</strong> · ${number.format(n(unit.speed))} spd · Z${n(unit.zetas)} · O${n(unit.omicrons)} · A${abilityTierTotal(unit)}`;
}

function renderUnitDeltas() {
  const output = byId("gacUnitDeltaBody");
  if (!output || !state.mine || !state.opponent) return;
  const rows = unitDeltaRows(state.mine, state.opponent).slice(0, 90);
  output.innerHTML = rows.map((row) => {
    const abilityDelta = abilityTierDelta(row.mine, row.theirs);
    return `
      <tr>
        <td><div class="gac-unit-name">${image(row.theirs || row.mine)}<strong>${escapeHtml(row.name)}</strong></div></td>
        <td>${unitCell(row.mine)}</td>
        <td>${unitCell(row.theirs)}</td>
        <td class="${signedClass(row.relicDelta)}">${formatSigned(row.relicDelta)}</td>
        <td class="${signedClass(row.speedDelta)}">${formatSigned(row.speedDelta)}</td>
        <td class="${signedClass(row.zetaDelta)}">${formatSigned(row.zetaDelta)}</td>
        <td class="${signedClass(row.omicronDelta)}">${formatSigned(row.omicronDelta)}</td>
        <td class="${signedClass(abilityDelta)}">${formatSigned(abilityDelta)}</td>
        <td>${escapeHtml(abilityGapSummary(row.mine, row.theirs))}</td>
      </tr>`;
  }).join("");
}

function opponentCharacters() {
  return Array.isArray(state.opponent?.units)
    ? state.opponent.units.filter((unit) => unit?.unitType !== "Ship").sort((a, b) => n(b.power) - n(a.power))
    : [];
}

function selectedEnemyUnits() {
  const selected = state.selectedEnemyIds;
  return opponentCharacters().filter((unit) => selected.has(unit.baseId));
}

function selectedEnemyUnitsLeaderFirst() {
  const units = selectedEnemyUnits();
  if (!state.enemyLeaderId) return units;
  const leader = units.find((unit) => unit.baseId === state.enemyLeaderId);
  return leader ? [leader, ...units.filter((unit) => unit.baseId !== leader.baseId)] : units;
}

function updateLeaderSelect() {
  const select = byId("gacDefenseLeader");
  if (!select) return;
  const selected = selectedEnemyUnits();
  if (state.enemyLeaderId && !state.selectedEnemyIds.has(state.enemyLeaderId)) state.enemyLeaderId = "";
  if (!state.enemyLeaderId && selected.length) state.enemyLeaderId = selected[0].baseId;
  select.disabled = !selected.length;
  select.innerHTML = selected.length
    ? selected.map((unit) => `<option value="${escapeAttr(unit.baseId)}" ${unit.baseId === state.enemyLeaderId ? "selected" : ""}>Leader · ${escapeHtml(unit.name)}</option>`).join("")
    : `<option value="">Leader · select defense</option>`;
}

function renderDefensePicker() {
  const output = byId("gacDefensePicker");
  const count = byId("gacDefenseCount");
  if (!output || !state.opponent) return;
  const units = opponentCharacters().slice(0, 120);
  output.innerHTML = units.map((unit) => {
    const checked = state.selectedEnemyIds.has(unit.baseId) ? "checked" : "";
    return `<label class="gac-defense-unit" data-name="${escapeAttr(String(unit.name || "").toLowerCase())}">
      <input type="checkbox" value="${escapeAttr(unit.baseId)}" ${checked}>
      ${image(unit)}
      <span><strong>${escapeHtml(unit.name)}</strong><small>R${n(unit.relic)} · ${number.format(n(unit.speed))} spd · Z${n(unit.zetas)} · O${n(unit.omicrons)} · A${abilityTierTotal(unit)}</small></span>
    </label>`;
  }).join("");
  output.querySelectorAll("input[type=checkbox]").forEach((input) => input.addEventListener("change", () => {
    const limit = state.mode;
    if (input.checked && state.selectedEnemyIds.size >= limit) {
      input.checked = false;
      showError(`Select up to ${limit} defenders for ${limit}v${limit}.`);
      return;
    }
    showError("");
    if (input.checked) {
      state.selectedEnemyIds.add(input.value);
      if (!state.enemyLeaderId) state.enemyLeaderId = input.value;
    } else {
      state.selectedEnemyIds.delete(input.value);
      if (state.enemyLeaderId === input.value) state.enemyLeaderId = "";
    }
    updateLeaderSelect();
    if (count) count.textContent = `${state.selectedEnemyIds.size}/${limit} selected`;
    void renderCounters();
  }));
  updateLeaderSelect();
  if (count) count.textContent = `${state.selectedEnemyIds.size}/${state.mode} selected`;
  void renderCounters();
}

function heuristicCounterCard(result, index) {
  const ability = result?.abilityReadiness?.known
    ? `${number.format(n(result.abilityReadiness.score))}% ability readiness`
    : "ability evidence incomplete";
  const risk = Array.isArray(result?.riskFlags) && result.riskFlags.length
    ? result.riskFlags.map((flag) => String(flag).replace(/-/g, " ")).join(" · ")
    : "no major heuristic risk flags";
  return `
    <article class="gac-counter-card">
      <div class="gac-counter-head"><strong>#${index + 1} ${escapeHtml(result.confidence)}</strong><span>${number.format(result.score)}</span></div>
      <div class="gac-counter-units">${result.squad.map((unit) => `<span title="${escapeAttr(unit.name)}">${image(unit)}</span>`).join("")}</div>
      <div class="gac-counter-meta">
        ${result.squad.map((unit) => escapeHtml(unit.name)).join(" · ")}<br>
        Relic Δ ${formatSigned(result.relicDelta)} · Fastest ${formatSigned(result.speedEdge)} · Omicron Δ ${formatSigned(result.omicronEdge)} · Zeta Δ ${formatSigned(result.zetaEdge)}<br>
        ${escapeHtml(result?.speedProfile?.label || "Speed evidence incomplete")} · ${escapeHtml(ability)} · ${escapeHtml(risk)}
      </div>
    </article>`;
}

function evidenceCounterCard(result, index) {
  return `
    <article class="gac-counter-card gac-counter-evidence-card">
      <div class="gac-counter-head"><strong>#${index + 1} ${escapeHtml(result.confidence)}</strong><span>${percent.format(result.winRate || 0)}</span></div>
      <div class="gac-counter-units">${result.squad.map((unit) => `<span title="${escapeAttr(unit.name)}">${image(unit)}</span>`).join("")}</div>
      <div class="gac-counter-meta">
        ${result.squad.map((unit) => escapeHtml(unit.name)).join(" · ")}<br>
        ${number.format(result.battles)} battles · conservative ${percent.format(result.conservativeWinRate || 0)} · ${result.averageBanners ? `${Number(result.averageBanners).toFixed(1)} avg banners · ` : ""}${escapeHtml(result.source)}
      </div>
    </article>`;
}

async function renderCounters() {
  const output = byId("gacCounterGrid");
  if (!output) return;
  const requestId = ++state.counterRequest;
  const enemyUnits = selectedEnemyUnitsLeaderFirst();
  if (!state.mine || !enemyUnits.length) {
    output.innerHTML = `<div class="workspace-note">Select the enemy defense characters you see on the GAC board. The engine will rank squads from your actual roster.</div>`;
    return;
  }

  const heuristic = rankRosterFitSquads(state.mine, enemyUnits, { size: state.mode });
  if (enemyUnits.length !== state.mode || !state.enemyLeaderId) {
    output.innerHTML = `
      <div class="workspace-note">Complete the ${state.mode}v${state.mode} defense and confirm its leader to unlock historical counter evidence. Roster-fit suggestions are shown while the squad is incomplete.</div>
      ${heuristic.slice(0, 8).map(heuristicCounterCard).join("")}`;
    return;
  }

  output.innerHTML = `<div class="workspace-note">Checking sourced ${state.mode}v${state.mode} counter evidence for ${escapeHtml(enemyUnits[0]?.name || state.enemyLeaderId)}…</div>`;
  let evidence = [];
  try {
    const format = state.mode === 3 ? "3v3" : "5v5";
    const body = await fetchJson(`/api/gac/counters?format=${format}&enemyLeader=${encodeURIComponent(state.enemyLeaderId)}&limit=200`);
    evidence = rankEvidenceCounters(state.mine, enemyUnits, body?.observations || [], { size: state.mode });
  } catch {
    evidence = [];
  }
  if (requestId !== state.counterRequest) return;

  const evidenceHtml = evidence.length
    ? `<div class="workspace-note"><strong>Historical evidence</strong> · exact owned counter squads ranked by conservative win rate, sample size, banners and composition match.</div>${evidence.slice(0, 8).map(evidenceCounterCard).join("")}`
    : `<div class="workspace-note">No imported historical evidence matches this full defense yet. Showing roster-fit fallbacks without claiming a historical win rate.</div>`;
  const fallbackHtml = heuristic.length
    ? `<div class="workspace-note"><strong>Roster-fit fallback</strong> · derived from your relics, speed profile, ability readiness, zetas, omicrons and squad synergy. Speed/ability warnings are heuristics, not counter-specific minimum requirements.</div>${heuristic.slice(0, 8).map(heuristicCounterCard).join("")}`
    : `<div class="workspace-note">No roster-fit squads met the current eligibility filter.</div>`;
  output.innerHTML = `${evidenceHtml}${fallbackHtml}`;
}

function seasonRows(body) {
  const seasons = Array.isArray(body?.seasonStatus) ? body.seasonStatus : [];
  if (!seasons.length) return `<tr><td colspan="5">No persisted rounds or public season summary returned yet.</td></tr>`;
  return seasons.slice(0, 5).map((season) => `<tr>
    <td>${escapeHtml(season.seasonId || "N/A")}</td>
    <td>${escapeHtml(season.league || "N/A")} ${escapeHtml(season.division || "")}</td>
    <td>${number.format(n(season.seasonPoints))} pts</td>
    <td>${season.rank ? `#${number.format(n(season.rank))}` : "N/A"}</td>
    <td>Comlink season summary</td>
  </tr>`).join("");
}

function persistedRoundRows(history, fallbackRoster) {
  const rounds = Array.isArray(history?.rounds) ? history.rounds : [];
  if (!rounds.length) return seasonRows(fallbackRoster);
  return rounds.slice(0, 30).map((round) => {
    const season = round?.event?.seasonId || round?.event?.id || "GAC";
    const result = String(round?.result || "unknown").toUpperCase();
    const banners = round?.playerBanners == null && round?.opponentBanners == null
      ? "—"
      : `${round?.playerBanners ?? "—"} / ${round?.opponentBanners ?? "—"}`;
    const verified = round?.verified ? " · verified" : "";
    return `<tr>
      <td>${escapeHtml(season)} · R${n(round?.round)}</td>
      <td>${escapeHtml(round?.opponent?.name || round?.opponent?.allyCode || "Unknown opponent")}</td>
      <td>${escapeHtml(result)}</td>
      <td>${escapeHtml(banners)}</td>
      <td>${escapeHtml(round?.source || "history")}${escapeHtml(verified)}</td>
    </tr>`;
  }).join("");
}

async function renderHistory() {
  const mine = byId("gacMyHistoryBody");
  const opponent = byId("gacOpponentHistoryBody");
  if (!mine || !opponent || !state.mine || !state.opponent) return;
  const requestId = ++state.historyRequest;
  mine.innerHTML = `<tr><td colspan="5">Loading persisted GAC rounds…</td></tr>`;
  opponent.innerHTML = `<tr><td colspan="5">Loading persisted GAC rounds…</td></tr>`;
  const mineCode = allyCode(state.mine?.player?.allyCode);
  const opponentCode = allyCode(state.opponent?.player?.allyCode);
  const [mineHistory, opponentHistory] = await Promise.all([
    /^\d{9}$/.test(mineCode) ? fetchOptionalJson(`/api/gac/history/${mineCode}?limit=30`) : null,
    /^\d{9}$/.test(opponentCode) ? fetchOptionalJson(`/api/gac/history/${opponentCode}?limit=30`) : null,
  ]);
  if (requestId !== state.historyRequest) return;
  mine.innerHTML = persistedRoundRows(mineHistory, state.mine);
  opponent.innerHTML = persistedRoundRows(opponentHistory, state.opponent);
}

async function renderCurrentEventStatus() {
  const chip = byId("gacLiveChip");
  if (!chip) return;
  const body = await fetchOptionalJson("/api/gac/current-event");
  const event = body?.event;
  if (!body?.active || !event?.eventInstanceId) {
    chip.textContent = "GAC EVENT · NOT DETECTED";
    chip.title = "No active public GAC event was returned by the live gateway.";
    return;
  }
  chip.textContent = "GAC EVENT · LIVE";
  chip.title = event.eventInstanceId;
}

function showError(message = "") {
  const element = byId("gacCommandError");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("gac-hidden", !message);
}

function setBusy(busy) {
  const button = byId("gacCompareButton");
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? "Scanning rosters…" : "Compare Rosters";
}

async function compareCurrentMatchup(event) {
  event?.preventDefault?.();
  showError("");
  const mineCode = allyCode(byId("allyCode")?.value);
  const opponentCode = allyCode(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(mineCode)) {
    showError("Load your 9-digit Ally Code at the top of Command Center first.");
    return;
  }
  if (!/^\d{9}$/.test(opponentCode)) {
    showError("Enter the opponent's 9-digit Ally Code. Public GAC data exposes the bracket, but exact live pairing/board state still requires indexed bracket history or connected-account match data.");
    return;
  }
  setBusy(true);
  try {
    const [mine, opponent] = await Promise.all([fetchRoster(mineCode), fetchRoster(opponentCode)]);
    state.mine = mine;
    state.opponent = opponent;
    state.selectedEnemyIds.clear();
    state.enemyLeaderId = "";
    renderComparison();
  } catch (error) {
    showError(error?.message || "Unable to compare the two live rosters.");
  } finally {
    setBusy(false);
  }
}

function mountMarkup(host) {
  const section = document.createElement("section");
  section.id = "gacCommandCenterPro";
  section.className = "card workspace-intro gac-command-center";
  section.innerHTML = `
    <div class="gac-hero">
      <div>
        <div class="kicker">GAC TACTICAL COMMAND</div>
        <h3>Player vs Player · Roster Delta · Counter Planner</h3>
        <p>Compare both live public rosters, inspect relic/omicron/zeta/ability progression and datacron counts, mark the defense actually placed on the board, then rank counter squads that exist in your roster.</p>
      </div>
      <div id="gacLiveChip" class="gac-live-chip">CHECKING GAC EVENT…</div>
    </div>

    <form id="gacMatchupForm" class="gac-matchup-form">
      <input id="gacOpponentCode" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="Opponent Ally Code · 123-456-789">
      <button id="gacCompareButton" type="submit">Compare Rosters</button>
    </form>
    <div id="gacCommandError" class="gac-error gac-hidden"></div>
    <div id="gacComparison"><div class="workspace-note">Enter the current opponent's Ally Code to open the matchup cockpit.</div></div>

    <section class="gac-section">
      <div class="gac-section-heading"><div><h4>Character-by-character delta</h4><p>Your relic, speed, zeta, omicron and exact ability-tier investment against the opponent's same units.</p></div></div>
      <div class="gac-table-wrap"><table class="gac-table">
        <thead><tr><th>Character</th><th>You</th><th>Opponent</th><th>Relic Δ</th><th>Speed Δ</th><th>Zeta Δ</th><th>Omicron Δ</th><th>Ability Δ</th><th>Ability gaps</th></tr></thead>
        <tbody id="gacUnitDeltaBody"><tr><td colspan="9">Load a matchup to compare units.</td></tr></tbody>
      </table></div>
    </section>

    <section class="gac-section">
      <div class="gac-section-heading">
        <div><h4>Enemy defense selector</h4><p>Select the defense you can see, then confirm its leader. Public roster data does not expose hidden/current board deployments.</p></div>
        <div>
          <select id="gacMode"><option value="5">5v5</option><option value="3">3v3</option></select>
          <select id="gacDefenseLeader" disabled><option value="">Leader · select defense</option></select>
          <span id="gacDefenseCount" class="count">0/5 selected</span>
        </div>
      </div>
      <div id="gacDefensePicker" class="gac-defense-picker"><div class="workspace-note">Load an opponent to select defenders.</div></div>
    </section>

    <section class="gac-section">
      <div class="gac-section-heading"><div><h4>Counter Squad Intelligence</h4><p>Historical evidence wins when available; otherwise the system falls back to your actual roster's relics, speed profile, ability readiness, zetas, omicrons and squad synergy.</p></div></div>
      <div id="gacCounterGrid" class="gac-counter-grid"><div class="workspace-note">Select an enemy defense squad to calculate counters.</div></div>
      <div class="gac-warning">Historical win rates are shown only when imported evidence exists. Roster-fit suggestions remain explicitly labeled as heuristics. The live gateway currently exposes datacron counts, not individual datacron bonuses, so bonus compatibility is not guessed.</div>
    </section>

    <section class="gac-section">
      <div class="gac-section-heading"><div><h4>GAC round history</h4><p>Persisted Round 1/2/3 records are preferred. Until imported, the table falls back to public Comlink season summaries.</p></div></div>
      <div class="gac-table-wrap"><table class="gac-table"><thead><tr><th colspan="5">Your GAC history</th></tr><tr><th>Event / Round</th><th>Opponent / League</th><th>Result / Points</th><th>Banners / Rank</th><th>Source</th></tr></thead><tbody id="gacMyHistoryBody"><tr><td colspan="5">Load a matchup.</td></tr></tbody></table></div>
      <div class="gac-table-wrap" style="margin-top:.65rem"><table class="gac-table"><thead><tr><th colspan="5">Opponent GAC history</th></tr><tr><th>Event / Round</th><th>Opponent / League</th><th>Result / Points</th><th>Banners / Rank</th><th>Source</th></tr></thead><tbody id="gacOpponentHistoryBody"><tr><td colspan="5">Load a matchup.</td></tr></tbody></table></div>
    </section>`;
  host.insertAdjacentElement("afterend", section);
  byId("gacMatchupForm")?.addEventListener("submit", compareCurrentMatchup);
  byId("gacMode")?.addEventListener("change", (event) => {
    state.mode = Number(event.target.value) === 3 ? 3 : 5;
    state.selectedEnemyIds.clear();
    state.enemyLeaderId = "";
    renderDefensePicker();
  });
  byId("gacDefenseLeader")?.addEventListener("change", (event) => {
    state.enemyLeaderId = String(event.target.value || "");
    void renderCounters();
  });
  void renderCurrentEventStatus();
}

function ensureMounted() {
  if (byId("gacCommandCenterPro")) return;
  const host = byId("workspaceGacBody");
  if (host) mountMarkup(host);
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", ensureMounted);
