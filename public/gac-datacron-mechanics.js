function clean(value) { return String(value ?? "").trim(); }

const SIGNALS = Object.freeze([
  { id: "revive", label: "Revive", regex: /\brevive(?:s|d)?\b|\breturn(?:s|ed)? to battle\b/i },
  { id: "bonus-turn", label: "Bonus Turn", regex: /\bbonus turn\b/i },
  { id: "turn-meter", label: "Turn Meter", regex: /\bturn meter\b/i },
  { id: "cooldown", label: "Cooldown", regex: /\bcooldown(?:s)?\b/i },
  { id: "dispel", label: "Dispel", regex: /\bdispel(?:s|led|ling)?\b/i },
  { id: "cleanse", label: "Cleanse", regex: /\bcleanse(?:s|d)?\b|\bremove(?:s|d)? all debuffs\b/i },
  { id: "stun", label: "Stun", regex: /\bstun(?:s|ned|ning)?\b/i },
  { id: "fear", label: "Fear", regex: /\bfear\b/i },
  { id: "daze", label: "Daze", regex: /\bdaze(?:s|d)?\b/i },
  { id: "ability-block", label: "Ability Block", regex: /\bability block\b/i },
  { id: "healing-immunity", label: "Healing Immunity", regex: /\bhealing immunity\b/i },
  { id: "damage-immunity", label: "Damage Immunity", regex: /\bdamage immunity\b/i },
  { id: "health-recovery", label: "Health Recovery", regex: /\brecover(?:s|ed|ing)? [^.!?]{0,45}\bhealth\b|\brestore(?:s|d)? [^.!?]{0,45}\bhealth\b/i },
  { id: "protection-recovery", label: "Protection Recovery", regex: /\brecover(?:s|ed|ing)? [^.!?]{0,45}\bprotection\b|\brestore(?:s|d)? [^.!?]{0,45}\bprotection\b/i },
  { id: "speed", label: "Speed", regex: /\bspeed\b/i },
  { id: "offense", label: "Offense", regex: /\boffense\b/i },
  { id: "defense", label: "Defense", regex: /\bdefense\b/i },
  { id: "max-health", label: "Max Health", regex: /\bmax health\b/i },
  { id: "max-protection", label: "Max Protection", regex: /\bmax protection\b/i },
  { id: "potency", label: "Potency", regex: /\bpotency\b/i },
  { id: "tenacity", label: "Tenacity", regex: /\btenacity\b/i },
  { id: "critical-chance", label: "Critical Chance", regex: /\bcritical chance\b/i },
  { id: "critical-damage", label: "Critical Damage", regex: /\bcritical damage\b/i },
  { id: "stacking", label: "Stacking", regex: /\bstacking\b|\bstacks? of\b/i },
  { id: "start-of-battle", label: "Start of Battle", regex: /\bat the start of battle\b|\bstart of battle\b/i },
  { id: "start-of-turn", label: "Start of Turn", regex: /\bat the start of (?:their|its|the) turn\b|\bstart of turn\b/i },
  { id: "end-of-turn", label: "End of Turn", regex: /\bat the end of (?:their|its|the) turn\b|\bend of turn\b/i },
  { id: "first-time-trigger", label: "First-Time Trigger", regex: /\bthe first time\b|\bfirst time\b/i },
  { id: "whenever-trigger", label: "Whenever Trigger", regex: /\bwhenever\b/i },
]);

function sentenceContaining(text, start, end) {
  const leftBoundary = Math.max(text.lastIndexOf(".", start), text.lastIndexOf("!", start), text.lastIndexOf("?", start));
  const dot = text.indexOf(".", end);
  const exclamation = text.indexOf("!", end);
  const question = text.indexOf("?", end);
  const rightCandidates = [dot, exclamation, question].filter((value) => value >= 0);
  const rightBoundary = rightCandidates.length ? Math.min(...rightCandidates) + 1 : text.length;
  return clean(text.slice(leftBoundary + 1, rightBoundary)).slice(0, 280);
}

function percentages(text) {
  const values = [];
  const regex = /\b(\d+(?:\.\d+)?)%/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    values.push(Object.freeze({ value: Number(match[1]), evidence: match[0] }));
  }
  return Object.freeze(values.slice(0, 12));
}

function parseMechanics(description) {
  const text = clean(description);
  if (!text) {
    return Object.freeze({ known: false, signals: Object.freeze([]), percentages: Object.freeze([]), sourceText: "" });
  }

  const signals = [];
  for (const definition of SIGNALS) {
    const match = definition.regex.exec(text);
    if (!match) continue;
    signals.push(Object.freeze({
      id: definition.id,
      label: definition.label,
      evidence: match[0],
      sentence: sentenceContaining(text, match.index, match.index + match[0].length),
    }));
  }

  return Object.freeze({
    known: true,
    signals: Object.freeze(signals),
    percentages: percentages(text),
    sourceText: text,
  });
}

function parseAffixMechanics(affix = {}) {
  const abilityId = clean(affix?.abilityId);
  const description = clean(affix?.abilityDescription);
  const parsed = parseMechanics(description);
  return Object.freeze({
    abilityId,
    abilityName: clean(affix?.abilityName),
    abilityTextResolved: affix?.abilityTextResolved === true && Boolean(description || clean(affix?.abilityName)),
    ...parsed,
  });
}

function aggregateDatacronMechanics(datacron = {}) {
  const affixes = (Array.isArray(datacron?.affixes) ? datacron.affixes : [])
    .filter((affix) => clean(affix?.abilityId))
    .map(parseAffixMechanics);
  const byId = new Map();
  for (const affix of affixes) {
    for (const signal of affix.signals) {
      if (!byId.has(signal.id)) {
        byId.set(signal.id, Object.freeze({
          id: signal.id,
          label: signal.label,
          evidence: signal.evidence,
          sentence: signal.sentence,
          abilityId: affix.abilityId,
          abilityName: affix.abilityName,
        }));
      }
    }
  }
  return Object.freeze({
    known: affixes.some((affix) => affix.known),
    abilitiesResolved: affixes.filter((affix) => affix.abilityTextResolved).length,
    abilityAffixes: affixes.length,
    signals: Object.freeze([...byId.values()]),
    affixes: Object.freeze(affixes),
  });
}

function mechanicsLabels(datacron, limit = 6) {
  return aggregateDatacronMechanics(datacron).signals.slice(0, Math.max(0, Number(limit) || 0)).map((signal) => signal.label);
}

export {
  SIGNALS,
  aggregateDatacronMechanics,
  mechanicsLabels,
  parseAffixMechanics,
  parseMechanics,
  percentages,
};
