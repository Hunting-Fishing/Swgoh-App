const clean = (value) => String(value ?? '').trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function normalizedDatacronState(value, datacron = null) {
  const text = clean(value).toLowerCase();
  if (text === 'none') return 'none';
  if (text === 'assigned') return datacron && typeof datacron === 'object' ? 'assigned' : 'unknown';
  if (datacron && typeof datacron === 'object') return 'assigned';
  return 'unknown';
}

function normalizedAffix(affix = {}) {
  const tier = finite(affix?.tier);
  const abilityId = clean(affix?.abilityId || affix?.ability_id);
  const targetRule = clean(affix?.targetRule || affix?.target_rule);
  const requiredRelicTier = finite(affix?.requiredRelicTier ?? affix?.required_relic_tier);
  const statId = clean(affix?.statId || affix?.stat_id || affix?.statType || affix?.stat_type || affix?.id);
  const statValue = finite(affix?.statValue ?? affix?.stat_value ?? affix?.value ?? affix?.amount);
  return Object.freeze({ tier, abilityId, targetRule, requiredRelicTier, statId, statValue });
}

function affixKey(affix = {}) {
  const row = normalizedAffix(affix);
  return [
    row.tier ?? '',
    row.abilityId,
    row.targetRule,
    row.requiredRelicTier ?? '',
    row.statId,
    row.statValue ?? '',
  ].join(':');
}

function normalizeDatacronEvidence(datacron = null, stateInput = '') {
  const state = normalizedDatacronState(stateInput, datacron);
  if (state !== 'assigned') {
    return Object.freeze({
      state,
      setId: '',
      templateId: '',
      level: null,
      affixes: Object.freeze([]),
      signature: state === 'none' ? 'DC:NONE' : 'DC:UNKNOWN',
    });
  }
  const setId = clean(datacron?.setId ?? datacron?.set_id);
  const templateId = clean(datacron?.templateId ?? datacron?.template_id);
  const level = finite(datacron?.level) ?? (Array.isArray(datacron?.affixes) ? datacron.affixes.length : null);
  const affixes = (Array.isArray(datacron?.affixes) ? datacron.affixes : [])
    .map(normalizedAffix)
    .sort((a, b) => affixKey(a).localeCompare(affixKey(b)));
  const signature = `DC:SET=${setId || '?'}|TPL=${templateId || '?'}|L=${level ?? '?'}|AFF=${affixes.map(affixKey).join(';') || 'NONE'}`;
  return Object.freeze({
    state: 'assigned',
    setId,
    templateId,
    level,
    affixes: Object.freeze(affixes),
    signature,
  });
}

function datacronEvidenceSignature(datacron = null, state = '') {
  return normalizeDatacronEvidence(datacron, state).signature;
}

function datacronMatchupSignature({ defenderDatacron = null, defenderState = '', attackerDatacron = null, attackerState = '' } = {}) {
  return `${datacronEvidenceSignature(defenderDatacron, defenderState)}>>${datacronEvidenceSignature(attackerDatacron, attackerState)}`;
}

export {
  affixKey,
  datacronEvidenceSignature,
  datacronMatchupSignature,
  normalizeDatacronEvidence,
  normalizedAffix,
  normalizedDatacronState,
};
