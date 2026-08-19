const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function freezeRows(rows) {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

export function tbAssignmentSlotKey(row = {}) {
  const explicit = text(row.id || row.slotId || row.slot_id);
  if (explicit) return explicit;
  return [
    text(row.phase),
    text(row.conflictId || row.conflict_id),
    text(row.squadId || row.squad_id),
    text(row.slot),
    text(row.baseId || row.base_id),
  ].join('|');
}

export function tbAssignmentDonorKey(row = {}) {
  return text(
    row?.member?.playerId
    || row?.member?.allyCode
    || row?.member?.name
    || row.playerId
    || row.player_id
    || row.memberId
    || row.member_id,
  );
}

function helpCount(run = {}) {
  const diagnostics = object(run.diagnostics);
  const explicit = diagnostics?.safetySummary?.helpAssignments
    ?? diagnostics?.helpAssignments
    ?? diagnostics?.helpCount;
  if (Number.isFinite(Number(explicit))) return Math.max(0, Math.floor(Number(explicit)));
  return array(run.assignments).filter((row) => row?.safety?.help === true).length;
}

function slotMap(rows) {
  const map = new Map();
  for (const row of array(rows)) {
    const key = tbAssignmentSlotKey(row);
    if (key) map.set(key, row);
  }
  return map;
}

function assignmentSummary(row = {}) {
  return Object.freeze({
    slotKey: tbAssignmentSlotKey(row),
    phase: text(row.phase),
    conflictId: text(row.conflictId || row.conflict_id),
    squadId: text(row.squadId || row.squad_id),
    slot: row.slot ?? null,
    baseId: text(row.baseId || row.base_id),
    name: text(row.name),
    donorId: tbAssignmentDonorKey(row),
    donorName: text(row?.member?.name),
    donorAllyCode: text(row?.member?.allyCode),
    safetyStatus: text(row?.safety?.status),
    help: row?.safety?.help === true,
  });
}

function unfilledSummary(row = {}) {
  return Object.freeze({
    slotKey: tbAssignmentSlotKey(row),
    phase: text(row.phase),
    conflictId: text(row.conflictId || row.conflict_id),
    squadId: text(row.squadId || row.squad_id),
    slot: row.slot ?? null,
    baseId: text(row.baseId || row.base_id),
    name: text(row.name),
    eligibleOwners: finite(row.eligibleOwners, 0),
    availableOwners: finite(row.availableOwners, 0),
    safeOwners: finite(row.safeOwners, 0),
    locked: row.locked === true,
    lockIssue: text(row.lockIssue),
  });
}

export function compareTbAssignmentVersions(fromRun = {}, toRun = {}) {
  const fromAssignments = slotMap(fromRun.assignments);
  const toAssignments = slotMap(toRun.assignments);
  const fromUnfilled = slotMap(fromRun.unfilled);
  const toUnfilled = slotMap(toRun.unfilled);

  const addedAssignments = [];
  const removedAssignments = [];
  const changedDonors = [];
  const newlyFilledSlots = [];
  const newlyUnfilledSlots = [];

  for (const [slotKey, toRow] of toAssignments.entries()) {
    const fromRow = fromAssignments.get(slotKey);
    if (!fromRow) {
      addedAssignments.push(assignmentSummary(toRow));
      if (fromUnfilled.has(slotKey)) {
        newlyFilledSlots.push(Object.freeze({
          slotKey,
          from: unfilledSummary(fromUnfilled.get(slotKey)),
          to: assignmentSummary(toRow),
        }));
      }
      continue;
    }

    const fromDonor = tbAssignmentDonorKey(fromRow);
    const toDonor = tbAssignmentDonorKey(toRow);
    if (fromDonor !== toDonor) {
      changedDonors.push(Object.freeze({
        slotKey,
        from: assignmentSummary(fromRow),
        to: assignmentSummary(toRow),
      }));
    }
  }

  for (const [slotKey, fromRow] of fromAssignments.entries()) {
    if (toAssignments.has(slotKey)) continue;
    removedAssignments.push(assignmentSummary(fromRow));
    if (toUnfilled.has(slotKey)) {
      newlyUnfilledSlots.push(Object.freeze({
        slotKey,
        from: assignmentSummary(fromRow),
        to: unfilledSummary(toUnfilled.get(slotKey)),
      }));
    }
  }

  const fromHelpCount = helpCount(fromRun);
  const toHelpCount = helpCount(toRun);

  return Object.freeze({
    from: Object.freeze({
      id: text(fromRun.id),
      versionNumber: finite(fromRun.version_number ?? fromRun.versionNumber, 0),
      planHash: text(fromRun.plan_hash ?? fromRun.planHash),
      assigned: fromAssignments.size,
      unfilled: fromUnfilled.size,
      helpCount: fromHelpCount,
    }),
    to: Object.freeze({
      id: text(toRun.id),
      versionNumber: finite(toRun.version_number ?? toRun.versionNumber, 0),
      planHash: text(toRun.plan_hash ?? toRun.planHash),
      assigned: toAssignments.size,
      unfilled: toUnfilled.size,
      helpCount: toHelpCount,
    }),
    summary: Object.freeze({
      addedAssignments: addedAssignments.length,
      removedAssignments: removedAssignments.length,
      changedDonors: changedDonors.length,
      newlyFilledSlots: newlyFilledSlots.length,
      newlyUnfilledSlots: newlyUnfilledSlots.length,
      helpDelta: toHelpCount - fromHelpCount,
    }),
    addedAssignments: freezeRows(addedAssignments),
    removedAssignments: freezeRows(removedAssignments),
    changedDonors: freezeRows(changedDonors),
    newlyFilledSlots: freezeRows(newlyFilledSlots),
    newlyUnfilledSlots: freezeRows(newlyUnfilledSlots),
  });
}
