import { LiveRosterCache } from "./live-roster-cache.mjs";
import { persistedGuildRosterService } from "./persisted-guild-roster-service.mjs";

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveFinite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeAllyCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error("A valid 9-digit Ally Code is required for the live guild roster.");
    error.status = 400;
    throw error;
  }
  return digits;
}

function validGuildRoster(body) {
  return body?.source === "live" && body?.guild && Array.isArray(body?.members);
}

function normalizedMemberGalacticPower(member = {}) {
  const direct = positiveFinite(member?.galacticPower) || positiveFinite(member?.gp);
  if (direct) return Math.round(direct);

  const character = positiveFinite(member?.characterGalacticPower) || positiveFinite(member?.characterGp);
  const ship = positiveFinite(member?.shipGalacticPower) || positiveFinite(member?.shipGp);
  const combined = character + ship;
  return combined > 0 ? Math.round(combined) : 0;
}

function profileIdentityValue(value, fields = []) {
  if (typeof value === "string" || typeof value === "number") return clean(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const field of fields) {
    const candidate = clean(value?.[field]);
    if (candidate) return candidate;
  }
  return "";
}

function normalizedMemberPortrait(member = {}) {
  for (const candidate of [member.playerPortrait, member.selectedPlayerPortrait, member.profilePortrait, member.portrait]) {
    const value = profileIdentityValue(candidate, ["id", "portraitId", "definitionId", "key", "name"]);
    if (/^PLAYERPORTRAIT_[A-Z0-9_]+$/i.test(value)) return value.toUpperCase();
  }
  return "";
}

function normalizedMemberTitle(member = {}) {
  for (const candidate of [member.playerTitle, member.selectedPlayerTitle, member.profileTitle, member.title]) {
    const value = profileIdentityValue(candidate, ["name", "id", "titleId", "definitionId", "key"]);
    if (value && value !== "[object Object]") return value;
  }
  return "";
}

function normalizeGuildRoster(body) {
  const sourceMembers = Array.isArray(body?.members) ? body.members : [];
  let membersChanged = false;
  const members = sourceMembers.map((member) => {
    const gp = normalizedMemberGalacticPower(member);
    const portrait = normalizedMemberPortrait(member);
    const title = normalizedMemberTitle(member);
    const gpChanged = Boolean(gp && positiveFinite(member?.galacticPower) !== gp);
    const portraitChanged = Boolean(portrait && clean(member?.playerPortrait) !== portrait);
    const titleChanged = Boolean(title && clean(member?.playerTitle) !== title);
    if (!gpChanged && !portraitChanged && !titleChanged) return member;
    membersChanged = true;
    return {
      ...member,
      ...(gpChanged ? { galacticPower: gp } : {}),
      ...(portrait ? { playerPortrait: portrait } : {}),
      ...(title ? { playerTitle: title } : {}),
    };
  });

  const currentGuildGp = positiveFinite(body?.guild?.galacticPower);
  const summedMemberGp = members.reduce((total, member) => total + normalizedMemberGalacticPower(member), 0);
  const guildChanged = !currentGuildGp && summedMemberGp > 0;
  if (!membersChanged && !guildChanged) return body;

  return {
    ...body,
    guild: guildChanged ? { ...body.guild, galacticPower: Math.round(summedMemberGp) } : body.guild,
    members,
  };
}

function configFromEnv(env = process.env) {
  return Object.freeze({
    gatewayUrl: trimUrl(env.SWGOH_GATEWAY_URL),
    gatewayApiKey: String(env.SWGOH_GATEWAY_API_KEY || "").trim(),
    requestTimeoutMs: positiveNumber(env.SWGOH_GUILD_REQUEST_TIMEOUT_MS, 120_000),
    freshMs: positiveNumber(env.SWGOH_GUILD_CACHE_FRESH_SECONDS, 600) * 1000,
    staleMs: positiveNumber(env.SWGOH_GUILD_CACHE_STALE_SECONDS, 1800) * 1000,
    maxEntries: Math.max(1, Math.floor(positiveNumber(env.SWGOH_GUILD_CACHE_MAX_ENTRIES, 100))),
  });
}

function cacheKey(allyCode, includeActivity = false) {
  return `${allyCode}:${includeActivity ? "activity" : "roster"}`;
}

async function fetchGuildRoster(allyCode, config, fetchImpl, options = {}) {
  if (!config.gatewayUrl) {
    const error = new Error("SWGOH_GATEWAY_URL is not configured.");
    error.status = 503;
    throw error;
  }
  if (!config.gatewayApiKey) {
    const error = new Error("SWGOH_GATEWAY_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }

  const includeActivity = options.includeActivity === true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const suffix = includeActivity ? "?activity=1" : "";
    const response = await fetchImpl(
      `${config.gatewayUrl}/v1/guild/by-player/${encodeURIComponent(allyCode)}/roster${suffix}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-Key": config.gatewayApiKey,
          "User-Agent": "SWGOH-Command-Center (shared-guild-roster-service)",
        },
        redirect: "error",
        signal: controller.signal,
      },
    );

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }

    if (!response.ok) {
      const error = new Error(body?.error || `The live gateway returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    if (!validGuildRoster(body)) {
      const error = new Error("The live gateway returned an unexpected guild roster response.");
      error.status = 502;
      throw error;
    }
    return normalizeGuildRoster(body);
  } finally {
    clearTimeout(timeout);
  }
}

export function createGuildRosterService(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const fetchImpl = options.fetch || fetch;
  const persistedService = options.persistedService || persistedGuildRosterService;
  const cache = options.cache || new LiveRosterCache({
    freshMs: config.freshMs,
    staleMs: config.staleMs,
    maxEntries: config.maxEntries,
    ...(typeof options.now === "function" ? { now: options.now } : {}),
  });

  const load = (allyCode, includeActivity) => fetchGuildRoster(allyCode, config, fetchImpl, { includeActivity });

  async function getLiveGuildRoster(allyCode, options = {}) {
    const includeActivity = options.includeActivity === true;
    const key = cacheKey(allyCode, includeActivity);
    if (options.forceRefresh) {
      const value = await cache.refresh(key, () => load(allyCode, includeActivity));
      return Object.freeze({ value, cache: "refreshed", ageMs: 0, includeActivity, transport: "comlink-live" });
    }
    const result = await cache.getOrLoad(key, () => load(allyCode, includeActivity), {
      staleWhileRevalidate: options.staleWhileRevalidate !== false,
    });
    return Object.freeze({ ...result, includeActivity, transport: "comlink-live" });
  }

  async function getGuildRoster(allyCode, options = {}) {
    const normalized = normalizeAllyCode(allyCode);
    const includeActivity = options.includeActivity === true;
    const forceRefresh = options.forceRefresh === true;
    const persistedStatus = typeof persistedService?.status === "function" ? persistedService.status() : { configured: false };

    // Ordinary browser/planning reads use the canonical persisted roster first.
    // Rich activity reads and explicit refreshes stay live because activity fields
    // are intentionally not duplicated into the compact persisted compatibility payload.
    if (!includeActivity && !forceRefresh && persistedStatus?.configured && typeof persistedService?.getGuildRoster === "function") {
      try {
        const result = await persistedService.getGuildRoster(normalized, {
          staleWhileRevalidate: options.staleWhileRevalidate !== false,
        });
        return Object.freeze({ ...result, includeActivity: false, transport: "supabase-persisted" });
      } catch {
        // Availability is fail-open: a not-yet-onboarded Guild or temporary persistence
        // problem falls back to the live gateway rather than breaking public Guild tools.
      }
    }

    return getLiveGuildRoster(normalized, options);
  }

  return Object.freeze({
    async getGuildRoster(allyCode, options = {}) {
      return getGuildRoster(allyCode, options);
    },
    async refreshGuildRoster(allyCode, options = {}) {
      const normalized = normalizeAllyCode(allyCode);
      return getLiveGuildRoster(normalized, {
        ...options,
        forceRefresh: true,
        staleWhileRevalidate: false,
      });
    },
    inspect(allyCode, options = {}) {
      const normalized = normalizeAllyCode(allyCode);
      return cache.inspect(cacheKey(normalized, options.includeActivity === true));
    },
    status() {
      const persisted = typeof persistedService?.status === "function" ? persistedService.status() : { configured: false };
      return Object.freeze({
        mode: persisted?.configured ? "supabase-persisted-first-with-comlink-live-fallback" : "process-local-coalesced-swr-lru",
        freshSeconds: Math.round(config.freshMs / 1000),
        staleSeconds: Math.round(config.staleMs / 1000),
        maxEntries: config.maxEntries,
        shared: Boolean(persisted?.configured),
        sharedAcrossInstances: Boolean(persisted?.configured),
        sharedBetweenWebAndDiscord: true,
        persisted,
        activityMode: "live-opt-in-separate-cache-key",
        explicitRefreshMode: "comlink-live",
        coldRequestTimeoutSeconds: Math.round(config.requestTimeoutMs / 1000),
      });
    },
  });
}

// One process-wide instance is imported by the HTTP API, account onboarding and Discord.
// Normal non-activity reads prefer canonical Supabase persistence. Explicit refreshes and
// activity-rich Discord reads stay live, with public reads failing open to Comlink when a
// Guild has not yet been persisted.
export const guildRosterService = createGuildRosterService(process.env);

export {
  normalizeGuildRoster,
  normalizedMemberPortrait,
  normalizedMemberTitle,
  profileIdentityValue,
};
