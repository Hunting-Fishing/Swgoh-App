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

function reviewTarget(prediction = {}, snapshot = {}) {
  const slotRows = Array.isArray(prediction?.slotTendencies) ? prediction.slotTendencies : [];
  for (const tendency of slotRows) {
    const zone = clean(tendency?.zone).toUpperCase();
    const slot = Number(tendency?.slot);
    if (!zone || zone === 'BACK-TOP' || !Number.isInteger(slot) || slot < 0 || slot >= capacity(snapshot, zone)) continue;
    if (!occupied(snapshot, zone, slot)) return Object.freeze({ zone, slot, source: 'verified-slot-tendency', samples: n(tendency?.verifiedBoards) });
  }
  const zoneRows = Array.isArray(prediction?.zoneTendencies) ? prediction.zoneTendencies : [];
  for (const tendency of zoneRows) {
    const zone = clean(tendency?.zone).toUpperCase();
    if (!zone || zone === 'BACK-TOP') continue;
    const max = capacity(snapshot, zone);
    for (let slot = 0; slot < max; slot += 1) {
      if (!occupied(snapshot, zone, slot)) return Object.freeze({ zone, slot, source: 'verified-zone-tendency', samples: n(tendency?.verifiedBoards) });
    }
  }
  return null;
}

export { capacity, currentFormat, eligiblePredictions, occupied, reviewTarget };
