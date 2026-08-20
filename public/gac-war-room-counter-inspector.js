import { datacronLabel, loadEligibilityContext, squadCoverage } from "./gac-datacron-eligibility.js";
import { squadAbilityReadiness } from "./gac-ability-intelligence.js";
import { formatSigned, matchupDelta } from "./gac-war-room-matchup-deltas.js";
import {
  abilityConcerns,
  alternateExclusions,
  normalizeBaseId,
  observedPercent,
  primaryEvidenceMatch,
  primaryHeuristicMatch,
  primarySourceLabel,
  recoveryAlternates,
  unitsForIds,
} from "./gac-counter-inspector-model.js";

const state = {
  requestId: 0,
  timer: null,
  key: "",
  context: null,
  evidenceKey: "",
  evidenceByLeader: new Map(),
};
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function squadSize() { return Number(byId("gacMode")?.value) === 3 ? 3 : 5; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  }[char]));
}
function contextIdentity() {
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  const size = squadSize();
  return /^\d{9}$/.test(mine) && /^\d{9}$/.test(opponent) && round
    ? Object.freeze({ mine, opponent, round, size, format: size === 3 ? "3v3" : "5v5", key: `${mine}|${opponent}|${round}|${size}` })
    : null;
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
function evidenceMapFromBatch(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : [])
    .map((entry) => [normalizeBaseId(entry?.enemyLeaderBaseId), entry])
    .filter(([leader]) => Boolean(leader)));
}
function batchEvidenceKey(context) {
  const leaders = [...new Set(context.enemyDefenses
    .map((defense) => normalizeBaseId(defense?.leaderBaseId || defense?.members?.[0]))
    .filter(Boolean))].sort();
  return Object.freeze({ leaders, key: `${context.identity.format}|${leaders.join(",")}` });
}
async function loadContext(identity, force = false) {
  if (!force && state.key === identity.key && state.context) return state.context;
  const [mineRoster, opponentRoster, enemyBoard, ownBoard, attackPlan] = await Promise.all([
    fetchJson(`/api/player/${identity.mine}`),
    fetchJson(`/api/player/${identity.opponent}`),
    fetchJson(`/api/gac/current-board/${identity.mine}/defense?round=${identity.round}`),
    fetchJson(`/api/gac/current-board/${identity.mine}/my-defense?round=${identity.round}`),
    fetchJson(`/api/gac/attack-plan/${identity.mine}?round=${identity.round}`),
  ]);
  if (allyCode(enemyBoard?.opponent?.allyCode) !== identity.opponent) {
    const error = new Error("Saved enemy board does not match the selected opponent.");
    error.status = 409;
    throw error;
  }
  const context = Object.freeze({
    identity,
    mineRoster,
    opponentRoster,
    enemyDefenses: Object.freeze(Array.isArray(enemyBoard?.defenses) ? enemyBoard.defenses : []),
    ownDefenses: Object.freeze(Array.isArray(ownBoard?.defenses) ? ownBoard.defenses : []),
    assignments: Object.freeze(Array.isArray(attackPlan?.assignments) ? attackPlan.assignments : []),
  });
  state.key = identity.key;
  state.context = context;
  return context;
}
async function loadEvidence(context, force = false) {
  const batch = batchEvidenceKey(context);
  if (!batch.leaders.length) return new Map();
  if (!force && state.evidenceKey === batch.key) return state.evidenceByLeader;
  try {
    const body = await fetchJson(`/api/gac/counters/batch?format=${context.identity.format}&leaders=${encodeURIComponent(batch.leaders.join(","))}&limit=40`);
    state.evidenceByLeader = evidenceMapFromBatch(body);
  } catch {
    state.evidenceByLeader = new Map();
  }
  state.evidenceKey = batch.key;
  return state.evidenceByLeader;
}
function cardRecommendations() {
  return [...document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")]
    .map((card) => ({
      defenseId: Number(card?.dataset?.defenseId || 0),
      members: clean(card?.dataset?.recommendedAttackerMembers).split(",").map(normalizeBaseId).filter(Boolean),
    }))
    .filter((entry) => entry.defenseId > 0 && entry.members.length);
}
function portrait(unit = {}) {
  const name = clean(unit?.name || unit?.baseId) || "Unknown";
  const image = clean(unit?.image);
  if (image) return `<span class="gac-inspector-unit" title="${escapeHtml(name)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`;
  return `<span class="gac-inspector-unit" title="${escapeHtml(name)}"><span>${escapeHtml(name.slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}
function metric(label, value, unknown = false) {
  return `<span><small>${escapeHtml(label)}</small><strong>${unknown ? "—" : escapeHtml(value)}</strong></span>`;
}
function matchupMetrics(primary, defenders) {
  const delta = primary.length && defenders.length ? matchupDelta(primary, defenders) : null;
  if (!delta?.known) return `<div class="gac-inspector-metrics">${metric("Relic Δ", "", true)}${metric("Zeta Δ", "", true)}${metric("Omicron Δ", "", true)}${metric("Fastest Δ", "", true)}${metric("Ability Δ", "", true)}</div>`;
  return `<div class="gac-inspector-metrics">${metric("Relic Δ", formatSigned(delta.relicDelta))}${metric("Zeta Δ", formatSigned(delta.zetaDelta))}${metric("Omicron Δ", formatSigned(delta.omicronDelta))}${metric("Fastest Δ", formatSigned(delta.speedDelta), delta.speedDelta == null)}${metric("Ability Δ", formatSigned(delta.abilityDelta), delta.abilityDelta == null)}</div>`;
}
function evidenceExplanation(match) {
  if (!match) return "";
  const rate = observedPercent(match.observedWinRate);
  const avg = match.averageBanners == null ? "" : ` · avg ${number.format(Math.round(Number(match.averageBanners) * 10) / 10)} banners`;
  const sources = Array.isArray(match.evidenceSources) && match.evidenceSources.length ? ` · ${match.evidenceSources.join(" + ")}` : "";
  return `<section class="gac-inspector-block is-evidence"><h6>Historical provenance</h6><strong>${escapeHtml(match.reliability?.label || "Historical sample")}</strong><p>${number.format(Number(match.wins || 0))}/${number.format(Number(match.battles || 0))} observed wins${rate == null ? "" : ` (${number.format(rate)}%)`}${avg} · ${number.format(Number(match.holds || 0))} holds · ${number.format(Number(match.draws || 0))} draws${escapeHtml(sources)}</p><small>Observed results only · not a predicted win rate.</small></section>`;
}
function heuristicExplanation(match) {
  if (!match) return "";
  const risks = Array.isArray(match.riskFlags) && match.riskFlags.length ? match.riskFlags.join(" · ") : "No elevated heuristic risk flag";
  return `<section class="gac-inspector-block"><h6>Roster-fit basis</h6><strong>${escapeHtml(match.confidence || "Roster-fit heuristic")} · Fit ${number.format(Number(match.score || 0))}</strong><p>${escapeHtml(risks)}</p><small>Heuristic fit is not a win probability.</small></section>`;
}
function readinessExplanation(primary) {
  const readiness = squadAbilityReadiness(primary);
  const concerns = abilityConcerns(primary, 5);
  const coverage = readiness?.known ? `${number.format(Math.round(Number(readiness.coverage || 0) * 100))}% roster ability coverage` : "Ability readiness unresolved";
  const concernText = concerns.length
    ? concerns.map((row) => `${row.name}: ${row.lowTierAbilities} low-tier · readiness ${row.score}`).join(" · ")
    : readiness?.known ? "No low-tier purchased-ability concern detected." : "No authoritative ability profile available.";
  return `<section class="gac-inspector-block"><h6>Ability readiness</h6><strong>${readiness?.known ? `Squad readiness ${number.format(Number(readiness.score || 0))} · ${coverage}` : coverage}</strong><p>${escapeHtml(concernText)}</p><small>Readiness is a roster heuristic, not a claimed Zeta/Omicron requirement for this counter.</small></section>`;
}
function datacronExplanation(primary, card, context, eligibility) {
  const id = clean(card?.dataset?.recommendedDatacronId);
  if (!id) return `<section class="gac-inspector-block"><h6>Datacron</h6><strong>No authoritative owned Datacron selected</strong><p>Counter explanation does not invent Datacron value when no selected loadout is present.</p></section>`;
  const datacron = (Array.isArray(context.mineRoster?.datacrons) ? context.mineRoster.datacrons : []).find((entry) => clean(entry?.id) === id);
  if (!datacron || !eligibility) return `<section class="gac-inspector-block"><h6>Datacron</h6><strong>Selected Datacron ${escapeHtml(id)}</strong><p>Detailed eligibility coverage is unresolved.</p></section>`;
  const coverage = squadCoverage(datacron, primary, eligibility.unitIndex, eligibility.datacronCatalog);
  const label = datacronLabel(datacron, eligibility.datacronCatalog);
  const memberText = coverage.known ? `${coverage.eligibleMembers}/${coverage.squadSize} members receive ≥1 unlocked ability target` : `${coverage.eligibleMembers}/${coverage.squadSize} confirmed · ${coverage.unknownMembers} unresolved`;
  return `<section class="gac-inspector-block"><h6>Datacron</h6><strong>${escapeHtml(label)} · ${escapeHtml(memberText)}</strong><p>${coverage.leaderEligible === true ? "Leader receives a resolved ability target." : coverage.leaderEligible === false ? "Leader does not receive a resolved ability target." : "Leader eligibility unresolved."}</p><small>Eligibility/target evidence only · no arbitrary Datacron power multiplier.</small></section>`;
}
function alternateCard(alternate, defenders) {
  const evidence = alternate.source === "historical-counter-evidence";
  const rate = alternate.observedWinRate == null ? null : observedPercent(alternate.observedWinRate);
  const title = evidence
    ? `${alternate.reliability?.label || "Historical alternate"} · ${number.format(Number(alternate.wins || 0))}/${number.format(Number(alternate.battles || 0))} wins${rate == null ? "" : ` (${number.format(rate)}%)`}`
    : `${alternate.confidence || "Roster-fit alternate"} · Fit ${number.format(Number(alternate.score || 0))}`;
  const risks = !evidence && alternate.riskFlags?.length ? `<small>${escapeHtml(alternate.riskFlags.join(" · "))}</small>` : "";
  return `<article class="gac-inspector-alternate" data-source="${evidence ? "evidence" : "heuristic"}"><header><span>${evidence ? "EXACT HISTORICAL ALTERNATE" : "ROSTER-FIT ALTERNATE"}</span><strong>${escapeHtml(title)}</strong></header><div class="gac-inspector-units">${alternate.squad.map(portrait).join("")}</div>${matchupMetrics(alternate.squad, defenders)}${risks}<small>Recovery-safe: does not reuse the primary squad or another displayed alternate.</small></article>`;
}
function inspectorShell(card) {
  let details = card.querySelector(".gac-counter-inspector");
  if (details) return details;
  details = document.createElement("details");
  details.className = "gac-counter-inspector";
  details.innerHTML = `<summary><span>WHY THIS COUNTER?</span><strong>Evidence · roster fit · risk · alternates</strong></summary><div class="gac-counter-inspector-body"><div class="workspace-note">Loading explanation…</div></div>`;
  const warRoom = card.querySelector(".gac-war-room");
  if (warRoom) warRoom.insertAdjacentElement("beforebegin", details);
  else card.append(details);
  return details;
}
function renderCard(card, context, evidenceByLeader, eligibility, recommendations) {
  const details = inspectorShell(card);
  const body = details.querySelector(".gac-counter-inspector-body");
  const defenseId = Number(card?.dataset?.defenseId || 0);
  const defense = context.enemyDefenses.find((entry) => Number(entry?.id) === defenseId);
  const primaryIds = clean(card?.dataset?.recommendedAttackerMembers).split(",").map(normalizeBaseId).filter(Boolean);
  if (!defense || !primaryIds.length) {
    body.innerHTML = `<div class="workspace-note">No authoritative current counter is available for this defense yet.</div>`;
    return;
  }
  const primary = unitsForIds(context.mineRoster, primaryIds);
  const defenders = unitsForIds(context.opponentRoster, defense.members || []);
  const leader = normalizeBaseId(defense?.leaderBaseId || defense?.members?.[0]);
  const evidenceEntry = evidenceByLeader.get(leader) || null;
  const evidenceMatch = primaryEvidenceMatch(context.mineRoster, defense, evidenceEntry, primaryIds, { size: context.identity.size });
  const heuristicMatch = evidenceMatch || !defenders.length ? null : primaryHeuristicMatch(context.mineRoster, defenders, primaryIds, { size: context.identity.size });
  const source = primarySourceLabel(evidenceMatch, heuristicMatch);
  const allocationReason = clean(card.querySelector(".gac-board-strategy strong")?.textContent) || "Authoritative board-wide allocation";
  const exclusions = alternateExclusions({
    ownDefenses: context.ownDefenses,
    assignments: context.assignments,
    cardRecommendations: recommendations,
    defenseId,
    primaryIds,
  });
  const alternates = defenders.length ? recoveryAlternates(context.mineRoster, defenders, defense, evidenceEntry, {
    size: context.identity.size,
    excludeBaseIds: exclusions,
    limit: 3,
  }) : [];
  const primaryBlock = `<section class="gac-inspector-primary"><div class="gac-inspector-source"><span>${escapeHtml(source)}</span><strong>${escapeHtml(allocationReason)}</strong></div><div class="gac-inspector-units">${primary.map(portrait).join("")}</div>${matchupMetrics(primary, defenders)}</section>`;
  const evidenceBlock = evidenceExplanation(evidenceMatch);
  const heuristicBlock = evidenceMatch ? "" : heuristicExplanation(heuristicMatch);
  const scarcityBlock = `<section class="gac-inspector-block"><h6>Board-wide scarcity decision</h6><strong>${escapeHtml(allocationReason)}</strong><p>Alternates below exclude your saved defense, consumed/planned attacks, other current War Room recommendations, the primary squad, and each other.</p></section>`;
  const alternateBlock = `<section class="gac-inspector-alternates"><div><span>RECOVERY ALTERNATES</span><strong>${alternates.length ? `${alternates.length} non-overlapping option${alternates.length === 1 ? "" : "s"}` : "No recovery-safe alternate remained"}</strong></div>${alternates.length ? alternates.map((alternate) => alternateCard(alternate, defenders)).join("") : `<div class="workspace-note">No additional non-overlapping evidence-backed or roster-fit squad remained after current resource protections.</div>`}</section>`;
  body.innerHTML = `${primaryBlock}<div class="gac-inspector-grid">${evidenceBlock}${heuristicBlock}${readinessExplanation(primary)}${datacronExplanation(primary, card, context, eligibility)}${scarcityBlock}</div>${alternateBlock}<div class="gac-inspector-truth">Inspector is read-only. It explains the current authoritative War Room recommendation and never changes or locks the attack squad.</div>`;
}
async function refresh(options = {}) {
  const identity = contextIdentity();
  const cards = [...document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")];
  if (!identity || !cards.length) return;
  const requestId = ++state.requestId;
  try {
    const context = await loadContext(identity, options.forceContext === true);
    const [evidenceByLeader, eligibility] = await Promise.all([
      loadEvidence(context, options.forceEvidence === true),
      loadEligibilityContext().catch(() => null),
    ]);
    if (requestId !== state.requestId) return;
    const recommendations = cardRecommendations();
    for (const card of cards) renderCard(card, context, evidenceByLeader, eligibility, recommendations);
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (![401, 409].includes(Number(error?.status))) console.warn("GAC counter inspector unavailable", error);
  }
}
function schedule(delay = 180, options = {}) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(options), Math.max(0, delay));
}
function invalidateContext() {
  state.key = "";
  state.context = null;
}
function invalidateEvidence() {
  state.evidenceKey = "";
  state.evidenceByLeader = new Map();
}
function injectStylesheet() {
  if (document.querySelector('link[data-gac-counter-inspector="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-war-room-counter-inspector.css?v=20260820-gacinspect1";
  link.dataset.gacCounterInspector = "true";
  document.head.append(link);
}
function bind() {
  if (document.documentElement.dataset.gacCounterInspectorBound === "true") return;
  document.documentElement.dataset.gacCounterInspectorBound = "true";
  injectStylesheet();
  window.addEventListener("gac-saved-board-rendered", () => schedule(320));
  window.addEventListener("gac-war-room-updated", () => {
    invalidateContext();
    schedule(240, { forceContext: true });
  });
  window.addEventListener("gac-board-evidence-updated", () => {
    invalidateContext();
    invalidateEvidence();
    schedule(260, { forceContext: true, forceEvidence: true });
  });
  window.addEventListener("gac-verified-battle-archived", () => {
    invalidateEvidence();
    schedule(220, { forceEvidence: true });
  });
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacOpponentCode", "gacBracketRound", "gacMode"].includes(event.target?.id)) {
      invalidateContext();
      invalidateEvidence();
      schedule(280, { forceContext: true, forceEvidence: true });
    }
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bind();
  document.addEventListener("DOMContentLoaded", () => schedule(420), { once: true });
  schedule(600);
}

export {
  batchEvidenceKey,
  cardRecommendations,
  contextIdentity,
  evidenceMapFromBatch,
  loadContext,
  loadEvidence,
  matchupMetrics,
};
