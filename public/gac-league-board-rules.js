const LEAGUES = Object.freeze(['Kyber','Aurodium','Chromium','Bronzium','Carbonite']);

const TERRITORIES = Object.freeze([
  Object.freeze({ value: 'BACK-TOP', label: 'Fleet Territory', kind: 'fleet', position: 'back-top', unlockFrom: 'FRONT-TOP' }),
  Object.freeze({ value: 'FRONT-TOP', label: 'Front Top', kind: 'squad', position: 'front-top', unlocks: 'BACK-TOP' }),
  Object.freeze({ value: 'BACK-BOTTOM', label: 'Back Bottom', kind: 'squad', position: 'back-bottom', unlockFrom: 'FRONT-BOTTOM' }),
  Object.freeze({ value: 'FRONT-BOTTOM', label: 'Front Bottom', kind: 'squad', position: 'front-bottom', unlocks: 'BACK-BOTTOM' }),
]);

// Territory counts follow the in-game 2x2 map order documented by the SWGOH Wiki:
// back-top (fleet), front-top (squad), back-bottom (squad), front-bottom (squad).
// Back territories are hidden during attack until the corresponding front territory is conquered.
const RULES = Object.freeze({
  Kyber: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 11, fleetTeams: 3, territoryTeams: Object.freeze({ 'BACK-TOP': 3, 'FRONT-TOP': 4, 'BACK-BOTTOM': 3, 'FRONT-BOTTOM': 4 }) }),
    '3v3': Object.freeze({ squadTeams: 15, fleetTeams: 3, territoryTeams: Object.freeze({ 'BACK-TOP': 3, 'FRONT-TOP': 5, 'BACK-BOTTOM': 5, 'FRONT-BOTTOM': 5 }) }),
  }),
  Aurodium: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 9, fleetTeams: 2, territoryTeams: Object.freeze({ 'BACK-TOP': 2, 'FRONT-TOP': 3, 'BACK-BOTTOM': 3, 'FRONT-BOTTOM': 3 }) }),
    '3v3': Object.freeze({ squadTeams: 13, fleetTeams: 2, territoryTeams: Object.freeze({ 'BACK-TOP': 2, 'FRONT-TOP': 4, 'BACK-BOTTOM': 5, 'FRONT-BOTTOM': 4 }) }),
  }),
  Chromium: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 7, fleetTeams: 2, territoryTeams: Object.freeze({ 'BACK-TOP': 2, 'FRONT-TOP': 3, 'BACK-BOTTOM': 2, 'FRONT-BOTTOM': 2 }) }),
    '3v3': Object.freeze({ squadTeams: 10, fleetTeams: 2, territoryTeams: Object.freeze({ 'BACK-TOP': 2, 'FRONT-TOP': 3, 'BACK-BOTTOM': 4, 'FRONT-BOTTOM': 3 }) }),
  }),
  Bronzium: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 5, fleetTeams: 1, territoryTeams: Object.freeze({ 'BACK-TOP': 1, 'FRONT-TOP': 2, 'BACK-BOTTOM': 1, 'FRONT-BOTTOM': 2 }) }),
    '3v3': Object.freeze({ squadTeams: 7, fleetTeams: 1, territoryTeams: Object.freeze({ 'BACK-TOP': 1, 'FRONT-TOP': 2, 'BACK-BOTTOM': 3, 'FRONT-BOTTOM': 2 }) }),
  }),
  Carbonite: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 3, fleetTeams: 1, territoryTeams: Object.freeze({ 'BACK-TOP': 1, 'FRONT-TOP': 1, 'BACK-BOTTOM': 1, 'FRONT-BOTTOM': 1 }) }),
    '3v3': Object.freeze({ squadTeams: 3, fleetTeams: 1, territoryTeams: Object.freeze({ 'BACK-TOP': 1, 'FRONT-TOP': 1, 'BACK-BOTTOM': 1, 'FRONT-BOTTOM': 1 }) }),
  }),
});

function clean(value) { return String(value ?? '').trim(); }
function normalizeLeague(value) {
  const text = clean(value).toLowerCase();
  return LEAGUES.find((league) => league.toLowerCase() === text) || '';
}
function formatFromSize(value) { return Number(value) === 3 ? '3v3' : '5v5'; }
function boardRule(leagueInput, formatInput = '5v5') {
  const league = normalizeLeague(leagueInput) || 'Carbonite';
  const format = clean(formatInput).toLowerCase() === '3v3' ? '3v3' : '5v5';
  const rule = RULES[league][format];
  const territories = TERRITORIES.map((territory) => Object.freeze({
    ...territory,
    capacity: Number(rule.territoryTeams?.[territory.value] || 0),
  }));
  const squadCapacity = territories.filter((entry) => entry.kind === 'squad').reduce((sum, entry) => sum + entry.capacity, 0);
  const fleetCapacity = territories.filter((entry) => entry.kind === 'fleet').reduce((sum, entry) => sum + entry.capacity, 0);
  return Object.freeze({
    league,
    format,
    squadSize: format === '3v3' ? 3 : 5,
    squadTeams: rule.squadTeams,
    fleetTeams: rule.fleetTeams,
    totalDefenses: rule.squadTeams + rule.fleetTeams,
    territories: Object.freeze(territories),
    territoryTeams: rule.territoryTeams,
    territoryContractValid: squadCapacity === rule.squadTeams && fleetCapacity === rule.fleetTeams,
  });
}
function territoryRule(ruleOrLeague, zone, formatInput = '5v5') {
  const rule = ruleOrLeague && typeof ruleOrLeague === 'object' && Array.isArray(ruleOrLeague.territories)
    ? ruleOrLeague
    : boardRule(ruleOrLeague, formatInput);
  const normalized = clean(zone).toUpperCase();
  return rule.territories.find((entry) => entry.value === normalized) || null;
}
function leagueFromRoster(roster = {}) {
  return normalizeLeague(roster?.competitive?.gacLeague || roster?.player?.gacLeague);
}
function divisionFromRoster(roster = {}) {
  const value = Number(roster?.competitive?.gacDivision ?? roster?.player?.gacDivision);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

export { LEAGUES, RULES, TERRITORIES, boardRule, divisionFromRoster, formatFromSize, leagueFromRoster, normalizeLeague, territoryRule };