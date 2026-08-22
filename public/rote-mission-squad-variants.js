const STORAGE_PREFIX = "swgoh:rote-mission-variants:v1";
const MAX_VARIANTS = 12;

const state = {
  scheduled: false,
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);

function currentContext() {
  return window.__swgohSquadMissionContext || null;
}

function currentAllyCode() {
  return digits(window.__swgohLiveSnapshot?.allyCode || document.getElementById("allyCode")?.value);
}

function currentSquadBaseIds() {
  return [...document.querySelectorAll("#proSquadBuilder [data-squad-remove]")]
    .map((button) => String(button.dataset.squadRemove || ""))
    .filter(Boolean);
}

function storageKey(context = currentContext(), allyCode = currentAllyCode()) {
  const missionId = String(context?.missionId || "");
  if (allyCode.length !== 9 || !missionId) return "";
  return `${STORAGE_PREFIX}:${allyCode}:${missionId}`;
}

export function normalizeMissionVariant(value = {}) {
  const baseIds = [...new Set((Array.isArray(value.baseIds) ? value.baseIds : []).map(String).filter(Boolean))].slice(0, 8);
  return Object.freeze({
    id: String(value.id || ""),
    name: String(value.name || "Variant").trim().slice(0, 60) || "Variant",
    baseIds: Object.freeze(baseIds),
    planetId: String(value.planetId || ""),
    nodeId: String(value.nodeId || ""),
    missionId: String(value.missionId || ""),
    missionName: String(value.missionName || ""),
    sourceLabel: String(value.sourceLabel || value.recommendationName || "Manual squad").slice(0, 120),
    savedEntryStatus: String(value.savedEntryStatus || "Not evaluated").slice(0, 80),
    createdAt: Number(value.createdAt || Date.now()),
  });
}

export function parseMissionVariants(raw = "") {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMissionVariant).filter((variant) => variant.id && variant.missionId && variant.baseIds.length);
  } catch {
    return [];
  }
}

function readVariants() {
  const key = storageKey();
  if (!key) return [];
  try {
    return parseMissionVariants(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeVariants(variants) {
  const key = storageKey();
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(variants.slice(0, MAX_VARIANTS)));
    return true;
  } catch {
    return false;
  }
}

function unitMap() {
  const body = window.__swgohLiveSnapshot?.body || {};
  return new Map([...(body.units || []), ...(body.ships || [])].map((unit) => [String(unit.baseId || ""), unit]).filter(([baseId]) => baseId));
}

function memberNames(baseIds = []) {
  const map = unitMap();
  return baseIds.map((baseId) => map.get(String(baseId))?.name || baseId);
}

function currentEntryStatus() {
  return document.querySelector("#proSquadRoteContext .squad-rote-head-actions b")?.textContent?.trim() || "Not evaluated";
}

function nextVariantName(variants = []) {
  const used = new Set(variants.map((variant) => variant.name));
  let index = variants.length + 1;
  while (used.has(`Variant ${index}`)) index += 1;
  return `Variant ${index}`;
}

export function buildMissionVariant({ context, allyCode, baseIds, name, entryStatus, existing = [] } = {}) {
  const missionId = String(context?.missionId || "");
  const code = digits(allyCode);
  const ids = [...new Set((baseIds || []).map(String).filter(Boolean))];
  if (code.length !== 9 || !missionId || !ids.length) return null;
  const createdAt = Date.now();
  return normalizeMissionVariant({
    id: `${createdAt}-${ids.join("-").slice(0, 32)}`,
    name: String(name || "").trim() || nextVariantName(existing),
    baseIds: ids,
    planetId: context.planetId,
    nodeId: context.nodeId,
    missionId,
    missionName: context.missionName,
    sourceLabel: context.sourceLabel || context.recommendationName || "Manual squad",
    savedEntryStatus: entryStatus || "Not evaluated",
    createdAt,
  });
}

function saveCurrentVariant() {
  const context = currentContext();
  const allyCode = currentAllyCode();
  const baseIds = currentSquadBaseIds();
  const variants = readVariants();
  const input = document.querySelector("[data-rote-variant-name]");
  const variant = buildMissionVariant({
    context,
    allyCode,
    baseIds,
    name: input?.value,
    entryStatus: currentEntryStatus(),
    existing: variants,
  });
  if (!variant) return false;
  const next = [variant, ...variants].slice(0, MAX_VARIANTS);
  if (!writeVariants(next)) return false;
  if (input) input.value = "";
  renderLibrary();
  return true;
}

function deleteVariant(id) {
  const next = readVariants().filter((variant) => variant.id !== String(id || ""));
  writeVariants(next);
  renderLibrary();
}

function loadVariant(variant) {
  if (!variant?.baseIds?.length) return;
  window.dispatchEvent(new CustomEvent("swgoh:set-squad-mission-context", {
    detail: {
      planetId: variant.planetId,
      nodeId: variant.nodeId,
      baseIds: [...variant.baseIds],
      sourceLabel: `Saved mission variant · ${variant.name}`,
    },
  }));
  window.dispatchEvent(new CustomEvent("swgoh:replace-squad", {
    detail: {
      baseIds: [...variant.baseIds],
      size: variant.baseIds.length,
      name: `ROTE ${variant.missionName || variant.missionId} · ${variant.name}`,
    },
  }));
  document.querySelector('button[data-workspace-tab="squads"]')?.click();
}

function variantMarkup(variant) {
  const names = memberNames(variant.baseIds);
  const date = Number.isFinite(variant.createdAt) ? new Date(variant.createdAt).toLocaleDateString() : "";
  return `<article class="rote-variant-row">
    <div class="rote-variant-copy">
      <span>${escapeHtml(variant.savedEntryStatus)} · ${escapeHtml(date)}</span>
      <strong>${escapeHtml(variant.name)}</strong>
      <small>${escapeHtml(names.join(" · "))}</small>
      <i>${escapeHtml(variant.sourceLabel)}</i>
    </div>
    <div class="rote-variant-actions">
      <button type="button" data-rote-variant-load="${escapeAttr(variant.id)}">Load + Re-evaluate</button>
      <button type="button" class="danger" data-rote-variant-delete="${escapeAttr(variant.id)}">Delete</button>
    </div>
  </article>`;
}

function libraryMarkup() {
  const context = currentContext();
  const baseIds = currentSquadBaseIds();
  const variants = readVariants();
  return `<section class="squad-rote-variants" data-squad-rote-variants>
    <div class="rote-variant-head">
      <div><span>MISSION VARIANT LIBRARY</span><strong>${escapeHtml(context?.missionName || "ROTE Mission")}</strong><small>Saved per Ally Code + mission. Entry status is a snapshot; every loaded variant is re-evaluated against the current roster and mission rules.</small></div>
      <b>${variants.length}/${MAX_VARIANTS}</b>
    </div>
    <div class="rote-variant-save">
      <input type="text" maxlength="60" data-rote-variant-name placeholder="Variant name (optional)" aria-label="Mission variant name">
      <button type="button" data-rote-variant-save${baseIds.length ? "" : " disabled"}>Save Current Variant</button>
    </div>
    <div class="rote-variant-boundary"><strong>Planning boundary:</strong> saved variants preserve squad composition and the status shown when saved. They do not freeze game rules, roster progression, or battle evidence; loading always re-runs the current mission-entry assessment.</div>
    <div class="rote-variant-list">${variants.length ? variants.map(variantMarkup).join("") : '<div class="rote-variant-empty">No saved variants for this mission and Ally Code yet.</div>'}</div>
  </section>`;
}

function renderLibrary() {
  state.scheduled = false;
  const contextPanel = document.getElementById("proSquadRoteContext");
  if (!contextPanel || !currentContext()) return;
  const existing = contextPanel.querySelector("[data-squad-rote-variants]");
  const shell = document.createElement("div");
  shell.innerHTML = libraryMarkup().trim();
  const next = shell.firstElementChild;
  if (!next) return;
  if (existing) existing.replaceWith(next);
  else contextPanel.appendChild(next);
}

function scheduleRender() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(renderLibrary);
}

function install() {
  const observer = new MutationObserver(() => scheduleRender());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-rote-variant-save]")) {
      event.preventDefault();
      saveCurrentVariant();
      return;
    }
    const load = event.target.closest?.("[data-rote-variant-load]");
    if (load) {
      event.preventDefault();
      const variant = readVariants().find((row) => row.id === load.dataset.roteVariantLoad);
      if (variant) loadVariant(variant);
      return;
    }
    const remove = event.target.closest?.("[data-rote-variant-delete]");
    if (remove) {
      event.preventDefault();
      deleteVariant(remove.dataset.roteVariantDelete);
    }
  }, true);

  window.addEventListener("swgoh:squad-mission-context", scheduleRender);
  window.addEventListener("swgoh:add-to-squad", scheduleRender);
  window.addEventListener("swgoh:replace-squad", scheduleRender);
  document.getElementById("allyForm")?.addEventListener("submit", () => setTimeout(scheduleRender, 500));
  scheduleRender();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
