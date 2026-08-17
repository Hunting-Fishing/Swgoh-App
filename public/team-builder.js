function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function knownNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function memberScore(unit) {
  return numeric(unit.readiness) * 1000 + numeric(unit.power) + numeric(unit.speed) * 10;
}

export function isLeader(unit = {}) {
  return (unit.abilities || []).some((ability) => {
    const type = String(ability?.type || "").toLowerCase();
    const id = String(ability?.id || "").toLowerCase();
    return type === "leader" || type.includes("leader") || id.startsWith("leader_") || id.includes("_leader_");
  });
}

export function buildFactionSquads(units = [], options = {}) {
  const size = Math.max(1, Number(options.size || 5));
  const limit = Math.max(1, Number(options.limit || 8));
  const characters = units.filter((unit) => unit?.unitType === "Character");
  const factions = new Map();

  for (const unit of characters) {
    for (const faction of unit.factions || []) {
      const key = String(faction || "").trim();
      if (!key) continue;
      if (!factions.has(key)) factions.set(key, []);
      factions.get(key).push(unit);
    }
  }

  const suggestions = [];
  for (const [faction, members] of factions) {
    if (members.length < size) continue;
    const ranked = [...members]
      .sort((a, b) => memberScore(b) - memberScore(a) || String(a.name).localeCompare(String(b.name)));
    const leader = ranked.find(isLeader) || null;
    const selected = leader
      ? [leader, ...ranked.filter((unit) => unit !== leader)].slice(0, size)
      : ranked.slice(0, size);
    const totalPower = selected.reduce((sum, unit) => sum + numeric(unit.power), 0);
    const knownReadiness = selected.map((unit) => knownNumeric(unit.readiness)).filter((value) => value !== null);
    const averageReadiness = knownReadiness.length
      ? knownReadiness.reduce((sum, value) => sum + value, 0) / knownReadiness.length
      : null;
    suggestions.push({
      faction,
      members: selected,
      ...(leader ? { leader, leaderBaseId: leader.baseId } : {}),
      totalPower: Math.round(totalPower),
      averageReadiness: averageReadiness === null ? null : Math.round(averageReadiness),
      readinessKnown: knownReadiness.length === selected.length,
      benchCount: Math.max(0, members.length - size),
    });
  }

  return suggestions
    .sort((a, b) => numeric(b.averageReadiness) - numeric(a.averageReadiness) || b.totalPower - a.totalPower || a.faction.localeCompare(b.faction))
    .slice(0, limit);
}

export function squadReadiness(squad = {}) {
  const members = Array.isArray(squad.members) ? squad.members : [];
  if (!members.length) return { ready: 0, developing: 0, needsWork: 0, known: true };
  const known = members.filter((unit) => knownNumeric(unit.readiness) !== null);
  if (!known.length) return { ready: "—", developing: "—", needsWork: "—", known: false };
  const counts = known.reduce((result, unit) => {
    const score = knownNumeric(unit.readiness) ?? 0;
    if (score >= 85) result.ready += 1;
    else if (score >= 65) result.developing += 1;
    else result.needsWork += 1;
    return result;
  }, { ready: 0, developing: 0, needsWork: 0 });
  return { ...counts, known: known.length === members.length };
}
