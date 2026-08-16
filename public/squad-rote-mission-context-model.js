import { guildRoteMissionEvidence } from "./guild-rote-mission-coverage-model.js";
import { missionRosterEligibility } from "./rote-mission-node-eligibility.js";
import { missionStrategyCoverage } from "./tb-strategy-coverage.js";
import { normalizeRosterName, recommendationRosterFit } from "./tb-mission-intelligence.js";

const normalize = normalizeRosterName;
const asArray = (value) => Array.isArray(value) ? value : [];

function rosterUnits(body = {}) {
  return [...asArray(body.units), ...asArray(body.ships)];
}

function rosterMaps(body = {}) {
  const units = rosterUnits(body);
  return {
    byId: new Map(units.map((unit) => [String(unit?.baseId || ""), unit]).filter(([id]) => id)),
    byName: new Map(units.map((unit) => [normalize(unit?.name), unit]).filter(([name]) => name)),
  };
}

function memberFromBaseId(baseId, maps) {
  const unit = maps.byId.get(String(baseId || "")) || null;
  return Object.freeze({
    baseId: String(baseId || ""),
    name: String(unit?.name || baseId || "Unknown"),
  });
}

function selectedContainsRequirement(baseIds, mandatoryRow) {
  const ids = new Set(asArray(baseIds).map(String));
  if (mandatoryRow?.baseId && ids.has(String(mandatoryRow.baseId))) return true;
  const requiredName = normalize(mandatoryRow?.name || mandatoryRow?.member?.name);
  if (!requiredName) return false;
  const selectedNames = asArray(baseIds).map((baseId) => normalize(mandatoryRow?.rosterMaps?.byId?.get(String(baseId))?.name));
  return selectedNames.includes(requiredName);
}

function mandatorySelectionStatus(baseIds, mandatoryRows, maps) {
  const ids = new Set(asArray(baseIds).map(String));
  return asArray(mandatoryRows).map((row) => {
    const baseId = String(row.baseId || row.member?.baseId || row.unit?.baseId || "");
    const name = String(row.name || row.member?.name || row.unit?.name || baseId || "Required unit");
    const selectedById = Boolean(baseId && ids.has(baseId));
    const normalizedName = normalize(name);
    const selectedByName = !selectedById && normalizedName
      ? asArray(baseIds).some((selectedBaseId) => normalize(maps.byId.get(String(selectedBaseId))?.name) === normalizedName)
      : false;
    return Object.freeze({
      ...row,
      baseId,
      name,
      selected: selectedById || selectedByName,
      satisfied: Boolean((selectedById || selectedByName) && row.legal),
    });
  });
}

export function squadTemplateEvidence(recommendation = null) {
  if (!recommendation) return Object.freeze({ status: "manual", label: "Manual squad", verifiedLegal: false, sourceType: "manual" });
  if (recommendation.verifiedLegal) {
    return Object.freeze({ status: "verified-legal", label: "Verified legal template", verifiedLegal: true, sourceType: recommendation.sourceType || "verified" });
  }
  return Object.freeze({
    status: "planning-template",
    label: "Planning template",
    verifiedLegal: false,
    sourceType: recommendation.sourceType || "planning-template",
  });
}

export function assessSquadForRoteMission(body = {}, mission = {}, baseIds = [], recommendation = null) {
  const selectedBaseIds = [...new Set(asArray(baseIds).map(String).filter(Boolean))];
  const maps = rosterMaps(body);
  const currentRecommendation = {
    name: recommendation?.name || "Current Workbench Squad",
    members: selectedBaseIds.map((baseId) => memberFromBaseId(baseId, maps)),
  };
  const fit = recommendationRosterFit(body, mission, currentRecommendation);
  const eligibility = missionRosterEligibility(body, mission);
  const evidence = guildRoteMissionEvidence(mission);
  const strategy = missionStrategyCoverage(mission);
  const template = squadTemplateEvidence(recommendation);
  const mandatory = mandatorySelectionStatus(selectedBaseIds, eligibility.mandatory, maps);
  const mandatoryMissing = mandatory.filter((row) => !row.selected);
  const mandatoryBlocked = mandatory.filter((row) => row.selected && !row.legal);
  const illegalSelected = fit.rows.filter((row) => !row.owned || !row.legal);
  const selectedSet = new Set(selectedBaseIds);
  const alternatives = asArray(eligibility.candidates)
    .filter((unit) => unit?.baseId && !selectedSet.has(String(unit.baseId)))
    .slice()
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0) || Number(b.speed || 0) - Number(a.speed || 0) || String(a.name || "").localeCompare(String(b.name || "")));
  const squadSize = Number(eligibility.squadSize || eligibility.rule?.squadSize || 0);
  const sizeReady = squadSize > 0 ? selectedBaseIds.length >= squadSize : selectedBaseIds.length > 0;
  const allSelectedMeetEncodedGate = selectedBaseIds.length > 0 && illegalSelected.length === 0;
  const mandatoryReady = mandatory.every((row) => row.satisfied);
  const exactEntrySquad = evidence === "exact" && sizeReady && allSelectedMeetEncodedGate && mandatoryReady;
  const knownGateSquad = evidence !== "exact" && sizeReady && allSelectedMeetEncodedGate && mandatoryReady;

  return Object.freeze({
    mission,
    evidence,
    strategy,
    template,
    selectedBaseIds: Object.freeze(selectedBaseIds),
    fit,
    eligibility,
    squadSize,
    sizeReady,
    allSelectedMeetEncodedGate,
    mandatoryReady,
    exactEntrySquad,
    knownGateSquad,
    illegalSelected: Object.freeze(illegalSelected),
    mandatory: Object.freeze(mandatory),
    mandatoryMissing: Object.freeze(mandatoryMissing),
    mandatoryBlocked: Object.freeze(mandatoryBlocked),
    alternatives: Object.freeze(alternatives),
    legalSelectedCount: fit.rows.filter((row) => row.owned && row.legal).length,
  });
}

export function replacementCandidates(assessment = {}, replacingBaseId = "", limit = 6) {
  const replacing = String(replacingBaseId || "");
  const selectedWithoutTarget = new Set(asArray(assessment.selectedBaseIds).filter((baseId) => String(baseId) !== replacing).map(String));
  const mandatoryMissingIds = new Set(asArray(assessment.mandatoryMissing).map((row) => String(row.baseId || "")).filter(Boolean));
  return asArray(assessment.alternatives)
    .filter((unit) => !selectedWithoutTarget.has(String(unit.baseId || "")))
    .sort((a, b) => Number(mandatoryMissingIds.has(String(b.baseId || ""))) - Number(mandatoryMissingIds.has(String(a.baseId || "")))
      || Number(b.power || 0) - Number(a.power || 0)
      || Number(b.speed || 0) - Number(a.speed || 0)
      || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, Math.max(1, Number(limit || 6)));
}
