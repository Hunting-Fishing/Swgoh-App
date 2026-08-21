import { rankRosterFitSquads } from './gac-counter-engine.js';

const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value?.baseId || value).split(':')[0].toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];

function uniqueIds(values = []) {
  return [...new Set(asArray(values).map(normalizeId).filter(Boolean))];
}

function latestLossAttempt(assignment = {}) {
  const attempts = asArray(assignment?.attemptLog);
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (clean(attempts[index]?.status).toLowerCase() === 'loss') return Object.freeze({ attempt:attempts[index], index });
  }
  return null;
}

function cleanupTruth(assignment = {}, defense = {}, opponentRoster = {}) {
  const status = clean(assignment?.status).toLowerCase();
  const latest = latestLossAttempt(assignment);
  if (!latest) {
    return Object.freeze({ ready:false, code:status==='loss'?'loss-log-missing':'not-loss', detail:status==='loss'?'The failed assignment has no completed loss attempt in its canonical attempt log.':'Cleanup intelligence requires a recorded failed attempt.', survivorBaseIds:Object.freeze([]), survivorUnits:Object.freeze([]), attemptIndex:null, telemetryKnown:false });
  }
  if (!['loss','abandoned'].includes(status)) {
    return Object.freeze({ ready:false, code:'not-cleanup-state', detail:'Cleanup intelligence is waiting for the active cleanup plan/attempt lifecycle to finish before replanning.', survivorBaseIds:Object.freeze([]), survivorUnits:Object.freeze([]), attemptIndex:latest.index, telemetryKnown:false });
  }
  const post = latest.attempt?.postAttempt || {};
  if (clean(post?.defenseState).toLowerCase() !== 'survivors-confirmed') {
    return Object.freeze({ ready:false, code:'survivors-unknown', detail:'Survivor state was not confirmed after the loss. No survivor-specific cleanup counter can be generated.', survivorBaseIds:Object.freeze([]), survivorUnits:Object.freeze([]), attemptIndex:latest.index, telemetryKnown:false });
  }
  const defenseIds = uniqueIds(defense?.members);
  const survivors = uniqueIds(post?.survivorBaseIds);
  if (!survivors.length) return Object.freeze({ ready:false, code:'survivors-empty', detail:'Confirmed survivor state is empty and cannot represent a failed battle.', survivorBaseIds:Object.freeze([]), survivorUnits:Object.freeze([]), attemptIndex:latest.index, telemetryKnown:false });
  const invalid = survivors.filter((id) => !defenseIds.includes(id));
  if (invalid.length) return Object.freeze({ ready:false, code:'survivor-mismatch', detail:`Confirmed survivors do not match the saved defense: ${invalid.join(', ')}.`, survivorBaseIds:Object.freeze(survivors), survivorUnits:Object.freeze([]), attemptIndex:latest.index, telemetryKnown:false });
  const rosterIndex = new Map(asArray(opponentRoster?.units).filter((unit)=>clean(unit?.unitType).toLowerCase()!=='ship').map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));
  if (!rosterIndex.size) return Object.freeze({ ready:false, code:'opponent-roster-unavailable', detail:'Current opponent character roster is unavailable, so survivor roster-fit cannot be evaluated.', survivorBaseIds:Object.freeze(survivors), survivorUnits:Object.freeze([]), attemptIndex:latest.index, telemetryKnown:false });
  const unresolved = survivors.filter((id)=>!rosterIndex.has(id));
  if (unresolved.length) return Object.freeze({ ready:false, code:'survivor-roster-unresolved', detail:`Confirmed survivors are not resolved in the current opponent roster: ${unresolved.join(', ')}.`, survivorBaseIds:Object.freeze(survivors), survivorUnits:Object.freeze([]), attemptIndex:latest.index, telemetryKnown:false });
  return Object.freeze({
    ready:true,
    code:'survivors-confirmed',
    detail:`${survivors.length} surviving defender${survivors.length===1?'':'s'} confirmed from the recorded battle result.`,
    survivorBaseIds:Object.freeze(survivors),
    survivorUnits:Object.freeze(survivors.map((id)=>rosterIndex.get(id))),
    attemptIndex:latest.index,
    telemetryKnown:false,
  });
}

function consumedAndReservedIds(assignments = [], ownDefenses = []) {
  const ids = new Set();
  for (const defense of asArray(ownDefenses)) for (const id of uniqueIds(defense?.members)) ids.add(id);
  for (const assignment of asArray(assignments)) {
    for (const attempt of asArray(assignment?.attemptLog)) {
      for (const id of uniqueIds(attempt?.members)) ids.add(id);
    }
    if (['planned','attempted'].includes(clean(assignment?.status).toLowerCase())) {
      for (const id of uniqueIds(assignment?.members)) ids.add(id);
    }
  }
  return Object.freeze([...ids]);
}

function cleanupCandidatePlan({ ownerRoster = {}, opponentRoster = {}, assignment = {}, defense = {}, assignments = [], ownDefenses = [], size = 5, limit = 5 } = {}) {
  const truth = cleanupTruth(assignment, defense, opponentRoster);
  const excludedBaseIds = consumedAndReservedIds(assignments, ownDefenses);
  if (!truth.ready) return Object.freeze({ ready:false, truth, excludedBaseIds, candidates:Object.freeze([]), source:'cleanup-truth-blocked', turnMeterState:'unknown', healthState:'unknown', protectionState:'unknown' });
  const ownerCharacters = asArray(ownerRoster?.units).filter((unit)=>clean(unit?.unitType).toLowerCase()!=='ship');
  if (!ownerCharacters.length) return Object.freeze({ ready:false, truth:Object.freeze({ ...truth, ready:false, code:'owner-roster-unavailable', detail:'Current owner character roster is unavailable.' }), excludedBaseIds, candidates:Object.freeze([]), source:'cleanup-truth-blocked', turnMeterState:'unknown', healthState:'unknown', protectionState:'unknown' });
  const requestedSize = Number(size) === 3 ? 3 : 5;
  const ranked = rankRosterFitSquads(ownerRoster, truth.survivorUnits, { size:requestedSize, excludeBaseIds })
    .filter((candidate)=>asArray(candidate?.squad).length===requestedSize)
    .filter((candidate)=>asArray(candidate?.squad).every((unit)=>!excludedBaseIds.includes(normalizeId(unit))))
    .slice(0,Math.max(1,Math.min(10,Number(limit)||5)))
    .map((candidate,index)=>Object.freeze({
      ...candidate,
      cleanupRank:index+1,
      source:'cleanup-roster-fit-heuristic',
      prediction:false,
      turnMeterState:'unknown',
      postBattleTelemetryKnown:false,
    }));
  return Object.freeze({
    ready:true,
    truth,
    excludedBaseIds,
    candidates:Object.freeze(ranked),
    source:'cleanup-roster-fit-heuristic',
    turnMeterState:'unknown',
    healthState:'unknown',
    protectionState:'unknown',
  });
}

export {
  cleanupCandidatePlan,
  cleanupTruth,
  consumedAndReservedIds,
  latestLossAttempt,
  normalizeId,
  uniqueIds,
};