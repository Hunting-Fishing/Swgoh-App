function clean(value) {
  return String(value ?? "").trim();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function isLiveRosterBody(body) {
  return clean(body?.source).toLowerCase() === "live";
}

export function isCanonicalRosterBody(body) {
  return clean(body?.source).toLowerCase() === "canonical" || body?.capabilities?.persistedFullRoster === true;
}

export function validPlayerRosterBody(body) {
  return Boolean(
    body?.player
    && Array.isArray(body?.units)
    && Array.isArray(body?.ships)
    && (isLiveRosterBody(body) || isCanonicalRosterBody(body))
  );
}

export function rosterEndpoint(allyCode, { forceLive = false } = {}) {
  const code = clean(allyCode).replace(/\D/g, "").slice(0, 9);
  return forceLive ? `/api/player/${code}` : `/api/player/${code}/baseline`;
}

export async function loadPreferredPlayerRoster(allyCode, fetchImpl = fetch) {
  const code = clean(allyCode).replace(/\D/g, "").slice(0, 9);
  if (!/^\d{9}$/.test(code)) throw new Error("A valid 9-digit Ally Code is required.");

  let baselineDiagnostic = "";
  try {
    const response = await fetchImpl(rosterEndpoint(code), { cache: "no-store" });
    const body = await response.json();
    if (response.ok && validPlayerRosterBody(body) && isCanonicalRosterBody(body)) {
      return Object.freeze({ body, source: "canonical", liveFallback: false, baselineDiagnostic: "" });
    }
    baselineDiagnostic = body?.error || `Persisted roster returned HTTP ${response.status}.`;
  } catch (error) {
    baselineDiagnostic = error?.message || "Persisted roster request failed.";
  }

  const response = await fetchImpl(rosterEndpoint(code, { forceLive: true }), { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    const liveDiagnostic = body?.error || `Live roster returned HTTP ${response.status}.`;
    throw new Error(baselineDiagnostic ? `${liveDiagnostic} Persisted baseline: ${baselineDiagnostic}` : liveDiagnostic);
  }
  if (!validPlayerRosterBody(body) || !isLiveRosterBody(body)) {
    throw new Error("The live gateway returned an invalid full-roster response.");
  }
  return Object.freeze({ body, source: "live", liveFallback: true, baselineDiagnostic });
}

export function rosterNeedsLiveDetail(filters = {}) {
  return clean(filters.mods || "Any") !== "Any"
    || clean(filters.upgrade || "Any") === "omega"
    || clean(filters.readiness || "All") !== "All"
    || clean(filters.sort || "power") === "readiness";
}

export function nullableMetric(value, fallback = "—") {
  const parsed = finiteOrNull(value);
  return parsed === null ? fallback : parsed;
}

export function rosterCapabilityKnown(body = {}, capability) {
  const capabilities = body?.capabilities && typeof body.capabilities === "object" ? body.capabilities : {};
  if (isCanonicalRosterBody(body)) return capabilities[capability] === true;
  return capabilities[capability] !== false;
}

export function unitProgressionKnown(unit = {}, capability) {
  const capabilities = unit?.persistenceCapabilities && typeof unit.persistenceCapabilities === "object"
    ? unit.persistenceCapabilities
    : null;
  if (!capabilities) return true;
  return capabilities[capability] === true;
}

export function unitProgressionValue(unit = {}, field, capability) {
  if (!unitProgressionKnown(unit, capability)) return null;
  return finiteOrNull(unit?.[field]);
}

export function rosterProgressionTotal(body = {}, field, capability, options = {}) {
  if (!rosterCapabilityKnown(body, capability)) return null;
  const summary = body?.summary && typeof body.summary === "object" ? body.summary : {};
  const summaryFields = [field, ...(Array.isArray(options.summaryAliases) ? options.summaryAliases : [])];
  for (const key of summaryFields) {
    const value = finiteOrNull(summary?.[key]);
    if (value !== null) return value;
  }

  const units = [...asArray(body?.units), ...(options.includeShips ? asArray(body?.ships) : [])];
  let total = 0;
  for (const unit of units) {
    const value = unitProgressionValue(unit, field, capability);
    if (value === null) return null;
    total += value;
  }
  return total;
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
