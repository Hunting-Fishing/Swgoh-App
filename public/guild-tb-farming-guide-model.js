const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalize = (value) => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function currentProgress(row = {}) {
  const unit = row.unit || null;
  return Object.freeze({
    owned: Boolean(unit),
    unitType: text(unit?.unitType || 'Character') || 'Character',
    stars: finite(unit?.stars),
    gear: finite(unit?.gear),
    relic: finite(unit?.relic),
    power: finite(unit?.power),
  });
}

export function tbFarmTargetProgress(row = {}) {
  const current = currentProgress(row);
  const gap = row.maxGap || {};
  if (gap.missing) {
    const relic = Math.max(0, finite(gap.relic));
    const gear = relic > 0 ? Math.max(13, finite(gap.gear)) : Math.max(0, finite(gap.gear));
    return Object.freeze({
      owned: false,
      unitType: current.unitType,
      stars: Math.max(0, finite(gap.stars)),
      gear,
      relic,
      power: Math.max(0, finite(gap.power)),
    });
  }
  const relic = Math.max(0, current.relic + finite(gap.relic));
  const gear = relic > 0 ? Math.max(13, current.gear + finite(gap.gear)) : Math.max(0, current.gear + finite(gap.gear));
  return Object.freeze({
    owned: current.owned,
    unitType: current.unitType,
    stars: Math.max(0, current.stars + finite(gap.stars)),
    gear,
    relic,
    power: Math.max(0, current.power + finite(gap.power)),
  });
}

export function progressionLabel(progress = {}) {
  const isShip = text(progress.unitType).toLowerCase() === 'ship';
  if (isShip) return `${finite(progress.stars)}★`;
  if (finite(progress.relic) > 0) return `${finite(progress.stars)}★ · R${finite(progress.relic)}`;
  if (finite(progress.gear) > 0) return `${finite(progress.stars)}★ · G${finite(progress.gear)}`;
  return `${finite(progress.stars)}★`;
}

export function journeyRequirementLabel(requirement = {}) {
  const type = text(requirement.type).toUpperCase();
  const tier = finite(requirement.tier);
  if (type === 'RELIC') return `R${tier}`;
  if (type === 'GEAR') return `G${tier}`;
  return `${tier}★`;
}

function progressValue(progress = {}, requirement = {}) {
  const type = text(requirement.type).toUpperCase();
  if (type === 'RELIC') return finite(progress.relic);
  if (type === 'GEAR') return finite(progress.relic) > 0 ? 13 : finite(progress.gear);
  if (type === 'STAR') return finite(progress.stars);
  return 0;
}

function overlapStatus(current, target, requirement) {
  const required = finite(requirement?.tier);
  const before = progressValue(current, requirement);
  const after = progressValue(target, requirement);
  if (before >= required) return 'already';
  if (after >= required) return 'direct';
  if (after > before) return 'partial';
  return 'none';
}

export function buildJourneyRequirementIndex(presets = []) {
  const index = new Map();
  for (const event of asArray(presets)) {
    for (const requirement of asArray(event?.requirements)) {
      const baseId = text(requirement?.baseId);
      if (!baseId) continue;
      if (!index.has(baseId)) index.set(baseId, []);
      index.get(baseId).push(Object.freeze({
        eventId: text(event.id),
        eventName: text(event.name || event.shortName || event.id),
        shortName: text(event.shortName || event.name || event.id),
        category: text(event.category || 'Journey Guide'),
        targetBaseId: text(event.targetBaseId),
        requirement: Object.freeze({ baseId, type: text(requirement.type).toUpperCase(), tier: finite(requirement.tier) }),
      }));
    }
  }
  return index;
}

function journeyOverlapsForRow(row, index) {
  const current = currentProgress(row);
  const target = tbFarmTargetProgress(row);
  return Object.freeze(asArray(index.get(text(row.baseId))).map((entry) => {
    const status = overlapStatus(current, target, entry.requirement);
    return Object.freeze({
      ...entry,
      status,
      requirementLabel: journeyRequirementLabel(entry.requirement),
      currentValue: progressValue(current, entry.requirement),
      tbTargetValue: progressValue(target, entry.requirement),
    });
  }).filter((entry) => entry.status !== 'none'));
}

function classification(overlaps = []) {
  const direct = overlaps.filter((row) => row.status === 'direct').length;
  const partial = overlaps.filter((row) => row.status === 'partial').length;
  const active = direct + partial;
  if (active >= 2) return 'multi-unlock';
  if (direct > 0) return 'direct';
  if (partial > 0) return 'partial';
  return 'tb-only';
}

export function buildGuildTbFarmingGuide(coverage = {}, journeyPresets = []) {
  const journeyIndex = buildJourneyRequirementIndex(journeyPresets);
  const rows = asArray(coverage?.farms).map((row) => {
    const current = currentProgress(row);
    const tbTarget = tbFarmTargetProgress(row);
    const journeyOverlaps = journeyOverlapsForRow(row, journeyIndex);
    const directCount = journeyOverlaps.filter((entry) => entry.status === 'direct').length;
    const partialCount = journeyOverlaps.filter((entry) => entry.status === 'partial').length;
    const alreadyCount = journeyOverlaps.filter((entry) => entry.status === 'already').length;
    const activeJourneyOverlaps = directCount + partialCount;
    return Object.freeze({
      key: text(row.key),
      member: row.member,
      baseId: text(row.baseId),
      unitName: text(row.unitName || row.baseId || 'Required unit'),
      unit: row.unit || null,
      current,
      tbTarget,
      currentLabel: row.unit ? progressionLabel(current) : 'Not owned',
      tbTargetLabel: progressionLabel(tbTarget),
      gapLabel: text(row.gapLabel || 'Upgrade required'),
      mandatoryImpact: finite(row.mandatoryImpact),
      poolImpact: finite(row.poolImpact),
      missionImpact: finite(row.missionImpact),
      minGapScore: finite(row?.minGap?.score, Number.MAX_SAFE_INTEGER),
      missionRefs: Object.freeze(asArray(row.missionRefs)),
      journeyOverlaps,
      directCount,
      partialCount,
      alreadyCount,
      activeJourneyOverlaps,
      classification: classification(journeyOverlaps),
    });
  });

  const activeRows = rows.filter((row) => row.activeJourneyOverlaps > 0);
  const journeyTargets = new Set(activeRows.flatMap((row) => row.journeyOverlaps.filter((entry) => ['direct','partial'].includes(entry.status)).map((entry) => entry.eventId)));
  const members = new Set(rows.map((row) => text(row.member?.id || row.member?.allyCode || row.member?.name)).filter(Boolean));
  return Object.freeze({
    coverage,
    rows: Object.freeze(rows),
    summary: Object.freeze({
      priorityRows: rows.length,
      membersWithFarmRows: members.size,
      rowsWithJourneyOverlap: activeRows.length,
      directDoubleUseRows: rows.filter((row) => row.directCount > 0).length,
      partialDoubleUseRows: rows.filter((row) => row.partialCount > 0).length,
      multiUnlockRows: rows.filter((row) => row.classification === 'multi-unlock').length,
      journeyTargets: journeyTargets.size,
      exactCoveragePercent: finite(coverage?.summary?.exactCoveragePercent),
      redundancyCoveragePercent: finite(coverage?.summary?.redundancyCoveragePercent),
    }),
  });
}

export function filterGuildTbFarmingRows(rows = [], options = {}) {
  const search = normalize(options.search);
  const member = text(options.member || 'all');
  const phase = text(options.phase || 'All');
  const overlap = text(options.overlap || 'all');
  const impact = text(options.impact || 'All');
  const sort = text(options.sort || 'tb-impact');

  const filtered = asArray(rows).filter((row) => {
    const memberId = text(row.member?.id || row.member?.playerId || row.member?.allyCode || row.member?.name);
    if (member !== 'all' && memberId !== member) return false;
    if (phase !== 'All' && !row.missionRefs.some((mission) => text(mission.phase) === phase)) return false;
    if (impact === 'Mandatory' && row.mandatoryImpact <= 0) return false;
    if (impact === 'Pool' && row.poolImpact <= 0) return false;
    if (overlap === 'double' && row.activeJourneyOverlaps <= 0) return false;
    if (overlap === 'direct' && row.directCount <= 0) return false;
    if (overlap === 'partial' && row.partialCount <= 0) return false;
    if (overlap === 'multi' && row.classification !== 'multi-unlock') return false;
    if (overlap === 'tb-only' && row.activeJourneyOverlaps > 0) return false;
    if (search) {
      const haystack = normalize([
        row.member?.name,
        row.member?.allyCode,
        row.unitName,
        row.baseId,
        ...row.missionRefs.flatMap((mission) => [mission.phase, mission.planetName, mission.mission?.name]),
        ...row.journeyOverlaps.flatMap((entry) => [entry.eventName, entry.shortName, entry.category, entry.targetBaseId]),
      ].join(' '));
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const comparators = {
    'journey-overlap': (a, b) => b.activeJourneyOverlaps - a.activeJourneyOverlaps || b.directCount - a.directCount || b.missionImpact - a.missionImpact,
    member: (a, b) => text(a.member?.name).localeCompare(text(b.member?.name)) || b.missionImpact - a.missionImpact || a.unitName.localeCompare(b.unitName),
    gap: (a, b) => a.minGapScore - b.minGapScore || b.missionImpact - a.missionImpact || b.activeJourneyOverlaps - a.activeJourneyOverlaps,
    'tb-impact': (a, b) => b.mandatoryImpact - a.mandatoryImpact || b.missionImpact - a.missionImpact || b.activeJourneyOverlaps - a.activeJourneyOverlaps || a.minGapScore - b.minGapScore,
  };
  return Object.freeze(filtered.slice().sort(comparators[sort] || comparators['tb-impact']));
}
