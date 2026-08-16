import { discordStateStore } from "./discord-state-store.mjs";

const asArray = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value || "").trim();
const allyCode = (value) => clean(value).replace(/\D/g, "");

function memberKey(member = {}) {
  return clean(member?.playerId || member?.id || member?.allyCode || member?.name);
}

function memberIndexes(guildRoster = {}) {
  const members = asArray(guildRoster?.members);
  const byAny = new Map();
  for (const member of members) {
    const canonical = memberKey(member);
    if (!canonical) continue;
    for (const value of [member?.playerId, member?.id, member?.allyCode, member?.name]) {
      const key = clean(value);
      if (key) byAny.set(key, { member, canonical });
    }
    const code = allyCode(member?.allyCode);
    if (code.length === 9) byAny.set(code, { member, canonical });
  }
  return { members, byAny };
}

function normalizePreference(value) {
  const preference = clean(value).toLowerCase();
  return preference === "give" || preference === "keep" ? preference : "";
}

function resolveStoredMember(row, indexes) {
  for (const value of [row?.memberId, row?.playerId, row?.swgohAllyCode]) {
    const raw = clean(value);
    if (!raw) continue;
    const direct = indexes.byAny.get(raw);
    if (direct) return direct;
    const code = allyCode(raw);
    if (code.length === 9 && indexes.byAny.has(code)) return indexes.byAny.get(code);
  }
  return null;
}

function unbound(reason, extra = {}) {
  return Object.freeze({
    source: "none",
    bound: false,
    durable: false,
    reason,
    preferences: Object.freeze([]),
    ignoredMembers: Object.freeze([]),
    unavailableMembers: Object.freeze([]),
    ...extra,
  });
}

export async function resolveGuildPlanningOverlay(guildRoster = {}, options = {}) {
  const stateStore = options.stateStore || discordStateStore;
  if (!stateStore || typeof stateStore.status !== "function" || typeof stateStore.readState !== "function") {
    return unbound("state-store-unavailable");
  }

  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) {
    return unbound(clean(status?.reason) || "durable-state-disabled");
  }

  const indexes = memberIndexes(guildRoster);
  const guildAllyCodes = new Set(indexes.members.map((member) => allyCode(member?.allyCode)).filter((code) => code.length === 9));
  if (!guildAllyCodes.size) return unbound("guild-member-ally-codes-unavailable", { durable: true });

  let state;
  try {
    state = await stateStore.readState();
  } catch (error) {
    return unbound("state-read-failed", { durable: true, error: clean(error?.code || error?.message) });
  }

  const bindings = Object.values(state?.guilds && typeof state.guilds === "object" ? state.guilds : {})
    .filter((guild) => guildAllyCodes.has(allyCode(guild?.swgohAllyCode)));
  if (!bindings.length) return unbound("discord-guild-not-bound", { durable: true });
  if (bindings.length > 1) {
    return unbound("ambiguous-discord-guild-bindings", { durable: true, bindingCount: bindings.length });
  }

  const binding = bindings[0];
  const preferenceMap = new Map();
  for (const row of Object.values(binding?.memberPreferences && typeof binding.memberPreferences === "object" ? binding.memberPreferences : {})) {
    const resolved = resolveStoredMember(row, indexes);
    const baseId = clean(row?.baseId).toUpperCase();
    const preference = normalizePreference(row?.preference);
    if (!resolved || !baseId || !preference) continue;
    preferenceMap.set(`${resolved.canonical}|${baseId}`, Object.freeze({
      memberId: resolved.canonical,
      allyCode: allyCode(resolved.member?.allyCode),
      baseId,
      preference,
    }));
  }

  const ignored = new Map();
  for (const row of Object.values(binding?.memberAvailability && typeof binding.memberAvailability === "object" ? binding.memberAvailability : {})) {
    if (clean(row?.availability).toLowerCase() !== "unavailable") continue;
    const resolved = resolveStoredMember(row, indexes);
    if (!resolved) continue;
    ignored.set(resolved.canonical, Object.freeze({
      memberId: resolved.canonical,
      allyCode: allyCode(resolved.member?.allyCode),
      memberName: clean(resolved.member?.name),
      availability: "unavailable",
      updatedAt: clean(row?.updatedAt),
    }));
  }

  return Object.freeze({
    source: "durable-discord-planning-state",
    bound: true,
    durable: true,
    reason: "ready",
    bindingCount: 1,
    updatedAt: clean(binding?.updatedAt),
    preferences: Object.freeze([...preferenceMap.values()]),
    ignoredMembers: Object.freeze([...ignored.keys()]),
    unavailableMembers: Object.freeze([...ignored.values()]),
  });
}
