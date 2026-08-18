const state = {
  requestId: 0,
  report: null,
  roster: null,
  opponentCode: "",
};

const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

function byId(id) { return document.getElementById(id); }
function allyCode(value) { return String(value || "").replace(/\D/g, "").slice(0, 9); }
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

function rosterIndex() {
  return new Map((state.roster?.units || []).map((unit) => [String(unit?.baseId || ""), unit]));
}

function readableBaseId(value) {
  return String(value || "Unknown").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function unitName(baseId) {
  return rosterIndex().get(String(baseId || ""))?.name || readableBaseId(baseId);
}

function portrait(baseId) {
  const unit = rosterIndex().get(String(baseId || ""));
  const name = unit?.name || readableBaseId(baseId);
  const src = String(unit?.image || "").trim();
  if (src) return `<span class="gac-scout-unit" title="${escapeAttr(name)}"><img src="${escapeAttr(src)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`;
  return `<span class="gac-scout-unit" title="${escapeAttr(name)}"><span>${escapeHtml(String(name).slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}

function dateLabel(value) {
  const parsed = Date.parse(String(value || ""));
  return parsed ? new Date(parsed).toLocaleDateString() : "unknown date";
}

function setStatus(text, kind = "") {
  const element = byId("gacScoutStatus");
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
}

function renderEmpty(message) {
  const defense = byId("gacScoutDefenseGrid");
  const offense = byId("gacScoutOffenseGrid");
  if (defense) defense.innerHTML = `<div class="workspace-note">${escapeHtml(message)}</div>`;
  if (offense) offense.innerHTML = `<div class="workspace-note">${escapeHtml(message)}</div>`;
}

function trendUnits(trend) {
  return (trend?.members || []).map((baseId) => portrait(baseId)).join("");
}

function defenseCard(trend, index) {
  const resolved = Number(trend?.holds || 0) + Number(trend?.beaten || 0) + Number(trend?.draws || 0);
  const holdRate = trend?.holdRate == null ? "No resolved attempts" : `${percent.format(trend.holdRate)} hold rate`;
  return `
    <article class="gac-scout-card">
      <div class="gac-scout-card-head">
        <div><span>#${index + 1} HISTORICAL DEFENSE · ${escapeHtml(String(trend?.format || "").toUpperCase())}</span><strong>${escapeHtml(unitName(trend?.leaderBaseId))}</strong></div>
        <button type="button" class="gac-action gac-scout-analyze" data-scout-defense="${index}">Analyze Counter</button>
      </div>
      <div class="gac-scout-units">${trendUnits(trend)}</div>
      <div class="gac-scout-metrics">
        <strong>${number.format(Number(trend?.observations || 0))} observations</strong>
        <span>${escapeHtml(holdRate)}</span>
        <span>${number.format(Number(trend?.holds || 0))} holds</span>
        <span>${number.format(Number(trend?.beaten || 0))} beaten</span>
        <span>${number.format(Number(trend?.observedByPlayers || 0))} observers</span>
        <span>last ${escapeHtml(dateLabel(trend?.lastSeenAt))}</span>
      </div>
      ${resolved ? "" : `<div class="gac-scout-caution">Observed composition only; resolved battle outcome evidence is not available.</div>`}
    </article>`;
}

function offenseCard(trend, index) {
  const rate = trend?.winRate == null ? "No resolved attempts" : `${percent.format(trend.winRate)} win rate`;
  return `
    <article class="gac-scout-card gac-scout-offense-card">
      <div class="gac-scout-card-head"><div><span>#${index + 1} OFFENSE TENDENCY · ${escapeHtml(String(trend?.format || "").toUpperCase())}</span><strong>${escapeHtml(unitName(trend?.leaderBaseId))}</strong></div></div>
      <div class="gac-scout-units">${trendUnits(trend)}</div>
      <div class="gac-scout-metrics">
        <strong>${number.format(Number(trend?.attempts || 0))} attacks</strong>
        <span>${escapeHtml(rate)}</span>
        <span>${number.format(Number(trend?.wins || 0))} wins</span>
        <span>${number.format(Number(trend?.losses || 0))} losses</span>
        <span>last ${escapeHtml(dateLabel(trend?.lastSeenAt))}</span>
      </div>
    </article>`;
}

function renderReport() {
  const report = state.report;
  const defense = byId("gacScoutDefenseGrid");
  const offense = byId("gacScoutOffenseGrid");
  const coverage = byId("gacScoutCoverage");
  if (!defense || !offense || !coverage) return;
  if (!report) {
    coverage.textContent = "Select or enter an opponent to load imported scouting evidence.";
    renderEmpty("No opponent scouting report loaded.");
    return;
  }

  const defensive = Array.isArray(report.defensiveTendencies) ? report.defensiveTendencies : [];
  const offensive = Array.isArray(report.offensiveTendencies) ? report.offensiveTendencies : [];
  const c = report.coverage || {};
  coverage.textContent = `${number.format(Number(c.defensiveBattleRows || 0))} defensive battle observations · ${number.format(Number(c.offensiveBattleRows || 0))} offense records · ${number.format(Number(c.observedByPlayers || 0))} independent historical observers`;
  defense.innerHTML = defensive.length
    ? defensive.slice(0, 10).map(defenseCard).join("")
    : `<div class="workspace-note">No imported battles currently reconstruct this player's historical defenses. This does not mean the player has no history; it means our dataset has not observed their board from another imported player's attack record yet.</div>`;
  offense.innerHTML = offensive.length
    ? offensive.slice(0, 10).map(offenseCard).join("")
    : `<div class="workspace-note">No imported offense tendencies are available for this player yet.</div>`;
  defense.querySelectorAll(".gac-scout-analyze").forEach((button) => {
    button.addEventListener("click", () => loadDefenseIntoAnalyzer(defensive[Number(button.dataset.scoutDefense)]));
  });
}

function clearDefensePicker() {
  const picker = byId("gacDefensePicker");
  if (!picker) return;
  picker.querySelectorAll('input[type="checkbox"]:checked').forEach((input) => {
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function loadDefenseIntoAnalyzer(trend) {
  const picker = byId("gacDefensePicker");
  if (!picker) {
    setStatus("Load the opponent roster before analyzing a historical defense.", "error");
    return;
  }
  const size = String(trend?.format || "").toLowerCase() === "3v3" ? 3 : 5;
  const mode = byId("gacMode");
  if (mode) {
    mode.value = String(size);
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  clearDefensePicker();
  let selected = 0;
  for (const baseId of (trend?.members || []).slice(0, size)) {
    const input = [...picker.querySelectorAll('input[type="checkbox"]')].find((candidate) => candidate.value === baseId);
    if (!input) continue;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    selected += 1;
  }
  const leader = byId("gacDefenseLeader");
  if (leader && trend?.leaderBaseId && [...leader.options].some((option) => option.value === trend.leaderBaseId)) {
    leader.value = trend.leaderBaseId;
    leader.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (selected !== size) {
    setStatus(`Historical squad loaded partially (${selected}/${size}); some units are not present in the currently loaded opponent roster.`, "warning");
  } else {
    setStatus(`Historical ${size}v${size} defense loaded into Counter Squad Intelligence.`, "ready");
  }
  byId("gacCounterGrid")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

async function loadScouting() {
  const code = allyCode(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(code)) {
    state.report = null;
    state.roster = null;
    state.opponentCode = "";
    renderReport();
    return;
  }
  const requestId = ++state.requestId;
  state.opponentCode = code;
  setStatus("Loading imported opponent battle evidence…");
  try {
    const [report, roster] = await Promise.all([
      fetchJson(`/api/gac/scouting/${code}?limit=2500`),
      fetchJson(`/api/player/${code}`).catch(() => null),
    ]);
    if (requestId !== state.requestId) return;
    state.report = report;
    state.roster = roster;
    renderReport();
    setStatus(report?.coverage?.hasDefenseEvidence || report?.coverage?.hasOffenseEvidence ? "Scouting evidence loaded" : "No imported scouting evidence yet", report?.coverage?.hasDefenseEvidence || report?.coverage?.hasOffenseEvidence ? "ready" : "warning");
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.report = null;
    state.roster = null;
    renderReport();
    setStatus(error?.message || "Opponent scouting evidence could not be loaded.", "error");
  }
}

function injectStylesheet() {
  if (document.querySelector('link[data-gac-scouting="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-scouting-enhancer.css?v=20260818-gac-scout1";
  link.dataset.gacScouting = "true";
  document.head.append(link);
}

function mount() {
  injectStylesheet();
  const comparison = byId("gacComparison");
  if (!comparison || byId("gacOpponentScoutingPanel")) return false;
  const panel = document.createElement("section");
  panel.id = "gacOpponentScoutingPanel";
  panel.className = "gac-scout-panel";
  panel.innerHTML = `
    <div class="gac-scout-heading">
      <div><div class="kicker">IMPORTED GAC INTELLIGENCE</div><h4>Opponent Scouting Report</h4><p id="gacScoutCoverage">Select or enter an opponent to load imported scouting evidence.</p></div>
      <div id="gacScoutStatus" class="gac-scout-status">Awaiting opponent</div>
    </div>
    <div class="gac-scout-truth">Defense patterns are reconstructed from historical battles where imported players attacked this opponent. They are evidence of past placements—not a claim about the current hidden board.</div>
    <div class="gac-scout-columns">
      <section><div class="gac-scout-subhead"><span>DEFENSE SCOUT</span><strong>Recurring historical placements</strong></div><div id="gacScoutDefenseGrid" class="gac-scout-grid"><div class="workspace-note">No opponent scouting report loaded.</div></div></section>
      <section><div class="gac-scout-subhead"><span>OFFENSE SCOUT</span><strong>Teams they prefer to attack with</strong></div><div id="gacScoutOffenseGrid" class="gac-scout-grid"><div class="workspace-note">No opponent scouting report loaded.</div></div></section>
    </div>`;

  const bracketPanel = document.querySelector(".gac-bracket-panel");
  const livePanel = document.querySelector(".gac-live-matchup-panel");
  if (bracketPanel) bracketPanel.insertAdjacentElement("afterend", panel);
  else if (livePanel) livePanel.insertAdjacentElement("afterend", panel);
  else comparison.insertAdjacentElement("afterend", panel);

  byId("gacMatchupForm")?.addEventListener("submit", () => void loadScouting());
  return true;
}

function ensureMounted() {
  mount();
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
