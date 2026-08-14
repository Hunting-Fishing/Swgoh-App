function hasOwn(record, key) {
  return record !== null && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key);
}

export function capabilityContract(body = {}) {
  const summary = body?.summary && typeof body.summary === "object" ? body.summary : {};
  const competitive = body?.competitive && typeof body.competitive === "object" ? body.competitive : {};

  return {
    version: 1,
    liveRoster: body?.source === "live" && Array.isArray(body?.units),
    profileGp: Boolean(
      Number(body?.player?.galacticPower) > 0 ||
      Number(body?.player?.characterGalacticPower) > 0 ||
      Number(body?.player?.shipGalacticPower) > 0
    ),
    characterRoster: Array.isArray(body?.units),
    shipRoster: Array.isArray(body?.ships),
    equippedMods: hasOwn(summary, "equippedMods") || body?.units?.some?.((unit) => hasOwn(unit, "equippedMods")) === true,
    purchasedAbilities: hasOwn(summary, "purchasedAbilities") || Array.isArray(body?.purchasedAbilities),
    profileStats: Array.isArray(body?.profileStats),
    unlockedCosmetics: hasOwn(summary, "unlockedTitles") || hasOwn(summary, "unlockedPortraits"),
    seasonStatus: Array.isArray(body?.seasonStatus),
    datacrons: hasOwn(summary, "datacrons"),
    sixDotMods: hasOwn(summary, "sixDotMods"),
    competitiveProfile: Object.keys(competitive).length > 0,
    abilityProgression: Array.isArray(body?.units) && body.units.some((unit) => Array.isArray(unit?.abilities)),
    materials: false,
    currencyBalances: false,
    unequippedGear: false,
    unequippedMods: false,
  };
}

export function withCapabilityContract(body = {}) {
  if (!body || typeof body !== "object") return body;
  return {
    ...body,
    capabilities: {
      ...capabilityContract(body),
      ...(body.capabilities && typeof body.capabilities === "object" ? body.capabilities : {}),
    },
  };
}
