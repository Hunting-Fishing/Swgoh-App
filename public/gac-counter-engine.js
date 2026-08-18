const NUMBER = new Intl.NumberFormat("en-US");

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function characters(body) {
  return Array.isArray(body?.units) ? body.units.filter((unit) => unit?.unitType !== "Ship") : [];
}

function hasLeaderAbility(unit) {
  return (unit?.abilities || []).some((ability) => {
    const type = String(ability?.type || "").toLowerCase();
    const id = String(ability?.id || "").toLowerCase();
    return type.includes("leader") || id.startsWith("leader");
  });
}

function combatValue(unit) {
  const relic = n(unit?.relic);
  const power = n(unit?.power);
  const speed = n(unit?.speed);
  const zetas = n(unit?.zetas);
  const omicrons = n(unit?.omicrons);
  const stars = n(unit?.stars);
  const gear = n(unit?.gear);
  return Math.round(
    power +
    relic * 4_250 +
    speed * 47 +
    zetas * 5_500 +
    omicrons * 13_500 +
    Math.max(0, stars - 5) * 1_250 +
    Math.max(0, gear - 12) * 3_000
  );
}

function rosterSummary(body) {
  const units = characters(body);
  const relicUnits = units.filter((unit) => n(unit.relic) > 0);
  return {
    name: body?.player?.name || "Unknown Player",
    allyCode: String(body?.player?.allyCode || ""),
    gp: n(body?.player?.galacticPower),
    characterGp: n(body?.player?.characterGalacticPower),
    skillRating: n(body?.competitive?.gacSkillRating || body?.player?.gacSkillRating),
    league: body?.competitive?.gacLeague || body?.player?.gacLeague || "N/A",
    division: body?.competitive?.gacDivision || body?.player?.gacDivision || "N/A",
    units: units.length,
    relicUnits: relicUnits.length,
    relicTotal: relicUnits.reduce((sum, unit) => sum + n(unit.relic), 0),
    r7Plus: relicUnits.filter((unit) => n(unit.relic) >= 7).length,
    r8Plus: relicUnits.filter((unit) => n(unit.relic) >= 8).length,
    r9Plus: relicUnits.filter((unit) => n(unit.relic) >= 9).length,
    zetas: units.reduce((sum, unit) => sum + n(unit.zetas), 0),
    omicrons: units.reduce((sum, unit) => sum + n(unit.omicrons), 0),
    sixDotMods: n(body?.summary?.sixDotMods),
    topSpeed: units.reduce((max, unit) => Math.max(max, n(unit.speed)), 0),
    combatValue: units.reduce((sum, unit) => sum + combatValue(unit), 0),
  };
}

function delta(left, right, key) {
  return n(left?.[key]) - n(right?.[key]);
}

function compareRosters(leftBody, rightBody) {
  const left = rosterSummary(leftBody);
  const right = rosterSummary(rightBody);
  return {
    left,
    right,
    delta: {
      gp: delta(left, right, "gp"),
      characterGp: delta(left, right, "characterGp"),
      skillRating: delta(left, right, "skillRating"),
      relicUnits: delta(left, right, "relicUnits"),
      relicTotal: delta(left, right, "relicTotal"),
      r7Plus: delta(left, right, "r7Plus"),
      r9Plus: delta(left, right, "r9Plus"),
      zetas: delta(left, right, "zetas"),
      omicrons: delta(left, right, "omicrons"),
      sixDotMods: delta(left, right, "sixDotMods"),
      topSpeed: delta(left, right, "topSpeed"),
      combatValue: delta(left, right, "combatValue"),
    },
  };
}

function unitDeltaRows(leftBody, rightBody) {
  const left = new Map(characters(leftBody).map((unit) => [unit.baseId, unit]));
  const right = new Map(characters(rightBody).map((unit) => [unit.baseId, unit]));
  const ids = new Set([...left.keys(), ...right.keys()]);
  return [...ids].map((baseId) => {
    const mine = left.get(baseId) || null;
    const theirs = right.get(baseId) || null;
    return {
      baseId,
      name: mine?.name || theirs?.name || baseId,
      mine,
      theirs,
      relicDelta: n(mine?.relic) - n(theirs?.relic),
      speedDelta: n(mine?.speed) - n(theirs?.speed),
      powerDelta: n(mine?.power) - n(theirs?.power),
      zetaDelta: n(mine?.zetas) - n(theirs?.zetas),
      omicronDelta: n(mine?.omicrons) - n(theirs?.omicrons),
      threat: combatValue(theirs || mine || {}),
    };
  }).sort((a, b) => b.threat - a.threat || a.name.localeCompare(b.name));
}

function sharedFactions(unit, targetUnits) {
  const own = new Set((unit?.factions || []).map((value) => String(value).toLowerCase()));
  const targetFactions = new Map();
  for (const target of targetUnits) {
    for (const faction of target?.factions || []) {
      const key = String(faction).toLowerCase();
      targetFactions.set(key, (targetFactions.get(key) || 0) + 1);
    }
  }
  return [...own].reduce((score, faction) => score + (targetFactions.get(faction) || 0), 0);
}

function squadSynergy(squad) {
  const counts = new Map();
  for (const unit of squad) {
    for (const faction of unit?.factions || []) {
      const key = String(faction).toLowerCase();
      if (["light side", "dark side", "neutral"].includes(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const best = Math.max(0, ...counts.values());
  const leader = squad.some(hasLeaderAbility) ? 1 : 0;
  return best * 7 + leader * 12;
}

function buildAroundLeader(leader, roster, size) {
  const leaderFactions = new Set((leader?.factions || []).map((value) => String(value).toLowerCase()));
  const candidates = roster
    .filter((unit) => unit.baseId !== leader.baseId)
    .map((unit) => {
      const factionMatch = (unit?.factions || []).reduce((sum, faction) => {
        return sum + (leaderFactions.has(String(faction).toLowerCase()) ? 1 : 0);
      }, 0);
      return { unit, factionMatch, value: combatValue(unit) };
    })
    .sort((a, b) => b.factionMatch - a.factionMatch || b.value - a.value);
  return [leader, ...candidates.slice(0, Math.max(0, size - 1)).map((item) => item.unit)];
}

function uniqueSquads(squads) {
  const seen = new Set();
  return squads.filter((squad) => {
    const key = squad.map((unit) => unit.baseId).sort().join("|");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankRosterFitSquads(ownBody, enemyUnits, options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const excluded = new Set((options.excludeBaseIds || []).map((value) => String(value || "")));
  const roster = characters(ownBody)
    .filter((unit) => !excluded.has(String(unit?.baseId || "")))
    .filter((unit) => n(unit.stars) >= 7 && (n(unit.relic) > 0 || n(unit.gear) >= 12))
    .sort((a, b) => combatValue(b) - combatValue(a));
  if (!roster.length || !enemyUnits?.length) return [];

  const enemyThreat = enemyUnits.reduce((sum, unit) => sum + combatValue(unit), 0);
  const leaders = roster.filter(hasLeaderAbility).slice(0, 40);
  const seeds = leaders.length ? leaders : roster.slice(0, 25);
  const squads = uniqueSquads(seeds.map((leader) => buildAroundLeader(leader, roster, size)));

  return squads.map((squad) => {
    const ownThreat = squad.reduce((sum, unit) => sum + combatValue(unit), 0);
    const relicDelta = squad.reduce((sum, unit) => sum + n(unit.relic), 0) - enemyUnits.reduce((sum, unit) => sum + n(unit.relic), 0);
    const speedEdge = Math.max(...squad.map((unit) => n(unit.speed)), 0) - Math.max(...enemyUnits.map((unit) => n(unit.speed)), 0);
    const omicronEdge = squad.reduce((sum, unit) => sum + n(unit.omicrons), 0) - enemyUnits.reduce((sum, unit) => sum + n(unit.omicrons), 0);
    const zetaEdge = squad.reduce((sum, unit) => sum + n(unit.zetas), 0) - enemyUnits.reduce((sum, unit) => sum + n(unit.zetas), 0);
    const synergy = squadSynergy(squad);
    const targetOverlap = squad.reduce((sum, unit) => sum + sharedFactions(unit, enemyUnits), 0);
    const strengthRatio = enemyThreat > 0 ? ownThreat / enemyThreat : 1;
    const score = Math.round(
      Math.min(160, strengthRatio * 72) +
      synergy +
      Math.max(-20, Math.min(30, relicDelta * 3)) +
      Math.max(-12, Math.min(18, speedEdge / 12)) +
      Math.max(-12, Math.min(20, omicronEdge * 8)) +
      Math.max(-8, Math.min(12, zetaEdge * 2)) -
      Math.min(12, targetOverlap)
    );
    return {
      squad,
      score,
      strengthRatio,
      relicDelta,
      speedEdge,
      omicronEdge,
      zetaEdge,
      synergy,
      confidence: score >= 128 ? "Strong roster fit" : score >= 105 ? "Playable roster fit" : "Risky roster fit",
    };
  }).sort((a, b) => b.score - a.score).slice(0, 12);
}

function normalizeDefenseSquad(squad, opponentBody) {
  const index = new Map(characters(opponentBody).map((unit) => [String(unit?.baseId || ""), unit]));
  const ids = Array.isArray(squad?.members) ? squad.members : [];
  const units = ids.map((id) => index.get(String(id || ""))).filter(Boolean);
  if (!units.length) return null;
  const leaderId = String(squad?.leaderBaseId || ids[0] || "");
  const leader = units.find((unit) => unit.baseId === leaderId);
  return {
    ...squad,
    units: leader ? [leader, ...units.filter((unit) => unit.baseId !== leaderId)] : units,
  };
}

function planBoardCounters(ownBody, opponentBody, defenseSquads, options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const baseExcluded = new Set((options.excludeBaseIds || []).map((value) => String(value || "")));
  const defenses = (Array.isArray(defenseSquads) ? defenseSquads : [])
    .map((squad, index) => ({ index, defense: normalizeDefenseSquad(squad, opponentBody) }))
    .filter((item) => item.defense?.units?.length)
    .map((item) => {
      const candidates = rankRosterFitSquads(ownBody, item.defense.units, { size, excludeBaseIds: [...baseExcluded] });
      return {
        ...item,
        candidates,
        threat: item.defense.units.reduce((sum, unit) => sum + combatValue(unit), 0),
        playable: candidates.filter((candidate) => candidate.score >= 105).length,
      };
    })
    .sort((a, b) => a.playable - b.playable || b.threat - a.threat);

  const used = new Set(baseExcluded);
  const assignments = [];
  for (const item of defenses) {
    const available = item.candidates
      .filter((candidate) => candidate.squad.every((unit) => !used.has(String(unit?.baseId || ""))))
      .map((candidate) => {
        const overkillPenalty = Math.max(0, candidate.strengthRatio - 1.28) * 28;
        const efficiencyScore = candidate.score - overkillPenalty;
        return { candidate, efficiencyScore };
      })
      .sort((a, b) => b.efficiencyScore - a.efficiencyScore || b.candidate.score - a.candidate.score);
    const selected = available[0]?.candidate || null;
    if (selected) {
      for (const unit of selected.squad) used.add(String(unit?.baseId || ""));
    }
    assignments.push({
      defenseIndex: item.index,
      defense: item.defense,
      recommendation: selected,
      alternativesRemaining: Math.max(0, available.length - 1),
    });
  }

  return assignments.sort((a, b) => a.defenseIndex - b.defenseIndex);
}

function formatSigned(value) {
  const number = n(value);
  if (!number) return "0";
  return `${number > 0 ? "+" : "−"}${NUMBER.format(Math.abs(number))}`;
}

export {
  combatValue,
  compareRosters,
  formatSigned,
  hasLeaderAbility,
  planBoardCounters,
  rankRosterFitSquads,
  rosterSummary,
  unitDeltaRows,
};
