const DEFAULT_BASE_URL = "https://gahistory.c3po.wtf";
const DEFAULT_LEAGUES = Object.freeze(["KYBER", "AURODIUM", "CHROMIUM", "BRONZIUM"]);
const MODES = new Set(["3v3", "5v5"]);

function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeMode(value) {
  const mode = clean(value).toLowerCase();
  if (!MODES.has(mode)) throw new Error("GAC history mode must be 3v3 or 5v5.");
  return mode;
}

function normalizePlayerId(value) {
  const playerId = clean(value);
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(playerId)) throw new Error("A valid SWGOH player ID is required.");
  return playerId;
}

function baseId(definitionId) {
  return clean(definitionId).split(":")[0];
}

function teamIds(units) {
  return asArray(units).map((unit) => baseId(unit?.definitionId)).filter(Boolean);
}

function squadInfo(units) {
  const list = asArray(units);
  if (!list.length) return { kind: "unknown", leader: "" };
  const fleet = list.some((unit) => [3, 5].includes(integer(unit?.squadUnitType, -1)));
  if (fleet) {
    const capital = list.find((unit) => integer(unit?.squadUnitType, -1) === 3) || list[0];
    return { kind: "fleet", leader: baseId(capital?.definitionId) };
  }
  const leader = list.find((unit) => integer(unit?.squadUnitType, -1) === 2) || list[0];
  return { kind: "character", leader: baseId(leader?.definitionId) };
}

function battleOutcome(value) {
  const numeric = Number(value);
  if (numeric === 1) return "win";
  if (numeric === 2) return "loss";
  if (numeric === 3) return "draw";
  return "unknown";
}

function matchMetadata(match = {}) {
  const opponent = match?.opponent || match?.opponentPlayer || match?.enemyPlayer || {};
  const round = integer(match?.roundNumber ?? match?.round ?? match?.matchRound, 0);
  return {
    roundNumber: round >= 1 && round <= 3 ? round : null,
    matchId: clean(match?.matchId || match?.id || match?.tournamentMatchId),
    opponentPlayerId: clean(
      match?.opponentPlayerId ||
      match?.opponentId ||
      opponent?.playerId ||
      opponent?.id
    ),
    opponentAllyCode: clean(match?.opponentAllyCode || opponent?.allyCode).replace(/\D/g, "").slice(0, 9),
    opponentName: clean(match?.opponentName || opponent?.name || opponent?.playerName),
  };
}

function normalizePlayerBattles(doc, context = {}) {
  const mode = normalizeMode(context.mode);
  const playerId = normalizePlayerId(context.playerId);
  const eventInstanceId = clean(context.eventInstanceId);
  const season = clean(context.season);
  const allyCode = clean(context.allyCode).replace(/\D/g, "").slice(0, 9);
  const battles = [];

  asArray(doc?.matchResult).forEach((match, matchIndex) => {
    const metadata = matchMetadata(match);
    asArray(match?.attackResult).forEach((attackGroup, attackGroupIndex) => {
      asArray(attackGroup?.duelResult).forEach((duel, duelIndex) => {
        const attackerUnits = asArray(duel?.attackerUnit);
        const defenderUnits = asArray(duel?.defenderUnit);
        const attacker = squadInfo(attackerUnits);
        const defender = squadInfo(defenderUnits);
        const attackerMembers = teamIds(attackerUnits);
        const defenderMembers = teamIds(defenderUnits);
        if (!attackerMembers.length || !defenderMembers.length) return;

        battles.push(Object.freeze({
          format: mode,
          playerId,
          allyCode: /^\d{9}$/.test(allyCode) ? allyCode : "",
          eventInstanceId,
          seasonId: season,
          matchIndex,
          attackGroupIndex,
          duelIndex,
          roundNumber: metadata.roundNumber,
          matchId: metadata.matchId,
          opponentPlayerId: metadata.opponentPlayerId,
          opponentAllyCode: /^\d{9}$/.test(metadata.opponentAllyCode) ? metadata.opponentAllyCode : "",
          opponentName: metadata.opponentName,
          battleType: defender.kind,
          attackerLeaderBaseId: attacker.leader,
          attackerMembers: Object.freeze(attackerMembers),
          defenderLeaderBaseId: defender.leader,
          defenderMembers: Object.freeze(defenderMembers),
          outcome: battleOutcome(duel?.battleOutcome),
          rawOutcome: duel?.battleOutcome ?? null,
        }));
      });
    });
  });

  return Object.freeze(battles);
}

function createRequestGate(minIntervalMs) {
  let lastStartedAt = 0;
  return async function gate() {
    const wait = Math.max(0, lastStartedAt + minIntervalMs - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStartedAt = Date.now();
  };
}

export function createC3poHistorySource(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = clean(options.baseUrl || process.env.GAC_HISTORY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || process.env.GAC_HISTORY_TIMEOUT_MS || 15000));
  const gate = createRequestGate(Math.max(0, Number(options.minIntervalMs ?? 20)));

  async function requestJson(pathname) {
    await gate();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, {
        headers: { Accept: "application/json", "User-Agent": "swgoh-command-center-gac-history" },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        const error = new Error(`C-3PO GAHistory returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getInfo(modeInput) {
    const mode = normalizeMode(modeInput);
    const body = await requestJson(`/${mode}/info.json`);
    if (!body?.instanceId) throw new Error(`C-3PO GAHistory has no ${mode} event metadata yet.`);
    return Object.freeze({
      mode,
      instanceId: clean(body.instanceId),
      season: clean(body.season),
      eventInstanceId: clean(body.eventInstanceId),
    });
  }

  async function getPlayer(modeInput, playerIdInput) {
    const mode = normalizeMode(modeInput);
    const playerId = normalizePlayerId(playerIdInput);
    return await requestJson(`/${mode}/${encodeURIComponent(playerId)}.json`);
  }

  async function getPlayerIds(modeInput, leagues = DEFAULT_LEAGUES) {
    const mode = normalizeMode(modeInput);
    const body = await requestJson(`/${mode}/players.json`);
    const ids = new Set();
    for (const league of leagues) {
      for (const playerId of asArray(body?.[clean(league).toUpperCase()])) {
        const normalized = clean(playerId);
        if (normalized) ids.add(normalized);
      }
    }
    return Object.freeze([...ids]);
  }

  return Object.freeze({
    baseUrl,
    getInfo,
    getPlayer,
    getPlayerIds,
  });
}

export {
  DEFAULT_LEAGUES,
  baseId,
  battleOutcome,
  matchMetadata,
  normalizeMode,
  normalizePlayerBattles,
  squadInfo,
  teamIds,
};
