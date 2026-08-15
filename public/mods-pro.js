import {
  buildCharacterModRows,
  equippedModAuditSummary,
  flattenEquippedMods,
  statDisplay,
} from "./mods-audit.js";

const LIVE_CACHE_MS = 25_000;
const MOD_CACHE_MS = 60_000;
const state = {
  allyCode: "",
  liveBody: null,
  liveFetchedAt: 0,
  modBody: null,
  modFetchedAt: 0,
  characters: [],
  mods: [],
  summary: null,
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

function summaryCard(label, value, note = "") {
  return `<div class="mods-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
}

function setupPanel() {
  const panel = document.querySelector('[data-workspace-panel="mods"]');
  if (!panel || panel.dataset.modsProReady === "true") return Boolean(panel);
  panel.dataset.modsProReady = "true";
  panel.innerHTML = `
    <section class="card workspace-intro mods-pro-shell">
      <div class="mods-pro-heading">
        <div>
          <div class="kicker">LIVE EQUIPPED MOD INTELLIGENCE</div>
          <h2>Mods Command</h2>
          <p>Audit every equipped mod returned by the public player roster—from 1-dot through 6-dot. Review character coverage, pip investment, level-15 completion and speed secondaries without inventing unequipped inventory.</p>
        </div>
        <div id="modsProStatus" class="status">Load an Ally Code</div>
      </div>
      <div class="mods-pro-toolbar">
        <label>View
          <select id="modsProView">
            <option value="characters">Character Audit</option>
            <option value="mods">All Equipped Mods</option>
          </select>
        </label>
        <label>Pips
          <select id="modsProPips">
            <option value="All">All 1–6 dot</option>
            <option value="Under6">Under 6-dot</option>
            <option value="1">1-dot</option>
            <option value="2">2-dot</option>
            <option value="3">3-dot</option>
            <option value="4">4-dot</option>
            <option value="5">5-dot</option>
            <option value="6">6-dot</option>
          </select>
        </label>
        <label>Focus
          <select id="modsProFocus">
            <option value="All">All</option>
            <option value="OpenSlots">Open mod slots</option>
            <option value="Under6">Any under 6-dot</option>
            <option value="OneToFour">Any 1–4 dot</option>
            <option value="Below15">Below level 15</option>
            <option value="NoSpeed">No speed secondary</option>
            <option value="Speed20">+20 speed or better</option>
            <option value="Speed25">+25 speed or better</option>
          </select>
        </label>
        <label>Sort
          <select id="modsProSort">
            <option value="power">Character GP</option>
            <option value="totalSpeed">Total mod speed</option>
            <option value="bestSpeed">Best speed secondary</option>
            <option value="sixDot">6-dot count</option>
            <option value="underSix">Under-6 count</option>
            <option value="pips">Pips</option>
            <option value="level">Mod level</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label class="mods-pro-search">Search
          <input id="modsProSearch" placeholder="Character, set, slot, stat…">
        </label>
        <button id="modsProRefresh" type="button">Refresh Mods</button>
      </div>
    </section>
    <section class="card workspace-intro">
      <div id="modsProSummary" class="mods-summary-grid"></div>
      <div id="modsProPipSummary" class="mods-pip-grid"></div>
      <p class="workspace-note mods-data-boundary"><strong>Public-data boundary:</strong> this workspace analyzes equipped mods only. Unequipped mod inventory is not exposed by the public player endpoint and is not represented as zero or otherwise fabricated.</p>
    </section>
    <section class="card workspace-intro">
      <div id="modsProOutput"><div class="workspace-note">Enter a 9-digit Ally Code, load the roster, then open Mods.</div></div>
      <button id="modsProMore" class="catalog-more hidden" type="button">Show More</button>
    </section>
    <dialog id="modsProDialog" class="details mods-pro-dialog">
      <button id="modsProDialogClose" class="close" type="button" aria-label="Close">×</button>
      <div id="modsProDialogBody"></div>
    </dialog>
  `;

  for (const id of ["modsProView", "modsProPips", "modsProFocus", "modsProSort"]) {
    $(id)?.addEventListener("change", () => { state.shown = 200; renderTable(); });
  }
  $("modsProSearch")?.addEventListener("input", () => { state.shown = 200; renderTable(); });
  $("modsProRefresh")?.addEventListener("click", () => loadMods(true));
  $("modsProMore")?.addEventListener("click", () => { state.shown += 200; renderTable(); });
  $("modsProDialogClose")?.addEventListener("click", () => $("modsProDialog")?.close());
  $("modsProDialog")?.addEventListener("click", (event) => {
    if (event.target === $("modsProDialog")) $("modsProDialog")?.close();
  });
  document.querySelector('[data-workspace-tab="mods"]')?.addEventListener("click", () => loadMods(false));
  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.liveBody = null;
    state.modBody = null;
    state.characters = [];
    state.mods = [];
    state.summary = null;
    setTimeout(() => {
      if (location.hash === "#mods") loadMods(true);
    }, 400);
  });
  if (location.hash === "#mods") loadMods(false);
  return true;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadLive(allyCode, force) {
  const shared = window.__swgohLiveSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < LIVE_CACHE_MS) {
    return shared.body;
  }
  if (!force && state.liveBody && state.allyCode === allyCode && Date.now() - state.liveFetchedAt < LIVE_CACHE_MS) {
    return state.liveBody;
  }
  const body = await fetchJson(`/api/player/${allyCode}`);
  state.liveFetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.liveFetchedAt };
  return body;
}

async function loadDetailedMods(allyCode, force) {
  const shared = window.__swgohModSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < MOD_CACHE_MS) {
    return shared.body;
  }
  if (!force && state.modBody && state.allyCode === allyCode && Date.now() - state.modFetchedAt < MOD_CACHE_MS) {
    return state.modBody;
  }
  const body = await fetchJson(`/api/mods/${allyCode}`);
  state.modFetchedAt = Date.now();
  window.__swgohModSnapshot = { allyCode, body, fetchedAt: state.modFetchedAt };
  return body;
}

async function loadMods(force = false) {
  const allyCode = digits($("allyCode")?.value);
  const status = $("modsProStatus");
  const output = $("modsProOutput");
  if (!status || !output) return;
  if (allyCode.length !== 9) {
    status.textContent = "Load an Ally Code";
    status.className = "status warning";
    output.innerHTML = '<div class="workspace-note">Enter and load a 9-digit Ally Code to analyze equipped mods.</div>';
    return;
  }
  if (state.loading) return;
  if (!force && state.allyCode === allyCode && state.summary) {
    renderAll();
    return;
  }

  state.loading = true;
  status.textContent = "Loading all equipped mods…";
  status.className = "status";
  if ($("modsProRefresh")) $("modsProRefresh").disabled = true;
  try {
    const [liveBody, modBody] = await Promise.all([
      loadLive(allyCode, force),
      loadDetailedMods(allyCode, force),
    ]);
    state.allyCode = allyCode;
    state.liveBody = liveBody;
    state.modBody = modBody;
    state.characters = buildCharacterModRows(liveBody, modBody);
    state.mods = flattenEquippedMods(state.characters);
    state.summary = equippedModAuditSummary(state.characters, modBody);
    state.shown = 200;
    status.textContent = "Equipped mods ready";
    status.className = "status ready";
    renderAll();
  } catch (error) {
    status.textContent = "Mods unavailable";
    status.className = "status danger";
    output.innerHTML = `<div class="workspace-error">${escapeHtml(error.message || "Equipped mod data could not be loaded.")}</div>`;
  } finally {
    state.loading = false;
    if ($("modsProRefresh")) $("modsProRefresh").disabled = false;
  }
}

function renderAll() {
  const summary = state.summary;
  if (!summary) return;
  $("modsProSummary").innerHTML = [
    summaryCard("Total Equipped", number(summary.totalMods)),
    summaryCard("Under 6-dot", number(summary.underSixDot), "1–5 dot equipped"),
    summaryCard("6-dot", number(summary.sixDot)),
    summaryCard("Level 15", number(summary.maxLevel)),
    summaryCard("+10 Speed", number(summary.speed10Plus)),
    summaryCard("+15 Speed", number(summary.speed15Plus)),
    summaryCard("+20 Speed", number(summary.speed20Plus)),
    summaryCard("+25 Speed", number(summary.speed25Plus)),
    summaryCard("Open-Slot Characters", number(summary.charactersWithOpenSlots)),
    summaryCard("Characters With 1–4 Dot", number(summary.charactersWithOneToFourDot)),
  ].join("");

  $("modsProPipSummary").innerHTML = [1, 2, 3, 4, 5, 6].map((pip) => `
    <button type="button" data-mod-pip-filter="${pip}" class="mods-pip-card${pip < 6 ? " under-six" : " six-dot"}">
      <strong>${pip}-dot</strong><span>${number(summary.byRarity?.[String(pip)] || 0)}</span>
    </button>
  `).join("");
  for (const button of document.querySelectorAll("button[data-mod-pip-filter]")) {
    button.addEventListener("click", () => {
      $("modsProPips").value = button.dataset.modPipFilter;
      state.shown = 200;
      renderTable();
    });
  }
  renderTable();
}

function pipPass(pips) {
  const filter = $("modsProPips")?.value || "All";
  const value = Number(pips || 0);
  if (filter === "All") return true;
  if (filter === "Under6") return value > 0 && value < 6;
  return value === Number(filter);
}

function characterFocusPass(row) {
  const focus = $("modsProFocus")?.value || "All";
  if (focus === "All") return true;
  if (focus === "OpenSlots") return row.openSlots > 0;
  if (focus === "Under6") return row.underSixDot > 0;
  if (focus === "OneToFour") return row.oneToFourDot > 0;
  if (focus === "Below15") return row.maxLevel < row.equipped;
  if (focus === "NoSpeed") return row.equipped > 0 && row.speedSecondaryMods === 0;
  if (focus === "Speed20") return row.speed20Plus > 0;
  if (focus === "Speed25") return row.speed25Plus > 0;
  return true;
}

function modFocusPass(row) {
  const focus = $("modsProFocus")?.value || "All";
  if (focus === "All") return true;
  if (focus === "Under6") return Number(row.pips) > 0 && Number(row.pips) < 6;
  if (focus === "OneToFour") return Number(row.pips) >= 1 && Number(row.pips) <= 4;
  if (focus === "Below15") return Number(row.level || 0) < 15;
  if (focus === "NoSpeed") return Number(row.speedSecondary || 0) <= 0;
  if (focus === "Speed20") return Number(row.speedSecondary || 0) >= 20;
  if (focus === "Speed25") return Number(row.speedSecondary || 0) >= 25;
  if (focus === "OpenSlots") return false;
  return true;
}

function searchPass(values) {
  const query = String($("modsProSearch")?.value || "").trim().toLowerCase();
  if (!query) return true;
  return values.join(" ").toLowerCase().includes(query);
}

function characterRows() {
  const sort = $("modsProSort")?.value || "power";
  return state.characters
    .filter((row) => row.mods.some((mod) => pipPass(mod.pips)) || ($("modsProPips")?.value === "All" && row.equipped === 0))
    .filter(characterFocusPass)
    .filter((row) => searchPass([row.name, row.baseId, row.relic, row.gear]))
    .slice()
    .sort((a, b) => {
      if (sort === "totalSpeed") return b.totalSpeedSecondary - a.totalSpeedSecondary || b.power - a.power;
      if (sort === "bestSpeed") return b.bestSpeedSecondary - a.bestSpeedSecondary || b.power - a.power;
      if (sort === "sixDot") return b.sixDot - a.sixDot || b.power - a.power;
      if (sort === "underSix") return b.underSixDot - a.underSixDot || b.power - a.power;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.power - a.power || a.name.localeCompare(b.name);
    });
}

function individualModRows() {
  const sort = $("modsProSort")?.value || "power";
  return state.mods
    .filter((row) => pipPass(row.pips))
    .filter(modFocusPass)
    .filter((row) => searchPass([
      row.characterName,
      row.characterBaseId,
      row.setName,
      row.slotName,
      row.primaryStat?.name,
      ...(row.secondaryStats || []).map((stat) => stat?.name || ""),
    ]))
    .slice()
    .sort((a, b) => {
      if (sort === "bestSpeed" || sort === "totalSpeed") return Number(b.speedSecondary || 0) - Number(a.speedSecondary || 0) || b.characterPower - a.characterPower;
      if (sort === "sixDot") return Number(b.pips === 6) - Number(a.pips === 6) || b.characterPower - a.characterPower;
      if (sort === "underSix") return Number(a.pips >= 6) - Number(b.pips >= 6) || Number(a.pips) - Number(b.pips);
      if (sort === "pips") return Number(a.pips) - Number(b.pips) || Number(b.speedSecondary || 0) - Number(a.speedSecondary || 0);
      if (sort === "level") return Number(a.level || 0) - Number(b.level || 0) || Number(a.pips) - Number(b.pips);
      if (sort === "name") return a.characterName.localeCompare(b.characterName) || Number(a.slot) - Number(b.slot);
      return b.characterPower - a.characterPower || Number(a.slot) - Number(b.slot);
    });
}

function pipMix(row) {
  return [1, 2, 3, 4, 5, 6]
    .filter((pip) => row.byRarity?.[pip])
    .map((pip) => `${pip}d×${row.byRarity[pip]}`)
    .join(" · ") || "No mods";
}

function renderCharacterTable() {
  const rows = characterRows();
  const visible = rows.slice(0, state.shown);
  return {
    rows,
    html: `
      <div class="database-heading"><div><div class="kicker">CHARACTER MOD AUDIT</div><h3>${number(rows.length)} matching characters</h3><p>Objective equipped-mod coverage and speed-secondary investment. No universal character-specific score is implied.</p></div></div>
      <div class="pro-table-wrap"><table class="workspace-table mods-character-table">
        <thead><tr><th>Character</th><th>GP</th><th>Equipped</th><th>Pip Mix</th><th>L15</th><th>Under 6</th><th>6-dot</th><th>Total +Speed</th><th>Best +Speed</th><th>+20</th><th>+25</th><th>Mods</th></tr></thead>
        <tbody>${visible.map((row) => `
          <tr>
            <td><button class="mods-character-link" type="button" data-inspect-base-id="${escapeAttr(row.baseId)}"><strong>${escapeHtml(row.name)}</strong><small>${row.relic > 0 ? `R${number(row.relic)}` : `G${number(row.gear)}`} · ${number(row.characterSpeed)} speed</small></button></td>
            <td>${number(row.power)}</td>
            <td><span class="mods-badge ${row.openSlots ? "warning" : "ready"}">${row.equipped}/6${row.openSlots ? ` · ${row.openSlots} open` : ""}</span></td>
            <td>${escapeHtml(pipMix(row))}</td>
            <td>${row.maxLevel}/${row.equipped}</td>
            <td><span class="mods-badge ${row.underSixDot ? "warning" : "ready"}">${number(row.underSixDot)}</span></td>
            <td>${number(row.sixDot)}</td>
            <td>${row.totalSpeedSecondary ? `+${number(row.totalSpeedSecondary)}` : "0"}</td>
            <td>${row.bestSpeedSecondary ? `+${number(row.bestSpeedSecondary)}` : "0"}</td>
            <td>${number(row.speed20Plus)}</td><td>${number(row.speed25Plus)}</td>
            <td><button type="button" data-show-character-mods="${escapeAttr(row.baseId)}">View ${row.equipped}</button></td>
          </tr>
        `).join("")}</tbody>
      </table></div>
    `,
  };
}

function statList(stats) {
  return (stats || []).length ? stats.map((stat) => `${statDisplay(stat)}${stat.rolls ? ` (${stat.rolls} rolls)` : ""}`).join(" · ") : "None";
}

function renderModsTable() {
  const rows = individualModRows();
  const visible = rows.slice(0, state.shown);
  return {
    rows,
    html: `
      <div class="database-heading"><div><div class="kicker">ALL EQUIPPED MODS</div><h3>${number(rows.length)} matching individual mods</h3><p>Every returned equipped mod is listed individually, including all 1–5 dot mods.</p></div></div>
      <div class="pro-table-wrap"><table class="workspace-table mods-all-table">
        <thead><tr><th>Character</th><th>Slot</th><th>Set</th><th>Pips</th><th>Level</th><th>Tier</th><th>Primary</th><th>Speed Secondary</th><th>Secondaries</th><th>Detail</th></tr></thead>
        <tbody>${visible.map((row, index) => `
          <tr class="${Number(row.pips) < 6 ? "mods-under-six-row" : "mods-six-row"}">
            <td><strong>${escapeHtml(row.characterName)}</strong><small>${escapeHtml(row.characterBaseId)}</small></td>
            <td>${escapeHtml(row.slotName)}</td><td>${escapeHtml(row.setName)}</td>
            <td><span class="mods-pip-badge pip-${Number(row.pips)}">${number(row.pips)}-dot</span></td>
            <td>${number(row.level)}</td><td>${number(row.tier)}</td>
            <td>${escapeHtml(statDisplay(row.primaryStat))}</td>
            <td><strong>${Number(row.speedSecondary) > 0 ? `+${number(row.speedSecondary)}` : "—"}</strong></td>
            <td>${escapeHtml(statList(row.secondaryStats))}</td>
            <td><button type="button" data-mod-detail-index="${index}">Inspect</button></td>
          </tr>
        `).join("")}</tbody>
      </table></div>
    `,
  };
}

function renderTable() {
  const output = $("modsProOutput");
  if (!output || !state.summary) return;
  const view = $("modsProView")?.value || "characters";
  const result = view === "mods" ? renderModsTable() : renderCharacterTable();
  output.innerHTML = result.html || '<div class="workspace-note">No rows match the current filters.</div>';
  $("modsProMore")?.classList.toggle("hidden", result.rows.length <= state.shown);

  for (const button of output.querySelectorAll("button[data-show-character-mods]")) {
    button.addEventListener("click", () => {
      const row = state.characters.find((candidate) => candidate.baseId === button.dataset.showCharacterMods);
      $("modsProView").value = "mods";
      $("modsProSearch").value = row?.name || button.dataset.showCharacterMods || "";
      $("modsProPips").value = "All";
      $("modsProFocus").value = "All";
      state.shown = 200;
      renderTable();
    });
  }
  const visibleMods = view === "mods" ? result.rows.slice(0, state.shown) : [];
  for (const button of output.querySelectorAll("button[data-mod-detail-index]")) {
    button.addEventListener("click", () => {
      const mod = visibleMods[Number(button.dataset.modDetailIndex)];
      if (mod) openModDetail(mod);
    });
  }
}

function openModDetail(mod) {
  const dialog = $("modsProDialog");
  const body = $("modsProDialogBody");
  if (!dialog || !body) return;
  body.innerHTML = `
    <div class="kicker">EQUIPPED MOD DETAIL</div>
    <h2>${escapeHtml(mod.characterName)}</h2>
    <div class="mods-detail-head">
      <span class="mods-pip-badge pip-${Number(mod.pips)}">${number(mod.pips)}-dot</span>
      <strong>${escapeHtml(mod.setName)} · ${escapeHtml(mod.slotName)}</strong>
      <span>Level ${number(mod.level)} · Tier ${number(mod.tier)}</span>
    </div>
    <div class="mods-detail-grid">
      <div><span>Primary</span><strong>${escapeHtml(statDisplay(mod.primaryStat))}</strong></div>
      <div><span>Speed secondary</span><strong>${Number(mod.speedSecondary) > 0 ? `+${number(mod.speedSecondary)}` : "None"}</strong></div>
      <div><span>Definition</span><strong>${escapeHtml(mod.definitionId || "N/A")}</strong></div>
      <div><span>Static definition</span><strong>${mod.definitionResolved ? "Resolved" : "Fallback decoded"}</strong></div>
    </div>
    <h3>Secondaries</h3>
    <div class="mods-secondary-list">${(mod.secondaryStats || []).length ? (mod.secondaryStats || []).map((stat) => `
      <div><strong>${escapeHtml(statDisplay(stat))}</strong><span>${stat.rolls ? `${number(stat.rolls)} roll${Number(stat.rolls) === 1 ? "" : "s"}` : "Roll count not returned"}</span></div>
    `).join("") : '<p class="workspace-note">No secondary stats returned on this mod.</p>'}</div>
    <p class="workspace-note">Raw public equipped-mod values are normalized for display. This does not expose or infer unequipped mod inventory.</p>
  `;
  dialog.showModal();
}

if (!setupPanel()) {
  const observer = new MutationObserver(() => {
    if (setupPanel()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
