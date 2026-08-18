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

function setLine(sets = {}) {
  const entries = Object.entries(sets).sort((a, b) => Number(b[0]) - Number(a[0]));
  return entries.length ? entries.map(([setId, count]) => `Set ${escapeHtml(setId)} ×${number.format(count)}`).join(" · ") : "No set IDs exposed";
}

function sideCard(body, label, enemy = false) {
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
    <div class="gac-datacron-setline">${escapeHtml(setLine(stats.sets))}</div>
    ${inventoryGrid(body)}
  </article>`;
}

function importantAffixes(item) {
  return (Array.isArray(item?.affixes) ? item.affixes : [])
    .filter((affix, index) => [2, 5, 8].includes(index) || clean(affix?.abilityId))
    .slice(0, 5);
}

function affixLabel(affix, index) {
  const tier = Number.isInteger(Number(affix?.tier)) ? Number(affix.tier) : index + 1;
  const ability = clean(affix?.abilityId);
  const target = clean(affix?.targetRule);
  const statType = Number.isFinite(Number(affix?.statType)) ? Number(affix.statType) : null;
  if (ability) return `L${tier} ability · ${ability}`;
  if (target) return `L${tier} target · ${target}`;
  if (statType !== null) return `L${tier} stat ${statType}`;
  return `L${tier} affix`;
}

function inventoryGrid(body) {
  const value = inventory(body);
  if (!value.known || !value.items.length) return "";
  const strongest = [...value.items]
    .sort((a, b) => n(b.level) - n(a.level) || n(b.rerollCount) - n(a.rerollCount))
    .slice(0, 8);
  return `<div class="gac-datacron-inventory">${strongest.map((item) => {
    const affixes = importantAffixes(item);
    return `<div class="gac-datacron-card">
      <div class="gac-datacron-card-head"><strong>Set ${escapeHtml(item.setId ?? "?")} · L${n(item.level)}</strong><span>${item.locked ? "LOCKED" : "LIVE"}</span></div>
      <small>${item.rerollCount == null ? "Rerolls unknown" : `${number.format(item.rerollCount)} rerolls`} · ${escapeHtml(item.templateId || item.id || "instance ID unavailable")}</small>
      ${affixes.length ? `<div class="gac-datacron-affixes">${affixes.map((affix, index) => `<span class="gac-datacron-affix" title="Raw Comlink/game ID; description not resolved yet">${escapeHtml(affixLabel(affix, index))}</span>`).join("")}</div>` : ""}
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

function render(mine, opponent) {
  const panel = ensurePanel();
  if (!panel) return;
  const known = Array.isArray(mine?.datacrons) && Array.isArray(opponent?.datacrons);
  panel.innerHTML = `
    <div class="gac-datacron-heading">
      <div><div class="kicker">DATACRON INTELLIGENCE</div><h4>Owned Datacrons · Level 3 / 6 / 9</h4><p>Live Comlink instance evidence. Raw target-rule and ability IDs stay unresolved until the game-data catalog layer is connected.</p></div>
      <span class="gac-datacron-truth">${known ? "DETAILS VERIFIED" : "PARTIAL EVIDENCE"}</span>
    </div>
    <div class="gac-datacron-sides">
      ${sideCard(mine, mine?.player?.name || "Your roster")}
      <div class="gac-datacron-vs">VS</div>
      ${sideCard(opponent, opponent?.player?.name || "Opponent", true)}
    </div>
    <div class="gac-datacron-footnote">No combat-value or counter bonus is assigned from raw statType, statValue, targetRule, abilityId, or rerollIndex yet. Those values are preserved as evidence only.</div>`;
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
    const [mine, opponent] = await Promise.all([
      fetchJson(`/api/player/${mineCode}`),
      fetchJson(`/api/player/${opponentCode}`),
    ]);
    if (requestId !== state.requestId) return;
    render(mine, opponent);
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

function ensureBound() { bind(); }
ensureBound();
document.addEventListener("DOMContentLoaded", ensureBound, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureBound, 0));
new MutationObserver(ensureBound).observe(document.documentElement, { childList: true, subtree: true });

export { inventory, summary };
