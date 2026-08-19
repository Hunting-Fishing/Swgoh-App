import { displaySlotFromBackend, zoneLabel, ZONES } from "./gac-board-position.js";

const state = { requestId: 0, timer: null };
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

function normalizeDefense(defense = {}) {
  const zone = clean(defense?.zone).toUpperCase();
  const slot = defense?.slot == null ? null : Number(defense.slot);
  const members = Array.isArray(defense?.members) ? defense.members.map(clean).filter(Boolean) : [];
  return Object.freeze({
    id: defense?.id ?? null,
    leaderBaseId: clean(defense?.leaderBaseId),
    members: Object.freeze(members),
    zone: ZONES.some((entry) => entry.value === zone) ? zone : "",
    slot: Number.isInteger(slot) && slot >= 0 && slot <= 99 ? slot : null,
    datacron: defense?.datacron || null,
    confidence: Number(defense?.confidence || 0),
    observedAt: clean(defense?.observedAt),
    source: clean(defense?.source),
  });
}

function groupBoardDefenses(defenses = []) {
  const groups = new Map(ZONES.map((entry) => [entry.value, []]));
  const unpositioned = [];
  for (const value of Array.isArray(defenses) ? defenses : []) {
    const defense = normalizeDefense(value);
    if (defense.zone && defense.slot !== null) groups.get(defense.zone).push(defense);
    else unpositioned.push(defense);
  }
  for (const values of groups.values()) values.sort((a, b) => a.slot - b.slot || String(a.leaderBaseId).localeCompare(String(b.leaderBaseId)));
  unpositioned.sort((a, b) => String(a.leaderBaseId).localeCompare(String(b.leaderBaseId)));
  return Object.freeze({
    zones: Object.freeze(ZONES.map((entry) => Object.freeze({
      value: entry.value,
      label: entry.label,
      defenses: Object.freeze(groups.get(entry.value)),
    }))),
    unpositioned: Object.freeze(unpositioned),
    total: [...groups.values()].reduce((sum, values) => sum + values.length, 0) + unpositioned.length,
    positioned: [...groups.values()].reduce((sum, values) => sum + values.length, 0),
  });
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function injectStyles() {
  if (document.querySelector('style[data-gac-saved-board-map="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacSavedBoardMap = "true";
  style.textContent = `
    .gac-saved-board-map { margin-top:.55rem; padding:.65rem; border:1px solid rgba(100,181,235,.2); border-radius:.72rem; background:rgba(11,24,38,.45); }
    .gac-saved-board-map-head { display:flex; justify-content:space-between; gap:.7rem; align-items:center; margin-bottom:.55rem; }
    .gac-saved-board-map-head strong { color:#c9ebff; font-size:.7rem; letter-spacing:.055em; }
    .gac-saved-board-map-head span { color:#75869b; font-size:.59rem; }
    .gac-saved-board-zones { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.45rem; }
    .gac-saved-board-zone { min-width:0; padding:.45rem; border:1px solid rgba(255,255,255,.07); border-radius:.58rem; background:rgba(255,255,255,.02); }
    .gac-saved-board-zone h5 { margin:0 0 .36rem; color:#829bb0; font-size:.58rem; letter-spacing:.08em; }
    .gac-saved-board-zone-list { display:grid; gap:.28rem; }
    .gac-saved-board-tile { display:grid; grid-template-columns:48px minmax(0,1fr) auto; gap:.42rem; align-items:center; width:100%; border:1px solid rgba(94,187,241,.18); border-radius:.5rem; padding:.4rem .45rem; background:rgba(28,74,103,.1); color:inherit; text-align:left; cursor:pointer; }
    .gac-saved-board-tile:hover { border-color:rgba(94,187,241,.42); background:rgba(31,94,132,.16); }
    .gac-saved-board-slot { color:#6fbbe8; font-size:.58rem; font-weight:900; letter-spacing:.04em; }
    .gac-saved-board-team { display:grid; gap:.08rem; min-width:0; }
    .gac-saved-board-team strong { overflow:hidden; text-overflow:ellipsis; color:#d7e5f1; font-size:.63rem; white-space:nowrap; }
    .gac-saved-board-team span { overflow:hidden; text-overflow:ellipsis; color:#708094; font-size:.53rem; white-space:nowrap; }
    .gac-saved-board-dc { color:#e2bd72; font-size:.53rem; white-space:nowrap; }
    .gac-saved-board-empty { color:#59687a; font-size:.55rem; font-style:italic; }
    .gac-saved-board-unpositioned { margin-top:.45rem; padding-top:.45rem; border-top:1px dashed rgba(255,255,255,.09); }
    .gac-saved-board-unpositioned > strong { display:block; margin-bottom:.3rem; color:#9a8f78; font-size:.56rem; letter-spacing:.05em; }
    @media(max-width:760px){.gac-saved-board-zones{grid-template-columns:1fr}.gac-saved-board-tile{grid-template-columns:46px minmax(0,1fr)}}
  `;
  document.head.append(style);
}

function unitNameIndex() {
  const values = document.querySelectorAll('#gacDefensePicker input[type="checkbox"]');
  const index = new Map();
  for (const input of values) {
    const label = input.closest("label")?.textContent?.trim() || "";
    if (clean(input.value)) index.set(clean(input.value), label || clean(input.value));
  }
  return index;
}

function tileHtml(defense, index) {
  const leader = index.get(defense.leaderBaseId) || defense.leaderBaseId || "Unknown defense";
  const members = defense.members.map((id) => index.get(id) || id).join(" / ");
  const slot = defense.slot === null ? "—" : displaySlotFromBackend(defense.slot);
  const dc = clean(defense?.datacron?.id) ? `DC L${Number(defense?.datacron?.level || 0)}` : "";
  return `<button type="button" class="gac-saved-board-tile" data-saved-defense-id="${escapeHtml(defense.id)}">
    <span class="gac-saved-board-slot">SLOT ${escapeHtml(slot)}</span>
    <span class="gac-saved-board-team"><strong>${escapeHtml(leader)}</strong><span>${escapeHtml(members)}</span></span>
    ${dc ? `<span class="gac-saved-board-dc">${escapeHtml(dc)}</span>` : ""}
  </button>`;
}

function mount() {
  const control = document.querySelector(".gac-defense-datacron-control");
  if (!control) return null;
  let panel = byId("gacSavedBoardMap");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "gacSavedBoardMap";
    panel.className = "gac-saved-board-map";
    panel.innerHTML = `<div class="gac-saved-board-map-head"><strong>VERIFIED CURRENT BOARD MAP</strong><span>Waiting for saved defenses…</span></div><div class="gac-saved-board-zones"></div>`;
    control.insertAdjacentElement("afterend", panel);
  }
  return panel;
}

function render(defenses = []) {
  injectStyles();
  const panel = mount();
  if (!panel) return;
  const model = groupBoardDefenses(defenses);
  const index = unitNameIndex();
  const head = panel.querySelector(".gac-saved-board-map-head span");
  const grid = panel.querySelector(".gac-saved-board-zones");
  if (head) head.textContent = `${number.format(model.total)} saved · ${number.format(model.positioned)} positioned`;
  if (!grid) return;
  grid.innerHTML = model.zones.map((zone) => `<article class="gac-saved-board-zone" data-board-zone="${escapeHtml(zone.value)}">
    <h5>${escapeHtml(zone.label.toUpperCase())} · ${number.format(zone.defenses.length)}</h5>
    <div class="gac-saved-board-zone-list">${zone.defenses.length ? zone.defenses.map((defense) => tileHtml(defense, index)).join("") : `<span class="gac-saved-board-empty">No positioned defenses saved.</span>`}</div>
  </article>`).join("");
  panel.querySelector(".gac-saved-board-unpositioned")?.remove();
  if (model.unpositioned.length) {
    panel.insertAdjacentHTML("beforeend", `<div class="gac-saved-board-unpositioned"><strong>UNPOSITIONED SAVES · ${number.format(model.unpositioned.length)}</strong><div class="gac-saved-board-zone-list">${model.unpositioned.map((defense) => tileHtml(defense, index)).join("")}</div></div>`);
  }
}

async function refresh() {
  const mine = allyCode(byId("allyCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  if (!/^\d{9}$/.test(mine) || !round) {
    render([]);
    return;
  }
  const requestId = ++state.requestId;
  try {
    const body = await fetchJson(`/api/gac/current-board/${mine}/defense?round=${round}`);
    if (requestId !== state.requestId) return;
    const selectedOpponent = allyCode(byId("gacOpponentCode")?.value);
    if (selectedOpponent && allyCode(body?.opponent?.allyCode) !== selectedOpponent) return;
    render(Array.isArray(body?.defenses) ? body.defenses : []);
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (![401, 409].includes(Number(error?.status))) console.warn("Saved GAC board map unavailable", error);
  }
}

function schedule(delay = 250) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(), Math.max(0, delay));
}

function bind() {
  if (document.documentElement.dataset.gacSavedBoardMapBound === "true") return;
  document.documentElement.dataset.gacSavedBoardMapBound = "true";
  document.addEventListener("click", (event) => {
    const tile = event.target.closest?.("[data-saved-defense-id]");
    if (tile) {
      const select = byId("gacSavedDefense");
      if (select) {
        select.value = clean(tile.dataset.savedDefenseId);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }
      return;
    }
  });
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacOpponentCode", "gacBracketRound"].includes(event.target?.id)) schedule(200);
  });
  window.addEventListener("gac-board-evidence-updated", () => schedule(100));
  window.addEventListener("hashchange", () => schedule(200));
}

function ensureMounted() {
  mount();
  bind();
  schedule(120);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  new MutationObserver(() => mount()).observe(document.documentElement, { childList: true, subtree: true });
}

export { groupBoardDefenses, normalizeDefense };
