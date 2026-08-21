const GAC_V1_RELEASE_STATUS = Object.freeze({
  release: 'gac-v1',
  state: 'production-hardening-complete',
  generatedPolicyVersion: '2026-08-21-b18',
  packages: Object.freeze({
    console: 'production',
    rosterIntegrity: 'production',
    boardCapture: 'production',
    executionLock: 'production',
    resultCapture: 'production',
    cleanupIntelligence: 'production',
    cleanupAttackBrief: 'production',
    fleetWarRoom: 'production',
    fleetCleanup: 'production',
    datacronIntelligence: 'production',
    evidenceWarehouse: 'production',
    acceptanceSuite: 'production',
    publicScaleHardening: 'production',
  }),
  tacticalSources: Object.freeze({
    threeVThree: Object.freeze({ state: 'quarantine-enforced', approvalRequired: true }),
    fiveVFive: Object.freeze({ state: 'quarantine-enforced', approvalRequired: true }),
    executionFallback: 'source-gated-no-invention',
  }),
  truthBoundaries: Object.freeze({
    mockLiveGacData: false,
    unknownBecomesZero: false,
    unsourcedExecutionGuidance: false,
    observedRateIsPrediction: false,
    legacyDatacronAbsenceMeansNone: false,
    fleetDatacronsApplicable: false,
    hiddenFleetRolesInferred: false,
  }),
  scale: Object.freeze({
    warehousePublicLimit: 250,
    cacheScope: 'process-local-lru-coalesced',
    freshSeconds: 30,
    staleSeconds: 180,
    maxEntries: 256,
    sharedAcrossInstances: false,
  }),
});

export { GAC_V1_RELEASE_STATUS };
