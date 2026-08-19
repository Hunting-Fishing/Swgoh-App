function clean(value) { return String(value ?? "").trim(); }

const GATE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "opening-tempo",
    label: "OPENING TEMPO",
    signals: Object.freeze(["Turn Meter", "Speed", "Bonus Turn", "Start of Battle"]),
    instruction: "Verify the chosen counter can survive or control the opening turn-order swing before relying on historical win rate.",
  }),
  Object.freeze({
    id: "revive",
    label: "REVIVE",
    signals: Object.freeze(["Revive"]),
    instruction: "Verify the counter has a reliable answer to revival or enough control/damage to avoid a stalled cleanup.",
  }),
  Object.freeze({
    id: "sustain",
    label: "SUSTAIN",
    signals: Object.freeze(["Health Recovery", "Protection Recovery", "Max Health", "Max Protection"]),
    instruction: "Verify damage output and healing/protection disruption are sufficient for the added sustain profile.",
  }),
  Object.freeze({
    id: "control",
    label: "CONTROL",
    signals: Object.freeze(["Stun", "Fear", "Daze", "Ability Block", "Cooldown"]),
    instruction: "Verify the counter remains functional when key abilities, assists, turns, or cooldowns are disrupted.",
  }),
  Object.freeze({
    id: "debuff-resilience",
    label: "DEBUFF RESILIENCE",
    signals: Object.freeze(["Cleanse", "Dispel", "Tenacity"]),
    instruction: "Verify the counter does not depend on debuffs or buffs that the datacron can remove or resist.",
  }),
  Object.freeze({
    id: "damage-pressure",
    label: "DAMAGE PRESSURE",
    signals: Object.freeze(["Offense", "Critical Chance", "Critical Damage"]),
    instruction: "Verify the counter can absorb the increased damage profile without losing a required unit before its win condition starts.",
  }),
]);

function tacticalRiskGates(mechanics = []) {
  const present = new Set((Array.isArray(mechanics) ? mechanics : []).map(clean).filter(Boolean));
  const gates = [];
  for (const definition of GATE_DEFINITIONS) {
    const evidence = definition.signals.filter((signal) => present.has(signal));
    if (!evidence.length) continue;
    gates.push(Object.freeze({
      id: definition.id,
      label: definition.label,
      evidence: Object.freeze(evidence),
      instruction: definition.instruction,
    }));
  }
  return Object.freeze(gates);
}

function counterEvidenceStatus(assessment = {}) {
  if (assessment?.selected !== true) {
    return Object.freeze({
      datacronKnown: false,
      datacronSpecificCounterEvidence: false,
      label: "DATACRON ASSIGNMENT UNKNOWN",
      note: "Do not adjust historical counter confidence from opponent inventory alone.",
    });
  }
  return Object.freeze({
    datacronKnown: true,
    datacronSpecificCounterEvidence: false,
    label: "DATACRON NOT MODELED IN WIN RATE",
    note: "Historical counter evidence remains useful, but this verified current datacron is a separate tactical condition until datacron-specific battle samples are collected.",
  });
}

export { counterEvidenceStatus, GATE_DEFINITIONS, tacticalRiskGates };
