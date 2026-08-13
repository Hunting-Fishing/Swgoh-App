const state = { units: [], player: null };

const $ = (id) => document.getElementById(id);
const health = $("health");
const allyForm = $("allyForm");
const allyCode = $("allyCode");
const loadButton = $("loadButton");
const errorBox = $("error");
const profile = $("profile");
const controls = $("controls");
const roster = $("roster");
const empty = $("empty");
const search = $("search");
const alignment = $("alignment");
const sort = $("sort");
const count = $("count");
const details = $("details");

function compact(value) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function number(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function sanitizeAllyCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

function formatAllyCode(value) {
  const raw = sanitizeAllyCode(value);
  return raw.replace(/(\d{3})(?=\d)/g, "$1-");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.toggle("hidden", !message);
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const body = await response.json();
    if (response.ok && body.status === "ready") {
      health.textContent = "Live pipeline ready";
      health.className = "status ready";
    } else {
      health.textContent = "Gateway needs configuration";
      health.className = "status warning";
    }
  } catch {
    health.textContent = "Gateway unavailable";
    health.className = "status danger";
  }
}

allyCode.addEventListener("input", () => {
  allyCode.value = formatAllyCode(allyCode.value);
});

allyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = sanitizeAllyCode(allyCode.value);
  if (code.length !== 9) {
    showError("Enter a valid 9-digit Ally Code.");
    return;
  }

  loadButton.disabled = true;
  loadButton.textContent = "Loading…";
  showError("");

  try {
    const response = await fetch(`/api/player/${code}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `Live request failed with HTTP ${response.status}.`);
    if (body?.source !== "live" || !body?.player || !Array.isArray(body?.units)) {
      throw new Error("The live gateway returned an invalid roster response.");
    }

    state.player = body.player;
    state.units = body.units;
    renderProfile(body.player, body.fetchedAt);
    renderRoster();
    empty.classList.add("hidden");
    profile.classList.remove("hidden");
    controls.classList.remove("hidden");
    roster.classList.remove("hidden");
  } catch (error) {
    state.player = null;
    state.units = [];
    profile.classList.add("hidden");
    controls.classList.add("hidden");
    roster.classList.add("hidden");
    empty.classList.remove("hidden");
    showError(error.message || "Live SWGOH data is unavailable.");
  } finally {
    loadButton.disabled = false;
    loadButton.textContent = "Load Live Roster";
  }
});

function renderProfile(player, fetchedAt) {
  profile.innerHTML = `
    <div>
      <div class="kicker">CURRENT PLAYER</div>
      <h3>${escapeHtml(player.name)}</h3>
      <p>${escapeHtml(formatAllyCode(player.allyCode))}${player.guildName ? ` · ${escapeHtml(player.guildName)}` : ""}</p>
    </div>
    <div class="stats-row">
      <div><span>GP</span><strong>${compact(player.galacticPower)}</strong></div>
      <div><span>Character GP</span><strong>${compact(player.characterGalacticPower)}</strong></div>
      <div><span>Ship GP</span><strong>${compact(player.shipGalacticPower)}</strong></div>
      <div><span>Level</span><strong>${number(player.level)}</strong></div>
    </div>
    <div class="freshness">Fetched ${escapeHtml(new Date(fetchedAt || player.updatedAt).toLocaleString())}</div>
  `;
}

function renderRoster() {
  const query = search.value.trim().toLowerCase();
  const selectedAlignment = alignment.value;
  const sortKey = sort.value;

  const units = state.units
    .filter((unit) => selectedAlignment === "All" || unit.alignment === selectedAlignment)
    .filter((unit) => {
      if (!query) return true;
      const haystack = [unit.name, unit.role, unit.alignment, ...(unit.factions || []), ...(unit.tags || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));

  count.textContent = `${units.length} / ${state.units.length}`;
  roster.innerHTML = units.map(cardHtml).join("");

  for (const button of roster.querySelectorAll("button[data-base-id]")) {
    button.addEventListener("click", () => {
      const unit = state.units.find((candidate) => candidate.baseId === button.dataset.baseId);
      if (unit) showDetails(unit);
    });
  }
}

function cardHtml(unit) {
  const tags = (unit.factions || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const image = unit.image
    ? `<img src="${escapeAttr(unit.image)}" alt="${escapeAttr(unit.name)}" loading="lazy">`
    : `<div class="initials">${escapeHtml(unit.short || "?")}</div>`;

  return `
    <article class="unit-card">
      <div class="portrait">${image}<div class="relic">R${number(unit.relic)}</div></div>
      <div class="unit-body">
        <div class="unit-title"><h3>${escapeHtml(unit.name)}</h3><span>${escapeHtml(unit.alignment)}</span></div>
        <p>${escapeHtml(unit.summary || "Live roster unit")}</p>
        <div class="metrics">
          <div><span>Power</span><strong>${number(unit.power)}</strong></div>
          <div><span>Speed</span><strong>${number(unit.speed)}</strong></div>
          <div><span>Ready</span><strong>${number(unit.readiness)}%</strong></div>
        </div>
        <div class="tags">${tags}</div>
        <button data-base-id="${escapeAttr(unit.baseId)}">Inspect</button>
      </div>
    </article>
  `;
}

function showDetails(unit) {
  const abilities = (unit.abilities || []).map((ability) => `
    <li><strong>${escapeHtml(ability.name || ability.type)}</strong><span>${escapeHtml(ability.note || "")}</span></li>
  `).join("");

  details.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="kicker">${escapeHtml(unit.baseId)}</div>
    <h2>${escapeHtml(unit.name)}</h2>
    <p>${escapeHtml(unit.role)} · ${escapeHtml(unit.alignment)}</p>
    <div class="detail-metrics">
      <div><span>Power</span><strong>${number(unit.power)}</strong></div>
      <div><span>Speed</span><strong>${number(unit.speed)}</strong></div>
      <div><span>Gear</span><strong>${number(unit.gear)}</strong></div>
      <div><span>Relic</span><strong>${number(unit.relic)}</strong></div>
      <div><span>Zetas</span><strong>${number(unit.zetas)}</strong></div>
      <div><span>Omicrons</span><strong>${number(unit.omicrons)}</strong></div>
    </div>
    <h3>Abilities</h3>
    <ul class="abilities">${abilities || "<li>No ability detail returned.</li>"}</ul>
  `;
  details.querySelector(".close").addEventListener("click", () => details.close());
  details.showModal();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

search.addEventListener("input", renderRoster);
alignment.addEventListener("change", renderRoster);
sort.addEventListener("change", renderRoster);
details.addEventListener("click", (event) => {
  if (event.target === details) details.close();
});

checkHealth();
