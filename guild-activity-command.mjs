function clean(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function positive(value) {
  return Math.max(0, finite(value));
}

function eventTime(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentMember(row = {}) {
  return Object.freeze({
    playerId: clean(row.playerId || row.id),
    allyCode: clean(row.allyCode || row.ally_code),
    name: clean(row.name) || clean(row.allyCode || row.ally_code || row.playerId || row.id),
    galacticPower: positive(row.galacticPower ?? row.galactic_power),
    lastSyncedAt: clean(row.lastSyncedAt || row.last_synced_at),
  });
}

function membershipWithoutBaseline(rows = [], guildSize = 0) {
  const membership = asArray(rows);
  if (!membership.length) return Object.freeze([]);
  const size = Math.max(1, Math.floor(finite(guildSize, 0)) || 1);
  const groups = new Map();
  for (const row of membership) {
    const key = clean(row.occurredAt);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const baseline = [...groups.entries()]
    .filter(([, events]) => events.length >= Math.ceil(size * 0.8)
      && events.every((event) => clean(event.eventType).toLowerCase() === "joined"))
    .sort((a, b) => eventTime(a[0]) - eventTime(b[0]))[0] || null;
  if (!baseline) return Object.freeze([...membership]);
  const baselineIds = new Set(baseline[1].map((row) => row.id));
  return Object.freeze(membership.filter((row) => !baselineIds.has(row.id)));
}

function memberMomentum(currentMembers = [], progression = []) {
  const members = asArray(currentMembers).map(currentMember).filter((row) => row.playerId);
  const memberById = new Map(members.map((row) => [row.playerId, row]));
  const restrictToCurrent = memberById.size > 0;
  const aggregates = new Map(members.map((member) => [member.playerId, {
    ...member,
    eventCount: 0,
    gpGained: 0,
    relicLevelsGained: 0,
    gearLevelsGained: 0,
    zetasAdded: 0,
    omicronsAdded: 0,
    ultimatesAdded: 0,
    latestChangeAt: "",
  }]));

  for (const event of asArray(progression)) {
    const playerId = clean(event.playerId);
    if (!playerId || (restrictToCurrent && !memberById.has(playerId))) continue;
    let row = aggregates.get(playerId);
    if (!row) {
      const fallback = currentMember({
        playerId,
        allyCode: event.allyCode,
        name: event.playerName,
      });
      row = {
        ...fallback,
        eventCount: 0,
        gpGained: 0,
        relicLevelsGained: 0,
        gearLevelsGained: 0,
        zetasAdded: 0,
        omicronsAdded: 0,
        ultimatesAdded: 0,
        latestChangeAt: "",
      };
      aggregates.set(playerId, row);
    }
    row.eventCount += 1;
    row.gpGained += positive(event?.delta?.galacticPower);
    row.relicLevelsGained += positive(event?.delta?.relicTier);
    row.gearLevelsGained += positive(event?.delta?.gearLevel);
    row.zetasAdded += positive(event?.delta?.zetaCount);
    row.omicronsAdded += positive(event?.delta?.omicronCount);
    row.ultimatesAdded += positive(event?.delta?.ultimateUnlocked);
    if (eventTime(event.changedAt) > eventTime(row.latestChangeAt)) row.latestChangeAt = clean(event.changedAt);
  }

  return [...aggregates.values()].map((row) => Object.freeze({ ...row }));
}

function compareMomentum(a, b) {
  return b.omicronsAdded - a.omicronsAdded
    || b.ultimatesAdded - a.ultimatesAdded
    || b.relicLevelsGained - a.relicLevelsGained
    || b.zetasAdded - a.zetasAdded
    || b.gpGained - a.gpGained
    || b.eventCount - a.eventCount
    || b.galacticPower - a.galacticPower
    || a.name.localeCompare(b.name);
}

function abilityInvestments(events = [], currentMemberIds = null) {
  return asArray(events)
    .filter((event) => !currentMemberIds || currentMemberIds.has(clean(event.playerId)))
    .filter((event) => positive(event?.delta?.omicronCount)
      || positive(event?.delta?.zetaCount)
      || positive(event?.delta?.ultimateUnlocked))
    .slice()
    .sort((a, b) => eventTime(b.changedAt) - eventTime(a.changedAt))
    .map((event) => Object.freeze({
      id: event.id,
      playerId: clean(event.playerId),
      playerName: clean(event.playerName || event.allyCode || event.playerId),
      allyCode: clean(event.allyCode),
      baseId: clean(event.baseId),
      unitName: clean(event.unitName || event.baseId),
      changedAt: clean(event.changedAt),
      zetasAdded: positive(event?.delta?.zetaCount),
      omicronsAdded: positive(event?.delta?.omicronCount),
      ultimatesAdded: positive(event?.delta?.ultimateUnlocked),
    }));
}

export function buildGuildActivityCommand(input = {}) {
  const progression = asArray(input.progression).slice().sort((a, b) => eventTime(b.changedAt) - eventTime(a.changedAt));
  const currentMembers = asArray(input.currentMembers).map(currentMember).filter((row) => row.playerId);
  const currentMemberIds = currentMembers.length ? new Set(currentMembers.map((row) => row.playerId)) : null;
  const momentum = memberMomentum(currentMembers, progression);
  const active = momentum.filter((row) => row.eventCount > 0).sort(compareMomentum);
  const quiet = momentum.filter((row) => row.eventCount === 0)
    .sort((a, b) => b.galacticPower - a.galacticPower || a.name.localeCompare(b.name));
  const investments = abilityInvestments(progression, currentMemberIds);
  const membershipChanges = membershipWithoutBaseline(input.membership, input.guildMemberCount || currentMembers.length);
  const newest = progression[0] || null;
  const oldest = progression[progression.length - 1] || null;
  const eventLimit = Math.max(1, Math.floor(finite(input.eventLimit, progression.length || 1)));

  return Object.freeze({
    window: Object.freeze({
      from: clean(oldest?.changedAt),
      to: clean(newest?.changedAt),
      capturedEvents: progression.length,
      truncated: progression.length >= eventLimit,
    }),
    summary: Object.freeze({
      currentMembers: currentMembers.length,
      membersWithCapturedProgression: active.length,
      membersWithoutCapturedProgression: quiet.length,
      abilityInvestments: investments.length,
      membershipChanges: membershipChanges.length,
      gpGained: active.reduce((sum, row) => sum + row.gpGained, 0),
      relicLevelsGained: active.reduce((sum, row) => sum + row.relicLevelsGained, 0),
      zetasAdded: active.reduce((sum, row) => sum + row.zetasAdded, 0),
      omicronsAdded: active.reduce((sum, row) => sum + row.omicronsAdded, 0),
      ultimatesAdded: active.reduce((sum, row) => sum + row.ultimatesAdded, 0),
    }),
    momentumLeaders: Object.freeze(active.slice(0, 12)),
    noCapturedProgression: Object.freeze(quiet.slice(0, 20)),
    recentAbilityInvestments: Object.freeze(investments.slice(0, 20)),
    membershipChanges,
  });
}
