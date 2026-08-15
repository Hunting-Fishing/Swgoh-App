import { planGuildRoteAssignments, unitMeetsRoteSlot } from "./guild-rote-planner.js";

const state = {
  allyCode: "",
  guild: null,
  operations: null,
  plan: null,
  shown: 200,
  loading: false,
  controlSlotId: "",
  officerControls: { locks: [], reservations: [] },
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

function currentProgressionLabel(candidate, row) {
  const current = candidate?.current || {};
  if (row.unitType === "Ship") return `${number(current.stars || 0)}★`;
  if (Number(current.relic || 0) > 0) return `R${number(current.relic)}`;
  return `${number(current.stars || 0)}★ · G${number(current.gear || 0)}`;
}

function gapLabel(candidate) {
  const gap = candidate?.gap || {};
  const parts = [];
  if (Number(gap.stars || 0) > 0) parts.push(`+${number(gap.stars)}★`);
  if (Number(gap.gear || 0) > 0) parts.push(`+${number(gap.gear)} gear tier${Number(gap.gear) === 1 ? "" : "s"}`);
  if (Number(gap.relic || 0) > 0) parts.push(`+${number(gap.relic)} relic level${Number(gap.relic) === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Requirement met";
}

function stat(label, value, extra = "") {
  return `<div class="pro-summary-stat${extra ? ` ${extra}` : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function memberId(member) {
  return String(member?.playerId || member?.allyCode || member?.name || "");
}

function memberById(id) {
  return (state.guild?.members || []).find((member) => memberId(member) === String(id)) || null;
}

function slotById(id) {
  return (state.operations?.slots || []).find((slot) => String(slot.id) === String(id)) || null;
}

function controlsStorageKey() {
  const guildId = String(state.guild?.guild?.id || "").trim();
  return guildId ? `swgoh-roster-command:guild-rote-officer:${guildId}` : "";
}

function loadOfficerControls() {
  state.officerControls = { locks: [], reservations: [] };
  const key = controlsStorageKey();
  if (!key) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    state.officerControls = {
      locks: Array.isArray(parsed?.locks) ? parsed.locks.filter((entry) => entry?.slotId && entry?.memberId) : [],
      reservations: Array.isArray(parsed?.reservations) ? parsed.reservations.filter((entry) => entry?.memberId && entry?.baseId) : [],
    };
  } catch {
    state.officerControls = { locks: [], reservations: [] };
  }
}

function saveOfficerControls() {
  const key = controlsStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state.officerControls));
  } catch {
    // Browser storage is optional. The current plan remains usable in-memory.
  }
}

function recomputePlan() {
  if (!state.guild || !state.operations) return;
  state.plan = planGuildRoteAssignments(state.guild, state.operations, {
    maxPerTerritory: 10,
    locks: state.officerControls.locks,
    reservations: state.officerControls.reservations,
  });
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
      <div class="pro-reference-line">Assignments are a deterministic planning draft from public roster progression, not a record of in-game deployments. Mission reserves and assignment locks on this device are respected before automatic drafting.</div>
      <div class="guild-rote-toolbar">
        <label>Phase
          <select id="guildRotePhase"><option value="All">All phases</option></select>
        </label>
        <label>View
          <select id="guildRoteView">
            <option value="assignments">Assignment Draft</option>
            <option value="unfilled">Unfilled Slots</option>
            <option value="scarcity">Scarcity</option>
            <option value="farms">Farm Priorities</option>
            <option value="members">Member Load</option>
            <option value="controls">Officer Controls</option>
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
    <dialog id="guildRoteControlDialog" class="details guild-rote-control-dialog">
      <button id="guildRoteControlClose" class="close" type="button" aria-label="Close">×</button>
      <div class="kicker">OFFICER CONTROL</div>
      <h2 id="guildRoteControlTitle">Operation Slot</h2>
      <p id="guildRoteControlMeta"></p>
      <label class="guild-rote-control-field">Qualifying Member
        <select id="guildRoteControlMember"></select>
      </label>
      <div class="guild-rote-control-actions">
        <button id="guildRoteLockSelected" type="button">Lock Selected Member</button>
        <button id="guildRoteReserveSelected" type="button">Reserve Unit for Mission</button>
        <button id="guildRoteRemoveLock" type="button">Remove Slot Lock</button>
      </div>
      <p class="workspace-note">Locks and mission reserves are stored only in this browser for this guild. Shared officer plans will require authenticated server storage.</p>
    </dialog>
  `;

  $("guildRotePhase")?.addEventListener("change", () => { state.shown = 200; renderTable(); });
  $("guildRoteView")?.addEventListener("change", () => { state.shown = 200; renderTable(); });
  $("guildRoteSearch")?.addEventListener("input", () => { state.shown = 200; renderTable(); });
  $("guildRoteRefresh")?.addEventListener("click", () => loadGuildRote(true));
  $("guildRoteCopy")?.addEventListener("click", copyAssignments);
  $("guildRoteMore")?.addEventListener("click", () => { state.shown += 200; renderTable(); });
  $("guildRoteControlClose")?.addEventListener("click", () => $("guildRoteControlDialog")?.close());
  $("guildRoteLockSelected")?.addEventListener("click", lockSelectedMember);
  $("guildRoteReserveSelected")?.addEventListener("click", reserveSelectedMember);
  $("guildRoteRemoveLock")?.addEventListener("click", removeCurrentLock);
  $("guildRoteControlDialog")?.addEventListener("click", (event) => {
    if (event.target === $("guildRoteControlDialog")) $("guildRoteControlDialog")?.close();
  });

  document.querySelector('[data-workspace-tab="guild"]')?.addEventListener("click", () => loadGuildRote(false));
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.guild = null;
    state.plan = null;
    state.officerControls = { locks: [], reservations: [] };
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
    const guildChanged = String(state.guild?.guild?.id || "") !== String(guild?.guild?.id || "");
    state.allyCode = allyCode;
    state.guild = guild;
    state.operations = operations;
    if (guildChanged || !state.plan) loadOfficerControls();
    recomputePlan();
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
    stat("Officer Locks", `${number(plan.controls?.appliedLocks || 0)} / ${number(plan.controls?.requestedLocks || 0)}`),
    stat("Mission Reserves", number(plan.controls?.reservations || 0)),
  ].join("");
  $("guildRoteHydration").innerHTML = hydration.complete
    ? `Public roster hydration complete · ${number(hydration.hydrated)} members · source fetched ${escapeHtml(new Date(state.guild.fetchedAt).toLocaleString())}. Officer controls are local to this browser.`
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
  const lockIssues = state.plan.controls?.lockIssues || [];
  const critical = state.plan.scarcity.filter((row) => row.availableOwners <= row.demand || row.assigned < row.demand).slice(0, 24);
  if (!critical.length && !lockIssues.length) {
    $("guildRoteCritical").innerHTML = '<div class="kicker">CRITICAL COVERAGE</div><h3>No immediate assignment shortfall detected</h3><p class="workspace-note">The current public roster plus officer controls can fill every normalized slot in this draft.</p>';
    return;
  }
  $("guildRoteCritical").innerHTML = `
    <div class="kicker">CRITICAL COVERAGE</div><h3>Scarce / controlled / unfilled requirements</h3>
    ${lockIssues.length ? `<div class="workspace-error"><strong>${number(lockIssues.length)} lock issue${lockIssues.length === 1 ? "" : "s"}:</strong> ${escapeHtml(lockIssues.slice(0, 3).map((issue) => `${issue.phase} ${issue.name || issue.baseId}: ${issue.reason}`).join(" · "))}</div>` : ""}
    <div class="guild-rote-critical-grid">${critical.map((row) => `<div class="guild-rote-critical"><strong>${escapeHtml(row.name || row.baseId)}</strong><span>${escapeHtml(row.phase)} · ${escapeHtml(requirementLabel(row))}</span><small>${number(row.demand)} demand · ${number(row.eligibleOwners)} physically ready · ${number(row.availableOwners)} available after reserves · ${number(row.assigned)} assigned</small></div>`).join("")}</div>`;
}

function farmCandidatesHtml(row) {
  if (!row.closest?.length) return '<span class="pro-rote-status missing">No current owner below requirement</span>';
  return `<div class="guild-rote-farm-candidates">${row.closest.slice(0, 3).map((candidate) => `
    <div class="guild-rote-farm-candidate">
      <strong>${escapeHtml(candidate.member?.name || "Unknown")}</strong>
      <span>${escapeHtml(currentProgressionLabel(candidate, row))} → ${escapeHtml(requirementLabel(row))}</span>
      <small>${escapeHtml(gapLabel(candidate))}</small>
    </div>
  `).join("")}</div>`;
}

function officerButton(row) {
  return `<button type="button" data-officer-slot="${escapeAttr(row.id)}">${row.locked ? "Locked" : "Officer"}</button>`;
}

function controlsViewHtml() {
  const locks = state.officerControls.locks || [];
  const reservations = state.officerControls.reservations || [];
  const issues = state.plan.controls?.lockIssues || [];
  const lockRows = locks.map((lock) => {
    const slot = slotById(lock.slotId);
    const member = memberById(lock.memberId);
    return `<div class="guild-rote-control-row"><div><strong>${escapeHtml(slot?.name || slot?.baseId || lock.slotId)}</strong><span>${escapeHtml(slot?.phase || "Unknown")} · ${escapeHtml(slot?.conflictId || "")} · ${escapeHtml(member?.name || lock.memberId)}</span></div><button type="button" data-remove-lock="${escapeAttr(lock.slotId)}">Remove</button></div>`;
  }).join("");
  const reserveRows = reservations.map((reserve, index) => {
    const member = memberById(reserve.memberId);
    return `<div class="guild-rote-control-row"><div><strong>${escapeHtml(reserve.baseId)}</strong><span>${escapeHtml(reserve.phase || "All")} · ${escapeHtml(member?.name || reserve.memberId)} · reserved for mission</span></div><button type="button" data-remove-reserve="${index}">Remove</button></div>`;
  }).join("");
  const issueRows = issues.map((issue) => `<div class="guild-rote-control-issue"><strong>${escapeHtml(issue.phase)} · ${escapeHtml(issue.name || issue.baseId)}</strong><span>${escapeHtml(issue.reason)}</span></div>`).join("");
  return `
    <div class="database-heading"><div><div class="kicker">LOCAL OFFICER PLAN</div><h3>Locks &amp; Mission Reserves</h3><p>These controls persist only in this browser and are scoped to ${escapeHtml(state.guild?.guild?.name || "this guild")}. They are applied before automatic Operations drafting.</p></div><button id="guildRoteClearControls" type="button">Clear Local Controls</button></div>
    ${issues.length ? `<div class="guild-rote-control-section"><h4>Lock Issues</h4>${issueRows}</div>` : ""}
    <div class="guild-rote-control-columns">
      <section><h4>Assignment Locks (${number(locks.length)})</h4>${lockRows || '<p class="workspace-note">No locked Operation slots.</p>'}</section>
      <section><h4>Mission Reserves (${number(reservations.length)})</h4>${reserveRows || '<p class="workspace-note">No units reserved out of Operations.</p>'}</section>
    </div>
  `;
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
    html = `<div class="database-heading"><div><div class="kicker">OFFICER DRAFT</div><h3>Operation Assignments</h3><p>${number(rows.length)} matching assignments. Locked rows are frozen before the automatic draft.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Phase</th><th>Territory</th><th>Operation</th><th>Unit</th><th>Req.</th><th>Assigned Member</th><th>Owned</th><th>Ready / Available</th><th>Officer</th></tr></thead><tbody>${visible.map((row) => `<tr${row.locked ? ' class="guild-rote-locked-row"' : ""}><td>${escapeHtml(row.phase)}</td><td>${escapeHtml(row.conflictId)}</td><td>${escapeHtml(row.squadId)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td><strong>${escapeHtml(row.member?.name || "")}${row.locked ? " 🔒" : ""}</strong><small>${row.member?.allyCode ? escapeHtml(String(row.member.allyCode).replace(/(\d{3})(?=\d)/g, "$1-")) : ""}</small></td><td>${row.unitType === "Ship" ? `${number(row.owned?.stars)}★` : `R${number(row.owned?.relic)}`}</td><td>${number(row.eligibleOwners)} / ${number(row.availableOwners)}</td><td>${officerButton(row)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (view === "unfilled") {
    rows = filteredRows(state.plan.unfilled, (row) => [row.phase, row.conflictId, row.squadId, row.name, row.baseId, row.lockIssue]);
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">GAPS</div><h3>Unfilled Operation Slots</h3><p>Includes ownership gaps, mission-reserve effects, contribution limits and invalid officer locks.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Phase</th><th>Territory</th><th>Operation</th><th>Unit</th><th>Requirement</th><th>Ready / Available</th><th>Reason</th><th>Officer</th></tr></thead><tbody>${visible.map((row) => `<tr><td>${escapeHtml(row.phase)}</td><td>${escapeHtml(row.conflictId)}</td><td>${escapeHtml(row.squadId)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td>${number(row.eligibleOwners)} / ${number(row.availableOwners)}</td><td>${row.lockIssue ? `<span class="pro-rote-status missing">${escapeHtml(row.lockIssue)}</span>` : row.availableOwners < row.eligibleOwners ? '<span class="pro-rote-status partial">Mission reserve / plan constraint</span>' : '<span class="pro-rote-status missing">No valid assignment</span>'}</td><td>${officerButton(row)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (view === "scarcity") {
    rows = filteredRows(state.plan.scarcity, (row) => [row.phase, row.name, row.baseId]);
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">SCARCITY</div><h3>Demand vs Ready / Available Owners</h3><p>Physical readiness remains separate from officer mission reserves, so operational controls do not create false farm shortages.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Phase</th><th>Unit</th><th>Requirement</th><th>Demand</th><th>Physically Ready</th><th>Available</th><th>Assigned</th><th>Plan Margin</th></tr></thead><tbody>${visible.map((row) => { const margin = row.availableOwners - row.demand; return `<tr><td>${escapeHtml(row.phase)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td>${number(row.demand)}</td><td>${number(row.eligibleOwners)}</td><td>${number(row.availableOwners)}</td><td>${number(row.assigned)}</td><td><span class="pro-rote-status ${margin < 0 ? "missing" : margin <= 1 ? "partial" : "ready"}">${margin >= 0 ? "+" : ""}${number(margin)}</span></td></tr>`; }).join("")}</tbody></table></div>`;
  } else if (view === "farms") {
    rows = filteredRows(state.plan.developmentTargets || [], (row) => [row.phase, row.name, row.baseId, ...(row.closest || []).map((candidate) => candidate.member?.name || "")]);
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">GUILD FARM PRIORITIES</div><h3>Closest Upgrades to Close Physical ROTE Gaps</h3><p>Farm priorities use physical qualifying ownership, not mission-reserve availability. Private inventory costs are not estimated.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table guild-rote-farm-table"><thead><tr><th>Phase</th><th>Unit</th><th>Requirement</th><th>Demand</th><th>Ready</th><th>Shortage</th><th>Owned Below Req.</th><th>Closest Members</th></tr></thead><tbody>${visible.map((row) => `<tr><td>${escapeHtml(row.phase)}</td><td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td><td>${escapeHtml(requirementLabel(row))}</td><td>${number(row.demand)}</td><td>${number(row.eligibleOwners)}</td><td><span class="pro-rote-status missing">${number(row.shortage)}</span></td><td>${number(row.belowRequirement)}</td><td>${farmCandidatesHtml(row)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (view === "controls") {
    rows = [...(state.officerControls.locks || []), ...(state.officerControls.reservations || [])];
    html = controlsViewHtml();
  } else {
    const phase = $("guildRotePhase")?.value || "All";
    const query = String($("guildRoteSearch")?.value || "").trim().toLowerCase();
    rows = state.plan.memberLoads.filter((row) => {
      if (phase !== "All" && !row.phases?.[phase]) return false;
      if (!query) return true;
      return [row.name, row.allyCode, row.playerId].join(" ").toLowerCase().includes(query);
    });
    const visible = rows.slice(0, state.shown);
    html = `<div class="database-heading"><div><div class="kicker">MEMBER LOAD</div><h3>Planned Contributions</h3><p>Locked assignments are counted in member load before the remaining slots are drafted.</p></div></div><div class="pro-table-wrap"><table class="pro-rote-table guild-rote-table"><thead><tr><th>Member</th><th>GP</th><th>Total</th><th>Locked</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>P5</th><th>P6</th></tr></thead><tbody>${visible.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${row.allyCode ? escapeHtml(String(row.allyCode).replace(/(\d{3})(?=\d)/g, "$1-")) : ""}</small></td><td>${number(row.galacticPower)}</td><td>${number(row.total)}</td><td>${number(row.locked || 0)}</td>${[1,2,3,4,5,6].map((phaseNumber) => `<td>${number(row.phases?.[`P${phaseNumber}`] || 0)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  output.innerHTML = html || '<div class="workspace-note">No rows match the current filters.</div>';
  $("guildRoteMore")?.classList.toggle("hidden", view === "controls" || rows.length <= state.shown);
  wireOfficerButtons();
}

function qualifyingMembers(slot) {
  if (!slot) return [];
  return (state.guild?.members || [])
    .filter((member) => member?.rosterAvailable)
    .map((member) => ({ member, unit: (member.units || []).find((unit) => String(unit.baseId) === String(slot.baseId)) }))
    .filter(({ unit }) => unitMeetsRoteSlot(unit, slot))
    .sort((a, b) => Number(b.member?.galacticPower || 0) - Number(a.member?.galacticPower || 0) || String(a.member?.name || "").localeCompare(String(b.member?.name || "")));
}

function openOfficerDialog(slotId) {
  const slot = slotById(slotId);
  const dialog = $("guildRoteControlDialog");
  if (!slot || !dialog) return;
  state.controlSlotId = String(slot.id);
  const existingLock = state.officerControls.locks.find((lock) => String(lock.slotId) === String(slot.id));
  const members = qualifyingMembers(slot);
  $("guildRoteControlTitle").textContent = slot.name || slot.baseId;
  $("guildRoteControlMeta").textContent = `${slot.phase} · ${slot.conflictId} · ${slot.squadId} · ${requirementLabel(slot)}`;
  $("guildRoteControlMember").innerHTML = members.length
    ? members.map(({ member, unit }) => `<option value="${escapeAttr(memberId(member))}"${existingLock?.memberId === memberId(member) ? " selected" : ""}>${escapeHtml(member.name || memberId(member))} · ${slot.unitType === "Ship" ? `${number(unit.stars)}★` : `R${number(unit.relic)}`} · ${number(member.galacticPower)} GP</option>`).join("")
    : '<option value="">No qualifying public owner</option>';
  $("guildRoteLockSelected").disabled = !members.length;
  $("guildRoteReserveSelected").disabled = !members.length;
  $("guildRoteRemoveLock").disabled = !existingLock;
  dialog.showModal();
}

function applyControlMutation() {
  saveOfficerControls();
  recomputePlan();
  renderAll();
}

function lockSelectedMember() {
  const slot = slotById(state.controlSlotId);
  const memberValue = String($("guildRoteControlMember")?.value || "");
  if (!slot || !memberValue) return;
  state.officerControls.locks = state.officerControls.locks.filter((lock) => String(lock.slotId) !== String(slot.id));
  state.officerControls.locks.push({ slotId: String(slot.id), memberId: memberValue });
  $("guildRoteControlDialog")?.close();
  applyControlMutation();
}

function reserveSelectedMember() {
  const slot = slotById(state.controlSlotId);
  const memberValue = String($("guildRoteControlMember")?.value || "");
  if (!slot || !memberValue) return;
  const exists = state.officerControls.reservations.some((reserve) => reserve.memberId === memberValue && reserve.phase === slot.phase && reserve.baseId === slot.baseId);
  if (!exists) state.officerControls.reservations.push({ memberId: memberValue, phase: slot.phase, baseId: slot.baseId });
  state.officerControls.locks = state.officerControls.locks.filter((lock) => {
    if (String(lock.memberId) !== memberValue) return true;
    const lockedSlot = slotById(lock.slotId);
    return !(lockedSlot && lockedSlot.phase === slot.phase && lockedSlot.baseId === slot.baseId);
  });
  $("guildRoteControlDialog")?.close();
  applyControlMutation();
}

function removeCurrentLock() {
  const slotId = state.controlSlotId;
  state.officerControls.locks = state.officerControls.locks.filter((lock) => String(lock.slotId) !== String(slotId));
  $("guildRoteControlDialog")?.close();
  applyControlMutation();
}

function wireOfficerButtons() {
  for (const button of document.querySelectorAll("button[data-officer-slot]")) {
    button.addEventListener("click", () => openOfficerDialog(button.dataset.officerSlot));
  }
  for (const button of document.querySelectorAll("button[data-remove-lock]")) {
    button.addEventListener("click", () => {
      state.officerControls.locks = state.officerControls.locks.filter((lock) => String(lock.slotId) !== String(button.dataset.removeLock));
      applyControlMutation();
    });
  }
  for (const button of document.querySelectorAll("button[data-remove-reserve]")) {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeReserve);
      if (!Number.isInteger(index)) return;
      state.officerControls.reservations.splice(index, 1);
      applyControlMutation();
    });
  }
  $("guildRoteClearControls")?.addEventListener("click", () => {
    state.officerControls = { locks: [], reservations: [] };
    applyControlMutation();
  });
}

async function copyAssignments() {
  if (!state.plan) return;
  const rows = filteredRows(state.plan.assignments, (row) => [row.phase, row.conflictId, row.squadId, row.name, row.baseId, row.member?.name]);
  const lines = [
    ["Phase", "Territory", "Operation", "Slot", "Unit", "Base ID", "Requirement", "Member", "Ally Code", "Locked"].join("\t"),
    ...rows.map((row) => [row.phase, row.conflictId, row.squadId, row.slot, row.name || row.baseId, row.baseId, requirementLabel(row), row.member?.name || "", row.member?.allyCode || "", row.locked ? "YES" : ""].join("\t")),
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
