const state = {
  mineCode: "",
  roster: null,
  selected: new Set(),
  leaderBaseId: "",
  datacronId: "",
  saved: [],
  search: "",
  requestId: 0,
  busy: false,
};

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}
function currentRound() {
  const round = Number(byId("gacBracketRound")?.value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function squadSize() { return Number(byId("gacMode")?.value) === 3 ? 3 : 5; }

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, { headers: { Accept: "application/json", ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}
function postJson(pathname, body, method = "POST") {
  return fetchJson(pathname, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}

function characterUnits() {
  const values = Array.isArray(state.roster?.units) ? state.roster.units : [];
  return [...values].sort((a, b) => n(b?.power) - n(a?.power) || clean(a?.name).localeCompare(clean(b?.name)));
}
function unitIndex() { return new Map(characterUnits().map((unit) => [clean(unit?.baseId), unit])); }
function selectedUnits() {
  const index = unitIndex();
  return [...state.selected].map((id) => index.get(id)).filter(Boolean);
}
function datacrons() { return Array.isArray(state.roster?.datacrons) ? state.roster.datacrons : []; }

function ensureStyles() {
  if (document.querySelector('link[data-gac-own-defense="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-own-defense-reserve.css?v=20260819-gacreserve1";
  link.dataset.gacOwnDefense = "true";
  document.head.append(link);
}

function ensurePanel() {
  let panel = byId("gacOwnDefenseReserve");
  if (panel) return panel;
  const anchor = byId("gacDatacronIntelligence") || byId("gacComparison");
  if (!anchor) return null;
  panel = document.createElement("section");
  panel.id = "gacOwnDefenseReserve";
  panel.className = "gac-own-defense-panel";
  panel.innerHTML = `
    <div class="gac-own-defense-head">
      <div><div class="kicker">MY DEFENSE · ATTACK RESERVE</div><h4>Lock characters already placed on your GAC defense</h4><p>Public GAC data cannot see your hidden/current defense. Save only squads you actually placed; Command Center will exclude every saved member from whole-board attack planning.</p></div>
      <span>VERIFIED OWNER EVIDENCE</span>
    </div>
    <div class="gac-own-defense-toolbar">
      <input id="gacOwnDefenseSearch" type="search" placeholder="Search your roster…" autocomplete="off">
      <select id="gacOwnDefenseLeader"><option value="">Leader · select squad first</option></select>
      <select id="gacOwnDefenseDatacron"><option value="">Own defense datacron · none</option></select>
      <button id="gacOwnDefenseSave" type="button" disabled>Save My Defense</button>
    </div>
    <div id="gacOwnDefenseStatus" class="gac-own-defense-status">Load your roster and confirm the current GAC opponent/round first.</div>
    <div id="gacOwnDefensePicker" class="gac-own-defense-picker"></div>
    <div class="gac-own-defense-saved-head"><strong>Saved this round</strong><span id="gacOwnDefenseReservedCount">0 attackers reserved</span></div>
    <div id="gacOwnDefenseSaved" class="gac-own-defense-saved"></div>`;
  anchor.insertAdjacentElement("afterend", panel);
  bindPanel(panel);
  return panel;
}

function unitCard(unit) {
  const id = clean(unit?.baseId);
  const checked = state.selected.has(id);
  const image = clean(unit?.image);
  const relic = n(unit?.relic);
  return `<label class="gac-own-unit ${checked ? "is-selected" : ""}" data-name="${escapeHtml(clean(unit?.name).toLowerCase())}">
    <input type="checkbox" value="${escapeHtml(id)}" ${checked ? "checked" : ""}>
    ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<span class="gac-own-unit-fallback">${escapeHtml(clean(unit?.name || id).slice(0, 2).toUpperCase())}</span>`}
    <span><strong>${escapeHtml(unit?.name || id)}</strong><small>${relic > 0 ? `R${relic}` : `G${n(unit?.gear)}`} · ${Math.round(n(unit?.power) / 1000)}k GP</small></span>
  </label>`;
}

function renderPicker() {
  const output = byId("gacOwnDefensePicker");
  if (!output) return;
  const query = state.search.toLowerCase();
  const values = characterUnits().filter((unit) => !query || clean(unit?.name).toLowerCase().includes(query) || clean(unit?.baseId).toLowerCase().includes(query));
  output.innerHTML = values.map(unitCard).join("") || `<div class="workspace-note">No roster characters match that search.</div>`;
  output.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => toggleUnit(clean(input.value), input.checked));
  });
}

function toggleUnit(id, checked) {
  const limit = squadSize();
  if (checked && !state.selected.has(id) && state.selected.size >= limit) {
    const status = byId("gacOwnDefenseStatus");
    if (status) status.textContent = `${limit}v${limit} defense is full. Clear a character before adding another.`;
    renderPicker();
    return;
  }
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  if (!state.selected.has(state.leaderBaseId)) state.leaderBaseId = "";
  renderPicker();
  renderSelectionControls();
}

function datacronOption(datacron, index) {
  const id = clean(datacron?.id);
  if (!id) return "";
  const level = Number.isFinite(Number(datacron?.level)) ? Number(datacron.level) : (Array.isArray(datacron?.affixes) ? datacron.affixes.length : 0);
  return `<option value="${escapeHtml(id)}" ${state.datacronId === id ? "selected" : ""}>L${level} · Set ${escapeHtml(datacron?.setId ?? "?")} · ${escapeHtml(id.slice(-8) || `#${index + 1}`)}</option>`;
}

function renderSelectionControls() {
  const leader = byId("gacOwnDefenseLeader");
  const dc = byId("gacOwnDefenseDatacron");
  const status = byId("gacOwnDefenseStatus");
  const selected = selectedUnits();
  if (leader) {
    leader.innerHTML = `<option value="">Leader · ${selected.length ? "select" : "select squad first"}</option>${selected.map((unit) => `<option value="${escapeHtml(unit.baseId)}" ${state.leaderBaseId === unit.baseId ? "selected" : ""}>${escapeHtml(unit.name || unit.baseId)}</option>`).join("")}`;
    leader.value = state.leaderBaseId;
  }
  if (dc) {
    dc.innerHTML = `<option value="">Own defense datacron · none</option>${datacrons().map(datacronOption).join("")}`;
    if (!datacrons().some((entry) => clean(entry?.id) === state.datacronId)) state.datacronId = "";
    dc.value = state.datacronId;
  }
  const size = squadSize();
  const round = currentRound();
  const ready = state.selected.size === size && state.selected.has(state.leaderBaseId) && Boolean(round) && /^\d{9}$/.test(state.mineCode);
  const button = byId("gacOwnDefenseSave");
  if (button) {
    button.disabled = state.busy || !ready;
    button.textContent = state.busy ? "Saving…" : "Save My Defense";
  }
  if (status && !state.busy) {
    status.textContent = `${state.selected.size}/${size} selected${state.leaderBaseId ? ` · leader ${unitIndex().get(state.leaderBaseId)?.name || state.leaderBaseId}` : " · choose leader"}${round ? ` · Round ${round}` : " · select current round"}`;
  }
}

function savedCard(defense) {
  const index = unitIndex();
  const members = (defense?.members || []).map((id) => index.get(clean(id))).filter(Boolean);
  const leader = index.get(clean(defense?.leaderBaseId));
  const dc = defense?.datacron?.id ? ` · DC L${n(defense.datacron.level)}` : "";
  return `<article class="gac-own-saved-card" data-id="${escapeHtml(defense?.id ?? "")}">
    <div><strong>${escapeHtml(leader?.name || defense?.leaderBaseId || "Saved defense")}</strong><small>${members.map((unit) => escapeHtml(unit.name)).join(" · ")}${escapeHtml(dc)}</small></div>
    <div class="gac-own-saved-actions"><button type="button" data-load="${escapeHtml(defense?.id ?? "")}">Edit</button><button type="button" class="danger" data-delete="${escapeHtml(defense?.id ?? "")}">Remove</button></div>
  </article>`;
}

function renderSaved() {
  const output = byId("gacOwnDefenseSaved");
  const counter = byId("gacOwnDefenseReservedCount");
  const reserved = new Set(state.saved.flatMap((defense) => Array.isArray(defense?.members) ? defense.members.map(clean) : []));
  if (counter) counter.textContent = `${reserved.size} attacker${reserved.size === 1 ? "" : "s"} reserved`;
  if (!output) return;
  output.innerHTML = state.saved.length ? state.saved.map(savedCard).join("") : `<div class="workspace-note">No own-defense squads saved for this verified current round.</div>`;
  output.querySelectorAll("[data-load]").forEach((button) => button.addEventListener("click", () => loadSavedIntoEditor(button.dataset.load)));
  output.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void deleteSaved(button.dataset.delete)));
}

function loadSavedIntoEditor(id) {
  const defense = state.saved.find((entry) => String(entry?.id ?? "") === String(id));
  if (!defense) return;
  const size = Array.isArray(defense.members) && defense.members.length === 3 ? 3 : 5;
  const mode = byId("gacMode");
  if (mode && Number(mode.value) !== size) {
    mode.value = String(size);
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  state.selected = new Set((defense.members || []).map(clean));
  state.leaderBaseId = clean(defense.leaderBaseId);
  const dcId = clean(defense?.datacron?.id);
  state.datacronId = datacrons().some((entry) => clean(entry?.id) === dcId) ? dcId : "";
  renderPicker();
  renderSelectionControls();
  const status = byId("gacOwnDefenseStatus");
  if (status) status.textContent = dcId && !state.datacronId
    ? "Saved squad loaded. Its previous datacron is not in your current live inventory, so it was not re-selected."
    : "Saved own-defense squad loaded for editing.";
}

function notifyBoardChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("gac-board-evidence-updated", { detail: { owner: "player", round: currentRound() } }));
}

async function loadSaved() {
  const round = currentRound();
  if (!/^\d{9}$/.test(state.mineCode) || !round) {
    state.saved = [];
    renderSaved();
    return;
  }
  try {
    const body = await fetchJson(`/api/gac/current-board/${state.mineCode}/my-defense?round=${round}`);
    state.saved = Array.isArray(body?.defenses) ? body.defenses : [];
  } catch (error) {
    state.saved = [];
    if (![401, 409].includes(Number(error?.status))) {
      const status = byId("gacOwnDefenseStatus");
      if (status) status.textContent = `Saved own-defense evidence unavailable: ${error?.message || "request failed"}`;
    }
  }
  renderSaved();
  notifyBoardChanged();
}

async function saveCurrent() {
  const round = currentRound();
  const size = squadSize();
  if (!round || state.selected.size !== size || !state.selected.has(state.leaderBaseId)) return;
  state.busy = true;
  renderSelectionControls();
  const status = byId("gacOwnDefenseStatus");
  if (status) status.textContent = "Revalidating your current live roster and saving own-defense reserve…";
  try {
    const result = await postJson(`/api/gac/current-board/${state.mineCode}/my-defense`, {
      round,
      size,
      leaderBaseId: state.leaderBaseId,
      members: [...state.selected],
      datacronId: state.datacronId,
    });
    if (status) status.textContent = `Own defense saved for Round ${result.round}. ${size} attackers are now reserved from attack planning.`;
    await loadSaved();
  } catch (error) {
    if (status) {
      if (Number(error?.status) === 401) status.textContent = "Sign in with the verified owner account to save your GAC defense.";
      else if (Number(error?.status) === 409) status.textContent = `Own defense not saved: ${error?.message || "confirm current opponent/round first"}`;
      else status.textContent = `Own defense not saved: ${error?.message || "request failed"}`;
    }
  } finally {
    state.busy = false;
    renderSelectionControls();
  }
}

async function deleteSaved(id) {
  const round = currentRound();
  if (!round || !id) return;
  const status = byId("gacOwnDefenseStatus");
  try {
    await postJson(`/api/gac/current-board/${state.mineCode}/my-defense`, { id: Number(id), round }, "DELETE");
    if (status) status.textContent = "Saved own-defense squad removed from the current attack reserve.";
    await loadSaved();
  } catch (error) {
    if (status) status.textContent = `Could not remove saved defense: ${error?.message || "request failed"}`;
  }
}

async function loadRoster() {
  const code = allyCode(byId("allyCode")?.value);
  if (!/^\d{9}$/.test(code)) return;
  if (code !== state.mineCode) {
    state.mineCode = code;
    state.selected = new Set();
    state.leaderBaseId = "";
    state.datacronId = "";
    state.saved = [];
  }
  const token = ++state.requestId;
  const status = byId("gacOwnDefenseStatus");
  if (status) status.textContent = "Loading your live roster for defense reserve…";
  try {
    const roster = await fetchJson(`/api/player/${code}`);
    if (token !== state.requestId) return;
    state.roster = roster;
    renderPicker();
    renderSelectionControls();
    await loadSaved();
  } catch (error) {
    if (token !== state.requestId) return;
    state.roster = null;
    if (status) status.textContent = `Your live roster could not be loaded: ${error?.message || "request failed"}`;
  }
}

function bindPanel(panel) {
  if (panel.dataset.bound === "true") return;
  panel.dataset.bound = "true";
  byId("gacOwnDefenseSearch")?.addEventListener("input", (event) => {
    state.search = clean(event.target.value);
    renderPicker();
  });
  byId("gacOwnDefenseLeader")?.addEventListener("change", (event) => {
    state.leaderBaseId = clean(event.target.value);
    renderSelectionControls();
  });
  byId("gacOwnDefenseDatacron")?.addEventListener("change", (event) => {
    state.datacronId = clean(event.target.value);
    renderSelectionControls();
  });
  byId("gacOwnDefenseSave")?.addEventListener("click", () => void saveCurrent());
}

function bindSharedControls() {
  const round = byId("gacBracketRound");
  if (round && round.dataset.ownDefenseBound !== "true") {
    round.dataset.ownDefenseBound = "true";
    round.addEventListener("change", () => {
      state.selected = new Set();
      state.leaderBaseId = "";
      state.datacronId = "";
      renderPicker();
      renderSelectionControls();
      void loadSaved();
    });
  }
  const mode = byId("gacMode");
  if (mode && mode.dataset.ownDefenseBound !== "true") {
    mode.dataset.ownDefenseBound = "true";
    mode.addEventListener("change", () => {
      state.selected = new Set();
      state.leaderBaseId = "";
      renderPicker();
      renderSelectionControls();
    });
  }
  const form = byId("gacMatchupForm");
  if (form && form.dataset.ownDefenseBound !== "true") {
    form.dataset.ownDefenseBound = "true";
    form.addEventListener("submit", () => setTimeout(() => void loadRoster(), 0));
  }
}

function ensureMounted() {
  ensureStyles();
  const panel = ensurePanel();
  bindSharedControls();
  if (panel && /^\d{9}$/.test(allyCode(byId("allyCode")?.value)) && state.mineCode !== allyCode(byId("allyCode")?.value)) void loadRoster();
}

if (typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
  new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
}

export { currentRound, savedCard, squadSize, unitCard };
