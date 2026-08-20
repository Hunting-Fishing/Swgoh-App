import { JOURNEY_PRESETS } from './farm-presets.js';

const BASE_ID_ALIASES = Object.freeze({
  ASAJJVENTRESS: 'ASAJVENTRESS',
});

export function canonicalJourneyBaseId(value) {
  const source = String(value || '').trim().toUpperCase();
  return BASE_ID_ALIASES[source] || source;
}

export function canonicalizeJourneyPresets(presets = JOURNEY_PRESETS) {
  let changed = 0;
  for (const event of Array.isArray(presets) ? presets : []) {
    const targetSource = String(event?.targetBaseId || '').trim().toUpperCase();
    const targetCanonical = canonicalJourneyBaseId(targetSource);
    if (targetSource && targetCanonical !== targetSource) {
      event.targetSourceBaseId ||= targetSource;
      event.targetBaseId = targetCanonical;
      changed += 1;
    }
    for (const requirement of Array.isArray(event?.requirements) ? event.requirements : []) {
      const source = String(requirement?.baseId || '').trim().toUpperCase();
      const canonical = canonicalJourneyBaseId(source);
      if (!source || canonical === source) continue;
      requirement.sourceBaseId ||= source;
      requirement.baseId = canonical;
      changed += 1;
    }
  }
  return changed;
}

export function auditJourneyPresetsAgainstCatalog(presets = JOURNEY_PRESETS, catalog = []) {
  const known = new Set((Array.isArray(catalog) ? catalog : [])
    .map((unit) => String(unit?.baseId || unit?.id || '').trim().toUpperCase())
    .filter(Boolean));
  const unresolved = [];
  for (const event of Array.isArray(presets) ? presets : []) {
    const targetBaseId = canonicalJourneyBaseId(event?.targetBaseId);
    if (targetBaseId && !known.has(targetBaseId)) {
      unresolved.push(Object.freeze({
        eventId: event.id,
        eventName: event.name,
        kind: 'target',
        baseId: targetBaseId,
        sourceBaseId: event.targetSourceBaseId || event.targetBaseId || targetBaseId,
      }));
    }
    for (const requirement of Array.isArray(event?.requirements) ? event.requirements : []) {
      const baseId = canonicalJourneyBaseId(requirement?.baseId);
      if (!baseId || known.has(baseId)) continue;
      unresolved.push(Object.freeze({
        eventId: event.id,
        eventName: event.name,
        kind: 'requirement',
        baseId,
        sourceBaseId: requirement.sourceBaseId || requirement.baseId || baseId,
        type: requirement.type,
        tier: requirement.tier,
      }));
    }
  }
  return Object.freeze({
    valid: unresolved.length === 0,
    unresolved: Object.freeze(unresolved),
    unresolvedCount: unresolved.length,
  });
}

canonicalizeJourneyPresets();

export { BASE_ID_ALIASES };
