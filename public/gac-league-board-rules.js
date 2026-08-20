const LEAGUES = Object.freeze(['Kyber','Aurodium','Chromium','Bronzium','Carbonite']);

const RULES = Object.freeze({
  Kyber: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 11, fleetTeams: 3 }),
    '3v3': Object.freeze({ squadTeams: 15, fleetTeams: 3 }),
  }),
  Aurodium: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 9, fleetTeams: 2 }),
    '3v3': Object.freeze({ squadTeams: 13, fleetTeams: 2 }),
  }),
  Chromium: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 7, fleetTeams: 2 }),
    '3v3': Object.freeze({ squadTeams: 10, fleetTeams: 2 }),
  }),
  Bronzium: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 5, fleetTeams: 1 }),
    '3v3': Object.freeze({ squadTeams: 7, fleetTeams: 1 }),
  }),
  Carbonite: Object.freeze({
    '5v5': Object.freeze({ squadTeams: 3, fleetTeams: 1 }),
    '3v3': Object.freeze({ squadTeams: 3, fleetTeams: 1 }),
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
  return Object.freeze({
    league,
    format,
    squadSize: format === '3v3' ? 3 : 5,
    squadTeams: rule.squadTeams,
    fleetTeams: rule.fleetTeams,
    totalDefenses: rule.squadTeams + rule.fleetTeams,
  });
}
function leagueFromRoster(roster = {}) {
  return normalizeLeague(roster?.competitive?.gacLeague || roster?.player?.gacLeague);
}
function divisionFromRoster(roster = {}) {
  const value = Number(roster?.competitive?.gacDivision ?? roster?.player?.gacDivision);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

export { LEAGUES, RULES, boardRule, divisionFromRoster, formatFromSize, leagueFromRoster, normalizeLeague };
