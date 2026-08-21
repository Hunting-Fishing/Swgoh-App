const GAC_WAR_ROOM_RELEASE_STATUS = Object.freeze({
  state: 'code-complete',
  completionPct: 100,
  sourceOfTruth: 'verified-owner-server-state',
  manualWarRoom: Object.freeze({
    leagueAwareBoard: 'complete',
    manualOpponentEntry: 'complete',
    persistentAttackPlan: 'complete',
    reservationConflictProtection: 'complete',
    wholeBoardCounterAllocation: 'complete',
    directBattleExecution: 'complete',
    resultCapture: 'complete',
    attackerDatacronLock: 'complete',
    failedAttemptCleanupRecovery: 'complete',
    territoryAttackOrder: 'complete',
    fleetLifecycleParity: 'complete',
  }),
  truthBoundaries: Object.freeze({
    serverAttackPlanAuthoritative: true,
    ownDefenseReservationProtected: true,
    roundConsumedUnitsProtected: true,
    unknownPostBattleState: 'preserved',
    cleanupRequiresConfirmedSurvivors: true,
    tacticalExecutionSourceGated: true,
    fleetStarterRolesUserConfirmed: true,
    fleetDatacrons: 'not-applicable',
    noFabricatedWinProbability: true,
  }),
  acceptance: Object.freeze({
    sourceContract: 'complete',
    githubActions: 'blocked-before-steps',
    githubActionsEvidence: 'workflow job reported zero executed steps',
    liveAuthenticatedClickthrough: 'external-final-smoke',
  }),
});

export { GAC_WAR_ROOM_RELEASE_STATUS };
