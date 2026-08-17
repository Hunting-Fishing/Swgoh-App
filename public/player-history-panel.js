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
  return `<div class="pro-summary-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
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

  return labels.length ? labels : (event.changedFields || []).map((field) => String(field));
}

function trendHtml(body) {
  const trend = body?.trend || {};
  if (!trend.comparable) {
    return '<div class="workspace-note">Daily history baseline established. Trend comparison starts after the next UTC daily snapshot; progression events below are already persistent.</div>';
  }
  return `
    <div class="pro-summary-grid">
      ${stat("GP Change", signed(trend.galacticPower), `${formatTime(trend.from)} → ${formatTime(trend.to)}`)}
      ${stat("Character GP", signed(trend.characterPower))}
      ${stat("Ship GP", signed(trend.shipPower))}
      ${stat("R7+ Change", signed(trend.relic7Plus))}
      ${stat("Zetas", signed(trend.zetas))}
      ${stat("Omicrons", signed(trend.omicrons))}
    </div>`;
}

function eventsHtml(events = []) {
  if (!events.length) return '<div class="workspace-note">No player progression events have been recorded since the persistence baseline was established.</div>';
  return `<div class="tracker-list">${events.map((event) => `
    <article class="tracker-card">
      <div class="tracker-heading">
        <div>
          <span class="tracker-label">${escapeHtml(formatTime(event.changedAt))}</span>
          <h3><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(event.baseId)}">${escapeHtml(event.unitName || event.baseId)}</button></h3>
        </div>
        <strong class="tracker-score">${escapeHtml(eventChangeLabels(event).join(" · "))}</strong>
      </div>
      <div class="workspace-note">${escapeHtml(event.eventType || "progression change")} · ${escapeHtml(event.source || "persisted sync")}</div>
    </article>
  `).join("")}</div>`;
}

function render() {
  const panel = $("playerHistoryPanel");
  if (!panel) return;
  if (!state.body) {
    panel.innerHTML = `
      <div class="kicker">PERSISTED HISTORY</div>
      <h2>Player Progression Ledger</h2>
      <div class="workspace-note">Load an Ally Code to view server-persisted progression history.</div>`;
    return;
  }

  const body = state.body;
  const summary = body.summary || {};
  panel.innerHTML = `
    <div class="database-heading">
      <div>
        <div class="kicker">PERSISTED HISTORY</div>
        <h2>Player Progression Ledger</h2>
        <p>Real roster changes captured by the canonical Guild sync survive browsers, devices and sessions. Metadata/classifier churn is excluded.</p>
      </div>
      <div><div class="status ready">${escapeHtml(body.player?.name || body.player?.allyCode || "Player")}</div><button id="playerHistoryRefresh" type="button">Refresh History</button></div>
    </div>
    <div class="pro-summary-grid">
      ${stat("Recorded Events", number(summary.events))}
      ${stat("GP Gained", signed(summary.gpGained))}
      ${stat("Levels Gained", signed(summary.levelsGained))}
      ${stat("Relic Levels", signed(summary.relicLevelsGained))}
      ${stat("Zetas Added", signed(summary.zetasAdded))}
      ${stat("Omicrons Added", signed(summary.omicronsAdded))}
      ${stat("Ultimates", signed(summary.ultimatesAdded))}
    </div>
    ${trendHtml(body)}
    <div class="section-heading"><div><div class="kicker">RECENT CHANGES</div><h3>Unit progression events</h3></div></div>
    ${eventsHtml(body.progression || [])}`;
  $("playerHistoryRefresh")?.addEventListener("click", () => load(true));
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
  const panel = $("playerHistoryPanel");
  if (panel) panel.innerHTML = '<div class="workspace-note">Loading persisted progression history…</div>';
  try {
    const refresh = force ? "&refresh=1" : "";
    const response = await fetch(`/api/player/${allyCode}/history?events=100&snapshots=90${refresh}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `Player history returned HTTP ${response.status}`);
    state.allyCode = allyCode;
    state.body = body;
    state.fetchedAt = Date.now();
    render();
  } catch (error) {
    if (panel) panel.innerHTML = `<div class="workspace-error">${escapeHtml(error?.message || "Player history is unavailable.")}</div>`;
  } finally {
    state.loading = false;
  }
}

function build() {
  const rosterPanel = document.querySelector('[data-workspace-panel="roster"]');
  if (!rosterPanel || $("playerHistoryPanel")) return false;
  const section = document.createElement("section");
  section.id = "playerHistoryPanel";
  section.className = "card workspace-intro";
  rosterPanel.appendChild(section);
  render();

  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.body = null;
    state.fetchedAt = 0;
    setTimeout(() => load(false), 500);
  });
  document.querySelector('button[data-workspace-tab="roster"]')?.addEventListener("click", () => load(false));
  return true;
}

if (!build()) {
  const observer = new MutationObserver(() => {
    if (build()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
