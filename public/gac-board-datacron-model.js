const clean = (value) => String(value ?? '').trim();

function stableDatacronId(value) {
  if (value && typeof value === 'object') return clean(value.id);
  return clean(value);
}

function liveDatacronInventory(roster = {}) {
  if (!Array.isArray(roster?.datacrons)) return null;
  return roster.datacrons.filter((row) => stableDatacronId(row));
}

function datacronIndex(roster = {}) {
  const inventory = liveDatacronInventory(roster);
  return inventory === null ? null : new Map(inventory.map((row) => [stableDatacronId(row), row]));
}

function datacronLabel(datacron = {}, index = 0) {
  const id = stableDatacronId(datacron);
  const level = Number.isFinite(Number(datacron?.level))
    ? Number(datacron.level)
    : Array.isArray(datacron?.affixes) ? datacron.affixes.length : null;
  const setId = datacron?.setId ?? datacron?.set_id ?? null;
  const parts = [];
  if (level !== null) parts.push(`L${level}`);
  if (setId !== null && clean(setId)) parts.push(`Set ${clean(setId)}`);
  parts.push(id ? id.slice(-8) : `inventory ${index + 1}`);
  return parts.join(' · ');
}

function normalizedDatacronState(value) {
  const state = clean(value).toLowerCase();
  return ['unknown', 'none', 'assigned'].includes(state) ? state : 'unknown';
}

function restoredDatacronSelection(defense = {}, roster = {}) {
  const state = normalizedDatacronState(defense?.datacronState);
  const savedId = stableDatacronId(defense?.datacron?.id || defense?.datacronId);
  if (state !== 'assigned') {
    return Object.freeze({
      state,
      id: '',
      unresolved: false,
      datacron: null,
      reason: state === 'none' ? 'confirmed-none' : 'not-confirmed',
    });
  }
  if (!savedId) {
    return Object.freeze({
      state: 'assigned',
      id: '',
      unresolved: true,
      datacron: null,
      reason: 'assigned-id-missing',
    });
  }
  const index = datacronIndex(roster);
  if (index === null) {
    return Object.freeze({
      state: 'assigned',
      id: savedId,
      unresolved: true,
      datacron: defense?.datacron || null,
      reason: 'live-inventory-unavailable',
    });
  }
  const current = index.get(savedId) || null;
  return Object.freeze({
    state: 'assigned',
    id: savedId,
    unresolved: !current,
    datacron: current || defense?.datacron || null,
    reason: current ? 'resolved-current-live-instance' : 'assigned-instance-not-currently-resolved',
  });
}

function selectionFromControl(value, roster = {}) {
  const selected = clean(value);
  if (!selected || selected === 'unknown') {
    return Object.freeze({ state: 'unknown', id: '', unresolved: false, datacron: null });
  }
  if (selected === 'none') {
    return Object.freeze({ state: 'none', id: '', unresolved: false, datacron: null });
  }
  const prefix = 'assigned:';
  if (!selected.startsWith(prefix)) {
    return Object.freeze({ state: 'unknown', id: '', unresolved: false, datacron: null });
  }
  const id = selected.slice(prefix.length);
  const index = datacronIndex(roster);
  const datacron = index?.get(id) || null;
  return Object.freeze({
    state: datacron ? 'assigned' : 'unknown',
    id: datacron ? id : '',
    unresolved: false,
    datacron,
  });
}

function canSaveDatacronSelection(selection = {}) {
  const state = normalizedDatacronState(selection?.state);
  if (selection?.unresolved === true) return false;
  if (state === 'assigned') return Boolean(stableDatacronId(selection?.id));
  return state === 'unknown' || state === 'none';
}

function localDatacronSnapshot(selection = {}) {
  if (normalizedDatacronState(selection?.state) !== 'assigned' || !selection?.datacron) return null;
  const row = selection.datacron;
  const id = stableDatacronId(row);
  if (!id) return null;
  return Object.freeze({
    id,
    setId: row?.setId ?? row?.set_id ?? null,
    level: Number.isFinite(Number(row?.level)) ? Number(row.level) : Array.isArray(row?.affixes) ? row.affixes.length : null,
  });
}

export {
  canSaveDatacronSelection,
  datacronIndex,
  datacronLabel,
  liveDatacronInventory,
  localDatacronSnapshot,
  normalizedDatacronState,
  restoredDatacronSelection,
  selectionFromControl,
  stableDatacronId,
};
