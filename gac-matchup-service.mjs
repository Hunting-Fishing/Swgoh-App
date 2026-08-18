function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAllyCode(value) {
  const allyCode = clean(value).replace(/\D/g, "");
  if (!/^\d{9}$/.test(allyCode)) {
    const error = new Error("A valid 9-digit Ally Code is required.");
    error.status = 400;
    throw error;
  }
  return allyCode;
}

function normalizeBaseId(value) {
  return clean(value).split(":")[0].toUpperCase();
}

function allyCodeFrom(value) {
  const candidates = [
    value?.allyCode,
    value?.ally_code,
    value?.player?.allyCode,
    value?.player?.ally_code,
    value?.profile?.allyCode,
  ];
  for (const candidate of candidates) {
    const normalized = clean(candidate).replace(/\D/g, "");
    if (/^\d{9}$/.test(normalized)) return normalized;
  }
  return "";
}

function playerIdFrom(value) {
  return clean(value?.playerId || value?.player_id || value?.swgohPlayerId || value?.swgoh_player_id || value?.id);
}

function nameFrom(value) {
  return clean(value?.name || value?.playerName || value?.player_name || value?.profile?.name);
}

function participant(value) {
  if (!value || typeof value !== "object") return null;
  const allyCode = allyCodeFrom(value);
  const playerId = playerIdFrom(value);
  const name = nameFrom(value);
  if (!allyCode && !playerId && !name) return null;
  return Object.freeze({ allyCode, playerId, name });
}

function objectWalk(root, maxNodes = 20_000) {
  const output = [];
  const stack = [root];
  const seen = new WeakSet();
  while (stack.length && output.length < maxNodes) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return output;
}

function explicitOpponent(value) {
  const keys = ["opponent", "currentOpponent", "opponentPlayer", "enemyPlayer", "enemy", "rival"];
  for (const key of keys) {
    const found = participant(value?.[key]);
    if (found && (found.allyCode || found.playerId || found.name)) return found;
  }
  return null;
}

function resolveOpponent(currentEvent, allyCode, playerContext = {}) {
  const direct = explicitOpponent(playerContext) || explicitOpponent(currentEvent);
  if (direct && direct.allyCode !== allyCode) return direct;

  const playerId = playerIdFrom(playerContext?.player || playerContext);
  for (const object of objectWalk(currentEvent)) {
    for (const array of Object.values(object)) {
      if (!Array.isArray(array) || array.length < 2 || array.length > 16) continue;
      const participants = array.map(participant).filter(Boolean);
      if (participants.length < 2) continue;
      const meIndex = participants.findIndex((item) => item.allyCode === allyCode || (playerId && item.playerId === playerId));
      if (meIndex < 0) continue;
      const rival = participants.find((item, index) => index !== meIndex && (item.allyCode || item.playerId || item.name));
      if (rival) return rival;
    }
  }

  for (const object of objectWalk(currentEvent)) {
    const objectParticipant = participant(object);
    if (!objectParticipant) continue;
    if (objectParticipant.allyCode !== allyCode && (!playerId || objectParticipant.playerId !== playerId)) continue;
    const rival = explicitOpponent(object);
    if (rival) return rival;
  }
  return null;
}

function normalizeUnit(unit = {}) {
  const baseId = normalizeBaseId(unit.baseId || unit.base_id || unit.defId || unit.definitionId || unit.definition_id);
  if (!baseId) return null;
  return Object.freeze({
    baseId,
    name: clean(unit.name || unit.unitName || unit.unit_name || baseId),
    unitType: clean(unit.unitType || unit.unit_type || unit.combatType || unit.combat_type),
    power: finite(unit.power ?? unit.galacticPower ?? unit.galactic_power),
    relic: finite(unit.relic ?? unit.relicTier ?? unit.relic_tier),
    gear: finite(unit.gear ?? unit.gearLevel ?? unit.gear_level),
    zetas: finite(unit.zetas ?? unit.zetaCount ?? unit.zeta_count),
    omicrons: finite(unit.omicrons ?? unit.omicronCount ?? unit.omicron_count),
    ultimateUnlocked: unit.ultimateUnlocked === true || unit.ultimate_unlocked === true,
    skillTiers: Object.freeze(asArray(unit.skillTiers || unit.skills).map((skill) => Object.freeze({
      id: clean(skill?.id || skill?.skillId || skill?.skill_id),
      tier: finite(skill?.effectiveTier ?? skill?.tier ?? skill?.level),
    })).filter((skill) => skill.id)),
  });
}

function rosterUnits(body = {}) {
  const source = [...asArray(body.units), ...asArray(body.ships), ...asArray(body.rosterUnit), ...asArray(body.roster)];
  const index = new Map();
  for (const raw of source) {
    const unit = normalizeUnit(raw);
    if (unit) index.set(unit.baseId, unit);
  }
  return [...index.values()];
}

function rosterSummary(body = {}) {
  const units = rosterUnits(body);
  const characters = units.filter((unit) => !/ship|2/i.test(unit.unitType));
  const relics = Object.fromEntries(Array.from({ length: 10 }, (_, tier) => [`r${tier}`, 0]));
  for (const unit of characters) {
    if (unit.relic >= 0 && unit.relic <= 9) relics[`r${Math.floor(unit.relic)}`] += 1;
  }
  const player = body.player || {};
  return Object.freeze({
    allyCode: allyCodeFrom(player) || allyCodeFrom(body),
    playerId: playerIdFrom(player) || playerIdFrom(body),
    name: nameFrom(player) || nameFrom(body),
    galacticPower: finite(player.galacticPower ?? player.galactic_power ?? body.galacticPower ?? body.galactic_power),
    characterGalacticPower: finite(player.characterGalacticPower ?? player.character_power ?? body.characterGalacticPower),
    shipGalacticPower: finite(player.shipGalacticPower ?? player.ship_power ?? body.shipGalacticPower),
    units: units.length,
    relicCharacters: characters.filter((unit) => unit.relic > 0).length,
    relicScore: characters.reduce((sum, unit) => sum + Math.max(0, unit.relic), 0),
    zetas: units.reduce((sum, unit) => sum + unit.zetas, 0),
    omicrons: units.reduce((sum, unit) => sum + unit.omicrons, 0),
    ultimates: units.filter((unit) => unit.ultimateUnlocked).length,
    relics: Object.freeze(relics),
  });
}

function delta(left, right) {
  const fields = ["galacticPower", "characterGalacticPower", "shipGalacticPower", "relicCharacters", "relicScore", "zetas", "omicrons", "ultimates"];
  return Object.freeze(Object.fromEntries(fields.map((field) => [field, finite(left?.[field]) - finite(right?.[field])])));
}

function memberIds(value) {
  const raw = asArray(value?.members || value?.units || value?.squad || value?.unit);
  return raw.map((unit) => normalizeBaseId(typeof unit === "string" ? unit : unit?.baseId || unit?.defId || unit?.definitionId)).filter(Boolean);
}

function squadOwnerAllyCode(value) {
  return allyCodeFrom(value?.owner || value?.player || value) || clean(value?.ownerAllyCode).replace(/\D/g, "");
}

function squadSide(value) {
  return clean(value?.side || value?.type || value?.placementType || value?.deploymentType).toLowerCase();
}

function normalizeSquad(value = {}) {
  const members = memberIds(value);
  if (!members.length) return null;
  return Object.freeze({
    leaderBaseId: normalizeBaseId(value.leaderBaseId || value.leader || members[0]),
    members: Object.freeze(members),
    zone: clean(value.zone || value.zoneId || value.territory || value.territoryId),
    slot: Number.isFinite(Number(value.slot ?? value.squadSlot)) ? Number(value.slot ?? value.squadSlot) : null,
    ownerAllyCode: squadOwnerAllyCode(value),
  });
}

function extractDefenseSquads(currentEvent, ownerAllyCode) {
  const squads = [];
  const seen = new Set();
  for (const object of objectWalk(currentEvent)) {
    const side = squadSide(object);
    if (side && !/(defen|deploy|placed|home)/i.test(side)) continue;
    const squad = normalizeSquad(object);
    if (!squad || squad.members.length < 2) continue;
    if (ownerAllyCode && squad.ownerAllyCode && squad.ownerAllyCode !== ownerAllyCode) continue;
    const key = `${squad.zone}|${squad.slot}|${squad.members.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    squads.push(squad);
  }
  return Object.freeze(squads);
}

function formatFrom(...values) {
  for (const value of values) {
    const text = clean(value?.format || value?.mode || value?.squadSize || value).toLowerCase();
    if (text.includes("3v3") || text === "3") return "3v3";
    if (text.includes("5v5") || text === "5") return "5v5";
  }
  return "5v5";
}

function counterScore(observation, rosterIndex) {
  const members = asArray(observation.counterMembers);
  const owned = members.map((id) => rosterIndex.get(normalizeBaseId(id))).filter(Boolean);
  if (!members.length || owned.length !== members.length) return null;
  const battles = Math.max(0, finite(observation.battles));
  const winRate = Math.max(0, Math.min(1, finite(observation.winRate)));
  const averageBanners = finite(observation.averageBanners);
  const relicScore = owned.reduce((sum, unit) => sum + Math.max(0, unit.relic), 0) / owned.length;
  const score = (winRate * 60) + Math.min(15, Math.log10(battles + 1) * 6) + Math.min(12, averageBanners / 6) + Math.min(13, relicScore * 1.5);
  return Object.freeze({
    score: Math.round(score * 10) / 10,
    leaderBaseId: normalizeBaseId(observation.counterLeaderBaseId),
    members: Object.freeze(members.map(normalizeBaseId)),
    battles,
    wins: finite(observation.wins),
    winRate,
    averageBanners: observation.averageBanners ?? null,
    source: clean(observation.source),
    sourceRef: clean(observation.sourceRef),
    rosterFit: Object.freeze({
      averageRelic: Math.round(relicScore * 10) / 10,
      zetas: owned.reduce((sum, unit) => sum + unit.zetas, 0),
      omicrons: owned.reduce((sum, unit) => sum + unit.omicrons, 0),
      power: owned.reduce((sum, unit) => sum + unit.power, 0),
    }),
  });
}

export function createGacMatchupService(options = {}) {
  const requestGateway = options.requestGateway;
  const history = options.history;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");

  async function analyze(allyCodeInput, analyzeOptions = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const [currentEvent, playerContext, myRoster] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${allyCode}`, true).catch(() => ({})),
      requestGateway(`/v1/player/${allyCode}`, true),
    ]);
    const opponent = resolveOpponent(currentEvent, allyCode, playerContext);
    if (!opponent) {
      const error = new Error("The live GAC payload did not expose a resolvable current opponent for this player.");
      error.status = 404;
      throw error;
    }
    if (!opponent.allyCode) {
      const error = new Error(`Current opponent ${opponent.name || opponent.playerId || "unknown"} was found, but the live payload did not expose their Ally Code.`);
      error.status = 409;
      throw error;
    }

    const opponentRoster = await requestGateway(`/v1/player/${opponent.allyCode}`, true);
    const me = rosterSummary(myRoster);
    const rival = rosterSummary(opponentRoster);
    const format = formatFrom(currentEvent, playerContext);
    const opponentDefense = extractDefenseSquads(currentEvent, opponent.allyCode);
    const myDefense = extractDefenseSquads(currentEvent, allyCode);
    const committed = new Set(myDefense.flatMap((squad) => squad.members));
    const rosterIndex = new Map(rosterUnits(myRoster).map((unit) => [unit.baseId, unit]));

    const targetLeader = normalizeBaseId(analyzeOptions.enemyLeaderBaseId);
    let counters = [];
    if (targetLeader && history?.getCounterEvidence) {
      const evidence = await history.getCounterEvidence({ format, enemyLeaderBaseId: targetLeader, limit: 250 });
      counters = asArray(evidence?.observations)
        .filter((observation) => !asArray(observation.counterMembers).some((id) => committed.has(normalizeBaseId(id))))
        .map((observation) => counterScore(observation, rosterIndex))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || b.battles - a.battles)
        .slice(0, 10);
    }

    return Object.freeze({
      source: "live-gac-matchup-intelligence",
      fetchedAt: new Date().toISOString(),
      format,
      event: Object.freeze({
        eventInstanceId: clean(currentEvent?.eventInstanceId || currentEvent?.event?.eventInstanceId || currentEvent?.id),
        round: finite(currentEvent?.round ?? currentEvent?.roundNumber ?? playerContext?.round ?? playerContext?.roundNumber),
        status: clean(currentEvent?.status || currentEvent?.phase || playerContext?.status || playerContext?.phase),
      }),
      matchup: Object.freeze({ me, opponent: rival, delta: delta(me, rival) }),
      defense: Object.freeze({
        mine: myDefense,
        opponent: opponentDefense,
        visibility: opponentDefense.length ? "live-defense-visible" : "live-source-does-not-expose-defense",
      }),
      counterTarget: targetLeader || null,
      recommendedCounters: Object.freeze(counters),
      notes: Object.freeze([
        "Relic, zeta and omicron deltas are calculated from the two live roster payloads.",
        opponentDefense.length ? "Opponent defense squads were present in the live event payload." : "Opponent defense squads were not present in the live event payload; counter selection can still be requested by enemy leader.",
        counters.length ? "Counter ranking uses persisted battle evidence and removes squads that require units detected on your defense." : "No counter ranking was requested or no owned evidence-backed counter was available.",
      ]),
    });
  }

  return Object.freeze({ analyze });
}

export {
  counterScore,
  delta,
  extractDefenseSquads,
  normalizeAllyCode,
  resolveOpponent,
  rosterSummary,
  rosterUnits,
};
