import { squadAbilityReadiness } from "./gac-ability-intelligence.js";

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
    datacrons: body?.summary?.datacrons == null ? null : n(body.summary.datacrons),
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
      datacrons: left.datacrons == null || right.datacrons == null ? null : left.datacrons - right.datacrons,
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

function median(values) {
  const sorted = values.map(n).filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function speedProfile(squad, enemyUnits) {
  const ownSpeeds = (squad || []).map((unit) => n(unit?.speed));
  const enemySpeeds = (enemyUnits || []).map((unit) => n(unit?.speed));
  const ownKnown = ownSpeeds.some((value) => value > 0);
  const enemyKnown = enemySpeeds.some((value) => value > 0);
  if (!ownKnown || !enemyKnown) {
    return Object.freeze({
      known: false,
      fastestEdge: 0,
      leaderEdge: 0,
      medianEdge: 0,
      risk: 0,
      label: "Speed evidence incomplete",
    });
  }

  const fastestEdge = Math.max(...ownSpeeds, 0) - Math.max(...enemySpeeds, 0);
  const leaderEdge = n(squad?.[0]?.speed) - n(enemyUnits?.[0]?.speed);
  const medianEdge = median(ownSpeeds) - median(enemySpeeds);
  let risk = 0;
  if (fastestEdge < 0) risk += Math.min(14, Math.abs(fastestEdge) / 5);
  if (leaderEdge < 0) risk += Math.min(12, Math.abs(leaderEdge) / 6);
  if (medianEdge < -10) risk += Math.min(10, Math.abs(medianEdge + 10) / 5);
  risk = Math.round(Math.min(30, risk) * 10) / 10;
  const label = risk >= 18
    ? "Severe speed risk"
    : risk >= 9
      ? "Meaningful speed risk"
      : fastestEdge >= 15 && leaderEdge >= 0
        ? "Healthy speed profile"
        : "Manageable speed profile";

  return Object.freeze({
    known: true,
    fastestEdge,
    leaderEdge,
    medianEdge: Math.round(medianEdge),
    risk,
    label,
  });
}

function abilityRisk(readiness) {
  if (!readiness?.known) return 3;
  const score = n(readiness.score);
  const tierRisk = score >= 88 ? 0 : score >= 78 ? 3 : score >= 68 ? 8 : 15;
  const lowTierRisk = Math.min(8, n(readiness.lowTierAbilities) * 1.5);
  const coverageRisk = readiness.coverage >= 1 ? 0 : Math.round((1 - n(readiness.coverage)) * 6);
  return Math.round(Math.min(24, tierRisk + lowTierRisk + coverageRisk) * 10) / 10;
}

function riskFlags({ speed, readiness, reserveUses = [] }) {
  const flags = [];
  if (speed?.known && speed.risk >= 18) flags.push("severe-speed-disadvantage");
  else if (speed?.known && speed.risk >= 9) flags.push("speed-disadvantage");
  if (readiness?.known && n(readiness.score) < 68) flags.push("ability-readiness-low");
  else if (!readiness?.known) flags.push("ability-readiness-unknown");
  if (reserveUses.length) flags.push("uses-strategic-reserve");
  return Object.freeze(flags);
}

function confidenceLabel(score, flags = []) {
  if (flags.includes("severe-speed-disadvantage") || flags.includes("ability-readiness-low")) {
    return score >= 118 ? "Playable with execution risk" : "High-risk roster fit";
  }
  if (score >= 128) return "Strong roster fit";
  if (score >= 105) return "Playable roster fit";
  return "Risky roster fit";
}

function rankRosterFitSquads(ownBody, enemyUnits, options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const excluded = new Set((options.excludeBaseIds || []).map((value) => String(value || "")));
  const reserves = new Set((options.reserveBaseIds || []).map((value) => String(value || "")));
  const reservePenaltyPerUnit = Math.max(0, n(options.reservePenaltyPerUnit || 18));
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
    const speed = speedProfile(squad, enemyUnits);
    const speedEdge = speed.fastestEdge;
    const omicronEdge = squad.reduce((sum, unit) => sum + n(unit.omicrons), 0) - enemyUnits.reduce((sum, unit) => sum + n(unit.omicrons), 0);
    const zetaEdge = squad.reduce((sum, unit) => sum + n(unit.zetas), 0) - enemyUnits.reduce((sum, unit) => sum + n(unit.zetas), 0);
    const synergy = squadSynergy(squad);
    const targetOverlap = squad.reduce((sum, unit) => sum + sharedFactions(unit, enemyUnits), 0);
    const strengthRatio = enemyThreat > 0 ? ownThreat / enemyThreat : 1;
    const readiness = squadAbilityReadiness(squad);
    const readinessRisk = abilityRisk(readiness);
    const reserveUses = squad.filter((unit) => reserves.has(String(unit?.baseId || ""))).map((unit) => String(unit.baseId));
    const reservePenalty = reserveUses.length * reservePenaltyPerUnit;
    const readinessBonus = readiness.known ? Math.max(-8, Math.min(10, (n(readiness.score) - 75) / 2.5)) : 0;
    const score = Math.round(
      Math.min(160, strengthRatio * 72) +
      synergy +
      Math.max(-20, Math.min(30, relicDelta * 3)) +
      Math.max(-12, Math.min(20, omicronEdge * 8)) +
      Math.max(-8, Math.min(12, zetaEdge * 2)) +
      readinessBonus -
      readinessRisk -
      speed.risk -
      reservePenalty -
      Math.min(12, targetOverlap)
    );
    const flags = riskFlags({ speed, readiness, reserveUses });
    return {
      squad,
      score,
      strengthRatio,
      relicDelta,
      speedEdge,
      speedProfile: speed,
      speedRisk: speed.risk,
      omicronEdge,
      zetaEdge,
      synergy,
      abilityReadiness: readiness,
      abilityRisk: readinessRisk,
      reserveUses: Object.freeze(reserveUses),
      reservePenalty,
      riskFlags: flags,
      confidence: confidenceLabel(score, flags),
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

function candidateAvailable(candidate, used) {
  return candidate?.squad?.every((unit) => !used.has(String(unit?.baseId || ""))) === true;
}

function candidateIds(candidate) {
  return new Set((candidate?.squad || []).map((unit) => String(unit?.baseId || "")).filter(Boolean));
}

function overkillPenalty(candidate) {
  return Math.max(0, n(candidate?.strengthRatio) - 1.28) * 30;
}

function futureScarcityPenalty(candidate, remainingItems, used) {
  const chosen = candidateIds(candidate);
  let penalty = 0;
  let endangered = 0;
  for (const item of remainingItems) {
    const before = item.candidates.filter((future) => candidateAvailable(future, used) && n(future.score) >= 100);
    if (!before.length) continue;
    const after = before.filter((future) => future.squad.every((unit) => !chosen.has(String(unit?.baseId || ""))));
    const lost = before.length - after.length;
    if (!lost) continue;
    if (!after.length) {
      penalty += before.length <= 2 ? 52 : 36;
      endangered += 1;
    } else {
      const scarcity = before.length <= 2 ? 24 : before.length <= 4 ? 15 : 8;
      penalty += scarcity * (lost / before.length);
    }
  }
  return Object.freeze({ penalty: Math.round(penalty * 10) / 10, endangered });
}

function strategicAllocationReason(candidate, metrics = {}) {
  if (!candidate) return "No non-overlapping roster-fit squad remained for this defense.";
  const reasons = [];
  if (n(metrics.scarcityPenalty) >= 20) reasons.push("protects scarce counters needed elsewhere");
  if (n(metrics.overkillPenalty) >= 8) reasons.push("avoids excessive overkill");
  if (candidate.reserveUses?.length) reasons.push(`spends ${candidate.reserveUses.length} strategic reserve unit${candidate.reserveUses.length === 1 ? "" : "s"}`);
  if (candidate.speedRisk >= 9) reasons.push(candidate.speedProfile?.label || "carries speed risk");
  if (candidate.abilityRisk >= 8) reasons.push("has ability-readiness risk");
  if (!reasons.length) reasons.push("best board-wide efficiency with current non-overlap constraints");
  return reasons.join(" · ");
}

function planBoardCounters(ownBody, opponentBody, defenseSquads, options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const baseExcluded = new Set((options.excludeBaseIds || []).map((value) => String(value || "")));
  const beamWidth = Math.max(8, Math.min(128, Math.floor(n(options.beamWidth) || 48)));
  const candidateLimit = Math.max(2, Math.min(12, Math.floor(n(options.candidateLimit) || 7)));
  const defenses = (Array.isArray(defenseSquads) ? defenseSquads : [])
    .map((squad, index) => ({ index, defense: normalizeDefenseSquad(squad, opponentBody) }))
    .filter((item) => item.defense?.units?.length)
    .map((item) => {
      const candidates = rankRosterFitSquads(ownBody, item.defense.units, {
        size,
        excludeBaseIds: [...baseExcluded],
        reserveBaseIds: options.reserveBaseIds || [],
        reservePenaltyPerUnit: options.reservePenaltyPerUnit,
      });
      return {
        ...item,
        candidates,
        threat: item.defense.units.reduce((sum, unit) => sum + combatValue(unit), 0),
        playable: candidates.filter((candidate) => candidate.score >= 100).length,
      };
    })
    .sort((a, b) => a.playable - b.playable || b.threat - a.threat);

  let beam = [{ used: new Set(baseExcluded), total: 0, assignments: [] }];
  for (let itemIndex = 0; itemIndex < defenses.length; itemIndex += 1) {
    const item = defenses[itemIndex];
    const remaining = defenses.slice(itemIndex + 1);
    const next = [];

    for (const state of beam) {
      const available = item.candidates
        .filter((candidate) => candidateAvailable(candidate, state.used))
        .slice(0, candidateLimit);

      if (!available.length) {
        next.push({
          used: new Set(state.used),
          total: state.total - 85,
          assignments: [...state.assignments, {
            item,
            candidate: null,
            allocationScore: -85,
            overkillPenalty: 0,
            scarcityPenalty: 0,
            endangered: 0,
          }],
        });
        continue;
      }

      for (const candidate of available) {
        const overkill = overkillPenalty(candidate);
        const scarcity = futureScarcityPenalty(candidate, remaining, state.used);
        const allocationScore = n(candidate.score) - overkill - scarcity.penalty;
        const used = new Set(state.used);
        for (const unit of candidate.squad) used.add(String(unit?.baseId || ""));
        next.push({
          used,
          total: state.total + allocationScore,
          assignments: [...state.assignments, {
            item,
            candidate,
            allocationScore,
            overkillPenalty: overkill,
            scarcityPenalty: scarcity.penalty,
            endangered: scarcity.endangered,
          }],
        });
      }
    }

    beam = next
      .sort((a, b) => b.total - a.total)
      .slice(0, beamWidth);
  }

  const best = beam[0] || { assignments: [] };
  return best.assignments.map((assignment) => {
    const selected = assignment.candidate;
    const usedBefore = new Set(baseExcluded);
    for (const prior of best.assignments) {
      if (prior === assignment) break;
      for (const unit of prior.candidate?.squad || []) usedBefore.add(String(unit?.baseId || ""));
    }
    const alternativesRemaining = assignment.item.candidates
      .filter((candidate) => candidate !== selected && candidateAvailable(candidate, usedBefore))
      .length;
    return {
      defenseIndex: assignment.item.index,
      defense: assignment.item.defense,
      recommendation: selected,
      alternativesRemaining,
      allocationScore: Math.round(n(assignment.allocationScore) * 10) / 10,
      overkillPenalty: Math.round(n(assignment.overkillPenalty) * 10) / 10,
      scarcityPenalty: Math.round(n(assignment.scarcityPenalty) * 10) / 10,
      endangeredFutureDefenses: n(assignment.endangered),
      allocationReason: strategicAllocationReason(selected, assignment),
    };
  }).sort((a, b) => a.defenseIndex - b.defenseIndex);
}

function formatSigned(value) {
  const number = n(value);
  if (!number) return "0";
  return `${number > 0 ? "+" : "−"}${NUMBER.format(Math.abs(number))}`;
}

export {
  abilityRisk,
  combatValue,
  compareRosters,
  formatSigned,
  futureScarcityPenalty,
  hasLeaderAbility,
  planBoardCounters,
  rankRosterFitSquads,
  rosterSummary,
  speedProfile,
  unitDeltaRows,
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  import("./gac-live-matchup-enhancer.js").catch((error) => {
    console.warn("GAC live matchup enhancer failed to load", error);
  });
  import("./gac-bracket-fallback.js").catch((error) => {
    console.warn("GAC live bracket fallback failed to load", error);
  });
}
