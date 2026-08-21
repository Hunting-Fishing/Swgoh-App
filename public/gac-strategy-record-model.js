const FORMAT_VALUES = new Set(["3v3", "5v5", "fleet"]);
const STATUS_VALUES = new Set(["active", "disabled"]);
const SOURCE_TYPES = new Set(["video", "article", "tool", "community", "first-party", "curated"]);
const DATACRON_PRESENCE = new Set(["any", "none", "assigned"]);
const SCHEMA_VERSION = 1;

function clean(value) { return String(value ?? "").trim(); }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function normalizeIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeBaseId(value?.baseId || value)).filter(Boolean))];
}
function exactComposition(left = [], right = []) {
  const a = normalizeIds(left).sort();
  const b = normalizeIds(right).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function isoDate(value) {
  const text = clean(value);
  if (!text) return "";
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}
function guidanceStep(value) {
  if (typeof value === "string") {
    const text = clean(value);
    return text ? Object.freeze({ text, note: "" }) : null;
  }
  if (!value || typeof value !== "object") return null;
  const text = clean(value.text);
  if (!text) return null;
  return Object.freeze({ text, note: clean(value.note) });
}
function guidanceList(values) {
  return Object.freeze((Array.isArray(values) ? values : []).map(guidanceStep).filter(Boolean).slice(0, 20));
}
function normalizeGuidance(value = {}) {
  const guidance = Object.freeze({
    opening: guidanceList(value.opening),
    targets: guidanceList(value.targets),
    mechanics: guidanceList(value.mechanics),
    avoid: guidanceList(value.avoid),
  });
  const hasContent = Object.values(guidance).some((rows) => rows.length > 0);
  return Object.freeze({ ...guidance, hasContent });
}
function normalizeDatacronConstraint(value = {}) {
  const setIds = [...new Set((Array.isArray(value?.setIds) ? value.setIds : []).map(clean).filter(Boolean))].sort();
  const mechanicIds = [...new Set((Array.isArray(value?.mechanicIds) ? value.mechanicIds : []).map(clean).filter(Boolean))].sort();
  return Object.freeze({
    presence: clean(value?.presence).toLowerCase(),
    setIds: Object.freeze(setIds),
    mechanicIds: Object.freeze(mechanicIds),
    required: value?.required === true,
  });
}
function normalizeSide(value = {}) {
  const members = normalizeIds(value.members);
  const leaderBaseId = normalizeBaseId(value.leaderBaseId || members[0]);
  return Object.freeze({ leaderBaseId, members: Object.freeze(members) });
}
function normalizeProvenance(value = {}) {
  const sourceName = clean(value.sourceName);
  const sourceRef = clean(value.sourceRef);
  const sourceType = clean(value.sourceType).toLowerCase();
  return Object.freeze({
    sourceName,
    sourceRef,
    sourceType: SOURCE_TYPES.has(sourceType) ? sourceType : "",
    author: clean(value.author),
    sourcePublishedAt: isoDate(value.sourcePublishedAt),
    sourceUpdatedAt: isoDate(value.sourceUpdatedAt || value.sourcePublishedAt),
    capturedAt: isoDate(value.capturedAt),
  });
}
function normalizeValidity(value = {}) {
  return Object.freeze({
    validFrom: isoDate(value.validFrom),
    validUntil: isoDate(value.validUntil),
    gameDataVersion: clean(value.gameDataVersion),
    notes: clean(value.notes),
  });
}
function normalizeRecord(value = {}) {
  return Object.freeze({
    schemaVersion: Number(value.schemaVersion),
    id: clean(value.id),
    status: clean(value.status || "active").toLowerCase(),
    format: clean(value.format).toLowerCase(),
    defender: normalizeSide(value.defender),
    attacker: normalizeSide(value.attacker),
    attackerDatacron: normalizeDatacronConstraint(value.attackerDatacron),
    defenderDatacron: normalizeDatacronConstraint(value.defenderDatacron),
    guidance: normalizeGuidance(value.guidance),
    provenance: normalizeProvenance(value.provenance),
    validity: normalizeValidity(value.validity),
  });
}
function datacronConstraintErrors(constraint, side) {
  const errors = [];
  if (!DATACRON_PRESENCE.has(constraint?.presence)) errors.push(`invalid-${side}-datacron-presence`);
  if (constraint?.presence === "none" && (constraint.required === true || constraint.setIds.length || constraint.mechanicIds.length)) {
    errors.push(`invalid-${side}-datacron-none-constraints`);
  }
  if (constraint?.required === true && constraint?.presence !== "assigned") errors.push(`invalid-${side}-datacron-required-state`);
  return errors;
}
function validateRecord(value = {}) {
  const record = normalizeRecord(value);
  const errors = [];
  if (record.schemaVersion !== SCHEMA_VERSION) errors.push("unsupported-schema-version");
  if (!record.id || !/^[A-Za-z0-9._:-]{3,160}$/.test(record.id)) errors.push("invalid-id");
  if (!STATUS_VALUES.has(record.status)) errors.push("invalid-status");
  if (!FORMAT_VALUES.has(record.format)) errors.push("invalid-format");
  const expectedSize = record.format === "3v3" ? 3 : record.format === "5v5" ? 5 : null;
  if (!record.defender.leaderBaseId || !record.defender.members.includes(record.defender.leaderBaseId)) errors.push("invalid-defender-leader");
  if (!record.attacker.leaderBaseId || !record.attacker.members.includes(record.attacker.leaderBaseId)) errors.push("invalid-attacker-leader");
  if (expectedSize && record.defender.members.length !== expectedSize) errors.push("invalid-defender-size");
  if (expectedSize && (record.attacker.members.length < 1 || record.attacker.members.length > expectedSize)) errors.push("invalid-attacker-size");
  if (record.format === "fleet" && (record.defender.members.length < 4 || record.attacker.members.length < 4)) errors.push("invalid-fleet-size");
  errors.push(...datacronConstraintErrors(record.attackerDatacron, "attacker"));
  errors.push(...datacronConstraintErrors(record.defenderDatacron, "defender"));
  if (!record.guidance.hasContent) errors.push("missing-guidance");
  if (!record.provenance.sourceName) errors.push("missing-source-name");
  if (!record.provenance.sourceRef) errors.push("missing-source-ref");
  if (!record.provenance.sourceType) errors.push("invalid-source-type");
  if (!record.provenance.sourceUpdatedAt) errors.push("missing-source-date");
  if (!record.provenance.capturedAt) errors.push("missing-captured-date");
  if (record.validity.validFrom && record.validity.validUntil && Date.parse(record.validity.validFrom) > Date.parse(record.validity.validUntil)) errors.push("invalid-validity-window");
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), record });
}
function withinValidity(record, now = Date.now()) {
  const time = Number(now);
  const current = Number.isFinite(time) ? time : Date.now();
  const from = record?.validity?.validFrom ? Date.parse(record.validity.validFrom) : null;
  const until = record?.validity?.validUntil ? Date.parse(record.validity.validUntil) : null;
  if (Number.isFinite(from) && current < from) return false;
  if (Number.isFinite(until) && current > until) return false;
  return true;
}
function constraintMatches(constraint = {}, context = {}) {
  const presence = clean(constraint?.presence).toLowerCase();
  if (!DATACRON_PRESENCE.has(presence)) return false;
  const state = clean(context?.state).toLowerCase();
  const setIds = Array.isArray(constraint?.setIds) ? constraint.setIds : [];
  const mechanicIds = Array.isArray(constraint?.mechanicIds) ? constraint.mechanicIds : [];
  const hasSpecificRules = setIds.length > 0 || mechanicIds.length > 0 || constraint?.required === true;

  if (presence === "none") return context?.known === true && state === "none" && !hasSpecificRules;
  if (presence === "assigned" && (context?.known !== true || state !== "assigned")) return false;
  if (presence === "any" && !hasSpecificRules) return true;
  if (context?.known !== true || state !== "assigned") return false;

  const selectedSetId = clean(context?.setId);
  const selectedMechanics = new Set((Array.isArray(context?.mechanicIds) ? context.mechanicIds : []).map(clean).filter(Boolean));
  if (constraint?.required === true && !selectedSetId && !selectedMechanics.size) return false;
  if (setIds.length && !setIds.includes(selectedSetId)) return false;
  if (mechanicIds.length && mechanicIds.some((id) => !selectedMechanics.has(id))) return false;
  return true;
}
function recordMatches(record, context = {}) {
  if (!record || record.status !== "active") return false;
  if (clean(context.format).toLowerCase() !== record.format) return false;
  if (!exactComposition(record.defender.members, context.defenderMembers)) return false;
  if (!exactComposition(record.attacker.members, context.attackerMembers)) return false;
  if (!withinValidity(record, context.now)) return false;
  if (!constraintMatches(record.attackerDatacron, context.attackerDatacron)) return false;
  if (!constraintMatches(record.defenderDatacron, context.defenderDatacron)) return false;
  return true;
}
function recordSort(left, right) {
  const a = Date.parse(left?.provenance?.sourceUpdatedAt || "") || 0;
  const b = Date.parse(right?.provenance?.sourceUpdatedAt || "") || 0;
  if (a !== b) return b - a;
  return clean(left?.id).localeCompare(clean(right?.id));
}
function strategyGuidance(record) {
  if (!record) return null;
  return Object.freeze({
    recordId: record.id,
    sourceName: record.provenance.sourceName,
    sourceRef: record.provenance.sourceRef,
    sourceType: record.provenance.sourceType,
    sourceAuthor: record.provenance.author,
    sourcePublishedAt: record.provenance.sourcePublishedAt,
    sourceUpdatedAt: record.provenance.sourceUpdatedAt,
    capturedAt: record.provenance.capturedAt,
    validFrom: record.validity.validFrom,
    validUntil: record.validity.validUntil,
    gameDataVersion: record.validity.gameDataVersion,
    validityNotes: record.validity.notes,
    attackerDatacron: record.attackerDatacron,
    defenderDatacron: record.defenderDatacron,
    opening: record.guidance.opening,
    targets: record.guidance.targets,
    mechanics: record.guidance.mechanics,
    avoid: record.guidance.avoid,
  });
}
function findExactStrategy(records = [], context = {}) {
  const valid = (Array.isArray(records) ? records : [])
    .map((value) => validateRecord(value))
    .filter((result) => result.valid)
    .map((result) => result.record)
    .filter((record) => recordMatches(record, context))
    .sort(recordSort);
  return valid[0] || null;
}

export {
  DATACRON_PRESENCE,
  SCHEMA_VERSION,
  constraintMatches,
  exactComposition,
  findExactStrategy,
  normalizeBaseId,
  normalizeGuidance,
  normalizeIds,
  normalizeRecord,
  recordMatches,
  strategyGuidance,
  validateRecord,
  withinValidity,
};
