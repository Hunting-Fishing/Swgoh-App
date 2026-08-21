const REVIEW_STATES = new Set(['pending', 'quarantined', 'approved', 'rejected']);

function clean(value) { return String(value ?? '').trim(); }
function normalizeBaseId(value) { return clean(value).split(':')[0].toUpperCase(); }
function normalizeIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeBaseId(value?.baseId || value)).filter(Boolean))];
}
function exactComposition(left = [], right = []) {
  const a = normalizeIds(left).sort();
  const b = normalizeIds(right).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function iso(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}
function strings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
}
function normalizeDatacronConstraint(value = {}) {
  return Object.freeze({
    presence: clean(value.presence).toLowerCase(),
    required: value.required === true,
    setIds: Object.freeze(strings(value.setIds).sort()),
    mechanicIds: Object.freeze(strings(value.mechanicIds).sort()),
  });
}
function normalizeValidationRef(value = {}) {
  return Object.freeze({
    kind: clean(value.kind),
    sourceName: clean(value.sourceName),
    sourceRef: clean(value.sourceRef),
    capturedAt: iso(value.capturedAt),
    note: clean(value.note),
  });
}
function normalizeEntry(value = {}) {
  const flags = value?.review?.flags && typeof value.review.flags === 'object' ? value.review.flags : {};
  const status = clean(value?.review?.status || value?.status).toLowerCase();
  return Object.freeze({
    candidateId: clean(value.candidateId),
    recordId: clean(value.recordId || value.proposedRecordId),
    format: clean(value.format).toLowerCase(),
    defender: Object.freeze({
      leaderBaseId: normalizeBaseId(value?.defender?.leaderBaseId),
      members: Object.freeze(normalizeIds(value?.defender?.members)),
    }),
    attacker: Object.freeze({
      leaderBaseId: normalizeBaseId(value?.attacker?.leaderBaseId),
      members: Object.freeze(normalizeIds(value?.attacker?.members)),
    }),
    datacron: Object.freeze({
      attacker: normalizeDatacronConstraint(value?.datacron?.attacker || value?.attackerDatacron),
      defender: normalizeDatacronConstraint(value?.datacron?.defender || value?.defenderDatacron),
    }),
    source: Object.freeze({
      name: clean(value?.source?.name || value.sourceName),
      ref: clean(value?.source?.ref || value.sourceRef),
      type: clean(value?.source?.type || value.sourceType),
      author: clean(value?.source?.author || value.sourceAuthor),
      updatedAt: iso(value?.source?.updatedAt || value.sourceUpdatedAt),
      capturedAt: iso(value?.source?.capturedAt || value.capturedAt),
    }),
    review: Object.freeze({
      status: REVIEW_STATES.has(status) ? status : 'pending',
      promotionReady: value?.review?.promotionReady === true || value?.promotionReady === true,
      blockers: Object.freeze(strings(value?.review?.blockers || value.blockers)),
      flags: Object.freeze({
        sourceVerified: flags.sourceVerified === true,
        exactCompositionVerified: flags.exactCompositionVerified === true,
        baseIdsVerified: flags.baseIdsVerified === true,
        guidanceParaphraseVerified: flags.guidanceParaphraseVerified === true,
        datacronScopeVerified: flags.datacronScopeVerified === true,
        versionValidityVerified: flags.versionValidityVerified === true,
        copyrightParaphraseReviewed: flags.copyrightParaphraseReviewed === true,
      }),
    }),
    validity: Object.freeze({
      validFrom: iso(value?.validity?.validFrom || value.validFrom),
      validUntil: iso(value?.validity?.validUntil || value.validUntil),
      gameDataVersion: clean(value?.validity?.gameDataVersion || value.gameDataVersion),
      notes: clean(value?.validity?.notes || value.validityNotes),
    }),
    research: Object.freeze({
      snapshotDate: clean(value?.research?.snapshotDate || value?.research?.sourceSnapshotDate),
      notes: clean(value?.research?.notes || value?.research?.sourceNotes),
      validationRefs: Object.freeze((Array.isArray(value?.research?.validationRefs) ? value.research.validationRefs : []).map(normalizeValidationRef)),
    }),
  });
}
function entryMatches(entryInput = {}, context = {}) {
  const entry = normalizeEntry(entryInput);
  if (!entry.candidateId || !entry.format) return false;
  if (entry.format !== clean(context.format).toLowerCase()) return false;
  if (!exactComposition(entry.defender.members, context.defenderMembers)) return false;
  if (!exactComposition(entry.attacker.members, context.attackerMembers)) return false;
  return true;
}
function candidateSort(leftInput = {}, rightInput = {}) {
  const left = normalizeEntry(leftInput);
  const right = normalizeEntry(rightInput);
  const rank = (entry) => entry.review.promotionReady ? 4 : entry.review.status === 'approved' ? 3 : entry.review.status === 'quarantined' ? 2 : entry.review.status === 'pending' ? 1 : 0;
  const rankDelta = rank(right) - rank(left);
  if (rankDelta) return rankDelta;
  const leftDate = Date.parse(left.source.updatedAt || left.source.capturedAt || '') || 0;
  const rightDate = Date.parse(right.source.updatedAt || right.source.capturedAt || '') || 0;
  if (leftDate !== rightDate) return rightDate - leftDate;
  return left.candidateId.localeCompare(right.candidateId);
}
function findExactProvenance(entries = [], context = {}) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entryMatches(entry, context))
    .sort(candidateSort)
    .map(normalizeEntry)[0] || null;
}
function blockerLabel(value) {
  const blocker = clean(value).replace(/^review:/, '').replace(/^record:/, '');
  const labels = {
    'not-approved': 'Source record is not approved for runtime',
    'review:not-approved': 'Source record is not approved for runtime',
    datacronScopeVerified: 'Datacron scope is not verified',
    versionValidityVerified: 'Current-version validity is not verified',
    baseIdsVerified: 'Canonical unit IDs are not fully verified',
    guidanceParaphraseVerified: 'Execution paraphrase is not fully reviewed',
    sourceVerified: 'Primary source is not fully verified',
    exactCompositionVerified: 'Exact squad composition is not fully verified',
    'datacron-scope-unverified': 'Datacron scope is not verified',
    'current-version-validity-unverified': 'Current-version validity is not verified',
    'base-ids-unverified': 'Canonical unit IDs are not fully verified',
    'guidance-sequence-missing': 'No reviewed execution sequence is available',
  };
  return labels[value] || labels[blocker] || blocker.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
function provenanceState({ productionGuidance = null, candidate = null } = {}) {
  if (productionGuidance) {
    return Object.freeze({
      status: 'unlocked',
      label: 'APPROVED EXECUTION RECORD',
      detail: 'Exact composition, validity and Datacron constraints matched the current battle context.',
      sourceName: clean(productionGuidance.sourceName),
      sourceRef: clean(productionGuidance.sourceRef),
      sourceType: clean(productionGuidance.sourceType),
      sourceAuthor: clean(productionGuidance.sourceAuthor),
      sourceUpdatedAt: clean(productionGuidance.sourceUpdatedAt),
      capturedAt: clean(productionGuidance.capturedAt),
      validityNotes: clean(productionGuidance.validityNotes),
      validity: Object.freeze({
        validFrom: iso(productionGuidance.validFrom),
        validUntil: iso(productionGuidance.validUntil),
        gameDataVersion: clean(productionGuidance.gameDataVersion),
        notes: clean(productionGuidance.validityNotes),
      }),
      datacronScope: Object.freeze({
        attacker: normalizeDatacronConstraint(productionGuidance.attackerDatacron),
        defender: normalizeDatacronConstraint(productionGuidance.defenderDatacron),
      }),
      datacronScopeVerified: true,
      versionValidityVerified: true,
      reviewStatus: 'approved',
      blockers: Object.freeze([]),
      validationRefs: Object.freeze([]),
    });
  }
  if (candidate) {
    const entry = normalizeEntry(candidate);
    return Object.freeze({
      status: entry.review.status === 'rejected' ? 'rejected' : 'locked',
      label: entry.review.status === 'rejected' ? 'SOURCE RECORD REJECTED' : 'TACTIC FOUND · EXECUTION LOCKED',
      detail: 'A source record exists for this exact composition, but unapproved execution guidance remains quarantined.',
      sourceName: entry.source.name,
      sourceRef: entry.source.ref,
      sourceType: entry.source.type,
      sourceAuthor: entry.source.author,
      sourceUpdatedAt: entry.source.updatedAt,
      capturedAt: entry.source.capturedAt,
      validityNotes: entry.validity.notes,
      validity: entry.validity,
      datacronScope: entry.datacron,
      datacronScopeVerified: entry.review.flags.datacronScopeVerified,
      versionValidityVerified: entry.review.flags.versionValidityVerified,
      reviewStatus: entry.review.status,
      blockers: Object.freeze(entry.review.blockers.map(blockerLabel)),
      validationRefs: entry.research.validationRefs,
    });
  }
  return Object.freeze({
    status: 'none',
    label: 'NO EXACT TACTICAL SOURCE RECORD',
    detail: 'No approved or quarantined source record matches this exact attacker and defender composition.',
    sourceName: '', sourceRef: '', sourceType: '', sourceAuthor: '', sourceUpdatedAt: '', capturedAt: '', validityNotes: '',
    validity: Object.freeze({ validFrom: '', validUntil: '', gameDataVersion: '', notes: '' }),
    datacronScope: Object.freeze({ attacker: normalizeDatacronConstraint(), defender: normalizeDatacronConstraint() }),
    datacronScopeVerified: false, versionValidityVerified: false, reviewStatus: '',
    blockers: Object.freeze([]), validationRefs: Object.freeze([]),
  });
}

export { blockerLabel, entryMatches, exactComposition, findExactProvenance, normalizeDatacronConstraint, normalizeEntry, provenanceState };
