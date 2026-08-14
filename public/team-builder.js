function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function memberScore(unit) {
  return numeric(unit.readiness) * 1000 + numeric(unit.power) + numeric(unit.speed) * 10;
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
    const selected = [...members]
      .sort((a, b) => memberScore(b) - memberScore(a) || String(a.name).localeCompare(String(b.name)))
      .slice(0, size);
    const totalPower = selected.reduce((sum, unit) => sum + numeric(unit.power), 0);
    const averageReadiness = selected.reduce((sum, unit) => sum + numeric(unit.readiness), 0) / selected.length;
    suggestions.push({
      faction,
      members: selected,
      totalPower: Math.round(totalPower),
      averageReadiness: Math.round(averageReadiness),
      benchCount: Math.max(0, members.length - size),
    });
  }

  return suggestions
    .sort((a, b) => b.averageReadiness - a.averageReadiness || b.totalPower - a.totalPower || a.faction.localeCompare(b.faction))
    .slice(0, limit);
}

export function squadReadiness(squad = {}) {
  const members = Array.isArray(squad.members) ? squad.members : [];
  if (!members.length) return { ready: 0, developing: 0, needsWork: 0 };
  return members.reduce((counts, unit) => {
    const score = numeric(unit.readiness);
    if (score >= 85) counts.ready += 1;
    else if (score >= 65) counts.developing += 1;
    else counts.needsWork += 1;
    return counts;
  }, { ready: 0, developing: 0, needsWork: 0 });
}
