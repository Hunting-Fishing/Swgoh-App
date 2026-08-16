import { buildGuildRoteOperationSafety } from "./guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments, normalizeDonationPreference } from "./guild-rote-safe-planner.js";

const state = {
  allyCode: "",
  guild: null,
  operations: null,
  catalog: null,
  safety: null,
  plan: null,
  controls: { preferences: [], ignoredMembers: [] },
  loading: false,
  loadedAt: 0,
  phase: "All",
  status: "All",
  search: "",
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function memberId(member, index = 0) {
  return String(member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function currentRedundancyTarget() {
  const global = Number(window.__swgohGuildRoteRedundancyTarget);
  if (Number.isFinite(global)) return Math.max(1, Math.min(5, Math.floor(global)));
  try {
    const saved = Number(localStorage.getItem("swgoh:guild-rote-redundancy-target"));
    if (Number.isFinite(saved)) return Math.max(1, Math.min(5, Math.floor(saved)));
  } catch {
    // Optional storage.
  }
  return 2;
}

function guildId() {
  return String(state.guild?.guild?.id || "");
}

function safetyStorageKey() {
  return guildId() ? `swgoh-roster-command:guild-rote-safety:${guildId()}` : "";
}

function officerStorageKey() {
  return guildId() ? `swgoh-roster-command:guild-rote-officer:${guildId()}` : "";
}

function loadSafetyControls() {
  state.controls = { preferences: [], ignoredMembers: [] };
  const key = safetyStorageKey();
  if (!key) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    state.controls.preferences = Array.isArray(parsed?.preferences)
      ? parsed.preferences.filter((row) => row?.memberId && row?.baseId && ["give", "keep"].includes(normalizeDonationPreference(row.preference)))
      : [];
    state.controls.ignoredMembers = Array.isArray(parsed?.ignoredMembers)
      ? [...new Set(parsed.ignoredMembers.map((row) => typeof row === "string" ? row : row?.memberId).map(String).filter(Boolean))]
      : [];
  } catch {
    state.controls = { preferences: [], ignoredMembers: [] };
  }
}

function saveSafetyControls() {
  const key = safetyStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state.controls));
  } catch {
    // Current in-memory plan remains usable.
  }
}

function readExistingOfficerControls() {
  const key = officerStorageKey();
  if (!key) return { locks: [], reservations: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      locks: Array.isArray(parsed?.locks) ? parsed.locks : [],
      reservations: Array.isArray(parsed?.reservations) ? parsed.reservations : [],
    };
  } catch {
    return { locks: [], reservations: [] };
  }
}

async function fetchJson(url, force = false) {
  if (force && window.__swgohFetchCache?.invalidate) {
    try { window.__swgohFetchCache.invalidate(url); } catch { /* optional */ }
  }
  const response = await fetch(url, { cache: force ? "reload" : "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson("/data/catalog.json?guild-safe-operations=1");
  if (!Array.isArray(body?.units) || !body.units.length) throw new Error("Static game catalog is unavailable for mission-safe Operations planning.");
  state.catalog = body.units;
  return state.catalog;
}

function recompute() {
  if (!state.guild || !state.operations || !state.catalog) return;
  const redundancyTarget = currentRedundancyTarget();
  state.safety = buildGuildRoteOperationSafety(state.guild, state.catalog, { redundancyTarget });
  const officer = readExistingOfficerControls();
  state.plan = planGuildRoteSafeAssignments(state.guild, state.operations, {
    maxPerTerritory: 10,
    locks: officer.locks,
    reservations: officer.reservations,
    preferences: state.controls.preferences,
    ignoredMembers: state.controls.ignoredMembers,
    protections: state.safety.protections,
  });
  renderAll();
}

async function load(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9 || state.loading) {
    renderAll();
    return;
  }
  if (!force && state.plan && state.allyCode === allyCode && Date.now() - state.loadedAt < 25_000) {
    renderAll();
    return;
  }

  state.loading = true;
  renderLoading();
  try {
    const [guild, operations, catalog] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`, force),
      state.operations && !force ? Promise.resolve(state.operations) : fetchJson("/api/rote/operations", force),
      loadCatalog(),
    ]);
    if (!Array.isArray(guild?.members)) throw new Error("Live guild roster contained no members.");
    if (!Array.isArray(operations?.slots) || !operations.slots.length) throw new Error("ROTE Operation requirements are unavailable.");
    const changedGuild = String(state.guild?.guild?.id || "") !== String(guild?.guild?.id || "");
    state.allyCode = allyCode;
    state.guild = guild;
    state.operations = operations;
    state.catalog = catalog;
    if (changedGuild || !state.plan) loadSafetyControls();
    state.loadedAt = Date.now();
    recompute();
  } catch (error) {
    state.plan = null;
    renderError(error?.message || "Guild safe Operations planning is unavailable.");
  } finally {
    state.loading = false;
  }
}

function installGuildSurface() {
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel || $("guildRoteSafeOperations")) return Boolean(panel && $("guildRoteSafeOperations"));
  const section = document.createElement("section");
  section.id = "guildRoteSafeOperations";
  section.className = "card workspace-intro guild-safe-operations";
  section.innerHTML = '<div class="workspace-note">Load an Ally Code to build the guild-safe ROTE Operations draft.</div>';
  const missionCoverage = $("guildRoteMissionCoverage");
  if (missionCoverage?.parentNode === panel) panel.insertBefore(section, missionCoverage);
  else panel.appendChild(section);
  return true;
}

function installRoteSurface() {
  const view = $("roteOperationsView");
  if (!view || $("roteGuildSafeOperations")) return Boolean(view && $("roteGuildSafeOperations"));
  const section = document.createElement("section");
  section.id = "roteGuildSafeOperations";
  section.className = "card workspace-intro guild-safe-operations rote-guild-safe-card";
  section.innerHTML = '<div class="workspace-note">Guild-safe Operations will appear here after a live guild roster is loaded.</div>';
  view.prepend(section);
  return true;
}

function ensureSurfaces() {
  const guild = installGuildSurface();
  const rote = installRoteSurface();
  return guild && rote;
}

function renderLoading() {
  for (const id of ["guildRoteSafeOperations", "roteGuildSafeOperations"]) {
    const target = $(id);
    if (target) target.innerHTML = '<div class="workspace-note">Hydrating the guild roster and protecting verified combat-mission units before drafting Operations…</div>';
  }
}

function renderError(message) {
  for (const id of ["guildRoteSafeOperations", "roteGuildSafeOperations"]) {
    const target = $(id);
    if (target) target.innerHTML = `<div class="workspace-error">${escapeHtml(message)}</div>`;
  }
}

function safetyStatus(row) {
  const preference = row?.safety?.preference || "default";
  const protectedRisk = Boolean(row?.safety?.protection) && preference !== "give";
  if (preference === "keep") return { label: "HELP · KEEP", className: "keep", risk: true };
  if (preference === "give") return { label: "GIVE", className: "give", risk: false };
  if (protectedRisk) return { label: "HELP · MISSION RISK", className: "protected", risk: true };
  return { label: "SAFE", className: "safe", risk: false };
}

function preferenceFor(memberIdValue, baseId) {
  const row = state.controls.preferences.find((item) => String(item.memberId) === String(memberIdValue) && String(item.baseId) === String(baseId));
  return normalizeDonationPreference(row?.preference || "default");
}

function setPreference(memberIdValue, baseId, preference) {
  const normalized = normalizeDonationPreference(preference);
  state.controls.preferences = state.controls.preferences.filter((row) => !(String(row.memberId) === String(memberIdValue) && String(row.baseId) === String(baseId)));
  if (normalized !== "default") state.controls.preferences.push({ memberId: String(memberIdValue), baseId: String(baseId), preference: normalized });
  saveSafetyControls();
  recompute();
}

function setIgnored(memberIdValue, ignored) {
  const next = new Set(state.controls.ignoredMembers.map(String));
  if (ignored) next.add(String(memberIdValue));
  else next.delete(String(memberIdValue));
  state.controls.ignoredMembers = [...next];
  saveSafetyControls();
  recompute();
}

function assignmentMatches(row) {
  if (state.phase !== "All" && String(row.phase) !== state.phase) return false;
  const status = safetyStatus(row);
  if (state.status === "Safe" && status.label !== "SAFE") return false;
  if (state.status === "Give" && row?.safety?.preference !== "give") return false;
  if (state.status === "Risk" && !status.risk) return false;
  if (state.status === "Keep" && row?.safety?.preference !== "keep") return false;
  const query = state.search.toLowerCase().trim();
  if (!query) return true;
  return [row.phase, row.conflictId, row.squadId, row.name, row.baseId, row.member?.name, row.member?.allyCode, row?.safety?.protection?.reasons?.join(" ")].join(" ").toLowerCase().includes(query);
}

function assignmentRows() {
  return (state.plan?.assignments || []).filter(assignmentMatches);
}

function summaryStat(label, value, tone = "") {
  return `<div class="guild-safe-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function protectionText(row) {
  const protection = row?.safety?.protection;
  if (!protection) return '<span class="guild-safe-protection">No exact mission protection triggered.</span>';
  const reasons = Array.isArray(protection.reasons) ? protection.reasons : [];
  return `<span class="guild-safe-protection">${escapeHtml(reasons.slice(0, 2).join(" · ") || "Verified mission roster protection")}</span>`;
}

function assignmentTable() {
  const rows = assignmentRows();
  if (!rows.length) return '<div class="guild-safe-note">No assignments match the current filters.</div>';
  return `<div class="guild-safe-table-wrap"><table class="guild-safe-table"><thead><tr><th>Phase</th><th>Territory / Operation</th><th>Unit</th><th>Req.</th><th>Assigned Member</th><th>Owners</th><th>Safety</th><th>Mission Protection</th><th>Preference</th></tr></thead><tbody>${rows.map((row) => {
    const id = String(row.member?.playerId || row.member?.allyCode || row.member?.name || "");
    const status = safetyStatus(row);
    const preference = preferenceFor(id, row.baseId);
    return `<tr class="${status.risk ? (preference === "keep" ? "help" : "risk") : ""}">
      <td><strong>${escapeHtml(row.phase)}</strong></td>
      <td><strong>${escapeHtml(row.conflictId || "")}</strong><small>${escapeHtml(row.squadId || "")} · slot ${escapeHtml(row.slot)}</small></td>
      <td><strong>${escapeHtml(row.name || row.baseId)}</strong><small>${escapeHtml(row.baseId)}</small></td>
      <td>${row.unitType === "Ship" ? `${number(row.requiredRarity)}★` : `R${number(row.requiredRelic)}`}</td>
      <td><strong>${escapeHtml(row.member?.name || "Unknown")}${row.locked ? " 🔒" : ""}</strong><small>${number(row.member?.galacticPower)} GP · ${escapeHtml(row.member?.allyCode || "")}</small></td>
      <td><strong>${number(row.safeOwners)} safe</strong><small>${number(row.availableOwners)} assignable · ${number(row.eligibleOwners)} physical</small></td>
      <td><span class="guild-safe-status ${status.className}">${escapeHtml(status.label)}</span>${status.risk ? '<small class="guild-safe-help">Last-resort donation</small>' : ""}</td>
      <td>${protectionText(row)}</td>
      <td><select class="guild-safe-pref-select ${escapeAttr(preference)}" data-safe-pref-member="${escapeAttr(id)}" data-safe-pref-unit="${escapeAttr(row.baseId)}"><option value="default"${preference === "default" ? " selected" : ""}>Default</option><option value="give"${preference === "give" ? " selected" : ""}>GIVE</option><option value="keep"${preference === "keep" ? " selected" : ""}>KEEP</option></select></td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}

function operationUnitOptions() {
  const unique = new Map();
  for (const slot of state.operations?.slots || []) {
    const baseId = String(slot.baseId || "");
    if (baseId && !unique.has(baseId)) unique.set(baseId, slot.name || baseId);
  }
  return [...unique.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
}

function memberOptions() {
  return (state.guild?.members || []).map((member, index) => ({ id: memberId(member, index), name: member?.name || memberId(member, index), gp: Number(member?.galacticPower || 0) }))
    .sort((a, b) => b.gp - a.gp || a.name.localeCompare(b.name));
}

function controlsMarkup() {
  const members = memberOptions();
  const units = operationUnitOptions();
  const preferences = state.controls.preferences || [];
  const ignored = new Set(state.controls.ignoredMembers.map(String));
  const preferenceRows = preferences.map((row, index) => {
    const member = members.find((item) => item.id === String(row.memberId));
    const unit = units.find(([baseId]) => baseId === String(row.baseId));
    return `<div class="guild-safe-control-row"><div><strong>${escapeHtml(member?.name || row.memberId)} · ${escapeHtml(unit?.[1] || row.baseId)}</strong><span>${escapeHtml(String(row.preference).toUpperCase())}</span></div><button type="button" data-safe-remove-pref="${index}">Remove</button></div>`;
  }).join("");
  const ignoredRows = members.filter((member) => ignored.has(member.id)).map((member) => `<div class="guild-safe-control-row"><div><strong>${escapeHtml(member.name)}</strong><span>${number(member.gp)} GP · ignored by the Operation allocator</span></div><button type="button" data-safe-unignore="${escapeAttr(member.id)}">Include</button></div>`).join("");
  return `<div class="guild-safe-control-grid">
    <section><h4>Echo-style Donation Preferences</h4><p class="workspace-note">GIVE is favored. KEEP is avoided unless using it is necessary to preserve Operation completion.</p>
      <form id="guildSafePrefForm" class="guild-safe-pref-form"><label>Member<select id="guildSafePrefMember">${members.map((member) => `<option value="${escapeAttr(member.id)}">${escapeHtml(member.name)} · ${number(member.gp)} GP</option>`).join("")}</select></label><label>Operation Unit<select id="guildSafePrefUnit">${units.map(([baseId, name]) => `<option value="${escapeAttr(baseId)}">${escapeHtml(name)} · ${escapeHtml(baseId)}</option>`).join("")}</select></label><label>Preference<select id="guildSafePrefValue"><option value="give">GIVE</option><option value="keep">KEEP</option><option value="default">DEFAULT</option></select></label><button type="submit">Apply</button></form>
      <div class="guild-safe-control-list">${preferenceRows || '<div class="workspace-note">No GIVE/KEEP preferences set on this browser.</div>'}</div>
    </section>
    <section><h4>Ignore / Availability</h4><p class="workspace-note">Ignored members are treated as unavailable by the automatic Operation allocator. Officer hard locks and reserves remain in the existing Officer Controls panel.</p>
      <div class="guild-safe-member-actions"><select id="guildSafeIgnoreMember" class="guild-safe-pref-select">${members.filter((member) => !ignored.has(member.id)).map((member) => `<option value="${escapeAttr(member.id)}">${escapeHtml(member.name)}</option>`).join("")}</select><button id="guildSafeIgnoreButton" type="button">Ignore Member</button></div>
      <div class="guild-safe-control-list">${ignoredRows || '<div class="workspace-note">No ignored members.</div>'}</div>
    </section>
  </div>`;
}

function renderGuild() {
  const target = $("guildRoteSafeOperations");
  if (!target) return;
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) {
    target.innerHTML = '<div class="kicker">GUILD TB SAFETY</div><h3>Echo-style ROTE Operations</h3><p class="workspace-note">Load any member’s 9-digit Ally Code to connect the current guild roster to ROTE Operations.</p>';
    return;
  }
  if (!state.plan || !state.guild || !state.safety) return;

  const summary = state.plan.safetySummary || {};
  const hydration = state.guild.hydration || {};
  const riskCount = state.plan.assignments.filter((row) => safetyStatus(row).risk).length;
  const riskTone = riskCount ? "danger" : "good";
  target.innerHTML = `
    <div class="guild-safe-header"><div><div class="kicker">GUILD OFFICER · ROTE OPERATIONS SAFETY</div><h3>Echo-style Safe Assignment Draft</h3><p>Scarcity-first Operation assignments using the live guild roster, player GIVE/KEEP preferences, hard officer controls, and automatic protection for verified combat-mission rosters. Protected or KEEP units remain last-resort donors instead of silently breaking mission teams.</p></div><div class="guild-safe-badges"><span class="guild-safe-badge good">${escapeHtml(state.guild.guild?.name || "Guild")}</span><span class="guild-safe-badge">${number(hydration.hydrated || 0)}/${number(hydration.requested || state.guild.guild?.memberCount || 0)} rosters</span><span class="guild-safe-badge ${riskTone}">${number(riskCount)} HELP assignments</span></div></div>
    <div class="guild-safe-summary">${summaryStat("Operation Coverage", `${state.plan.coveragePercent}%`, state.plan.unfilledSlots ? "warn" : "good")}${summaryStat("Assigned", `${number(state.plan.assignedSlots)} / ${number(state.plan.totalSlots)}`)}${summaryStat("Mission Protected", number(state.safety.summary?.protectedUnits || 0))}${summaryStat("GIVE Used", number(summary.giveAssignments || 0), "good")}${summaryStat("HELP / Risk", number(riskCount), riskTone)}${summaryStat("Ignored Members", number(summary.ignoredMembers || 0))}</div>
    <div class="guild-safe-note"><strong>Protection rule:</strong> named mandatory units and exact-tight flexible mission slots are automatically protected for exact-ready members. Generic fleet gates with incomplete selectable-ship evidence are not auto-protected as exact legality. A forced protected/KEEP donation is shown as HELP instead of being hidden.</div>
    <div class="guild-safe-toolbar"><label>Phase<select id="guildSafePhase"><option value="All">All phases</option>${[1,2,3,4,5,6].map((phase) => `<option value="P${phase}"${state.phase === `P${phase}` ? " selected" : ""}>P${phase}</option>`).join("")}</select></label><label>Safety<select id="guildSafeStatus"><option value="All">All assignments</option><option value="Safe"${state.status === "Safe" ? " selected" : ""}>Safe only</option><option value="Give"${state.status === "Give" ? " selected" : ""}>GIVE</option><option value="Risk"${state.status === "Risk" ? " selected" : ""}>HELP / Mission risk</option><option value="Keep"${state.status === "Keep" ? " selected" : ""}>KEEP overrides</option></select></label><label>Search<input id="guildSafeSearch" value="${escapeAttr(state.search)}" placeholder="Member, unit, territory…"></label><button id="guildSafeRefresh" type="button">Refresh Guild</button><button id="guildSafeCopy" type="button">Copy Safe TSV</button></div>
    ${state.plan.unfilledSlots ? `<div class="guild-safe-note warn"><strong>${number(state.plan.unfilledSlots)} unfilled slot${state.plan.unfilledSlots === 1 ? "" : "s"}:</strong> review hard mission reserves, ignored members, ownership, or contribution limits. KEEP/automatic protections themselves are soft and can be overridden as last resort.</div>` : ""}
    ${assignmentTable()}
    ${controlsMarkup()}
  `;
  wireGuildControls();
}

function renderRote() {
  const target = $("roteGuildSafeOperations");
  if (!target) return;
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) {
    target.innerHTML = '<div class="kicker">GUILD OPERATIONS</div><h3>Connect the guild roster</h3><p class="workspace-note">Load an Ally Code to layer guild-wide safe Operation assignments onto this ROTE workspace.</p>';
    return;
  }
  if (!state.plan || !state.guild || !state.safety) return;
  const risks = state.plan.assignments.filter((row) => safetyStatus(row).risk).length;
  target.innerHTML = `<div class="guild-safe-header"><div><div class="kicker">GUILD-WIDE ROTE</div><h3>${escapeHtml(state.guild.guild?.name || "Guild")} · Safe Operations Draft</h3><p>This is the guild assignment layer for the same ROTE requirements below. It prefers surplus/GIVE donors and protects verified combat-mission access before resorting to mission-critical units.</p></div><div class="guild-safe-badges"><span class="guild-safe-badge ${state.plan.unfilledSlots ? "warn" : "good"}">${state.plan.coveragePercent}% assigned</span><span class="guild-safe-badge ${risks ? "danger" : "good"}">${number(risks)} HELP</span></div></div><div class="guild-safe-summary">${summaryStat("Guild GP", number(state.guild.guild?.galacticPower || 0))}${summaryStat("Members", number(state.guild.hydration?.hydrated || state.guild.guild?.memberCount || 0))}${summaryStat("Protected Units", number(state.safety.summary?.protectedUnits || 0))}${summaryStat("Safe Owners Target", `${state.safety.redundancyTarget} mission owners`)}</div><div class="guild-safe-actions"><button id="roteOpenGuildSafe" type="button">Open Full Guild Assignment Draft</button><button id="roteRefreshGuildSafe" type="button">Refresh Guild Safety</button></div>`;
  $("roteOpenGuildSafe")?.addEventListener("click", () => document.querySelector('button[data-workspace-tab="guild"]')?.click());
  $("roteRefreshGuildSafe")?.addEventListener("click", () => load(true));
}

function renderAll() {
  ensureSurfaces();
  renderGuild();
  renderRote();
}

function wireGuildControls() {
  $("guildSafePhase")?.addEventListener("change", (event) => { state.phase = event.target.value; renderGuild(); });
  $("guildSafeStatus")?.addEventListener("change", (event) => { state.status = event.target.value; renderGuild(); });
  $("guildSafeSearch")?.addEventListener("input", (event) => { state.search = event.target.value; renderGuild(); });
  $("guildSafeRefresh")?.addEventListener("click", () => load(true));
  $("guildSafeCopy")?.addEventListener("click", copyAssignments);
  for (const select of document.querySelectorAll("[data-safe-pref-member][data-safe-pref-unit]")) {
    select.addEventListener("change", () => setPreference(select.dataset.safePrefMember, select.dataset.safePrefUnit, select.value));
  }
  $("guildSafePrefForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    setPreference($("guildSafePrefMember")?.value, $("guildSafePrefUnit")?.value, $("guildSafePrefValue")?.value);
  });
  for (const button of document.querySelectorAll("[data-safe-remove-pref]")) {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.safeRemovePref);
      if (!Number.isInteger(index) || index < 0 || index >= state.controls.preferences.length) return;
      state.controls.preferences.splice(index, 1);
      saveSafetyControls();
      recompute();
    });
  }
  $("guildSafeIgnoreButton")?.addEventListener("click", () => {
    const id = $("guildSafeIgnoreMember")?.value;
    if (id) setIgnored(id, true);
  });
  for (const button of document.querySelectorAll("[data-safe-unignore]")) button.addEventListener("click", () => setIgnored(button.dataset.safeUnignore, false));
}

async function copyAssignments() {
  if (!state.plan) return;
  const rows = assignmentRows();
  const lines = [["Phase", "Territory", "Operation", "Unit", "Base ID", "Requirement", "Member", "Ally Code", "Member GP", "Safe Owners", "Available Owners", "Safety", "Preference", "Protection"].join("\t")];
  for (const row of rows) {
    const status = safetyStatus(row);
    lines.push([row.phase, row.conflictId, row.squadId, row.name || row.baseId, row.baseId, row.unitType === "Ship" ? `${row.requiredRarity}★` : `R${row.requiredRelic}`, row.member?.name || "", row.member?.allyCode || "", row.member?.galacticPower || 0, row.safeOwners || 0, row.availableOwners || 0, status.label, row.safety?.preference || "default", (row.safety?.protection?.reasons || []).join(" | ")].join("\t"));
  }
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    const button = $("guildSafeCopy");
    if (button) {
      button.textContent = `Copied ${rows.length}`;
      setTimeout(() => { if (button.isConnected) button.textContent = "Copy Safe TSV"; }, 1400);
    }
  } catch {
    $("guildRoteSafeOperations")?.insertAdjacentHTML("afterbegin", '<div class="workspace-error">Clipboard access was blocked.</div>');
  }
}

function install() {
  ensureSurfaces();
  const observer = new MutationObserver(() => {
    if (ensureSurfaces()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.('button[data-workspace-tab="guild"],button[data-workspace-tab="rote"],button[data-rote-view="operations"]');
    if (tab) setTimeout(() => load(false), 0);
  }, true);
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.guild = null;
    state.safety = null;
    state.plan = null;
    state.loadedAt = 0;
    setTimeout(() => load(true), 450);
  });
  window.addEventListener("swgoh:guild-rote-redundancy-target", () => {
    if (state.guild && state.operations && state.catalog) recompute();
  });
  if (["#guild", "#rote"].includes(location.hash.toLowerCase())) load(false);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
