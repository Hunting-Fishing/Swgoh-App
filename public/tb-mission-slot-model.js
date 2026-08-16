import { normalizeRosterName } from "./tb-mission-intelligence.js";

const positiveInt = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

function memberIdentity(member = {}) {
  const baseId = String(member?.baseId || "").trim();
  const name = normalizeRosterName(member?.name || "");
  return baseId ? `id:${baseId}` : name ? `name:${name}` : "";
}

function unitIdentity(unit = {}) {
  const baseId = String(unit?.baseId || "").trim();
  const name = normalizeRosterName(unit?.name || "");
  return baseId ? `id:${baseId}` : name ? `name:${name}` : "";
}

export function missionSquadSize(mission = {}) {
  const entry = mission?.entry || {};
  const explicit = positiveInt(entry.squadSize, 0);
  if (explicit) return explicit;
  return String(entry.unitType || "Character").toLowerCase() === "character" ? 5 : 0;
}

export function missionSlotModel(mission = {}, eligibility = {}) {
  const entry = mission?.entry || {};
  const squadSize = missionSquadSize(mission);
  const mandatoryMembers = Array.isArray(entry.mandatoryMembers) ? entry.mandatoryMembers : [];
  const mandatoryIdentities = new Set(mandatoryMembers.map(memberIdentity).filter(Boolean));
  const mandatorySlots = mandatoryMembers.length;
  const flexSlots = squadSize > 0 ? Math.max(0, squadSize - mandatorySlots) : 0;
  const candidates = Array.isArray(eligibility?.candidates) ? eligibility.candidates : [];
  const flexCandidates = candidates.filter((unit) => {
    const identity = unitIdentity(unit);
    return !identity || !mandatoryIdentities.has(identity);
  });
  const fixedSquad = squadSize > 0 && mandatorySlots >= squadSize;
  const flexShortfall = Math.max(0, flexSlots - flexCandidates.length);

  return Object.freeze({
    squadSize,
    mandatorySlots,
    flexSlots,
    fixedSquad,
    candidates: Object.freeze([...candidates]),
    flexCandidates: Object.freeze(flexCandidates),
    flexReady: flexShortfall === 0,
    flexShortfall,
  });
}

export function missionSlotSummary(mission = {}, eligibility = {}) {
  const model = missionSlotModel(mission, eligibility);
  if (!model.squadSize) return "Variable squad size";
  if (model.fixedSquad) return `${model.squadSize} slots · ${model.mandatorySlots} required · fixed squad`;
  if (!model.mandatorySlots) return `${model.squadSize} flexible slots`;
  return `${model.squadSize} slots · ${model.mandatorySlots} required + ${model.flexSlots} flex`;
}
