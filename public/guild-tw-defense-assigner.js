const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function memberId(member, index = 0) {
  return text(member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function unitMap(member) {
  return new Map(array(member?.units).filter((unit) => unit?.baseId).map((unit) => [upper(unit.baseId), unit]));
}

function normalizeRequirement(row) {
  if (typeof row === 'string') return { baseId: upper(row), minStars: 7, minRelic: 0 };
  return {
    baseId: upper(row?.baseId),
    minStars: Math.max(0, finite(row?.minStars, 7)),
    minRelic: Math.max(0, finite(row?.minRelic, 0)),
    minGear: Math.max(0, finite(row?.minGear, 0)),
  };
}

function normalizeTemplate(row, index) {
  return {
    id: text(row?.id || `template-${index + 1}`),
    name: text(row?.name || row?.id || `Defense Team ${index + 1}`),
    units: array(row?.units).map(normalizeRequirement).filter((unit) => unit.baseId),
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

function normalizeStrategy(strategy = {}) {
  const templates = array(strategy.templates).map(normalizeTemplate);
  const templateById = new Map(templates.map((row) => [row.id, row]));
  const zones = array(strategy.zones).map((zone, index) => ({
    id: text(zone?.id || `zone-${index + 1}`),
    name: text(zone?.name || zone?.id || `Territory ${index + 1}`),
    priority: Math.max(1, Math.floor(finite(zone?.priority, 1))),
    requirements: array(zone?.requirements).map((req) => ({
      templateId: text(req?.templateId),
      count: Math.max(0, Math.floor(finite(req?.count, 0))),
    })).filter((req) => req.templateId && req.count > 0),
  }));
  return { templates, templateById, zones };
}

function unitMeets(unit, requirement) {
  if (!unit) return false;
  if (finite(unit.stars, 0) < requirement.minStars) return false;
  if (finite(unit.gear, 0) < requirement.minGear) return false;
  if (finite(unit.relic, 0) < requirement.minRelic) return false;
  return true;
}

function teamFit(state, template) {
  let surplus = 0;
  const owned = [];
  for (const requirement of template.units) {
    const unit = state.units.get(requirement.baseId);
    if (!unitMeets(unit, requirement)) return null;
    if (state.usedUnits.has(requirement.baseId)) return null;
    surplus += Math.max(0, finite(unit.relic, 0) - requirement.minRelic) * 100;
    surplus += Math.max(0, finite(unit.gear, 0) - requirement.minGear) * 5;
    surplus += Math.max(0, finite(unit.stars, 0) - requirement.minStars);
    owned.push({
      baseId: requirement.baseId,
      stars: finite(unit.stars),
      gear: finite(unit.gear),
      relic: finite(unit.relic),
      power: finite(unit.power || unit.galacticPower),
    });
  }
  return { surplus, owned };
}

function buildTasks(normalized) {
  const tasks = [];
  for (const zone of normalized.zones) {
    for (const requirement of zone.requirements) {
      const template = normalized.templateById.get(requirement.templateId);
      if (!template) {
        tasks.push({ zone, template: null, templateId: requirement.templateId, invalid: true });
        continue;
      }
      for (let i = 0; i < requirement.count; i += 1) {
        tasks.push({
          id: `${zone.id}|${template.id}|${i + 1}`,
          zone,
          template,
          templateId: template.id,
          ordinal: i + 1,
          invalid: false,
        });
      }
    }
  }
  return tasks;
}

function candidateCount(task, states, maxTeamsPerMember) {
  if (!task.template) return 0;
  let count = 0;
  for (const state of states) {
    if (state.ignored || state.load >= maxTeamsPerMember) continue;
    if (teamFit(state, task.template)) count += 1;
  }
  return count;
}

export function planGuildTwDefenseAssignments(guildSnapshot, strategy, options = {}) {
  const normalized = normalizeStrategy(strategy);
  const maxTeamsPerMember = Math.max(1, Math.floor(finite(options.maxTeamsPerMember, 50)));
  const ignoredMembers = new Set(array(options.ignoredMembers).map((row) => text(typeof row === 'string' ? row : row?.memberId)).filter(Boolean));
  const members = array(guildSnapshot?.members);
  const states = members.map((member, index) => {
    const id = memberId(member, index);
    return {
      id,
      member,
      units: unitMap(member),
      usedUnits: new Set(),
      load: 0,
      ignored: !member?.rosterAvailable || ignoredMembers.has(id),
    };
  });

  const hasPriorityOne = normalized.zones.some((zone) => zone.priority === 1);
  const tasks = buildTasks(normalized);
  const invalidTemplates = tasks.filter((task) => task.invalid).map((task) => ({
    zoneId: task.zone.id,
    zoneName: task.zone.name,
    templateId: task.templateId,
    reason: 'Strategy references a team template that does not exist.',
  }));

  const validTasks = tasks.filter((task) => !task.invalid);
  const initialScarcity = new Map(validTasks.map((task) => [task.id, candidateCount(task, states, maxTeamsPerMember)]));
  validTasks.sort((a, b) =>
    a.zone.priority - b.zone.priority
    || finite(initialScarcity.get(a.id), 0) - finite(initialScarcity.get(b.id), 0)
    || b.template.units.length - a.template.units.length
    || a.zone.name.localeCompare(b.zone.name)
    || a.template.name.localeCompare(b.template.name)
    || a.ordinal - b.ordinal
  );

  const assignments = [];
  const unfilled = [];

  for (const task of validTasks) {
    const candidates = [];
    for (const state of states) {
      if (state.ignored || state.load >= maxTeamsPerMember) continue;
      const fit = teamFit(state, task.template);
      if (!fit) continue;
      candidates.push({ state, fit });
    }
    candidates.sort((a, b) =>
      a.state.load - b.state.load
      || a.fit.surplus - b.fit.surplus
      || finite(b.state.member?.galacticPower, 0) - finite(a.state.member?.galacticPower, 0)
      || text(a.state.member?.name || a.state.id).localeCompare(text(b.state.member?.name || b.state.id))
    );

    const chosen = candidates[0];
    if (!chosen) {
      unfilled.push({
        taskId: task.id,
        zoneId: task.zone.id,
        zoneName: task.zone.name,
        priority: task.zone.priority,
        templateId: task.template.id,
        teamName: task.template.name,
        requiredUnits: task.template.units,
        eligibleOwnersAtStart: finite(initialScarcity.get(task.id), 0),
      });
      continue;
    }

    for (const unit of chosen.fit.owned) chosen.state.usedUnits.add(unit.baseId);
    chosen.state.load += 1;
    assignments.push({
      taskId: task.id,
      zoneId: task.zone.id,
      zoneName: task.zone.name,
      priority: task.zone.priority,
      templateId: task.template.id,
      teamName: task.template.name,
      member: {
        playerId: text(chosen.state.member?.playerId),
        allyCode: text(chosen.state.member?.allyCode),
        name: text(chosen.state.member?.name || chosen.state.id),
        galacticPower: finite(chosen.state.member?.galacticPower),
      },
      units: chosen.fit.owned,
      fitSurplus: chosen.fit.surplus,
      eligibleOwnersAtStart: finite(initialScarcity.get(task.id), 0),
    });
  }

  const memberSummary = states.map((state) => ({
    memberId: state.id,
    allyCode: text(state.member?.allyCode),
    name: text(state.member?.name || state.id),
    ignored: state.ignored,
    assignedTeams: state.load,
    usedUnits: [...state.usedUnits],
  })).sort((a, b) => b.assignedTeams - a.assignedTeams || a.name.localeCompare(b.name));

  const zoneSummary = normalized.zones.map((zone) => {
    const requested = validTasks.filter((task) => task.zone.id === zone.id).length;
    const filled = assignments.filter((row) => row.zoneId === zone.id).length;
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      priority: zone.priority,
      requested,
      filled,
      unfilled: requested - filled,
    };
  });

  return Object.freeze({
    mode: 'tw-defense-assigner-v1',
    strategyValid: hasPriorityOne && invalidTemplates.length === 0,
    publishReady: hasPriorityOne && invalidTemplates.length === 0 && unfilled.length === 0,
    diagnostics: Object.freeze({
      hasPriorityOne,
      invalidTemplates: Object.freeze(invalidTemplates),
      requestedTeams: validTasks.length,
      filledTeams: assignments.length,
      unfilledTeams: unfilled.length,
      ignoredMembers: states.filter((state) => state.ignored).length,
      maxTeamsPerMember,
    }),
    assignments: Object.freeze(assignments),
    unfilled: Object.freeze(unfilled),
    memberSummary: Object.freeze(memberSummary),
    zoneSummary: Object.freeze(zoneSummary),
  });
}
