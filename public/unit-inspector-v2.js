const inspector = {
  catalogMap: new Map(),
  catalogLoaded: false,
  liveBody: null,
  allyCode: "",
  liveFetchedAt: 0,
};

const LIVE_CACHE_MS = 25_000;
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

async function ensureCatalog() {
  if (inspector.catalogLoaded) return;
  const response = await fetch("/data/catalog.json?inspector=2", { cache: "no-store" });
  if (!response.ok) throw new Error(`Game catalog returned HTTP ${response.status}`);
  const body = await response.json();
  inspector.catalogMap = new Map((body?.units || []).map((unit) => [String(unit.baseId), unit]));
  inspector.catalogLoaded = true;
}

async function ensureLive() {
  const allyCode = digits(document.getElementById("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < LIVE_CACHE_MS) {
    inspector.liveBody = shared.body;
    inspector.allyCode = allyCode;
    inspector.liveFetchedAt = Number(shared.fetchedAt || Date.now());
    return shared.body;
  }
  if (inspector.liveBody && inspector.allyCode === allyCode && Date.now() - inspector.liveFetchedAt < LIVE_CACHE_MS) {
    return inspector.liveBody;
  }
  try {
    const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return null;
    inspector.liveBody = body;
    inspector.allyCode = allyCode;
    inspector.liveFetchedAt = Date.now();
    window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: inspector.liveFetchedAt };
    return body;
  } catch {
    return null;
  }
}

function liveUnitFor(body, baseId) {
  if (!body) return null;
  return [...(body.units || []), ...(body.ships || [])].find((unit) => String(unit.baseId) === baseId) || null;
}

function value(unit, ...keys) {
  for (const key of keys) {
    if (unit?.[key] !== undefined && unit?.[key] !== null) return unit[key];
  }
  return 0;
}

function imageHtml(unit, staticUnit, baseId) {
  const image = unit?.image || staticUnit?.image || "";
  const fallback = unit?.imageFallback || (unit?.image && staticUnit?.image && unit.image !== staticUnit.image ? staticUnit.image : "");
  if (!image) return '<div class="inspector-portrait inspector-portrait-fallback">?</div>';
  return `<img class="inspector-portrait" src="${escapeAttr(image)}" ${fallback ? `data-fallback-src="${escapeAttr(fallback)}"` : ""} alt="${escapeAttr(unit?.name || staticUnit?.name || baseId)}">`;
}

function abilityRows(staticUnit, liveUnit) {
  const staticAbilities = Array.isArray(staticUnit?.abilities) ? staticUnit.abilities : [];
  const liveAbilities = Array.isArray(liveUnit?.abilities) ? liveUnit.abilities : [];
  const liveById = new Map(liveAbilities.filter((ability) => ability?.id).map((ability) => [String(ability.id), ability]));
  const abilities = staticAbilities.length ? staticAbilities : liveAbilities;
  if (!abilities.length) return '<div class="inspector-empty">No normalized ability definitions are available for this unit.</div>';

  return abilities.map((ability, index) => {
    const live = liveById.get(String(ability.id || "")) || liveAbilities[index] || {};
    const ownedTier = Number(live.currentTier ?? live.tier ?? live.level ?? 0);
    const maxTier = Number(ability.maxTier || live.maxTier || 0);
    const flags = [ability.omega ? "Ω Omega" : "", ability.zeta ? "Zeta" : "", ability.omicron ? "Omicron" : ""].filter(Boolean);
    return `
      <article class="inspector-ability">
        <div class="inspector-ability-head">
          <div><strong>${escapeHtml(ability.name || ability.id || `Ability ${index + 1}`)}</strong><span>${escapeHtml(ability.type || "Ability")}</span></div>
          <div class="inspector-ability-tier">${ownedTier ? `Tier ${ownedTier}` : "Tier N/A"}${maxTier ? ` / ${maxTier}` : ""}</div>
        </div>
        ${flags.length ? `<div class="inspector-flags">${flags.map((flag) => `<span>${escapeHtml(flag)}</span>`).join("")}</div>` : ""}
        ${ability.description ? `<p>${escapeHtml(ability.description)}</p>` : ""}
      </article>
    `;
  }).join("");
}

function stat(label, current, suffix = "") {
  const has = current !== undefined && current !== null && current !== "";
  return `<div class="inspector-stat"><span>${escapeHtml(label)}</span><strong>${has ? `${escapeHtml(String(current))}${escapeHtml(suffix)}` : "N/A"}</strong></div>`;
}

function renderDialog(baseId, staticUnit, liveUnit) {
  const dialog = document.getElementById("details");
  if (!dialog) return;
  const unit = liveUnit || staticUnit || { baseId, name: baseId };
  const name = unit.name || staticUnit?.name || baseId;
  const owned = Boolean(liveUnit?.baseId);
  const stars = value(liveUnit, "stars", "rarity");
  const level = value(liveUnit, "level");
  const gear = value(liveUnit, "gear", "gearTier", "gearLevel", "tier");
  const relic = value(liveUnit, "relic", "relicTier", "relicLevel");
  const power = value(liveUnit, "power", "gp");
  const speed = value(liveUnit, "speed");
  const factions = liveUnit?.factions?.length ? liveUnit.factions : staticUnit?.factions || [];

  dialog.innerHTML = `
    <div class="inspector-shell">
      <header class="inspector-head">
        <div class="inspector-unit-head">
          ${imageHtml(liveUnit, staticUnit, baseId)}
          <div>
            <span class="kicker">${escapeHtml(staticUnit?.unitType || liveUnit?.unitType || "UNIT")} · ${owned ? "LIVE OWNED UNIT" : "GAME DATABASE"}</span>
            <h2>${escapeHtml(name)}</h2>
            <p>${escapeHtml(staticUnit?.role || liveUnit?.role || "")} ${factions.length ? `· ${escapeHtml(factions.slice(0, 6).join(" · "))}` : ""}</p>
          </div>
        </div>
        <button class="inspector-close" type="button" data-inspector-close aria-label="Close">×</button>
      </header>

      ${owned ? `
        <section class="inspector-stats">
          ${stat("Galactic Power", number(power))}
          ${stat("Level", level)}
          ${stat("Stars", stars, "★")}
          ${stat("Gear", gear ? `G${gear}` : "N/A")}
          ${stat("Relic", relic ? `R${relic}` : "R0")}
          ${stat("Speed", speed || "N/A")}
          ${stat("Zetas", value(liveUnit, "zetas"))}
          ${stat("Omegas", value(liveUnit, "omegas"))}
          ${stat("Omicrons", value(liveUnit, "omicrons"))}
        </section>
      ` : `<div class="inspector-not-owned">This unit is not present in the loaded player's public roster. Static game data is shown below.</div>`}

      ${staticUnit?.description ? `<section class="inspector-description"><h3>Description</h3><p>${escapeHtml(staticUnit.description)}</p></section>` : ""}
      <section class="inspector-abilities">
        <div class="inspector-section-head"><h3>Abilities</h3><span>${(staticUnit?.abilities || liveUnit?.abilities || []).length} definitions</span></div>
        ${abilityRows(staticUnit, liveUnit)}
      </section>
    </div>
  `;

  dialog.querySelector("[data-inspector-close]")?.addEventListener("click", () => dialog.close());
  const portrait = dialog.querySelector("img[data-fallback-src]");
  if (portrait) {
    portrait.addEventListener("error", () => {
      const fallback = portrait.dataset.fallbackSrc;
      if (fallback && portrait.src !== fallback) portrait.src = fallback;
    }, { once: true });
  }
  if (!dialog.open) dialog.showModal();
}

async function inspect(baseId) {
  const id = String(baseId || "").trim();
  if (!id) return;
  const dialog = document.getElementById("details");
  if (dialog) {
    dialog.innerHTML = '<div class="inspector-loading">Loading unit data…</div>';
    if (!dialog.open) dialog.showModal();
  }
  try {
    await ensureCatalog();
    const body = await ensureLive();
    renderDialog(id, inspector.catalogMap.get(id) || null, liveUnitFor(body, id));
  } catch (error) {
    if (dialog) dialog.innerHTML = `<div class="inspector-error"><strong>Unit inspection failed.</strong><p>${escapeHtml(error?.message || "Unknown error")}</p><button type="button" onclick="this.closest('dialog').close()">Close</button></div>`;
  }
}

function baseIdFromTrigger(trigger) {
  return String(
    trigger?.dataset?.inspectBaseId
    || trigger?.dataset?.baseId
    || trigger?.dataset?.catalogBaseId
    || trigger?.dataset?.squadBaseId
    || ""
  );
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(
    "[data-inspect-base-id], button[data-base-id], button[data-catalog-base-id], button[data-squad-base-id]"
  );
  if (!trigger) return;
  const baseId = baseIdFromTrigger(trigger);
  if (!baseId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  inspect(baseId);
}, true);

document.getElementById("allyForm")?.addEventListener("submit", () => {
  inspector.liveBody = null;
  inspector.liveFetchedAt = 0;
});

window.swgohInspectUnit = inspect;
