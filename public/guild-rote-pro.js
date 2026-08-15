import { planGuildRoteAssignments } from "./guild-rote-planner.js";

const state = {
  allyCode: "",
  guild: null,
  operations: null,
  plan: null,
  shown: 200,
  loading: false,
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "N/A";

function requirementLabel(row) {
  return row.unitType === "Ship" ? `${Number(row.requiredRarity || 0)}★` : `R${Number(row.requiredRelic || 0)}`;
}

function stat(label, value, extra = "") {
  return `<div class="pro-summary-stat${extra ? ` ${extra}` : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function setupPanel() {
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel || panel.dataset.guildRoteReady === "true") return Boolean(panel);
  panel.dataset.guildRoteReady = "true";
  panel.innerHTML = `
    <section class="card workspace-intro pro-command-shell">
      <div class="pro-command-header">
        <div>
          <div class="kicker">GUILD OPERATIONS · RISE OF THE EMPIRE</div>
          <h2>Guild ROTE Operations Command</h2>
          <p>Build an officer-ready assignment draft from the current public guild roster and versioned ROTE Operation requirements. The planner prioritizes scarce coverage, prevents the same owned unit being assigned twice in one phase, and caps a member at 10 Operation contributions per territory.</p>
        </div>
        <div id="guildRoteStatus" class="status">Load an Ally Code</div>
      </div>
      <div class="pro-reference-line">Assignments are a deterministic planning draft from public roster progression, not a record of in-game deployments. Officers should preserve units needed for Combat/Special Missions before publishing assignments.</div>
      <div class="guild-rote-toolbar">
        <label>Phase
          <select id="guildRotePhase"><option value="All">All phases</option></select>
        </label>
        <label>View
          <select id="guildRoteView">
            <option value="assignments">Assignment Draft</option>
            <option value="unfilled">Unfilled Slots</option>
            <option value="scarcity">Scarcity</option>
            <option value="members">Member Load</option>
          </select>
        </label>
        <label>Search
          <input id="guildRoteSearch" placeholder="Unit, member, territory…">
        </label>
        <button id="guildRoteRefresh" type="button">Refresh Guild</button>
        <button id="guildRoteCopy" type="button">Copy Assignments TSV</button>
      </div>
    </section>
    <section class="card workspace-intro">
      <div id="guildRoteSummary" class="pro-summary-grid"></div>
      <div id="guildRoteHydration" class="workspace-note"></div>
      <div id="guildRotePhases" class="pro-phase-grid"></div>
    </section>
    <section class="card workspace-intro">
      <div id="guildRoteCritical"></div>
    </section>
    <section class="card workspace-intro">
      <div id="guildRoteOutput"></div>
      <button id="guildRoteMore" class="catalog-more hidden" type="button">Show More</button>
    </section>
  `;

  $("guildRotePhase")?.addEventListener("change", () => { state.shown = 200; renderTable(); });
  $("guildRoteView")?.addEventListener("change", () => { state.shown = 200; renderTable(); });
  $("guildRoteSearch")?.addEventListener("input", () => { state.shown = 200; renderTable(); });
  $("guildRoteRefresh")?.addEventListener("click", () => loadGuildRote(true));
  $("guildRoteCopy")?.addEventListener("click", copyAssignments);
  $("guildRoteMore")?.addEventListener("click", () => { state.shown += 200; renderTable(); });

  document.querySelector('[data-workspace-tab="guild"]')?.addEventListener("click", () => loadGuildRote(false));
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.guild = null;
    state.plan = null;
    state.shown = 200;
    setTimeout(() => {
      if (location.hash === "#guild") loadGuildRote(true);
    }, 400);
  });
  if (location.hash === "#guild") loadGuildRote(false);
  return true;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadGuildRote(force = false) {
  const allyCode = digits($("allyCode")?.value);
  const status = $("guildRoteStatus");
  if (!status) return;
  if (allyCode.length !== 9) {
    status.textContent = "Load an Ally Code";
    status.className = "status warning";
    $("guildRoteOutput").innerHTML = '<div class="workspace-note">Enter a 9-digit Ally Code, then open Guild / TB / TW.</div>';
    return;
  }
  if (state.loading) return;
  if (!force && state.allyCode === allyCode && state.plan) {
    renderAll();
    return;
  }

  state.loading = true;
  status.textContent = "Hydrating guild roster…";
  status.className = "status";
  if ($("guildRoteRefresh")) $("guildRoteRefresh").disabled = true;
  try {
    const [guild, operations] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`),
      state.operations && !force ? Promise.resolve(state.operations) : fetchJson("/api/rote/operations"),
    ]);
    if (!Array.isArray(operations?.slots) || !operations.slots.length) throw new Error("ROTE Operation slot definitions are unavailable.");
    state.allyCode = allyCode;
    state.guild = guild;
    state.operations = operations;
    state.plan = planGuildRoteAssignments(guild, operations, { maxPerTerritory: 10 });
    state.shown = 200;
    status.textContent = guild?.hydration?.complete ? "Guild roster ready" : "Partial guild roster";
    status.className = guild?.hydration?.complete ? "status ready" : "status warning";
    renderAll();
  } catch (error) {
    status.textContent = "Guild ROTE unavailable";
    status.className = "status danger";
    $("guildRoteOutput").innerHTML = `<div class="workspace-error">${escapeHtml(error.message || "Guild ROTE data could not be loaded.")}</div>`;
  } finally {
    state.loading = false;
    if ($("guildRoteRefresh")) $("guildRoteRefresh").disabled = false;
  }
}

function renderAll() {
  if (!state.plan || !state.guild) return;
  const guild = state.guild.guild || {};
  const hydration = state.guild.hydration || {};
  const plan = state.plan;
  $("guildRoteSummary").innerHTML = [
    stat("Guild", guild.name || "Unknown", "wide"),
    stat("Guild GP", number(guild.galacticPower)),
    stat("Members", `${number(hydration.hydrated || 0)} / ${number(hydration.requested || guild.memberCount || 0)}`),
    stat("ROTE Coverage", `${plan.coveragePercent}%`),
    stat("Assigned Slots", `${number(plan.assignedSlots)} / ${number(plan.totalSlots)}`),
    stat("Unfilled", number(plan.unfilledSlots)),
  ].join("");
  $("guildRoteHydration").innerHTML = hydration.complete
    ? `Public roster hydration complete · ${number(hydration.hydrated)} members · source fetched ${escapeHtml(new Date(state.guild.fetchedAt).toLocaleString())}.`
    : `<strong>Partial roster:</strong> ${number(hydration.hydrated)} of ${number(hydration.requested)} members hydrated; ${number(hydration.failed)} failed. Coverage is conservative until the missing public rosters refresh.`;

  const phaseSelect = $("guildRotePhase");
  const current = phaseSelect.value || "All";
  phaseSelect.innerHTML = '<option value="All">All phases</option>' + plan.phases.map((row) => `<option value="${escapeAttr(row.phase)}">${escapeHtml(row.phase)}</option>`).join("");
  phaseSelect.value = plan.phases.some((row) => row.phase === current) ? current : "All";

  $("guildRotePhases").innerHTML = plan.phases.map((row) => {
    const pct = row.total ? Math.round((row.assigned / row.total) * 1000) / 10 : 0;
    return `<div class="pro-phase-card"><div><strong>${escapeHtml(row.phase)}</strong><strong>${pct}%</strong></div><small>${number(row.assigned)} assigned · ${number(row.unfilled)} unfilled · ${number(row.total)} slots</small><div class="guild-rote-meter"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div></div>`;
  }).join("");

  renderCritical();
  renderTable();
}

function filteredRows(rows, fields) {
  const phase = $("guildRotePhase")?.value || "All";
  const query = String($("guildRoteSearch")?.value || "").trim().toLowerCase();
  return rows.filter((row) => phase === "All" || row.phase === phase).filter((row) => {
    if (!query) return true;
    return fields(row).join(" ").toLowerCase().includes(query);
  });
}

function renderCritical() {
  const critical = state.plan.scarcity.filter((row) => row.eligibleOwners <= row.demand || row.assigned < row.demand).slice(0, 24);
  if (!critical.length) {
    $("guildRoteCritical").innerHTML = '<div class="kicker">CRITICAL COVERAGE</div><h3>No immediate ownership shortfall detected</h3><p class="workspace-note">The deterministic draft found enough qualifying public owners for every normalized slot. Mission preservation and officer locks can still change the final plan.</p>';
    return;
  }
  $("guildRoteCritical").innerHTML = `
    <div class="kicker">CRITICAL COVERAGE</div><h3>Scarce / unfilled requirements</h3>
    <div class="guild-rote-critical-grid">${critical.map((row) => `<div class="guild-rote-critical"><strong>${escapeHtml(row.name || row.baseId)}</strong><span>${escapeHtml(row.phase)} · ${escapeHtml(requirementLabel(row))}</span><small>${number(row.demand)} demand · ${number(row.eligibleOwners)} eligible owners · ${number(row.assigned)} assigned</small></div>`).join("")}</div>`;
}

function renderTable() {
  const output = $("guildRoteOutput");
  if (!output || !state.plan) return;
  const view = $("guildRoteView")?.value || "assignments";
  let rows = [];
  let html = "";

  if (view === "assignments") {
    rows = filteredRows(state.plan.assignments, (row) => [row.phase, row.conflictId, row.squadId, row.name, row.baseId, row.member?.name, row.member?.allyCode]);
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">OFFICER DRAFT</div><h3>Operation Assignments</h3><p>${number(rows.length)} matching assignments. Scarcity-first draft; no in-game deployment is implied.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Phase</th><th>Territory</th><th>Operation</th><th>Unit</th><th>Req.</th><th>Assigned Member</th><th>Owned</th><th>Eligible Owners</th></tr></thead><tbody>${visible.map((row) => `<tr><td>${escapeHtml(row.phase)}</td><td>${escapeHtml(row.conflictId)}</td><td>${escapeHtml(row.squadId)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td><strong>${escapeHtml(row.member?.name || "")}</strong><small>${row.member?.allyCode ? escapeHtml(String(row.member.allyCode).replace(/(\d{3})(?=\d)/g, "$1-")) : ""}</small></td><td>${row.unitType === "Ship" ? `${number(row.owned?.stars)}★` : `R${number(row.owned?.relic)}`}</td><td>${number(row.eligibleOwners)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (view === "unfilled") {
    rows = filteredRows(state.plan.unfilled, (row) => [row.phase, row.conflictId, row.squadId, row.name, row.baseId]);
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">GAPS</div><h3>Unfilled Operation Slots</h3><p>These slots could not be assigned under current public ownership and contribution constraints.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Phase</th><th>Territory</th><th>Operation</th><th>Unit</th><th>Requirement</th><th>Eligible Owners</th></tr></thead><tbody>${visible.map((row) => `<tr><td>${escapeHtml(row.phase)}</td><td>${escapeHtml(row.conflictId)}</td><td>${escapeHtml(row.squadId)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td><span class="pro-rote-status ${row.eligibleOwners ? "blocked" : "missing"}">${number(row.eligibleOwners)}</span></td></tr>`).join("")}</tbody></table></div>`;
  } else if (view === "scarcity") {
    rows = filteredRows(state.plan.scarcity, (row) => [row.phase, row.name, row.baseId]);
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">SCARCITY</div><h3>Demand vs Qualifying Owners</h3><p>Lowest coverage margin first. This highlights guild farms with the most operational leverage.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Phase</th><th>Unit</th><th>Requirement</th><th>Demand</th><th>Eligible Owners</th><th>Assigned</th><th>Margin</th></tr></thead><tbody>${visible.map((row) => { const margin = row.eligibleOwners - row.demand; return `<tr><td>${escapeHtml(row.phase)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td>${number(row.demand)}</td><td>${number(row.eligibleOwners)}</td><td>${number(row.assigned)}</td><td><span class="pro-rote-status ${margin < 0 ? "missing" : margin <= 1 ? "partial" : "ready"}">${margin >= 0 ? "+" : ""}${number(margin)}</span></td></tr>`; }).join("")}</tbody></table></div>`;
  } else {
    const phase = $("guildRotePhase")?.value || "All";
    const query = String($("guildRoteSearch")?.value || "").trim().toLowerCase();
    rows = state.plan.memberLoads.filter((row) => {
      if (phase !== "All" && !row.phases?.[phase]) return false;
      if (!query) return true;
      return [row.name, row.allyCode, row.playerId].join(" ").toLowerCase().includes(query);
    });
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">MEMBER LOAD</div><h3>Planned Contributions</h3><p>Use this view to keep assignment load visible before officer overrides.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Member</th><th>GP</th><th>Total Assignments</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>P5</th><th>P6</th></tr></thead><tbody>${visible.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${row.allyCode ? escapeHtml(String(row.allyCode).replace(/(\d{3})(?=\d)/g, "$1-")) : ""}</small></td><td>${number(row.galacticPower)}</td><td>${number(row.total)}</td>${[1,2,3,4,5,6].map((phaseNumber) => `<td>${number(row.phases?.[`P${phaseNumber}`] || 0)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  output.innerHTML = html || '<div class="workspace-note">No rows match the current filters.</div>';
  $("guildRoteMore")?.classList.toggle("hidden", rows.length <= state.shown);
}

async function copyAssignments() {
  if (!state.plan) return;
  const rows = filteredRows(state.plan.assignments, (row) => [row.phase, row.conflictId, row.squadId, row.name, row.baseId, row.member?.name]);
  const lines = [
    ["Phase", "Territory", "Operation", "Slot", "Unit", "Base ID", "Requirement", "Member", "Ally Code"].join("\t"),
    ...rows.map((row) => [row.phase, row.conflictId, row.squadId, row.slot, row.name || row.baseId, row.baseId, requirementLabel(row), row.member?.name || "", row.member?.allyCode || ""].join("\t")),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    const button = $("guildRoteCopy");
    if (button) {
      const original = button.textContent;
      button.textContent = `Copied ${rows.length}`;
      setTimeout(() => { button.textContent = original; }, 1400);
    }
  } catch {
    const output = $("guildRoteOutput");
    if (output) output.insertAdjacentHTML("afterbegin", '<div class="workspace-error">Clipboard access was blocked by the browser.</div>');
  }
}

if (!setupPanel()) {
  const observer = new MutationObserver(() => {
    if (setupPanel()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
