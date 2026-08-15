import { extractAbilitySemantics, summarizeUnitKit } from "./kit-semantics.js?v=20260815-kit1";

let catalogPromise = null;
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function ensureCss() {
  if (document.getElementById("kit-intelligence-style")) return;
  const style = document.createElement("style");
  style.id = "kit-intelligence-style";
  style.textContent = `
    .kit-intelligence{margin:18px 0;padding:16px;border:1px solid rgba(115,155,255,.22);border-radius:14px;background:rgba(12,18,31,.72)}
    .kit-intelligence-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}
    .kit-intelligence-head h3{margin:2px 0 0}.kit-intelligence-head small{max-width:520px;color:#9aa7bd;text-align:right}
    .kit-capabilities,.kit-statuses{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.kit-chip{padding:5px 8px;border:1px solid rgba(151,171,214,.22);border-radius:999px;font-size:12px;background:rgba(255,255,255,.035)}
    .kit-chip.buff{border-color:rgba(67,211,142,.35)}.kit-chip.debuff{border-color:rgba(244,112,112,.35)}
    .kit-ability-grid{display:grid;gap:10px}.kit-ability-card{padding:11px;border:1px solid rgba(151,171,214,.14);border-radius:10px;background:rgba(255,255,255,.025)}
    .kit-ability-card header{display:flex;justify-content:space-between;gap:12px}.kit-ability-card header span{font-size:11px;text-transform:uppercase;color:#93a5c7}.kit-mechanics{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.kit-mechanics span{font-size:11px;padding:4px 6px;border-radius:6px;background:rgba(88,121,200,.12)}
    .kit-boundary{margin:12px 0 0;color:#91a0b7;font-size:12px;line-height:1.45}
  `;
  document.head.appendChild(style);
}

async function catalogMap() {
  catalogPromise ||= fetch("/data/catalog.json?kit=1", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
      return response.json();
    })
    .then((body) => new Map((body?.units || []).map((unit) => [String(unit.baseId), unit])));
  return catalogPromise;
}

function label(kind) {
  return String(kind || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function render(baseId, unit) {
  const dialog = document.getElementById("details");
  if (!dialog?.open || !unit) return false;
  const shell = dialog.querySelector(".inspector-shell");
  if (!shell) return false;
  shell.querySelector(".kit-intelligence")?.remove();

  const abilities = (unit.abilities || []).map((ability) => ({
    ...ability,
    semantics: ability.semantics || extractAbilitySemantics(ability),
  }));
  const kit = unit.kit || summarizeUnitKit({ ...unit, abilities });
  const section = document.createElement("section");
  section.className = "kit-intelligence";
  section.dataset.kitBaseId = baseId;
  section.innerHTML = `
    <div class="kit-intelligence-head">
      <div><div class="kicker">CHARACTER KIT INTELLIGENCE</div><h3>Structured Combat Mechanics</h3></div>
      <small>${escapeHtml(kit.abilityCount)} abilities · ${escapeHtml(kit.zetaAbilityCount)} Zeta-capable · ${escapeHtml(kit.omicronAbilityCount)} Omicron-capable</small>
    </div>
    <div class="kit-capabilities">${(kit.mechanicKinds || []).map((kind) => `<span class="kit-chip">${escapeHtml(label(kind))}</span>`).join("") || '<span class="kit-chip">No explicit mechanics extracted</span>'}</div>
    ${(kit.buffs || []).length ? `<div class="kit-statuses"><strong>Buffs:</strong>${kit.buffs.map((name) => `<span class="kit-chip buff">${escapeHtml(name)}</span>`).join("")}</div>` : ""}
    ${(kit.debuffs || []).length ? `<div class="kit-statuses"><strong>Debuffs:</strong>${kit.debuffs.map((name) => `<span class="kit-chip debuff">${escapeHtml(name)}</span>`).join("")}</div>` : ""}
    <div class="kit-ability-grid">${abilities.map((ability) => {
      const semantics = ability.semantics;
      return `<article class="kit-ability-card">
        <header><strong>${escapeHtml(ability.name || ability.id || "Ability")}</strong><span>${escapeHtml(semantics.abilityType || ability.type || "ability")}${ability.zeta ? " · Zeta" : ""}${ability.omicron ? ` · Omicron mode ${Number(ability.omicronMode || 0)}` : ""}</span></header>
        <div class="kit-mechanics">${(semantics.mechanicKinds || []).map((kind) => `<span>${escapeHtml(label(kind))}</span>`).join("") || "<span>No explicit semantic tags</span>"}</div>
      </article>`;
    }).join("")}</div>
    <p class="kit-boundary"><strong>Evidence boundary:</strong> these tags come from current localized game-data ability text. They identify explicit kit mechanics, but do not claim undocumented effect-script behavior, AI targeting, exact damage formulas, or battle win rates. Raw effect-graph normalization is the next validation layer.</p>`;

  const abilitiesSection = shell.querySelector(".inspector-abilities");
  if (abilitiesSection) shell.insertBefore(section, abilitiesSection);
  else shell.appendChild(section);
  return true;
}

async function inspectKit(baseId) {
  const id = String(baseId || "").trim();
  if (!id) return;
  ensureCss();
  try {
    const map = await catalogMap();
    const unit = map.get(id);
    if (!unit) return;
    for (const delay of [20, 80, 180, 400]) {
      setTimeout(() => render(id, unit), delay);
    }
  } catch (error) {
    console.error("Kit Intelligence failed", error);
  }
}

window.swgohInspectKit = inspectKit;
if (window.__swgohKitInspectPending) void inspectKit(window.__swgohKitInspectPending);

window.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("[data-inspect-base-id],button[data-base-id],button[data-catalog-base-id],button[data-squad-base-id]");
  const baseId = trigger?.dataset?.inspectBaseId || trigger?.dataset?.baseId || trigger?.dataset?.catalogBaseId || trigger?.dataset?.squadBaseId;
  if (baseId) void inspectKit(baseId);
}, true);
