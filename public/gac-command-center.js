import {
  compareRosters,
  formatSigned,
  rankRosterFitSquads,
  unitDeltaRows,
} from "./gac-counter-engine.js";

const number = new Intl.NumberFormat("en-US");
const state = {
  mine: null,
  opponent: null,
  selectedEnemyIds: new Set(),
  mode: 5,
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

async function fetchRoster(code) {
  const response = await fetch(`/api/player/${code}`, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Roster request failed with HTTP ${response.status}.`);
  if (body?.source !== "live" || !body?.player || !Array.isArray(body?.units)) {
    throw new Error("The live roster pipeline returned an unexpected response.");
  }
  return body;
}

function playerCard(summary, side) {
  return `
    <article class="gac-player-card ${side === "opponent" ? "enemy" : ""}">
      <span class="label">${side === "opponent" ? "Opponent" : "Your roster"}</span>
      <h4>${escapeHtml(summary.name)}</h4>
      <div class="rating">${escapeHtml(summary.league)} ${escapeHtml(summary.division)} · ${number.format(summary.skillRating || 0)} SR</div>
      <div class="gac-counter-meta">${number.format(summary.gp)} GP · ${number.format(summary.relicUnits)} relic characters · ${number.format(summary.omicrons)} omicrons · ${number.format(summary.zetas)} zetas</div>
    </article>`;
}

function deltaCard(label, value, suffix = "") {
  return `<div class="gac-delta"><span>${escapeHtml(label)}</span><strong class="${signedClass(value)}">${formatSigned(value)}${escapeHtml(suffix)}</strong></div>`;
}

function renderComparison() {
  const output = byId("gacComparison");
  if (!output || !state.mine || !state.opponent) return;
  const comparison = compareRosters(state.mine, state.opponent);
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
      ${deltaCard("Character GP", comparison.delta.characterGp)}
      ${deltaCard("Roster index", comparison.delta.combatValue)}
    </div>`;
  renderUnitDeltas();
  renderDefensePicker();
  renderHistory();
}

function unitCell(unit) {
  if (!unit) return `<span class="gac-neutral">—</span>`;
  return `<strong>R${n(unit.relic)}</strong> · ${number.format(n(unit.speed))} spd · Z${n(unit.zetas)} · O${n(unit.omicrons)}`;
}

function renderUnitDeltas() {
  const output = byId("gacUnitDeltaBody");
  if (!output || !state.mine || !state.opponent) return;
  const rows = unitDeltaRows(state.mine, state.opponent).slice(0, 90);
  output.innerHTML = rows.map((row) => `
    <tr>
      <td><div class="gac-unit-name">${image(row.theirs || row.mine)}<strong>${escapeHtml(row.name)}</strong></div></td>
      <td>${unitCell(row.mine)}</td>
      <td>${unitCell(row.theirs)}</td>
      <td class="${signedClass(row.relicDelta)}">${formatSigned(row.relicDelta)}</td>
      <td class="${signedClass(row.speedDelta)}">${formatSigned(row.speedDelta)}</td>
      <td class="${signedClass(row.zetaDelta)}">${formatSigned(row.zetaDelta)}</td>
      <td class="${signedClass(row.omicronDelta)}">${formatSigned(row.omicronDelta)}</td>
    </tr>`).join("");
}

function opponentCharacters() {
  return Array.isArray(state.opponent?.units)
    ? state.opponent.units.filter((unit) => unit?.unitType !== "Ship").sort((a, b) => n(b.power) - n(a.power))
    : [];
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
      <span><strong>${escapeHtml(unit.name)}</strong><small>R${n(unit.relic)} · ${number.format(n(unit.speed))} spd · Z${n(unit.zetas)} · O${n(unit.omicrons)}</small></span>
    </label>`;
  }).join("");
  output.querySelectorAll("input[type=checkbox]").forEach((input) => input.addEventListener("change", () => {
    const limit = state.mode;
    if (input.checked && state.selectedEnemyIds.size >= limit) {
      input.checked = false;
      showError(`Select up to ${limit} defenders for ${limit}v${limit}.`);
      return;
    }
    if (input.checked) state.selectedEnemyIds.add(input.value);
    else state.selectedEnemyIds.delete(input.value);
    if (count) count.textContent = `${state.selectedEnemyIds.size}/${limit} selected`;
    renderCounters();
  }));
  if (count) count.textContent = `${state.selectedEnemyIds.size}/${state.mode} selected`;
  renderCounters();
}

function selectedEnemyUnits() {
  const selected = state.selectedEnemyIds;
  return opponentCharacters().filter((unit) => selected.has(unit.baseId));
}

function renderCounters() {
  const output = byId("gacCounterGrid");
  if (!output) return;
  const enemyUnits = selectedEnemyUnits();
  if (!state.mine || !enemyUnits.length) {
    output.innerHTML = `<div class="workspace-note">Select the enemy defense characters you see on the GAC board. The engine will rank squads from your actual roster.</div>`;
    return;
  }
  const results = rankRosterFitSquads(state.mine, enemyUnits, { size: state.mode });
  if (!results.length) {
    output.innerHTML = `<div class="workspace-note">No roster-fit squads met the current eligibility filter.</div>`;
    return;
  }
  output.innerHTML = results.slice(0, 8).map((result, index) => `
    <article class="gac-counter-card">
      <div class="gac-counter-head"><strong>#${index + 1} ${escapeHtml(result.confidence)}</strong><span>${number.format(result.score)}</span></div>
      <div class="gac-counter-units">${result.squad.map((unit) => `<span title="${escapeAttr(unit.name)}">${image(unit)}</span>`).join("")}</div>
      <div class="gac-counter-meta">
        ${result.squad.map((unit) => escapeHtml(unit.name)).join(" · ")}<br>
        Relic Δ ${formatSigned(result.relicDelta)} · Speed edge ${formatSigned(result.speedEdge)} · Omicron Δ ${formatSigned(result.omicronEdge)} · Zeta Δ ${formatSigned(result.zetaEdge)}
      </div>
    </article>`).join("");
}

function seasonRows(body) {
  const seasons = Array.isArray(body?.seasonStatus) ? body.seasonStatus : [];
  if (!seasons.length) return `<tr><td colspan="5">No public season summary returned.</td></tr>`;
  return seasons.slice(0, 5).map((season) => `<tr>
    <td>${escapeHtml(season.seasonId || "N/A")}</td>
    <td>${escapeHtml(season.league || "N/A")} ${escapeHtml(season.division || "")}</td>
    <td>${number.format(n(season.seasonPoints))}</td>
    <td>${season.rank ? `#${number.format(n(season.rank))}` : "N/A"}</td>
    <td>${season.eventInstanceId ? escapeHtml(season.eventInstanceId) : "N/A"}</td>
  </tr>`).join("");
}

function renderHistory() {
  const mine = byId("gacMyHistoryBody");
  const opponent = byId("gacOpponentHistoryBody");
  if (mine) mine.innerHTML = seasonRows(state.mine);
  if (opponent) opponent.innerHTML = seasonRows(state.opponent);
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
    showError("Enter the opponent's 9-digit Ally Code. Automatic live-bracket opponent lookup is being wired to the new GAC gateway route.");
    return;
  }
  setBusy(true);
  try {
    const [mine, opponent] = await Promise.all([fetchRoster(mineCode), fetchRoster(opponentCode)]);
    state.mine = mine;
    state.opponent = opponent;
    state.selectedEnemyIds.clear();
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
        <p>Compare both live public rosters, inspect relic/omicron/zeta/ability progression, mark the defense actually placed on the board, then rank counter squads that exist in your roster.</p>
      </div>
      <div class="gac-live-chip">LIVE ROSTER DATA</div>
    </div>

    <form id="gacMatchupForm" class="gac-matchup-form">
      <input id="gacOpponentCode" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="Opponent Ally Code · 123-456-789">
      <button id="gacCompareButton" type="submit">Compare Rosters</button>
    </form>
    <div id="gacCommandError" class="gac-error gac-hidden"></div>
    <div id="gacComparison"><div class="workspace-note">Enter the current opponent's Ally Code to open the matchup cockpit.</div></div>

    <section class="gac-section">
      <div class="gac-section-heading"><div><h4>Character-by-character delta</h4><p>Your relic, speed, zeta and omicron investment against the opponent's same units.</p></div></div>
      <div class="gac-table-wrap"><table class="gac-table">
        <thead><tr><th>Character</th><th>You</th><th>Opponent</th><th>Relic Δ</th><th>Speed Δ</th><th>Zeta Δ</th><th>Omicron Δ</th></tr></thead>
        <tbody id="gacUnitDeltaBody"><tr><td colspan="7">Load a matchup to compare units.</td></tr></tbody>
      </table></div>
    </section>

    <section class="gac-section">
      <div class="gac-section-heading">
        <div><h4>Enemy defense selector</h4><p>Select what the opponent actually placed. This avoids pretending public roster data reveals hidden/current defenses.</p></div>
        <div>
          <select id="gacMode"><option value="5">5v5</option><option value="3">3v3</option></select>
          <span id="gacDefenseCount" class="count">0/5 selected</span>
        </div>
      </div>
      <div id="gacDefensePicker" class="gac-defense-picker"><div class="workspace-note">Load an opponent to select defenders.</div></div>
    </section>

    <section class="gac-section">
      <div class="gac-section-heading"><div><h4>Counter Squad Intelligence</h4><p>Ranks squads from your owned roster using relic, speed, zeta, omicron and faction/leader synergy evidence.</p></div></div>
      <div id="gacCounterGrid" class="gac-counter-grid"><div class="workspace-note">Select an enemy defense squad to calculate roster-fit counters.</div></div>
      <div class="gac-warning">This first engine is a roster-fit ranking, not a claimed historical win-rate. Matchup-specific counter statistics and datacron interactions will be added as sourced evidence, so we do not label an unverified squad as a guaranteed counter.</div>
    </section>

    <section class="gac-section">
      <div class="gac-section-heading"><div><h4>GAC history foundation</h4><p>Current Comlink player data returns recent season summaries. Full battle history will be ingested separately so offense/defense tendencies can become counter evidence.</p></div></div>
      <div class="gac-table-wrap"><table class="gac-table"><thead><tr><th colspan="5">Your recent seasons</th></tr><tr><th>Season</th><th>League</th><th>Points</th><th>Rank</th><th>Event Instance</th></tr></thead><tbody id="gacMyHistoryBody"><tr><td colspan="5">Load a matchup.</td></tr></tbody></table></div>
      <div class="gac-table-wrap" style="margin-top:.65rem"><table class="gac-table"><thead><tr><th colspan="5">Opponent recent seasons</th></tr><tr><th>Season</th><th>League</th><th>Points</th><th>Rank</th><th>Event Instance</th></tr></thead><tbody id="gacOpponentHistoryBody"><tr><td colspan="5">Load a matchup.</td></tr></tbody></table></div>
    </section>`;
  host.insertAdjacentElement("afterend", section);
  byId("gacMatchupForm")?.addEventListener("submit", compareCurrentMatchup);
  byId("gacMode")?.addEventListener("change", (event) => {
    state.mode = Number(event.target.value) === 3 ? 3 : 5;
    state.selectedEnemyIds.clear();
    renderDefensePicker();
  });
}

function ensureMounted() {
  if (byId("gacCommandCenterPro")) return;
  const host = byId("workspaceGacBody");
  if (host) mountMarkup(host);
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", ensureMounted);
