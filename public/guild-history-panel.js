const state = {
  allyCode: "",
  body: null,
  fetchedAt: 0,
  loading: false,
};

const CACHE_MS = 30_000;
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "—";
const signed = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${new Intl.NumberFormat().format(numeric)}`;
};
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function currentAllyCode() {
  return digits($("allyCode")?.value);
}

function formatTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function stat(label, value, detail = "") {
  return `<div class="guild-page-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function eventChangeLabels(event) {
  const labels = [];
  const before = event.previous || {};
  const after = event.current || {};
  const delta = event.delta || {};
  if (Number(delta.omicronCount || 0) > 0) labels.push(`Omicron +${number(delta.omicronCount)}`);
  if (Number(delta.zetaCount || 0) > 0) labels.push(`Zeta +${number(delta.zetaCount)}`);
  if (Number(delta.ultimateUnlocked || 0) > 0) labels.push("Ultimate unlocked");
  if (Number(delta.relicTier || 0) !== 0 && before.relicTier != null && after.relicTier != null) labels.push(`R${number(before.relicTier)} → R${number(after.relicTier)}`);
  if (Number(delta.gearLevel || 0) !== 0 && before.gearLevel != null && after.gearLevel != null) labels.push(`G${number(before.gearLevel)} → G${number(after.gearLevel)}`);
  if (Number(delta.rarity || 0) !== 0 && before.rarity != null && after.rarity != null) labels.push(`${number(before.rarity)}★ → ${number(after.rarity)}★`);
  if (Number(delta.level || 0) !== 0 && before.level != null && after.level != null) labels.push(`Lv ${number(before.level)} → ${number(after.level)}`);
  if (Number(delta.galacticPower || 0) !== 0) labels.push(`${signed(delta.galacticPower)} GP`);
  return labels.length ? labels : (event.changedFields || []).map(String);
}

function trendHtml(body) {
  const trend = body?.trend || {};
  if (!trend.comparable) {
    return '<div class="workspace-note">Daily Guild history baseline established. Trend comparison starts after the next UTC daily snapshot; member progression events are already persistent.</div>';
  }
  return `
    <div class="guild-page-stat-grid">
      ${stat("Guild GP", signed(trend.galacticPower), `${formatTime(trend.from)} → ${formatTime(trend.to)}`)}
      ${stat("Character GP", signed(trend.characterPower))}
      ${stat("Ship GP", signed(trend.shipPower))}
      ${stat("Galactic Legends", signed(trend.galacticLegends))}
      ${stat("R7+", signed(trend.relic7Plus))}
      ${stat("R9", signed(trend.relic9))}
      ${stat("Zetas", signed(trend.zetas))}
      ${stat("Omicrons", signed(trend.omicrons))}
    </div>`;
}

function membershipModel(body) {
  const rows = Array.isArray(body?.membership) ? body.membership : [];
  if (!rows.length) return { baseline: null, events: [] };
  const guildSize = Math.max(1, Number(body?.guild?.memberCount || 0));
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.occurredAt || "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const candidates = [...groups.entries()]
    .filter(([, events]) => events.length >= Math.ceil(guildSize * 0.8) && events.every((event) => String(event.eventType).toLowerCase() === "joined"))
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  const baseline = candidates[0] || null;
  const baselineIds = new Set((baseline?.[1] || []).map((row) => row.id));
  return { baseline, events: rows.filter((row) => !baselineIds.has(row.id)) };
}

function membershipHtml(body) {
  const model = membershipModel(body);
  const rows = [];
  if (model.baseline) {
    rows.push(`<div class="guild-change gp"><strong>BASELINE</strong><span>${number(model.baseline[1].length)} members recorded</span><small>${escapeHtml(formatTime(model.baseline[0]))}</small></div>`);
  }
  for (const event of model.events.slice(0, 30)) {
    const type = String(event.eventType || "change").toUpperCase();
    rows.push(`<div class="guild-change ${type === "JOINED" ? "joined" : type === "LEFT" ? "left" : "renamed"}"><strong>${escapeHtml(type)}</strong><span>${escapeHtml(event.playerName || event.allyCode || event.playerId)}</span><small>${escapeHtml(formatTime(event.occurredAt))}</small></div>`);
  }
  return rows.length ? `<div class="guild-change-list">${rows.join("")}</div>` : '<div class="workspace-note">No persisted membership events yet.</div>';
}

function progressionHtml(events = []) {
  if (!events.length) return '<div class="workspace-note">No persisted Guild progression events yet.</div>';
  return `<div class="guild-change-list">${events.slice(0, 40).map((event) => `
    <div class="guild-change gp">
      <strong>${escapeHtml(eventChangeLabels(event).join(" · "))}</strong>
      <span>${escapeHtml(event.playerName || event.allyCode || "Guild member")} · <button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(event.baseId)}">${escapeHtml(event.unitName || event.baseId)}</button></span>
      <small>${escapeHtml(formatTime(event.changedAt))}</small>
    </div>`).join("")}</div>`;
}

function render() {
  const panel = $("guildHistoryPanel");
  if (!panel) return;
  if (!state.body) {
    panel.innerHTML = '<div class="kicker">PERSISTED GUILD HISTORY</div><h2>Guild Progression Ledger</h2><div class="workspace-note">Load an Ally Code to view shared Guild history.</div>';
    return;
  }

  const body = state.body;
  const summary = body.progressionSummary || {};
  panel.innerHTML = `
    <div class="database-heading">
      <div><div class="kicker">PERSISTED GUILD HISTORY</div><h2>Guild Progression Ledger</h2><p>Shared membership, daily snapshot and real roster-change history from the canonical persistence layer.</p></div>
      <div><div class="status ready">${escapeHtml(body.guild?.name || "Guild")}</div><button id="guildHistoryRefresh" type="button">Refresh History</button></div>
    </div>
    <div class="guild-page-stat-grid">
      ${stat("Progression Events", number(summary.events))}
      ${stat("Members Changed", number(summary.affectedPlayers))}
      ${stat("Units Changed", number(summary.affectedUnits))}
      ${stat("GP Gained", signed(summary.gpGained))}
      ${stat("Relic Levels", signed(summary.relicLevelsGained))}
      ${stat("Zetas Added", signed(summary.zetasAdded))}
      ${stat("Omicrons Added", signed(summary.omicronsAdded))}
      ${stat("Ultimates", signed(summary.ultimatesAdded))}
    </div>
    ${trendHtml(body)}
    <div class="guild-page-two-col">
      <section class="guild-page-card"><div class="kicker">MEMBERSHIP HISTORY</div><h3>Persistent Guild membership</h3>${membershipHtml(body)}</section>
      <section class="guild-page-card"><div class="kicker">ROSTER PROGRESSION</div><h3>Recent verified changes</h3>${progressionHtml(body.progression || [])}</section>
    </div>`;
  $("guildHistoryRefresh")?.addEventListener("click", () => load(true));
}

async function load(force = false) {
  const allyCode = currentAllyCode();
  if (allyCode.length !== 9) {
    state.allyCode = "";
    state.body = null;
    state.fetchedAt = 0;
    render();
    return;
  }
  if (state.loading) return;
  if (!force && state.body && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) {
    render();
    return;
  }

  state.loading = true;
  const panel = $("guildHistoryPanel");
  if (panel) panel.innerHTML = '<div class="workspace-note">Loading persisted Guild history…</div>';
  try {
    const response = await fetch(`/api/guild/by-player/${allyCode}/history?events=200&snapshots=90`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `Guild history returned HTTP ${response.status}`);
    state.allyCode = allyCode;
    state.body = body;
    state.fetchedAt = Date.now();
    render();
  } catch (error) {
    if (panel) panel.innerHTML = `<div class="workspace-error">${escapeHtml(error?.message || "Guild history is unavailable.")}</div>`;
  } finally {
    state.loading = false;
  }
}

function build() {
  const guildPanel = document.querySelector('[data-workspace-panel="guild"]');
  if (!guildPanel || $("guildHistoryPanel")) return false;
  const section = document.createElement("section");
  section.id = "guildHistoryPanel";
  section.className = "card workspace-intro";
  guildPanel.appendChild(section);
  render();

  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.body = null;
    state.fetchedAt = 0;
    setTimeout(() => load(false), 550);
  });
  document.querySelector('button[data-workspace-tab="guild"]')?.addEventListener("click", () => load(false));
  return true;
}

if (!build()) {
  const observer = new MutationObserver(() => {
    if (build()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
