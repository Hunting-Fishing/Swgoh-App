function clean(value) {
  return String(value ?? "").trim();
}

export function isLiveRosterBody(body) {
  return clean(body?.source).toLowerCase() === "live";
}

export function isCanonicalRosterBody(body) {
  return clean(body?.source).toLowerCase() === "canonical" || body?.capabilities?.persistedFullRoster === true;
}

export function rosterEndpoint(allyCode, { forceLive = false } = {}) {
  const code = clean(allyCode).replace(/\D/g, "").slice(0, 9);
  return forceLive ? `/api/player/${code}` : `/api/player/${code}/baseline`;
}

export function rosterNeedsLiveDetail(filters = {}) {
  return clean(filters.mods || "Any") !== "Any"
    || clean(filters.upgrade || "Any") === "omega"
    || clean(filters.readiness || "All") !== "All"
    || clean(filters.sort || "power") === "readiness";
}

export function nullableMetric(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function rosterCapabilityKnown(body = {}, capability = "") {
  const capabilities = body?.capabilities && typeof body.capabilities === "object" ? body.capabilities : {};
  if (isCanonicalRosterBody(body)) return capabilities[capability] === true;
  return capabilities[capability] !== false;
}

export function unitCapabilityKnown(unit = {}, capability = "") {
  const capabilities = unit?.persistenceCapabilities && typeof unit.persistenceCapabilities === "object"
    ? unit.persistenceCapabilities
    : null;
  if (!capabilities) return true;
  return capabilities[capability] === true;
}

export function rosterSourceStatus(body, totalOwned = 0) {
  const player = clean(body?.player?.name || body?.player?.allyCode || "Player");
  const count = Number.isFinite(Number(totalOwned)) ? Number(totalOwned).toLocaleString() : "0";
  if (isLiveRosterBody(body)) return `${player} · live roster + ROTE operations demand loaded · ${count} owned`;
  if (isCanonicalRosterBody(body)) {
    const stamp = clean(body?.persistence?.lastSyncedAt || body?.fetchedAt);
    let suffix = "persisted full roster";
    if (stamp) {
      const date = new Date(stamp);
      if (!Number.isNaN(date.getTime())) suffix += ` · synced ${date.toLocaleString()}`;
    }
    return `${player} · ${suffix} · ${count} owned · live detail available on refresh`;
  }
  return `${player} · roster loaded · ${count} owned`;
}
