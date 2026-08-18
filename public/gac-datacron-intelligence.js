import "./gac-datacron-counter-eligibility.js";
import { loadDatacronCatalog, resolveAffix, resolveDatacron } from "./gac-datacron-catalog.js";

const number = new Intl.NumberFormat("en-US");
const state = { requestId: 0 };

function byId(id) { return document.getElementById(id); }
function code(value) { return String(value || "").replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function clean(value) { return String(value ?? "").trim(); }
function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

function inventory(body) {
  if (!Array.isArray(body?.datacrons)) return { known: false, items: [] };
  return {
    known: true,
    items: body.datacrons.map((item) => ({
      id: clean(item?.id),
      setId: item?.setId ?? null,
      templateId: clean(item?.templateId),
      level: Number.isInteger(Number(item?.level)) ? Number(item.level) : (Array.isArray(item?.affixes) ? item.affixes.length : 0),
      locked: item?.locked === true,
      rerollCount: Number.isFinite(Number(item?.rerollCount)) ? Number(item.rerollCount) : null,
      affixes: Array.isArray(item?.affixes) ? item.affixes : [],
    })),
  };
}

function summary(body) {
  const value = inventory(body);
  if (!value.known) return { known: false };
  const affixes = value.items.flatMap((item) => item.affixes);
  const sets = {};
  for (const item of value.items) {
    const key = clean(item.setId);
    if (key) sets[key] = (sets[key] || 0) + 1;
  }
  return {
    known: true,
    count: value.items.length,
    maxLevel: value.items.reduce((max, item) => Math.max(max, n(item.level)), 0),
    l3: value.items.filter((item) => n(item.level) >= 3).length,
    l6: value.items.filter((item) => n(item.level) >= 6).length,
    l9: value.items.filter((item) => n(item.level) >= 9).length,
    rerolled: value.items.filter((item) => n(item.rerollCount) > 0).length,
    abilityAffixes: affixes.filter((affix) => clean(affix?.abilityId)).length,
    sets,
  };
}

function metric(label, value) {
  return `<div class="gac-datacron-metric"><span>${escapeHtml(label)}</span><strong>${value == null ? "N/A" : number.format(value)}</strong></div>`;
}

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function setLine(sets = {}, catalog = null) {
  const entries = Object.entries(sets).sort((a, b) => Number(b[0]) - Number(a[0]));
  if (!entries.length) return "No set IDs exposed";
  return entries.map(([setId, count]) => {
    const resolved = catalog?.sets?.get(String(setId));
    const title = resolved?.displayName || `Set ${setId}`;
    const expiry = dateLabel(resolved?.expirationTime);
    return `${title} ×${number.format(count)}${expiry ? ` · expires ${expiry}` : ""}`;
  }).join(" · ");
}

function sideCard(body, label, enemy = false, catalog = null) {
  const stats = summary(body);
  if (!stats.known) {
    return `<article class="gac-datacron-side ${enemy ? "enemy" : ""}"><strong>${escapeHtml(label)}</strong><div class="gac-datacron-unknown">Detailed datacron inventory is not exposed by this live roster response. No zero-value assumption is used.</div></article>`;
  }
  return `<article class="gac-datacron-side ${enemy ? "enemy" : ""}">
    <strong>${escapeHtml(label)}</strong>
    <div class="gac-datacron-metrics">
      ${metric("Total", stats.count)}
      ${metric("Max level", stats.maxLevel)}
      ${metric("Level 3+", stats.l3)}
      ${metric("Level 6+", stats.l6)}
      ${metric("Level 9+", stats.l9)}
      ${metric("Rerolled", stats.rerolled)}
      ${metric("Ability affixes", stats.abilityAffixes)}
    </div>
    <div class="gac-datacron-setline">${escapeHtml(setLine(stats.sets, catalog))}</div>
    ${inventoryGrid(body, catalog)}
  </article>`;
}

function importantAffixes(item) {
  return (Array.isArray(item?.affixes) ? item.affixes : [])
    .filter((affix, index) => [2, 5, 8].includes(index) || clean(affix?.abilityId))
    .slice(0, 5);
}

function meaningfulTargetLabels(targetRule) {
  if (!targetRule) return [];
  const ignored = new Set(["Targeting Sets Exclude", "Any Obtainable"]);
  return (targetRule.includeLabels || []).filter((label) => label && !ignored.has(label));
}

function affixLabel(affix, index, catalog = null) {
  const tier = Number.isInteger(Number(affix?.tier)) ? Number(affix.tier) : index + 1;
  const ability = clean(affix?.abilityId);
  const target = clean(affix?.targetRule);
  const statType = Number.isFinite(Number(affix?.statType)) ? Number(affix.statType) : null;
  const resolved = catalog ? resolveAffix(affix, catalog) : null;
  const targetLabels = meaningfulTargetLabels(resolved?.targetRule);
  const eligibility = targetLabels.length ? targetLabels.join(" + ") : "";

  if (ability) {
    const scope = eligibility || resolved?.scopeLabel || (target ? target : "eligible units");
    return `L${tier} · ${scope} · ability ${ability}`;
  }
  if (resolved?.scopeLabel) {
    return `L${tier} · ${resolved.scopeLabel}${eligibility ? ` · ${eligibility}` : ""}`;
  }
  if (target) return `L${tier} · ${eligibility || target}`;
  if (statType !== null) return `L${tier} · stat ${statType}`;
  return `L${tier} affix`;
}

function datacronTitle(item, catalog = null) {
  const resolved = catalog ? resolveDatacron(item, catalog) : null;
  const setName = resolved?.set?.displayName || `Set ${item.setId ?? "?"}`;
  return `${setName} · L${n(item.level)}`;
}

function datacronMeta(item, catalog = null) {
  const resolved = catalog ? resolveDatacron(item, catalog) : null;
  const parts = [item.rerollCount == null ? "Rerolls unknown" : `${number.format(item.rerollCount)} rerolls`];
  const expiry = dateLabel(resolved?.set?.expirationTime);
  if (expiry) parts.push(`expires ${expiry}`);
  if (resolved?.template?.requiredRelicTier != null) parts.push(`template R${number.format(resolved.template.requiredRelicTier)} gate`);
  parts.push(item.templateId || item.id || "instance ID unavailable");
  return parts.join(" · ");
}

function inventoryGrid(body, catalog = null) {
  const value = inventory(body);
  if (!value.known || !value.items.length) return "";
  const strongest = [...value.items]
    .sort((a, b) => n(b.level) - n(a.level) || n(b.rerollCount) - n(a.rerollCount))
    .slice(0, 8);
  return `<div class="gac-datacron-inventory">${strongest.map((item) => {
    const affixes = importantAffixes(item);
    return `<div class="gac-datacron-card">
      <div class="gac-datacron-card-head"><strong>${escapeHtml(datacronTitle(item, catalog))}</strong><span>${item.locked ? "LOCKED" : "LIVE"}</span></div>
      <small>${escapeHtml(datacronMeta(item, catalog))}</small>
      ${affixes.length ? `<div class="gac-datacron-affixes">${affixes.map((affix, index) => `<span class="gac-datacron-affix" title="${escapeHtml(catalog ? "Resolved from current public game-data where exact; raw ability ID retained because ability prose is not yet resolved." : "Raw Comlink/game ID; catalog unavailable.")}">${escapeHtml(affixLabel(affix, index, catalog))}</span>`).join("")}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function ensurePanel() {
  const comparison = byId("gacComparison");
  if (!comparison) return null;
  let panel = byId("gacDatacronIntelligence");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "gacDatacronIntelligence";
    panel.className = "gac-datacron-panel";
    comparison.insertAdjacentElement("afterend", panel);
  }
  return panel;
}

function renderLoading() {
  const panel = ensurePanel();
  if (!panel) return;
  panel.innerHTML = `<div class="gac-datacron-heading"><div><div class="kicker">DATACRON INTELLIGENCE</div><h4>Loading live inventories…</h4></div><span class="gac-datacron-truth">RAW LIVE EVIDENCE</span></div>`;
}

function catalogVersionLabel(catalog) {
  if (!catalog) return "CATALOG OFFLINE";
  const version = Object.values(catalog.versions || {}).find(Boolean);
  if (!version) return catalog.versionAligned ? "CATALOG LOADED" : "CATALOG PARTIAL";
  return catalog.versionAligned ? `CATALOG ${version.split(":")[0]}` : "CATALOG VERSION MISMATCH";
}

function render(mine, opponent, catalog = null) {
  const panel = ensurePanel();
  if (!panel) return;
  const known = Array.isArray(mine?.datacrons) && Array.isArray(opponent?.datacrons);
  panel.innerHTML = `
    <div class="gac-datacron-heading">
      <div><div class="kicker">DATACRON INTELLIGENCE</div><h4>Owned Datacrons · Level 3 / 6 / 9</h4><p>Live Comlink instances plus shared public game-data. Eligibility and stat scope resolve only when an exact catalog match exists; raw ability IDs remain visible until bonus prose/mechanics are proven.</p></div>
      <span class="gac-datacron-truth">${known ? "DETAILS VERIFIED" : "PARTIAL EVIDENCE"} · ${escapeHtml(catalogVersionLabel(catalog))}</span>
    </div>
    <div class="gac-datacron-sides">
      ${sideCard(mine, mine?.player?.name || "Your roster", false, catalog)}
      <div class="gac-datacron-vs">VS</div>
      ${sideCard(opponent, opponent?.player?.name || "Opponent", true, catalog)}
    </div>
    <div class="gac-datacron-footnote">Set metadata, scope icons and target eligibility are resolved from the versioned public game-data catalog when available. No combat-value or counter bonus is assigned from abilityId, targetRule, statValue or rerollIndex yet.</div>`;
}

function renderError(message) {
  const panel = ensurePanel();
  if (!panel) return;
  panel.innerHTML = `<div class="gac-datacron-heading"><div><div class="kicker">DATACRON INTELLIGENCE</div><h4>Live detail unavailable</h4><p>${escapeHtml(message)}</p></div><span class="gac-datacron-truth">NO GUESSING</span></div>`;
}

async function refresh() {
  const mineCode = code(byId("allyCode")?.value);
  const opponentCode = code(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(mineCode) || !/^\d{9}$/.test(opponentCode)) return;
  const requestId = ++state.requestId;
  renderLoading();
  try {
    const catalogPromise = loadDatacronCatalog().catch(() => null);
    const [mine, opponent, catalog] = await Promise.all([
      fetchJson(`/api/player/${mineCode}`),
      fetchJson(`/api/player/${opponentCode}`),
      catalogPromise,
    ]);
    if (requestId !== state.requestId) return;
    render(mine, opponent, catalog);
  } catch (error) {
    if (requestId !== state.requestId) return;
    renderError(error?.message || "Detailed datacron inventory could not be loaded.");
  }
}

function bind() {
  const form = byId("gacMatchupForm");
  if (!form || form.dataset.datacronBound === "true") return false;
  form.dataset.datacronBound = "true";
  form.addEventListener("submit", () => void refresh());
  return true;
}

function updateLegacyWarning() {
  const warning = byId("gacCommandCenterPro")?.querySelector(".gac-warning");
  if (!warning || warning.dataset.datacronUpdated === "true") return;
  warning.dataset.datacronUpdated = "true";
  warning.textContent = "Historical win rates are shown only when imported evidence exists. Roster-fit suggestions remain explicitly labeled as heuristics. Public live datacron instances can be enriched with exact set/stat/eligibility catalog matches, but raw ability IDs are not converted into counter strength until their mechanics are resolved.";
}

function ensureBound() {
  bind();
  updateLegacyWarning();
}
ensureBound();
document.addEventListener("DOMContentLoaded", ensureBound, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureBound, 0));
new MutationObserver(ensureBound).observe(document.documentElement, { childList: true, subtree: true });

export { inventory, summary };
