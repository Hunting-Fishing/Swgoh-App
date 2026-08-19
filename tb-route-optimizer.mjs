const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonNegative = (value, fallback = 0) => Math.max(0, Math.trunc(finite(value, fallback)));
const boundedStars = (value, fallback = 0) => Math.max(0, Math.min(3, Math.trunc(finite(value, fallback))));

function cleanCommand(value, fallback = '') {
  const command = text(value).toLowerCase();
  return ['attack','preload','hold','deploy','stop'].includes(command) ? command : fallback;
}

function normalizeThresholds(value) {
  const source = array(value);
  if (source.length < 3) return null;
  const thresholds = source.slice(0, 3).map((entry) => nonNegative(entry));
  if (!thresholds.every((entry, index) => entry > 0 && (index === 0 || entry > thresholds[index - 1]))) return null;
  return Object.freeze(thresholds);
}

function targetThreshold(thresholds, stars) {
  if (stars <= 0) return 0;
  if (!thresholds) return null;
  return thresholds[stars - 1] ?? null;
}

function nextStarCeiling(thresholds, targetStars) {
  if (!thresholds || targetStars >= 3) return null;
  const next = thresholds[targetStars];
  return Number.isFinite(next) ? Math.max(0, next - 1) : null;
}

function shortNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(nonNegative(value));
}

function normalizeZone(raw = {}, index = 0) {
  const currentStars = boundedStars(raw.currentStars ?? raw.current_stars);
  const targetStars = Math.max(currentStars, boundedStars(raw.targetStars ?? raw.target_stars, currentStars));
  const preloadCapRaw = raw.preloadCapTp ?? raw.preload_cap_tp;
  const preloadCapTp = preloadCapRaw == null || preloadCapRaw === '' ? null : nonNegative(preloadCapRaw);
  return Object.freeze({
    planetId: text(raw.planetId ?? raw.planet_id) || `zone-${index + 1}`,
    planetName: text(raw.planetName ?? raw.planet_name ?? raw.name) || text(raw.planetId ?? raw.planet_id) || `Zone ${index + 1}`,
    priority: Math.max(1, Math.trunc(finite(raw.priority, index + 1))),
    currentTp: nonNegative(raw.currentTp ?? raw.current_tp),
    currentStars,
    targetStars,
    starThresholds: normalizeThresholds(raw.starThresholds ?? raw.star_thresholds),
    preloadCapTp,
    remainingMissionTp: nonNegative(raw.remainingMissionTp ?? raw.remaining_mission_tp),
    remainingOperationTp: nonNegative(raw.remainingOperationTp ?? raw.remaining_operation_tp),
    deployAllowed: raw.deployAllowed ?? raw.deploy_allowed ?? true,
    combatAllowed: raw.combatAllowed ?? raw.combat_allowed ?? true,
    commandState: cleanCommand(raw.commandState ?? raw.command_state),
    lockedByOfficer: raw.lockedByOfficer === true || raw.locked_by_officer === true,
    commandMessage: text(raw.commandMessage ?? raw.command_message),
  });
}

function safeCeiling(zone) {
  const starCeiling = nextStarCeiling(zone.starThresholds, zone.targetStars);
  if (zone.preloadCapTp == null) return starCeiling;
  if (starCeiling == null) return zone.preloadCapTp;
  return Math.min(zone.preloadCapTp, starCeiling);
}

function preserveLockedCommand(zone, safety) {
  if (!zone.lockedByOfficer || !zone.commandState) return null;
  if (zone.commandState === 'preload' && zone.preloadCapTp == null) {
    return {
      command: 'preload',
      source: 'officer-lock',
      blocked: true,
      blockingCode: 'PRELOAD_CAP_REQUIRED',
      explanation: `${zone.planetName}: officer-locked PRELOAD is preserved, but deployment is blocked until an explicit preload cap is saved.`,
      deployTp: 0,
    };
  }
  if (zone.commandState === 'preload' && zone.currentTp >= zone.preloadCapTp) {
    return {
      command: 'preload',
      source: 'officer-lock',
      blocked: true,
      blockingCode: 'PRELOAD_CAP_REACHED',
      explanation: `${zone.planetName}: officer-locked PRELOAD is preserved, but the cap of ${shortNumber(zone.preloadCapTp)} TP has already been reached. Do not deploy.`,
      deployTp: 0,
    };
  }
  if (['hold','stop'].includes(zone.commandState)) {
    return {
      command: zone.commandState,
      source: 'officer-lock',
      blocked: false,
      blockingCode: '',
      explanation: zone.commandMessage || `${zone.planetName}: officer-locked ${zone.commandState.toUpperCase()} is preserved.`,
      deployTp: 0,
    };
  }
  return {
    command: zone.commandState,
    source: 'officer-lock',
    blocked: false,
    blockingCode: '',
    explanation: zone.commandMessage || `${zone.planetName}: officer-locked ${zone.commandState.toUpperCase()} is preserved; optimizer only limits TP to the known safe ceiling.`,
    deployTp: safety.deployTp,
  };
}

function analyzeZone(zone, remainingGuildDeploymentTp) {
  const threshold = targetThreshold(zone.starThresholds, zone.targetStars);
  const ceiling = safeCeiling(zone);
  const knownNonDeployTp = zone.remainingMissionTp + zone.remainingOperationTp;

  if (zone.targetStars > zone.currentStars && threshold == null) {
    return {
      zone,
      threshold: null,
      ceiling,
      knownNonDeployTp,
      safeRoomTp: 0,
      tpNeededForTarget: null,
      requestedDeployTp: 0,
      deployTp: 0,
      blocked: true,
      blockingCode: 'STAR_THRESHOLDS_REQUIRED',
      command: zone.lockedByOfficer && zone.commandState ? zone.commandState : 'hold',
      source: zone.lockedByOfficer && zone.commandState ? 'officer-lock' : 'optimizer',
      explanation: `${zone.planetName}: star thresholds are missing, so the optimizer will not recommend deployment or claim a safe star route.`,
    };
  }

  const safeRoomTp = ceiling == null ? Number.POSITIVE_INFINITY : Math.max(0, ceiling - zone.currentTp);
  const targetTp = threshold ?? zone.currentTp;
  const tpNeededForTarget = Math.max(0, targetTp - zone.currentTp);
  const safeNonDeployTp = Math.min(knownNonDeployTp, safeRoomTp);
  const tpAfterKnownActions = zone.currentTp + safeNonDeployTp;
  const deploymentNeededForTarget = Math.max(0, targetTp - tpAfterKnownActions);
  const deploymentRoom = Number.isFinite(safeRoomTp) ? Math.max(0, safeRoomTp - safeNonDeployTp) : deploymentNeededForTarget;
  const requestedDeployTp = zone.deployAllowed === false ? 0 : Math.min(deploymentNeededForTarget, deploymentRoom);
  const deployTp = Math.min(requestedDeployTp, remainingGuildDeploymentTp);

  const knownActionsExceedCeiling = Number.isFinite(safeRoomTp) && knownNonDeployTp > safeRoomTp;
  const locked = preserveLockedCommand(zone, { deployTp });
  if (locked) {
    if (knownActionsExceedCeiling && ['attack','deploy'].includes(locked.command)) {
      return {
        zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp, deployTp: 0,
        blocked: true, blockingCode: 'KNOWN_ACTIONS_EXCEED_SAFE_CEILING', command: locked.command, source: locked.source,
        explanation: `${zone.planetName}: officer-locked ${locked.command.toUpperCase()} is preserved, but known remaining mission/Operation TP (${shortNumber(knownNonDeployTp)}) exceeds the safe room (${shortNumber(safeRoomTp)}). Deployment is blocked until the route is narrowed.`,
      };
    }
    return {
      zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp, deployTp: locked.deployTp,
      blocked: locked.blocked, blockingCode: locked.blockingCode, command: locked.command, source: locked.source, explanation: locked.explanation,
    };
  }

  if (zone.preloadCapTp != null) {
    if (zone.currentTp >= zone.preloadCapTp) {
      return {
        zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp: 0, deployTp: 0,
        blocked: false, blockingCode: 'PRELOAD_CAP_REACHED', command: 'stop', source: 'optimizer',
        explanation: `${zone.planetName}: STOP at ${shortNumber(zone.currentTp)} TP. Preload cap ${shortNumber(zone.preloadCapTp)} TP is reached; do not add TP.`,
      };
    }
    const room = Math.max(0, zone.preloadCapTp - zone.currentTp);
    const knownTpReserved = Math.min(knownNonDeployTp, room);
    const deploymentRoom = Math.max(0, room - knownTpReserved);
    const preloadDeployTp = zone.deployAllowed === false ? 0 : Math.min(deploymentRoom, remainingGuildDeploymentTp);
    const knownOverflow = knownNonDeployTp > room;
    return {
      zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget,
      requestedDeployTp: zone.deployAllowed === false ? 0 : deploymentRoom,
      deployTp: preloadDeployTp,
      blocked: knownOverflow,
      blockingCode: knownOverflow ? 'KNOWN_ACTIONS_EXCEED_PRELOAD_CAP' : (zone.deployAllowed === false ? 'DEPLOY_DISABLED' : ''),
      command: 'preload',
      source: 'optimizer',
      explanation: knownOverflow
        ? `${zone.planetName}: PRELOAD cap is ${shortNumber(zone.preloadCapTp)} TP, but known remaining mission/Operation TP exceeds the ${shortNumber(room)} TP headroom. Do not deploy; officers must narrow the allowed actions.`
        : zone.deployAllowed === false
          ? `${zone.planetName}: PRELOAD is planned to ${shortNumber(zone.preloadCapTp)} TP, but deployment is disabled. Do not deploy.`
          : `${zone.planetName}: PRELOAD only. Reserve ${shortNumber(knownTpReserved)} TP for known mission/Operation actions and allocate at most ${shortNumber(preloadDeployTp)} deployment TP; do not cross ${shortNumber(zone.preloadCapTp)} TP.`,
    };
  }

  if (zone.targetStars <= zone.currentStars || tpNeededForTarget === 0) {
    return {
      zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp: 0, deployTp: 0,
      blocked: false, blockingCode: '', command: 'hold', source: 'optimizer',
      explanation: `${zone.planetName}: target of ${zone.targetStars} star${zone.targetStars === 1 ? '' : 's'} is already satisfied. HOLD unless an officer changes the route.`,
    };
  }

  if (knownActionsExceedCeiling) {
    return {
      zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp: 0, deployTp: 0,
      blocked: true, blockingCode: 'KNOWN_ACTIONS_EXCEED_SAFE_CEILING', command: 'hold', source: 'optimizer',
      explanation: `${zone.planetName}: HOLD. Known remaining mission/Operation TP (${shortNumber(knownNonDeployTp)}) exceeds the ${shortNumber(safeRoomTp)} TP safe room before the next protected star boundary. Narrow the approved actions before proceeding.`,
    };
  }

  if (zone.combatAllowed !== false && knownNonDeployTp > 0) {
    return {
      zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp, deployTp,
      blocked: false,
      blockingCode: deployTp < requestedDeployTp ? 'DEPLOYMENT_CAPACITY_LIMIT' : '',
      command: 'attack', source: 'optimizer',
      explanation: `${zone.planetName}: ATTACK first. ${shortNumber(tpNeededForTarget)} TP is needed for the ${zone.targetStars}-star target; ${shortNumber(knownNonDeployTp)} TP remains from known mission/Operation actions${deployTp > 0 ? `, then allocate up to ${shortNumber(deployTp)} deployment TP` : ''}.`,
    };
  }

  if (deployTp > 0) {
    return {
      zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp, deployTp,
      blocked: false,
      blockingCode: deployTp < requestedDeployTp ? 'DEPLOYMENT_CAPACITY_LIMIT' : '',
      command: 'deploy', source: 'optimizer',
      explanation: `${zone.planetName}: DEPLOY ${shortNumber(deployTp)} TP toward the ${zone.targetStars}-star target${ceiling == null ? '' : `; safe ceiling is ${shortNumber(ceiling)} TP`}.`,
    };
  }

  return {
    zone, threshold, ceiling, knownNonDeployTp, safeRoomTp, tpNeededForTarget, requestedDeployTp, deployTp: 0,
    blocked: false,
    blockingCode: zone.deployAllowed === false ? 'DEPLOY_DISABLED' : 'INSUFFICIENT_DEPLOYMENT_CAPACITY',
    command: 'hold', source: 'optimizer',
    explanation: zone.deployAllowed === false
      ? `${zone.planetName}: HOLD. The target still needs ${shortNumber(tpNeededForTarget)} TP and deployment is disabled.`
      : `${zone.planetName}: HOLD. The target still needs ${shortNumber(tpNeededForTarget)} TP and no safe Guild deployment capacity remains.`,
  };
}

function publicResult(row) {
  const zone = row.zone;
  return Object.freeze({
    planetId: zone.planetId,
    planetName: zone.planetName,
    priority: zone.priority,
    currentTp: zone.currentTp,
    currentStars: zone.currentStars,
    targetStars: zone.targetStars,
    targetThresholdTp: row.threshold,
    safeCeilingTp: Number.isFinite(row.ceiling) ? row.ceiling : null,
    preloadCapTp: zone.preloadCapTp,
    remainingMissionTp: zone.remainingMissionTp,
    remainingOperationTp: zone.remainingOperationTp,
    requestedDeploymentTp: row.requestedDeployTp,
    recommendedDeploymentTp: row.deployTp,
    command: row.command,
    commandLabel: row.command.toUpperCase(),
    commandSource: row.source,
    lockedByOfficer: zone.lockedByOfficer,
    blocked: row.blocked,
    blockingCode: row.blockingCode,
    explanation: row.explanation,
  });
}

export function optimizeTbRoute(input = {}) {
  const riskMode = ['safe','balanced','aggressive'].includes(text(input.riskMode).toLowerCase()) ? text(input.riskMode).toLowerCase() : 'safe';
  const startingDeploymentTp = nonNegative(input.remainingGuildDeploymentTp ?? input.remaining_guild_deployment_tp);
  const zones = array(input.zones).map(normalizeZone).sort((a, b) => a.priority - b.priority || a.planetName.localeCompare(b.planetName));
  let remainingDeploymentTp = startingDeploymentTp;
  const results = [];

  for (const zone of zones) {
    const row = analyzeZone(zone, remainingDeploymentTp);
    const used = Math.min(remainingDeploymentTp, nonNegative(row.deployTp));
    remainingDeploymentTp -= used;
    results.push(publicResult({ ...row, deployTp: used }));
  }

  const blockedZones = results.filter((zone) => zone.blocked).length;
  const constrainedZones = results.filter((zone) => Boolean(zone.blockingCode)).length;
  const commands = results.reduce((acc, zone) => {
    acc[zone.command] = (acc[zone.command] || 0) + 1;
    return acc;
  }, {});

  return Object.freeze({
    algorithm: 'tb-route-optimizer-v1',
    deterministic: true,
    riskMode,
    remainingGuildDeploymentTp: startingDeploymentTp,
    allocatedDeploymentTp: startingDeploymentTp - remainingDeploymentTp,
    unallocatedDeploymentTp: remainingDeploymentTp,
    blockedZones,
    constrainedZones,
    commands: Object.freeze(commands),
    zones: Object.freeze(results),
    evidenceBoundary: 'Recommendations use only supplied event state, star thresholds, remaining known TP and officer locks. Missing safety inputs fail closed; no probability is inferred.',
  });
}
