const clean = (value) => String(value ?? '').trim();

function allyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? code : '';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeIntegerOrNull(value) {
  const parsed = finiteOrNull(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function firstKnownCount(...values) {
  for (const value of values) {
    const parsed = nonNegativeIntegerOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return clean(headers.get(name));
  const expected = clean(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (clean(key).toLowerCase() === expected) return clean(value);
  }
  return '';
}

function responseAgeSeconds(body = {}, headers = null, now = Date.now()) {
  const headerAge = finiteOrNull(headerValue(headers, 'Age'));
  if (headerAge !== null && headerAge >= 0) return Math.floor(headerAge);
  const stamp = clean(body?.fetchedAt || body?.player?.updatedAt);
  const parsed = Date.parse(stamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Number(now) - parsed) / 1000));
}

function expectedCounts(body = {}) {
  const summary = body?.summary && typeof body.summary === 'object' ? body.summary : {};
  return Object.freeze({
    characters: firstKnownCount(summary.characters, summary.characterCount, summary.rosterCharacters),
    ships: firstKnownCount(summary.ships, summary.shipCount, summary.rosterShips),
    total: firstKnownCount(summary.rosterUnits, summary.totalOwnedUnits, summary.units),
  });
}

function rosterCounts(body = {}) {
  return Object.freeze({
    characters: Array.isArray(body?.units) ? body.units.length : null,
    ships: Array.isArray(body?.ships) ? body.ships.length : null,
  });
}

function countMismatch(actual, expected) {
  return actual !== null && expected !== null && actual !== expected;
}

function capability(body = {}, name) {
  const caps = body?.capabilities && typeof body.capabilities === 'object' ? body.capabilities : {};
  if (!Object.prototype.hasOwnProperty.call(caps, name)) return null;
  return caps[name] === true ? true : caps[name] === false ? false : null;
}

function capabilityCoverage(value) {
  return value === true ? 'known' : value === false ? 'unknown' : 'unverified';
}

function rosterArrayCoverage(available, declaredCapability, mismatch, expectedCount) {
  if (!available || declaredCapability === false || mismatch) return 'partial';
  if (expectedCount === null) return 'observed';
  return 'known';
}

function rosterIntegrity(body = {}, headers = null, options = {}) {
  const expectedAllyCode = allyCode(options.expectedAllyCode);
  const actualAllyCode = allyCode(body?.player?.allyCode || body?.player?.ally_code);
  const bodySource = clean(body?.source).toLowerCase();
  const responseSource = clean(headerValue(headers, 'X-Roster-Source')).toLowerCase();
  const cacheState = clean(headerValue(headers, 'X-Roster-Cache')).toLowerCase();
  const ageSeconds = responseAgeSeconds(body, headers, options.now ?? Date.now());
  const counts = rosterCounts(body);
  const expected = expectedCounts(body);
  const caps = Object.freeze({
    liveRoster: capability(body, 'liveRoster'),
    profileGp: capability(body, 'profileGp'),
    characterRoster: capability(body, 'characterRoster'),
    shipRoster: capability(body, 'shipRoster'),
    unitGp: capability(body, 'unitGp'),
    zetas: capability(body, 'zetas'),
    omicrons: capability(body, 'omicrons'),
    abilityProgression: capability(body, 'abilityProgression'),
  });

  const sourceLive = bodySource === 'live';
  const responseSourceKnown = Boolean(responseSource);
  const responseSourceLive = !responseSourceKnown || responseSource === 'comlink-live';
  const identityKnown = Boolean(actualAllyCode);
  const identityMatches = Boolean(expectedAllyCode && actualAllyCode && expectedAllyCode === actualAllyCode);
  const hasCharacters = Array.isArray(body?.units);
  const hasShips = Array.isArray(body?.ships);
  const characterMismatch = countMismatch(counts.characters, expected.characters);
  const shipMismatch = countMismatch(counts.ships, expected.ships);
  const totalActual = counts.characters !== null && counts.ships !== null ? counts.characters + counts.ships : null;
  const totalMismatch = countMismatch(totalActual, expected.total);
  const stale = cacheState === 'stale';
  const freshnessKnown = Boolean(cacheState) || ageSeconds !== null;

  const blocking = [];
  const warnings = [];
  if (!sourceLive) blocking.push('Roster body is not marked as live.');
  if (!responseSourceLive) blocking.push(`Unexpected roster response source: ${responseSource}.`);
  if (caps.liveRoster === false) blocking.push('Live roster capability is explicitly unavailable.');
  if (!identityKnown) blocking.push('Roster response does not expose a valid Ally Code identity.');
  else if (expectedAllyCode && !identityMatches) blocking.push(`Roster identity mismatch: expected ${expectedAllyCode}, received ${actualAllyCode}.`);
  if (!hasCharacters || caps.characterRoster === false) blocking.push('Character roster coverage is unavailable.');
  if (characterMismatch) blocking.push(`Character roster count mismatch: expected ${expected.characters}, received ${counts.characters}.`);

  if (!responseSourceKnown) warnings.push('Roster response source header is not exposed; body source is the only provenance signal.');
  if (!cacheState) warnings.push('Server roster cache state is not exposed.');
  if (stale) warnings.push('Server returned stale-while-revalidate roster data.');
  if (!freshnessKnown) warnings.push('Roster freshness age is not exposed.');
  if (caps.liveRoster === null) warnings.push('Live roster capability is not explicitly declared.');
  if (caps.characterRoster === null && hasCharacters) warnings.push('Character roster capability is not explicitly declared.');
  if (!hasShips || caps.shipRoster === false) warnings.push('Ship roster coverage is unavailable; fleet comparison is partial.');
  else if (caps.shipRoster === null) warnings.push('Ship roster capability is not explicitly declared.');
  if (shipMismatch) warnings.push(`Ship roster count mismatch: expected ${expected.ships}, received ${counts.ships}.`);
  if (totalMismatch) warnings.push(`Total owned-unit count mismatch: expected ${expected.total}, received ${totalActual}.`);
  if (expected.characters === null) warnings.push('Expected character count is not exposed; logical character completeness is not independently count-audited.');
  if (hasShips && expected.ships === null) warnings.push('Expected ship count is not exposed; logical ship completeness is not independently count-audited.');
  if (caps.profileGp === false) warnings.push('Profile GP capability is unavailable.');
  else if (caps.profileGp === null) warnings.push('Profile GP capability is not explicitly declared.');
  if (caps.unitGp === false) warnings.push('Unit GP capability is unavailable.');
  else if (caps.unitGp === null) warnings.push('Unit GP capability is not explicitly declared.');
  if (caps.zetas === false) warnings.push('Zeta classification is unavailable.');
  else if (caps.zetas === null) warnings.push('Zeta capability is not explicitly declared.');
  if (caps.omicrons === false) warnings.push('Omicron classification is unavailable.');
  else if (caps.omicrons === null) warnings.push('Omicron capability is not explicitly declared.');

  const status = blocking.length ? 'blocked' : warnings.length ? 'warn' : 'good';
  const freshness = stale ? 'stale' : ['fresh', 'miss', 'refreshed'].includes(cacheState) ? 'fresh' : freshnessKnown ? 'observed' : 'unknown';
  const coverage = Object.freeze({
    characters: rosterArrayCoverage(hasCharacters, caps.characterRoster, characterMismatch, expected.characters),
    ships: rosterArrayCoverage(hasShips, caps.shipRoster, shipMismatch, expected.ships),
    profileGp: capabilityCoverage(caps.profileGp),
    unitGp: capabilityCoverage(caps.unitGp),
    zetas: capabilityCoverage(caps.zetas),
    omicrons: capabilityCoverage(caps.omicrons),
  });

  return Object.freeze({
    status,
    expectedAllyCode,
    actualAllyCode,
    identityMatches,
    source: Object.freeze({
      body: bodySource || 'unknown',
      response: responseSource || 'not-exposed',
      live: sourceLive && responseSourceLive && caps.liveRoster !== false,
    }),
    freshness: Object.freeze({
      state: freshness,
      cacheState: cacheState || 'not-exposed',
      ageSeconds,
      stale,
    }),
    counts,
    expectedCounts: expected,
    capabilities: caps,
    coverage,
    blocking: Object.freeze(blocking),
    warnings: Object.freeze(warnings),
  });
}

function combinedRosterIntegrity(mine, opponent) {
  const rows = [mine, opponent].filter(Boolean);
  if (rows.some((row) => row.status === 'blocked')) return 'blocked';
  if (rows.some((row) => row.status === 'warn')) return 'warn';
  return rows.length === 2 ? 'good' : 'waiting';
}

export {
  allyCode,
  capabilityCoverage,
  combinedRosterIntegrity,
  expectedCounts,
  firstKnownCount,
  headerValue,
  responseAgeSeconds,
  rosterArrayCoverage,
  rosterCounts,
  rosterIntegrity,
};
