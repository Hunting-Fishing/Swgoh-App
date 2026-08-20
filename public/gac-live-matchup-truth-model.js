function clean(value) { return String(value ?? "").trim(); }
function finite(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function allyCode(value) { const code = clean(value).replace(/\D/g, ""); return /^\d{9}$/.test(code) ? code : ""; }

function rosterLoaded(body, expectedAllyCode = "") {
  const expected = allyCode(expectedAllyCode);
  const actual = allyCode(body?.player?.allyCode || body?.player?.ally_code || body?.allyCode || body?.ally_code);
  return Boolean(body?.source === "live" && body?.player && Array.isArray(body?.units) && (!expected || actual === expected));
}

function aggregateOffense(tendencies = []) {
  const rows = asArray(tendencies);
  const result = rows.reduce((sum, row) => {
    sum.attempts += finite(row?.attempts);
    sum.wins += finite(row?.wins);
    sum.losses += finite(row?.losses);
    sum.draws += finite(row?.draws);
    sum.unknown += finite(row?.unknown);
    return sum;
  }, { attempts: 0, wins: 0, losses: 0, draws: 0, unknown: 0 });
  const resolved = result.wins + result.losses + result.draws;
  return Object.freeze({
    ...result,
    resolved,
    winRate: resolved ? result.wins / resolved : null,
    exactTeamsObserved: rows.length,
  });
}

function aggregateDefense(tendencies = []) {
  const rows = asArray(tendencies);
  const result = rows.reduce((sum, row) => {
    sum.attacksFaced += finite(row?.observations);
    sum.holds += finite(row?.holds);
    sum.beaten += finite(row?.beaten);
    sum.draws += finite(row?.draws);
    sum.unknown += finite(row?.unknown);
    return sum;
  }, { attacksFaced: 0, holds: 0, beaten: 0, draws: 0, unknown: 0 });
  const resolved = result.holds + result.beaten + result.draws;
  return Object.freeze({
    ...result,
    resolved,
    holdRate: resolved ? result.holds / resolved : null,
    exactTeamsObserved: rows.length,
  });
}

function scoutingHistory(scouting = {}) {
  const offense = aggregateOffense(scouting?.offensiveTendencies);
  const defense = aggregateDefense(scouting?.defensiveTendencies);
  const coverage = scouting?.coverage || {};
  const observedRows = finite(coverage.offensiveBattleRows) + finite(coverage.defensiveBattleRows);
  return Object.freeze({
    known: observedRows > 0 || offense.attempts > 0 || defense.attacksFaced > 0,
    observedRows,
    offense,
    defense,
    truthLabel: "Character battle-level scouting evidence. Rates are observed history, not predicted win probabilities.",
  });
}

function roundIdentity(row = {}, index = 0) {
  const eventId = clean(row?.event?.id || row?.event?.seasonId);
  const round = Number(row?.round);
  if (eventId && Number.isInteger(round) && round >= 1 && round <= 3) return `${eventId}|${round}`;
  const id = clean(row?.id);
  return id ? `id:${id}` : `row:${index}`;
}

function roundPreference(row = {}) {
  const result = clean(row?.result).toLowerCase();
  const knownResult = result === "win" || result === "loss" ? 1 : 0;
  const verified = row?.verified === true ? 1 : 0;
  const confidence = Math.max(0, Math.min(1, finite(row?.confidence)));
  return (knownResult * 100) + (verified * 10) + confidence;
}

function dedupeRecordedRounds(history = {}) {
  const unique = new Map();
  asArray(history?.rounds).forEach((row, index) => {
    const key = roundIdentity(row, index);
    const current = unique.get(key);
    if (!current || roundPreference(row) > roundPreference(current)) unique.set(key, row);
  });
  return Object.freeze([...unique.values()]);
}

function recordedRoundHistory(history = {}) {
  const rounds = dedupeRecordedRounds(history);
  const known = rounds.filter((row) => ["win", "loss"].includes(clean(row?.result).toLowerCase()));
  const wins = known.filter((row) => clean(row?.result).toLowerCase() === "win").length;
  const losses = known.filter((row) => clean(row?.result).toLowerCase() === "loss").length;
  const verifiedKnown = known.filter((row) => row?.verified === true).length;
  return Object.freeze({
    rounds: rounds.length,
    recordedResults: known.length,
    wins,
    losses,
    unknown: Math.max(0, rounds.length - known.length),
    winRate: known.length ? wins / known.length : null,
    verifiedRecordedResults: verifiedKnown,
    known: known.length > 0,
    truthLabel: known.length
      ? "Recorded GAC round results only; duplicate source rows are collapsed per event/round and unknown imported rounds remain unknown."
      : "No verified/recorded GAC round W/L is available yet; imported history is not converted into a match result.",
  });
}

function boardState(matchup = {}, savedBoard = null) {
  const liveDefenses = asArray(matchup?.defense?.opponent);
  const savedDefenses = asArray(savedBoard?.defenses);
  const currentOpponent = allyCode(matchup?.matchup?.opponent?.allyCode);
  const savedOpponent = allyCode(savedBoard?.opponent?.allyCode);
  const savedMatchesOpponent = Boolean(savedDefenses.length && currentOpponent && savedOpponent === currentOpponent);
  if (liveDefenses.length) {
    return Object.freeze({
      ready: true,
      source: "live",
      count: liveDefenses.length,
      label: "LIVE CURRENT BOARD",
      detail: "Opponent defense placements came from the current GAC payload.",
    });
  }
  if (savedMatchesOpponent) {
    return Object.freeze({
      ready: true,
      source: "verified-manual",
      count: savedDefenses.length,
      label: "VERIFIED MANUAL CURRENT BOARD",
      detail: "Current defenses were entered by the verified owner and bound to this opponent/event/round.",
    });
  }
  return Object.freeze({
    ready: false,
    source: "manual-required",
    count: 0,
    label: "CURRENT BOARD REQUIRED",
    detail: "The live source did not expose placements. Enter the squads you can see in-game to unlock current-board planning.",
  });
}

function truthDashboardModel(input = {}) {
  const matchup = input.matchup || {};
  const myCode = allyCode(matchup?.matchup?.me?.allyCode || input.myAllyCode);
  const opponentCode = allyCode(matchup?.matchup?.opponent?.allyCode || input.opponentAllyCode);
  const identityExact = Boolean(matchup?.opponentResolution?.exact === true && opponentCode && opponentCode !== myCode);
  const mineLoaded = rosterLoaded(input.mineRoster, myCode);
  const opponentLoaded = rosterLoaded(input.opponentRoster, opponentCode);
  const history = scoutingHistory(input.scouting);
  const rounds = recordedRoundHistory(input.roundHistory);
  const board = boardState(matchup, input.savedBoard);
  const actionable = identityExact && mineLoaded && opponentLoaded && board.ready;
  const recommendationMode = actionable
    ? (history.known ? "evidence-first-with-roster-fit" : "roster-fit-no-history")
    : "not-current-board-actionable";
  const blockers = [];
  if (!identityExact) blockers.push("Exact current opponent is not verified.");
  if (!mineLoaded) blockers.push("Your current live roster is not loaded.");
  if (!opponentLoaded) blockers.push("Opponent current live roster is not loaded.");
  if (!board.ready) blockers.push("Current opponent defense is not available yet.");
  return Object.freeze({
    actionable,
    recommendationMode,
    blockers: Object.freeze(blockers),
    identity: Object.freeze({
      exact: identityExact,
      method: clean(matchup?.opponentResolution?.method),
      source: clean(matchup?.opponentResolution?.source),
      myAllyCode: myCode,
      opponentAllyCode: opponentCode,
      opponentName: clean(matchup?.matchup?.opponent?.name),
    }),
    rosters: Object.freeze({ mineLoaded, opponentLoaded }),
    history,
    rounds,
    board,
  });
}

export {
  aggregateDefense,
  aggregateOffense,
  allyCode,
  boardState,
  dedupeRecordedRounds,
  recordedRoundHistory,
  rosterLoaded,
  roundIdentity,
  roundPreference,
  scoutingHistory,
  truthDashboardModel,
};
