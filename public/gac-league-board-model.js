const LEAGUES = Object.freeze(['carbonite', 'bronzium', 'chromium', 'aurodium', 'kyber']);

const LEAGUE_LABELS = Object.freeze({
  carbonite: 'Carbonite',
  bronzium: 'Bronzium',
  chromium: 'Chromium',
  aurodium: 'Aurodium',
  kyber: 'Kyber',
});

// Verified against the SWGOH Wiki GAC defense table.
// Zone mapping follows the in-game opponent board: front territories on the right,
// rear fleet territory top-left, rear squad territory bottom-left.
const GAC_ZONE_CAPACITY = Object.freeze({
  '5v5': Object.freeze({
    carbonite: Object.freeze({ 'FRONT-TOP': 1, 'FRONT-BOTTOM': 1, 'BACK-BOTTOM': 1, 'BACK-TOP': 1 }),
    bronzium: Object.freeze({ 'FRONT-TOP': 2, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 1, 'BACK-TOP': 1 }),
    chromium: Object.freeze({ 'FRONT-TOP': 3, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 2, 'BACK-TOP': 2 }),
    aurodium: Object.freeze({ 'FRONT-TOP': 3, 'FRONT-BOTTOM': 3, 'BACK-BOTTOM': 3, 'BACK-TOP': 2 }),
    kyber: Object.freeze({ 'FRONT-TOP': 4, 'FRONT-BOTTOM': 4, 'BACK-BOTTOM': 3, 'BACK-TOP': 3 }),
  }),
  '3v3': Object.freeze({
    carbonite: Object.freeze({ 'FRONT-TOP': 1, 'FRONT-BOTTOM': 1, 'BACK-BOTTOM': 2, 'BACK-TOP': 1 }),
    bronzium: Object.freeze({ 'FRONT-TOP': 2, 'FRONT-BOTTOM': 2, 'BACK-BOTTOM': 3, 'BACK-TOP': 1 }),
    chromium: Object.freeze({ 'FRONT-TOP': 3, 'FRONT-BOTTOM': 3, 'BACK-BOTTOM': 4, 'BACK-TOP': 2 }),
    aurodium: Object.freeze({ 'FRONT-TOP': 4, 'FRONT-BOTTOM': 4, 'BACK-BOTTOM': 5, 'BACK-TOP': 2 }),
    kyber: Object.freeze({ 'FRONT-TOP': 5, 'FRONT-BOTTOM': 5, 'BACK-BOTTOM': 5, 'BACK-TOP': 3 }),
  }),
});

function clean(value) { return String(value ?? '').trim().toLowerCase(); }

function normalizeFormat(value) {
  return Number(value) === 3 || clean(value) === '3v3' ? '3v3' : '5v5';
}

function normalizeLeague(value) {
  const normalized = clean(value);
  return LEAGUES.includes(normalized) ? normalized : '';
}

function leagueLabel(value) {
  return LEAGUE_LABELS[normalizeLeague(value)] || 'Select League';
}

function zoneCapacity(format, league, zone) {
  const fmt = normalizeFormat(format);
  const rank = normalizeLeague(league);
  if (!rank) return null;
  const count = Number(GAC_ZONE_CAPACITY?.[fmt]?.[rank]?.[String(zone || '').toUpperCase()]);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function leagueBoard(format, league) {
  const fmt = normalizeFormat(format);
  const rank = normalizeLeague(league);
  if (!rank) return null;
  const zones = GAC_ZONE_CAPACITY[fmt][rank];
  const squadCount = zones['FRONT-TOP'] + zones['FRONT-BOTTOM'] + zones['BACK-BOTTOM'];
  const fleetCount = zones['BACK-TOP'];
  return Object.freeze({
    format: fmt,
    league: rank,
    label: leagueLabel(rank),
    zones,
    squadCount,
    fleetCount,
    totalPlacements: squadCount + fleetCount,
  });
}

export {
  GAC_ZONE_CAPACITY,
  LEAGUES,
  LEAGUE_LABELS,
  leagueBoard,
  leagueLabel,
  normalizeFormat,
  normalizeLeague,
  zoneCapacity,
};
