import { roteMissionsForPlanet } from "./rote-mission-data.js";
import { normalizeRoteMissions } from "./rote-mission-overrides.js";
import {
  legalRosterCandidates,
  mandatoryRosterStatus,
  missionRosterEntrySummary,
} from "./tb-mission-intelligence.js";

const INFRASTRUCTURE_TYPES = new Set(["deployment", "operations"]);
const STOP_WORDS = new Set([
  "combat", "mission", "special", "fleet", "unlock", "source", "node", "the", "and", "plus", "with", "generic",
]);

const normalizeText = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const significantTokens = (value) => normalizeText(value)
  .split(/\s+/)
  .filter((token) => token && !STOP_WORDS.has(token));

const normalizedNodeType = (type) => type === "reva" ? "special" : String(type || "combat");

function withRoteNeutralAlignment(mission = {}) {
  if (String(mission?.entry?.unitType || "Character").toLowerCase() !== "character") return mission;
  const entry = mission.entry || {};
  let allowedAlignments = Array.isArray(entry.allowedAlignments) ? [...entry.allowedAlignments] : [];
  if (allowedAlignments.length) {
    if (!allowedAlignments.some((value) => String(value).toLowerCase() === "neutral")) allowedAlignments.push("Neutral");
  } else if (entry.alignment && entry.alignment !== "Mixed") {
    allowedAlignments = [String(entry.alignment), "Neutral"];
  } else {
    allowedAlignments = ["Light", "Dark", "Neutral"];
  }
  return {
    ...mission,
    entry: {
      ...entry,
      alignment: null,
      allowedAlignments,
    },
  };
}

export function normalizedRoteMissionsForPlanet(planetId) {
  return normalizeRoteMissions(roteMissionsForPlanet(planetId)).map(withRoteNeutralAlignment);
}

function missionSearchText(mission) {
  return [
    mission?.name,
    ...(mission?.entry?.mandatoryMembers || []).map((member) => member?.name),
    ...(mission?.entry?.requiredCategories || []),
  ].filter(Boolean).join(" ");
}

function nodeMissionScore(node, mission) {
  if (!node || !mission || INFRASTRUCTURE_TYPES.has(node.type)) return Number.NEGATIVE_INFINITY;
  if (node.missionId) return node.missionId === mission.id ? 1_000_000 : Number.NEGATIVE_INFINITY;

  const nodeType = normalizedNodeType(node.type);
  const missionType = normalizedNodeType(mission.missionType);
  const nodeTokens = significantTokens(node.label);
  const missionTokens = significantTokens(missionSearchText(mission));
  const missionTokenSet = new Set(missionTokens);
  let score = nodeType === missionType ? 40 : 0;

  if (nodeType === "fleet" && missionType === "fleet") score += 120;
  if (nodeType === "special" && missionType === "special") score += 45;

  for (const token of nodeTokens) {
    if (missionTokenSet.has(token)) score += 24;
  }

  const nodeText = normalizeText(node.label);
  for (const member of mission?.entry?.mandatoryMembers || []) {
    const memberText = normalizeText(member?.name);
    if (memberText && nodeText.includes(memberText)) score += 90;
    else {
      const memberTokens = significantTokens(member?.name);
      const hits = memberTokens.filter((token) => nodeTokens.includes(token)).length;
      score += hits * 22;
    }
  }

  for (const category of mission?.entry?.requiredCategories || []) {
    const categoryText = normalizeText(category);
    if (categoryText && nodeText.includes(categoryText)) score += 65;
  }

  const genericNode = nodeTokens.length === 0 || nodeText === "combat mission" || nodeText === "fleet mission";
  const genericMission = /combat mission \d+$/i.test(String(mission?.name || ""));
  if (genericNode && genericMission && nodeType === missionType) score += 55;
  if (genericNode && !genericMission && nodeType === "combat" && missionType === "combat") score -= 18;

  return score;
}

function tacticalNodeNote(node, mission) {
  const existing = String(node?.note || "").trim();
  const commandTag = String(mission?.tactical?.commandTag || "").trim();
  const presetPrefix = String(mission?.tactical?.presetPrefix || "").trim();
  if (!commandTag && !presetPrefix) return existing;
  const tactical = [
    commandTag ? `TACTICAL: ${commandTag}` : "",
    presetPrefix ? `SQUAD PRESET: ${presetPrefix}` : "",
  ].filter(Boolean).join(" · ");
  return [existing, tactical].filter(Boolean).join(" · ");
}

export function resolveRoteMissionNodes(planetId, map) {
  const missions = normalizedRoteMissionsForPlanet(planetId);
  const usedMissionIds = new Set();
  const resolvedByNodeId = new Map();
  const sourceNodes = Array.isArray(map?.nodes) ? map.nodes : [];

  for (const node of sourceNodes) {
    if (INFRASTRUCTURE_TYPES.has(node.type) || !node.missionId) continue;
    const mission = missions.find((candidate) => candidate.id === node.missionId);
    if (!mission || usedMissionIds.has(mission.id)) continue;
    resolvedByNodeId.set(node.id, mission);
    usedMissionIds.add(mission.id);
  }

  const unresolvedMissionNodes = sourceNodes
    .filter((node) => !INFRASTRUCTURE_TYPES.has(node.type) && !resolvedByNodeId.has(node.id))
    .sort((a, b) => significantTokens(b.label).length - significantTokens(a.label).length);

  for (const node of unresolvedMissionNodes) {
    const candidates = missions
      .filter((mission) => !usedMissionIds.has(mission.id))
      .map((mission) => ({ mission, score: nodeMissionScore(node, mission) }))
      .sort((a, b) => b.score - a.score || String(a.mission.id).localeCompare(String(b.mission.id)));
    const best = candidates[0];
    if (!best || !Number.isFinite(best.score) || best.score < 20) continue;
    resolvedByNodeId.set(node.id, best.mission);
    usedMissionIds.add(best.mission.id);
  }

  const nodes = sourceNodes.map((node) => {
    const mission = resolvedByNodeId.get(node.id) || null;
    return Object.freeze({
      ...node,
      missionId: mission?.id || node.missionId || "",
      note: tacticalNodeNote(node, mission),
      mission,
    });
  });

  const unresolvedNodeIds = nodes
    .filter((node) => !INFRASTRUCTURE_TYPES.has(node.type) && !node.mission)
    .map((node) => node.id);
  const unassignedMissionIds = missions
    .filter((mission) => !usedMissionIds.has(mission.id))
    .map((mission) => mission.id);

  return Object.freeze({
    planetId: String(planetId || ""),
    map,
    missions: Object.freeze(missions),
    nodes: Object.freeze(nodes),
    unresolvedNodeIds: Object.freeze(unresolvedNodeIds),
    unassignedMissionIds: Object.freeze(unassignedMissionIds),
  });
}

export function missionEntryRule(mission) {
  const entry = mission?.entry || {};
  const unitType = String(entry.unitType || "Character");
  const squadSize = Number(entry.squadSize || (unitType === "Character" ? 5 : 0));
  const threshold = [];
  if (entry.starsMin != null) threshold.push(`${Number(entry.starsMin)}★`);
  if (entry.relicMin != null && unitType === "Character") threshold.push(`R${Number(entry.relicMin)}+`);
  else if (entry.gearMin != null && unitType === "Character") threshold.push(`G${Number(entry.gearMin)}+`);
  if (entry.powerMin != null) threshold.push(`${Number(entry.powerMin).toLocaleString()}+ GP`);

  const alignments = entry.allowedAlignments?.length
    ? entry.allowedAlignments.map(String)
    : entry.alignment && entry.alignment !== "Mixed" ? [String(entry.alignment)] : [];
  const mandatory = (entry.mandatoryMembers || []).map((member) => Object.freeze({
    name: String(member?.name || member?.baseId || "Required unit"),
    baseId: String(member?.baseId || ""),
    starsMin: member?.starsMin ?? entry.starsMin ?? null,
    gearMin: member?.gearMin ?? entry.gearMin ?? null,
    relicMin: member?.relicMin ?? entry.relicMin ?? null,
    powerMin: member?.powerMin ?? entry.powerMin ?? null,
  }));

  return Object.freeze({
    verified: Boolean(entry.verified),
    unitType,
    squadSize,
    threshold: Object.freeze(threshold),
    alignments: Object.freeze(alignments),
    categories: Object.freeze([...(entry.requiredCategories || [])]),
    categoryMode: entry.categoryMode || "all",
    mandatory: Object.freeze(mandatory),
    allowedBaseIds: Object.freeze([...(entry.allowedBaseIds || [])]),
    requiredBaseIds: Object.freeze([...(entry.requiredBaseIds || [])]),
    notes: String(entry.notes || ""),
  });
}

export function missionRosterEligibility(body, mission) {
  const rule = missionEntryRule(mission);
  if (!body || !mission?.entry?.verified) {
    return Object.freeze({
      rule,
      loaded: false,
      ready: false,
      percent: 0,
      candidates: Object.freeze([]),
      mandatory: Object.freeze([]),
      squadSize: rule.squadSize,
      lockedSlots: rule.mandatory.length,
      selectableSlots: Math.max(0, Number(rule.squadSize || 0) - rule.mandatory.length),
    });
  }

  const entrySummary = missionRosterEntrySummary(body, mission, rule.squadSize || null);
  const mandatory = mandatoryRosterStatus(body, mission).rows.map((row) => Object.freeze({
    ...row,
    name: String(row.member?.name || row.unit?.name || row.member?.baseId || "Required unit"),
    baseId: String(row.member?.baseId || row.unit?.baseId || ""),
  }));
  const candidates = legalRosterCandidates(body, mission);

  return Object.freeze({
    rule,
    loaded: true,
    ready: Boolean(entrySummary.ready),
    percent: Number(entrySummary.percent || 0),
    candidates: Object.freeze(candidates),
    mandatory: Object.freeze(mandatory),
    squadSize: Number(entrySummary.squadSize || rule.squadSize || 0),
    lockedSlots: Number(entrySummary.lockedSlots || mandatory.length || 0),
    poolTarget: Number(entrySummary.poolTarget || 0),
    selectableSlots: Number(entrySummary.selectableSlots || entrySummary.poolTarget || 0),
  });
}

export function isRoteInfrastructureNode(node) {
  return INFRASTRUCTURE_TYPES.has(node?.type);
}
