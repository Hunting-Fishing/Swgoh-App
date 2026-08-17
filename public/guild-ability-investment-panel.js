let snapshot = null;

const number = (value) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? "—"
  : new Intl.NumberFormat().format(Number(value));
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function sourceLabel() {
  const source = String(snapshot?.source || "").toLowerCase();
  if (source === "canonical" || source === "persisted") return "PERSISTED CANONICAL";
  if (source === "live") return "LIVE COMLINK";
  return source ? source.toUpperCase() : "GUILD DATA";
}

function metric(label, value, note = "") {
  return `<div class="guild-page-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(number(value))}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
}

function leaderboard(key, limit = 8) {
  return [...(snapshot?.members || [])]
    .filter((member) => member?.[key] !== null && member?.[key] !== undefined && Number(member[key]) > 0)
    .sort((a, b) => Number(b[key]) - Number(a[key]) || Number(b.galacticPower || 0) - Number(a.galacticPower || 0) || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, limit);
}

function leaderboardHtml(title, key, suffix) {
  const rows = leaderboard(key);
  if (!rows.length) return `<section class="guild-page-card"><div class="kicker">${escapeHtml(title)}</div><div class="workspace-note">No classified values available from this source yet.</div></section>`;
  return `
    <section class="guild-page-card">
      <div class="kicker">${escapeHtml(title)}</div>
      <div class="guild-change-list">
        ${rows.map((member, index) => `<div class="guild-change gp"><strong>#${index + 1} ${escapeHtml(member.name || member.allyCode || member.id)}</strong><span>${escapeHtml(number(member[key]))} ${escapeHtml(suffix)}</span><small>${escapeHtml(number(member.galacticPower))} GP</small></div>`).join("")}
      </div>
    </section>`;
}

function render() {
  const panel = document.getElementById("guildAbilityInvestmentPanel");
  if (!panel) return;
  if (!snapshot) {
    panel.innerHTML = '<div class="kicker">ABILITY INVESTMENT</div><h2>Guild Ability Command</h2><div class="workspace-note">Load a Guild roster to analyze ability investment.</div>';
    return;
  }

  const summary = snapshot.summary || {};
  const omegaKnown = summary.omegaUpgrades !== null && summary.omegaUpgrades !== undefined;
  panel.innerHTML = `
    <div class="database-heading">
      <div>
        <div class="kicker">ABILITY INVESTMENT · ${escapeHtml(sourceLabel())}</div>
        <h2>Guild Ability Command</h2>
        <p>Current Guild-wide ability investment from the same complete 50-member roster used by Guild Command. Unknown upgrade evidence stays unknown instead of being displayed as zero.</p>
      </div>
      <div class="status ${snapshot.hydration?.complete ? "ready" : "warn"}">${escapeHtml(number(snapshot.summary?.hydratedMembers))}/${escapeHtml(number(snapshot.summary?.totalMembers))} members</div>
    </div>
    <div class="guild-page-stat-grid">
      ${metric("Zetas", summary.zetas, "classified across current roster")}
      ${metric("Omicrons", summary.omicrons, "classified across current roster")}
      ${metric("GL Ultimates", summary.ultimates, "unlocked")}
      ${omegaKnown ? metric("Omega / Eta", summary.omegaUpgrades, "classified") : '<div class="guild-page-stat"><span>Omega / Eta</span><strong>—</strong><small>ship ability mapping not yet authoritative</small></div>'}
      ${metric("Galactic Legends", summary.galacticLegends)}
      ${metric("R7+ Characters", summary.relic7Characters)}
      ${metric("R9 Characters", summary.relic9Characters)}
      ${metric("7★ Ships", summary.sevenStarShips)}
    </div>
    <div class="guild-page-two-col">
      ${leaderboardHtml("OMICRON LEADERS", "omicronCount", "Omicrons")}
      ${leaderboardHtml("ZETA LEADERS", "zetaCount", "Zetas")}
    </div>`;
}

function build() {
  const guildPanel = document.querySelector('[data-workspace-panel="guild"]');
  if (!guildPanel || document.getElementById("guildAbilityInvestmentPanel")) return false;
  const section = document.createElement("section");
  section.id = "guildAbilityInvestmentPanel";
  section.className = "card workspace-intro";
  const history = document.getElementById("guildHistoryPanel");
  if (history) guildPanel.insertBefore(section, history);
  else guildPanel.appendChild(section);
  render();
  return true;
}

window.addEventListener("swgoh:guild-command-snapshot", (event) => {
  snapshot = event?.detail || null;
  if (!build()) render();
});

if (!build()) {
  const observer = new MutationObserver(() => {
    if (build()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
