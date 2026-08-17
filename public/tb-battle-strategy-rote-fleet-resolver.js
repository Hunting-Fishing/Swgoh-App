import { roteFleetEntryAudit } from "./rote-fleet-entry-audit-data.js";
import { roteFleetBattleStrategyForMission as rawFleetStrategy } from "./tb-battle-strategy-rote-fleet-data.js";

const SHIP_BASE_IDS = Object.freeze({
  Scythe: "SCYTHE",
  "Lando's Millennium Falcon": "MILLENNIUMFALCONPRISTINE",
  Outrider: "OUTRIDER",
  Executor: "CAPITALEXECUTOR",
  Profundity: "CAPITALPROFUNDITY",
  Negotiator: "CAPITALNEGOTIATOR",
  Ghost: "GHOST",
  "Gauntlet Starfighter": "GAUNTLETSTARFIGHTER",
  "Imperial TIE Fighter": "TIEFIGHTERIMPERIAL",
});

function auditedKeyUnits(strategy, audit) {
  const rows = (strategy.keyUnits || []).map((unit) => ({
    ...unit,
    baseId: SHIP_BASE_IDS[unit.name] || String(unit.baseId || ""),
  }));

  for (const member of audit?.mandatoryMembers || []) {
    const baseId = String(member.baseId || SHIP_BASE_IDS[member.name] || "");
    const existing = rows.find((row) => (baseId && String(row.baseId || "") === baseId) || row.name === member.name);
    if (existing) {
      existing.baseId = baseId || existing.baseId || "";
      existing.importance = "critical";
      continue;
    }
    rows.push({
      name: member.name,
      baseId,
      importance: "critical",
      reason: "This ship is required by the audited ROTE mission-entry rule; battle recommendations do not override entry legality.",
    });
  }
  return rows;
}

function auditedStages(strategy, audit) {
  if (!audit) return strategy.stages || [];
  return (strategy.stages || []).map((stage, index) => {
    if (index !== 0) return stage;
    const steps = Array.isArray(stage.steps) ? [...stage.steps] : [];
    if (!steps.some((step) => step.id === "entry-audit")) {
      steps.unshift({
        id: "entry-audit",
        instruction: `Entry gate: ${audit.sourceRequirement}. This is the legal mission-entry rule and is separate from recommended fleet composition.`,
        priority: "critical",
      });
    }
    return { ...stage, steps };
  });
}

export function roteFleetBattleStrategyForMission(missionId) {
  const strategy = rawFleetStrategy(missionId);
  if (!strategy) return null;
  const audit = roteFleetEntryAudit(missionId);
  return {
    ...strategy,
    keyUnits: auditedKeyUnits(strategy, audit),
    stages: auditedStages(strategy, audit),
    entryAudit: audit ? {
      sourceRequirement: audit.sourceRequirement,
      allowedAlignments: [...audit.allowedAlignments],
      mandatoryBaseIds: audit.mandatoryMembers.map((member) => member.baseId),
      lastVerified: audit.lastVerified,
    } : null,
  };
}
