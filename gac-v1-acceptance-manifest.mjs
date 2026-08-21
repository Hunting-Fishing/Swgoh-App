const GAC_V1_ACCEPTANCE_SCENARIOS=Object.freeze([
  Object.freeze({id:'A01',area:'board',label:'3v3 visible-board capture excludes hidden rear territories',tests:['test/gac-board-capture-b07.test.mjs']}),
  Object.freeze({id:'A02',area:'board',label:'5v5 counter generation preserves exact format squad size',tests:['test/gac-board-planner.test.mjs']}),
  Object.freeze({id:'A03',area:'datacron',label:'enemy Datacron unknown / confirmed none / exact assigned remain distinct',tests:['test/gac-board-capture-b07.test.mjs','test/gac-datacron-risk-gates.test.mjs']}),
  Object.freeze({id:'A04',area:'roster',label:'stale/partial roster truth warns or blocks without fake completeness',tests:['test/gac-roster-integrity-b06.test.mjs']}),
  Object.freeze({id:'A05',area:'opponent',label:'wrong opponent / round mismatch fails closed',tests:['test/gac-current-opponent-confirmation-api.test.mjs','test/gac-board-observation-api.test.mjs']}),
  Object.freeze({id:'A06',area:'execution',label:'pre-battle fingerprint requires exact defense/squad/DC identity',tests:['test/gac-battle-execution-b08.test.mjs']}),
  Object.freeze({id:'A07',area:'result',label:'win/loss banners and unknown/confirmed survivor truth',tests:['test/gac-attempt-result-b09.test.mjs']}),
  Object.freeze({id:'A08',area:'cleanup',label:'survivor-unknown cleanup is blocked; confirmed residual enables legal plan',tests:['test/gac-cleanup-intelligence-b10.test.mjs']}),
  Object.freeze({id:'A09',area:'cleanup',label:'chained cleanup cannot resurrect destroyed defenders',tests:['test/gac-cleanup-execution-chain-b10.test.mjs','test/gac-cleanup-replan-service-b10.test.mjs']}),
  Object.freeze({id:'A10',area:'cleanup',label:'cleanup Attack Brief preserves resource protection and source gate',tests:['test/gac-cleanup-attack-brief-b11.test.mjs']}),
  Object.freeze({id:'A11',area:'fleet',label:'canonical fleet board + verified lifecycle + exact starter roles',tests:['test/gac-fleet-canonical-services.test.mjs']}),
  Object.freeze({id:'A12',area:'fleet',label:'fleet cleanup uses observed state and preserves Datacron exclusion',tests:['test/gac-fleet-cleanup-observation.test.mjs','test/gac-fleet-cleanup-provenance.test.mjs']}),
  Object.freeze({id:'A13',area:'fleet',label:'round-wide fleet scarcity and non-overlap are server enforced',tests:['test/gac-fleet-round-resource-integrity.test.mjs']}),
  Object.freeze({id:'A14',area:'datacron',label:'mechanic-aware Datacron selection has no arbitrary power multiplier',tests:['test/gac-datacron-counter-intelligence-b15.test.mjs']}),
  Object.freeze({id:'A15',area:'evidence',label:'warehouse preserves format/composition/provenance/DC truth boundaries',tests:['test/gac-evidence-warehouse-b16.test.mjs']}),
  Object.freeze({id:'A16',area:'resources',label:'depleted roster cannot reuse consumed or defense-reserved resources',tests:['test/gac-cleanup-replan-service-b10.test.mjs','test/gac-fleet-round-resource-integrity.test.mjs']}),
  Object.freeze({id:'A17',area:'concurrency',label:'attempt/result writes are guarded against duplicate terminal mutation',tests:['test/gac-battle-execution-b08.test.mjs','test/gac-attempt-result-b09.test.mjs']}),
  Object.freeze({id:'A18',area:'source',label:'unapproved tactical guidance remains quarantined/fail-closed',tests:['test/gac-strategy-source-b03-v2.test.mjs','test/gac-strategy-provenance.test.mjs']}),
]);

function scenarioSummary(scenarios=GAC_V1_ACCEPTANCE_SCENARIOS){
  const byArea={};for(const row of scenarios)byArea[row.area]=(byArea[row.area]||0)+1;
  return Object.freeze({count:scenarios.length,byArea:Object.freeze(byArea),ids:Object.freeze(scenarios.map((row)=>row.id))});
}

export { GAC_V1_ACCEPTANCE_SCENARIOS, scenarioSummary };
