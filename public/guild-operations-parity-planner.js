import { planGuildRoteSafeAssignments } from './guild-rote-safe-planner.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function setOf(values) {
  return new Set(array(values).map(text).filter(Boolean));
}

function normalizedLayout(layout = {}) {
  return Object.freeze({
    includedPhases: setOf(layout.includedPhases),
    includedConflictIds: setOf(layout.includedConflictIds),
    excludedConflictIds: setOf(layout.excludedConflictIds),
  });
}

function normalizeOverride(value = {}) {
  if (value === null || value === false || value?.clear === true) return Object.freeze({ clear: true });
  return Object.freeze({
    clear: false,
    baseId: upper(value.baseId),
    name: text(value.name),
    unitType: text(value.unitType),
    requiredRelic: finite(value.requiredRelic, NaN),
    requiredRarity: finite(value.requiredRarity, NaN),
  });
}

function overrideMapOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map();
  return new Map(Object.entries(value).map(([slotId, row]) => [text(slotId), normalizeOverride(row)]));
}

function shouldIncludeSlot(slot, config) {
  const layout = config.layout;
  const phase = text(slot.phase);
  const conflictId = text(slot.conflictId);
  const squadId = text(slot.squadId);
  const slotId = text(slot.id);

  if (layout.includedPhases.size && !layout.includedPhases.has(phase)) return false;
  if (layout.includedConflictIds.size && !layout.includedConflictIds.has(conflictId)) return false;
  if (layout.excludedConflictIds.has(conflictId)) return false;
  if (config.ignoredMissions.has(conflictId)) return false;
  if (config.ignoredPlatoons.has(squadId)) return false;
  if (config.ignoredSlots.has(slotId)) return false;
  return true;
}

function applyOverride(slot, override) {
  if (!override) return { slot, unresolved: null };
  if (override.clear) {
    return {
      slot: null,
      unresolved: {
        slotId: text(slot.id),
        phase: text(slot.phase),
        conflictId: text(slot.conflictId),
        squadId: text(slot.squadId),
        reason: 'Requirement was cleared by an officer and must be replaced or ignored before publish.',
      },
    };
  }
  const next = { ...slot };
  if (override.baseId) next.baseId = override.baseId;
  if (override.name) next.name = override.name;
  if (override.unitType) next.unitType = override.unitType;
  if (Number.isFinite(override.requiredRelic)) next.requiredRelic = override.requiredRelic;
  if (Number.isFinite(override.requiredRarity)) next.requiredRarity = override.requiredRarity;
  next.requirementSource = 'officer-override';
  return { slot: next, unresolved: null };
}

function normalizeConfig(options = {}) {
  return Object.freeze({
    layout: normalizedLayout(options.phaseLayout),
    ignoredMissions: setOf(options.ignoredMissions),
    ignoredPlatoons: setOf(options.ignoredPlatoons),
    ignoredSlots: setOf(options.ignoredSlots),
    overrides: overrideMapOf(options.requirementOverrides),
  });
}

export function buildScopedTbOperations(operations, options = {}) {
  const config = normalizeConfig(options);
  const sourceSlots = array(operations?.slots);
  const slots = [];
  const unresolvedRequirements = [];
  const ignored = [];

  for (const slot of sourceSlots) {
    if (!shouldIncludeSlot(slot, config)) {
      ignored.push({
        slotId: text(slot.id),
        phase: text(slot.phase),
        conflictId: text(slot.conflictId),
        squadId: text(slot.squadId),
      });
      continue;
    }
    const { slot: next, unresolved } = applyOverride(slot, config.overrides.get(text(slot.id)));
    if (unresolved) unresolvedRequirements.push(unresolved);
    else if (next) slots.push(next);
  }

  return Object.freeze({
    ...operations,
    slots: Object.freeze(slots),
    parityScope: Object.freeze({
      sourceSlots: sourceSlots.length,
      activeSlots: slots.length,
      ignoredSlots: ignored.length,
      overriddenSlots: [...config.overrides.values()].filter((row) => !row.clear).length,
      unresolvedRequirements: Object.freeze(unresolvedRequirements),
      ignored: Object.freeze(ignored),
    }),
  });
}

function memberIdFromAssignment(row) {
  return text(row?.member?.playerId || row?.member?.allyCode || row?.member?.name);
}

function ruleAppliesToAssignment(rule, row) {
  const when = rule?.when_spec || rule?.when || {};
  if (when.phase && text(when.phase) !== text(row.phase)) return false;
  if (when.memberId && text(when.memberId) !== memberIdFromAssignment(row)) return false;
  if (when.baseId && upper(when.baseId) !== upper(row.baseId)) return false;
  if (when.conflictId && text(when.conflictId) !== text(row.conflictId)) return false;
  if (when.squadId && text(when.squadId) !== text(row.squadId)) return false;
  return true;
}

function reservationSignature(row) {
  return `${text(row.memberId)}|${text(row.phase || 'All')}|${upper(row.baseId)}`;
}

function preferenceSignature(row) {
  return `${text(row.memberId)}|${upper(row.baseId)}|${text(row.preference)}`;
}

function deriveRuleConstraints(plan, rules, baseReservations, basePreferences) {
  const reservations = [...array(baseReservations)];
  const preferences = [...array(basePreferences)];
  const reservationSeen = new Set(reservations.map(reservationSignature));
  const preferenceSeen = new Set(preferences.map(preferenceSignature));
  const applied = [];

  const assignments = array(plan?.assignments);
  const countsByMember = new Map();
  for (const row of assignments) {
    const id = memberIdFromAssignment(row);
    countsByMember.set(id, (countsByMember.get(id) || 0) + 1);
  }

  for (const rule of array(rules).filter((row) => row?.enabled !== false).sort((a, b) => finite(a?.priority, 100) - finite(b?.priority, 100))) {
    const type = text(rule.rule_type || rule.type);
    const then = rule?.then_spec || rule?.then || {};

    if (type === 'max_member_assignments') {
      const max = Math.max(1, Math.floor(finite(then.max ?? rule.max, 1)));
      for (const [memberId, count] of countsByMember.entries()) {
        if (count <= max) continue;
        const excess = assignments.filter((row) => memberIdFromAssignment(row) === memberId).slice(max);
        for (const row of excess) {
          const constraint = { memberId, phase: row.phase, baseId: row.baseId, source: 'grouping-rule', ruleId: text(rule.id) };
          const sig = reservationSignature(constraint);
          if (!reservationSeen.has(sig)) {
            reservationSeen.add(sig);
            reservations.push(constraint);
            applied.push({ ruleId: text(rule.id), type, memberId, baseId: row.baseId, phase: row.phase });
          }
        }
      }
      continue;
    }

    for (const row of assignments) {
      if (!ruleAppliesToAssignment(rule, row)) continue;
      const memberId = memberIdFromAssignment(row);
      const phase = text(then.phase || row.phase || 'All');
      const targetBaseIds = array(then.baseIds || then.units || (then.baseId ? [then.baseId] : [])).map(upper).filter(Boolean);

      if (type === 'prefer_pair') {
        for (const baseId of targetBaseIds) {
          const pref = { memberId, baseId, preference: 'give', source: 'grouping-rule', ruleId: text(rule.id) };
          const sig = preferenceSignature(pref);
          if (!preferenceSeen.has(sig)) {
            preferenceSeen.add(sig);
            preferences.push(pref);
            applied.push({ ruleId: text(rule.id), type, memberId, baseId, phase });
          }
        }
      } else if (['avoid_pair','avoid_unit_after','protect_unit_if_assigned'].includes(type)) {
        for (const baseId of targetBaseIds) {
          const constraint = { memberId, phase, baseId, source: 'grouping-rule', ruleId: text(rule.id) };
          const sig = reservationSignature(constraint);
          if (!reservationSeen.has(sig)) {
            reservationSeen.add(sig);
            reservations.push(constraint);
            applied.push({ ruleId: text(rule.id), type, memberId, baseId, phase });
          }
        }
      }
    }
  }

  return { reservations, preferences, applied };
}

export function planGuildTbOperationsParity(guildSnapshot, operations, options = {}) {
  const scoped = buildScopedTbOperations(operations, options);
  const locks = array(options.preAssignments || options.locks).map((row) => ({
    slotId: text(row.slotId || row.slot_id),
    memberId: text(row.memberId || row.playerId || row.player_id),
  })).filter((row) => row.slotId && row.memberId);

  const baseReservations = array(options.reservations);
  const basePreferences = array(options.preferences);
  let reservations = [...baseReservations];
  let preferences = [...basePreferences];
  let plan = null;
  let appliedRules = [];
  let iterations = 0;
  let previousSignature = '';

  for (let i = 0; i < 6; i += 1) {
    iterations = i + 1;
    plan = planGuildRoteSafeAssignments(guildSnapshot, scoped, {
      maxPerTerritory: options.maxPerTerritory,
      locks,
      reservations,
      preferences,
      ignoredMembers: options.ignoredMembers,
      protections: options.protections,
    });

    const derived = deriveRuleConstraints(plan, options.groupingRules, reservations, preferences);
    const signature = JSON.stringify({
      reservations: derived.reservations.map(reservationSignature).sort(),
      preferences: derived.preferences.map(preferenceSignature).sort(),
    });
    appliedRules = derived.applied;
    reservations = derived.reservations;
    preferences = derived.preferences;
    if (signature === previousSignature || !derived.applied.length) break;
    previousSignature = signature;
  }

  const unresolved = array(scoped?.parityScope?.unresolvedRequirements);
  const unfilled = array(plan?.unfilled);
  const lockIssues = array(plan?.lockIssues);
  const completion = {
    sourceSlots: finite(scoped?.parityScope?.sourceSlots),
    activeSlots: finite(scoped?.parityScope?.activeSlots),
    ignoredSlots: finite(scoped?.parityScope?.ignoredSlots),
    unresolvedRequirements: unresolved.length,
    assigned: array(plan?.assignments).length,
    unfilled: unfilled.length,
    lockIssues: lockIssues.length,
  };

  return Object.freeze({
    ...plan,
    parity: Object.freeze({
      mode: 'echobase-parity-command-center',
      iterations,
      phaseLayout: options.phaseLayout || {},
      ignored: scoped.parityScope.ignored,
      requirementOverrides: scoped.parityScope.overriddenSlots,
      unresolvedRequirements: Object.freeze(unresolved),
      groupingRulesApplied: Object.freeze(appliedRules),
      effectiveReservations: Object.freeze(reservations),
      effectivePreferences: Object.freeze(preferences),
      completion: Object.freeze(completion),
      previewReady: unresolved.length === 0,
      publishReady: unresolved.length === 0 && unfilled.length === 0 && lockIssues.length === 0,
    }),
  });
}
