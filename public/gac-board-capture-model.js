const CAPTURE_PRIORITY = Object.freeze(['FRONT-TOP', 'FRONT-BOTTOM', 'BACK-BOTTOM', 'BACK-TOP']);
const clean = (value) => String(value ?? '').trim();

function captureSlotKey(slot = {}) {
  return `${clean(slot.zone).toUpperCase()}|${Number.isInteger(Number(slot.slot)) ? Number(slot.slot) : ''}`;
}

function orderedTerritories(territories = []) {
  const rank = new Map(CAPTURE_PRIORITY.map((zone, index) => [zone, index]));
  return (Array.isArray(territories) ? territories : [])
    .slice()
    .sort((a, b) => (rank.get(clean(a?.zone || a?.value).toUpperCase()) ?? 99) - (rank.get(clean(b?.zone || b?.value).toUpperCase()) ?? 99));
}

function visibleCaptureSlots(territories = []) {
  const rows = [];
  for (const territory of orderedTerritories(territories)) {
    if (territory?.revealed !== true) continue;
    for (const slot of Array.isArray(territory?.slots) ? territory.slots : []) {
      rows.push(Object.freeze({
        zone: clean(slot?.zone || territory?.zone || territory?.value).toUpperCase(),
        slot: Number(slot?.slot),
        displaySlot: Number(slot?.displaySlot || Number(slot?.slot) + 1),
        kind: clean(slot?.kind || territory?.kind).toLowerCase() === 'fleet' ? 'fleet' : 'squad',
        occupied: slot?.occupied === true,
      }));
    }
  }
  return Object.freeze(rows.filter((row) => row.zone && Number.isInteger(row.slot) && row.slot >= 0));
}

function captureQueue(territories = []) {
  const slots = visibleCaptureSlots(territories);
  const empty = slots.filter((slot) => !slot.occupied);
  const visibleCapacity = slots.length;
  const visibleEntered = slots.length - empty.length;
  const all = orderedTerritories(territories);
  const totalCapacity = all.reduce((sum, territory) => sum + Math.max(0, Number(territory?.capacity) || 0), 0);
  const totalEntered = all.reduce((sum, territory) => sum + Math.max(0, Number(territory?.entered) || 0), 0);
  const hidden = all.filter((territory) => territory?.revealed !== true);
  const hiddenCapacity = hidden.reduce((sum, territory) => sum + Math.max(0, Number(territory?.capacity) || 0), 0);
  return Object.freeze({
    slots,
    empty: Object.freeze(empty),
    next: empty[0] || null,
    visibleCapacity,
    visibleEntered,
    visibleComplete: visibleCapacity > 0 && visibleEntered >= visibleCapacity,
    totalCapacity,
    totalEntered,
    fullComplete: totalCapacity > 0 && totalEntered >= totalCapacity,
    hiddenCapacity,
    hiddenTerritories: Object.freeze(hidden.map((territory) => clean(territory?.zone || territory?.value).toUpperCase()).filter(Boolean)),
  });
}

function restoreSummary(squadDefenses = [], fleetDrafts = [], canonicalFleets = []) {
  const squads = Array.isArray(squadDefenses) ? squadDefenses : [];
  const fleets = Array.isArray(fleetDrafts) ? fleetDrafts : [];
  const canonical = Array.isArray(canonicalFleets) ? canonicalFleets : [];
  const canonicalSlots = new Set(canonical.map((row) => Number(row?.slot)).filter((slot) => Number.isInteger(slot) && slot >= 0));
  return Object.freeze({
    serverSquads: squads.filter((row) => clean(row?.storage).toLowerCase() === 'server').length,
    localSquads: squads.filter((row) => clean(row?.storage).toLowerCase() !== 'server').length,
    canonicalFleets: canonicalSlots.size,
    localFleets: fleets.filter((row) => Number.isInteger(Number(row?.slot)) && !canonicalSlots.has(Number(row.slot))).length,
  });
}

function captureStatus(queue = {}) {
  if (queue?.fullComplete) return Object.freeze({ code: 'full', label: 'FULL BOARD CAPTURED' });
  if (queue?.visibleComplete && Number(queue?.hiddenCapacity) > 0) {
    return Object.freeze({ code: 'visible-complete', label: 'VISIBLE ENTRY COMPLETE · REAR TERRITORIES STILL HIDDEN' });
  }
  if (queue?.next) {
    const zone = clean(queue.next.zone).replaceAll('-', ' ');
    return Object.freeze({
      code: 'next',
      label: `NEXT · ${zone} · SLOT ${Number(queue.next.displaySlot)} · ${clean(queue.next.kind).toUpperCase()}`,
    });
  }
  return Object.freeze({ code: 'waiting', label: 'WAITING FOR VISIBLE BOARD SLOTS' });
}

export {
  CAPTURE_PRIORITY,
  captureQueue,
  captureSlotKey,
  captureStatus,
  orderedTerritories,
  restoreSummary,
  visibleCaptureSlots,
};
