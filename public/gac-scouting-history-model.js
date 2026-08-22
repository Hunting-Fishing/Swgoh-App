const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const normalizeId = (value) => clean(value?.baseId || value).split(':')[0].toUpperCase();
const normalizeMembers = (values = []) => [...new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean))];

function currentFormat(snapshot = {}) {
  const value = clean(snapshot?.format || snapshot?.rule?.format || '5v5').toLowerCase();
  return value === '3v3' || value === '3' ? '3v3' : '5v5';
}

function eligiblePredictions(report, snapshot = {}) {
  const format = currentFormat(snapshot);
  return (Array.isArray(report?.defensePrediction?.predictions) ? report.defensePrediction.predictions : [])
    .filter((row) => clean(row?.format).toLowerCase() === format)
    .filter((row) => normalizeId(row?.leaderBaseId) && normalizeMembers(row?.members).length)
    .slice(0, 18);
}

function occupied(snapshot = {}, zone, slot) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : []).some((row) =>
    clean(row?.zone).toUpperCase() === clean(zone).toUpperCase() && Number(row?.slot) === Number(slot)
  );
}

function capacity(snapshot = {}, zone) {
  return Number(snapshot?.rule?.territories?.find((row) => clean(row?.value).toUpperCase() === clean(zone).toUpperCase())?.capacity || 0);
}

function exactSlotTarget(prediction = {}, snapshot = {}) {
  const slotRows = Array.isArray(prediction?.slotTendencies) ? prediction.slotTendencies : [];
  for (const tendency of slotRows) {
    const zone = clean(tendency?.zone).toUpperCase();
    const slot = Number(tendency?.slot);
    if (!zone || zone === 'BACK-TOP' || !Number.isInteger(slot) || slot < 0 || slot >= capacity(snapshot, zone)) continue;
    if (!occupied(snapshot, zone, slot)) return Object.freeze({ zone, slot, source:'verified-slot-tendency', samples:n(tendency?.verifiedBoards), exactSlot:true });
  }
  return null;
}

function zoneFallbackTarget(prediction = {}, snapshot = {}, reservedSlots = new Set()) {
  const zoneRows = Array.isArray(prediction?.zoneTendencies) ? prediction.zoneTendencies : [];
  for (const tendency of zoneRows) {
    const zone = clean(tendency?.zone).toUpperCase();
    if (!zone || zone === 'BACK-TOP') continue;
    const max = capacity(snapshot, zone);
    for (let slot = 0; slot < max; slot += 1) {
      const key = `${zone}|${slot}`;
      if (!occupied(snapshot, zone, slot) && !reservedSlots.has(key)) {
        return Object.freeze({ zone, slot, source:'verified-zone-tendency', samples:n(tendency?.verifiedBoards), exactSlot:false });
      }
    }
  }
  return null;
}

function reviewTarget(prediction = {}, snapshot = {}) {
  return exactSlotTarget(prediction, snapshot) || zoneFallbackTarget(prediction, snapshot) || null;
}

function predictionSignature(prediction = {}) {
  const leader = normalizeId(prediction?.leaderBaseId);
  const members = normalizeMembers(prediction?.members).sort();
  return `${leader}|${members.join(',')}`;
}

function buildStagingPlan(report, snapshot = {}, options = {}) {
  const allowZoneFallback = options.allowZoneFallback === true;
  const predictions = eligiblePredictions(report, snapshot);
  const reservedSlots = new Set();
  const usedTeams = new Set();
  const staged = [];
  const skipped = [];
  for (const prediction of predictions) {
    const signature = predictionSignature(prediction);
    if (!signature || usedTeams.has(signature)) {
      skipped.push(Object.freeze({ prediction, reason:'duplicate-team' }));
      continue;
    }
    let target = exactSlotTarget(prediction, snapshot);
    if (target && reservedSlots.has(`${target.zone}|${target.slot}`)) target = null;
    if (!target && allowZoneFallback) target = zoneFallbackTarget(prediction, snapshot, reservedSlots);
    if (!target) {
      skipped.push(Object.freeze({ prediction, reason:allowZoneFallback ? 'no-open-historical-target' : 'no-verified-open-slot' }));
      continue;
    }
    const slotKey = `${target.zone}|${target.slot}`;
    reservedSlots.add(slotKey);
    usedTeams.add(signature);
    staged.push(Object.freeze({
      leaderBaseId: normalizeId(prediction?.leaderBaseId),
      members: Object.freeze(normalizeMembers(prediction?.members)),
      zone: target.zone,
      slot: target.slot,
      targetSource: target.source,
      exactSlot: target.exactSlot === true,
      verifiedSamples: n(target.samples),
      evidenceClass: clean(prediction?.evidenceClass),
      verifiedHistoricalBoards: n(prediction?.verifiedHistoricalBoards),
      battleObservedMatchups: n(prediction?.battleObservedMatchups),
      lastSeenAt: clean(prediction?.lastSeenAt),
      latestVerifiedDatacron: prediction?.latestVerifiedDatacron || null,
      priorityRank: n(prediction?.priorityRank),
    }));
  }
  return Object.freeze({
    source:'historical-defense-staging',
    format:currentFormat(snapshot),
    allowZoneFallback,
    staged:Object.freeze(staged),
    skipped:Object.freeze(skipped),
    exactSlotCount:staged.filter((row)=>row.exactSlot).length,
    zoneOnlyCount:staged.filter((row)=>!row.exactSlot).length,
  });
}

export {
  buildStagingPlan,
  capacity,
  currentFormat,
  eligiblePredictions,
  exactSlotTarget,
  occupied,
  predictionSignature,
  reviewTarget,
  zoneFallbackTarget,
};
