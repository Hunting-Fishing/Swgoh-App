import { roteMissionMap } from './rote-mission-map-registry.js';
import {
  isRoteInfrastructureNode,
  missionEntryRule,
  resolveRoteMissionNodes,
} from './rote-mission-node-eligibility.js';
import { evaluateTbMissionReadinessPolicyV2 } from './tb-mission-readiness-policy-v2.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function catalogIndexes(catalog = {}) {
  const units = array(catalog?.units);
  return Object.freeze({
    byId: new Map(units.map((unit) => [text(unit?.baseId), unit]).filter(([id]) => id)),
    byName: new Map(units.map((unit) => [text(unit?.name).toLowerCase(), unit]).filter(([name]) => name)),
  });
}

function catalogUnit(indexes, baseId = '', name = '') {
  const id = text(baseId);
  if (id && indexes.byId.has(id)) return indexes.byId.get(id);
  const key = text(name).toLowerCase();
  return key ? indexes.byName.get(key) || null : null;
}

function unitAnchor(indexes, input = {}, role = 'mandatory') {
  const unit = catalogUnit(indexes, input?.baseId, input?.name) || {};
  return Object.freeze({
    role,
    baseId: text(input?.baseId || unit?.baseId),
    name: text(input?.name || unit?.name || input?.baseId || 'Required unit'),
    image: text(unit?.image),
    unitType: text(unit?.unitType || 'Character'),
    starsMin: input?.starsMin ?? null,
    gearMin: input?.gearMin ?? null,
    relicMin: input?.relicMin ?? null,
    powerMin: input?.powerMin ?? null,
  });
}

function mandatoryAnchors(rule, indexes) {
  return Object.freeze(array(rule?.mandatory).map((member) => unitAnchor(indexes, member, 'mandatory')));
}

function alternativeAnchors(rule, indexes) {
  const mandatoryIds = new Set(array(rule?.mandatory).map((member) => text(member?.baseId)).filter(Boolean));
  const alternatives = array(rule?.allowedBaseIds)
    .map(text)
    .filter(Boolean)
    .filter((baseId) => !mandatoryIds.has(baseId));
  return Object.freeze(alternatives.map((baseId) => unitAnchor(indexes, {
    baseId,
    starsMin: rule?.threshold?.find?.(() => false) ?? null,
  }, 'alternative')));
}

function rewardBadges(node = {}, mission = {}) {
  const values = [...array(mission?.rewards), text(node?.reward)].filter(Boolean);
  return Object.freeze([...new Set(values.map(text).filter(Boolean))]);
}

function selectedRecommendation(node = {}, mission = {}) {
  const recommendations = array(mission?.recommendations);
  const teamId = text(node?.teamId);
  if (teamId) {
    const exact = recommendations.find((recommendation) => text(recommendation?.id) === teamId);
    if (exact) return exact;
  }
  return recommendations[0] || null;
}

function tacticalMissionNode(node, indexes, body, catalog) {
  const mission = node?.mission || null;
  const infrastructure = isRoteInfrastructureNode(node);
  if (infrastructure || !mission) {
    return Object.freeze({
      id: text(node?.id),
      type: text(node?.type),
      top: Number(node?.top || 0),
      left: Number(node?.left || 0),
      label: text(node?.label),
      missionId: text(node?.missionId),
      infrastructure,
      mission: null,
      requiredUnits: Object.freeze([]),
      alternativeUnits: Object.freeze([]),
      requiredCategories: Object.freeze([]),
      rewardBadges: Object.freeze(text(node?.reward) ? [text(node.reward)] : []),
      assetAnchors: Object.freeze({ portraits: Object.freeze([]), missionType: text(node?.type) }),
      readiness: null,
      note: text(node?.note),
    });
  }

  const rule = missionEntryRule(mission);
  const requiredUnits = mandatoryAnchors(rule, indexes);
  const alternativeUnits = alternativeAnchors(rule, indexes);
  const recommendation = selectedRecommendation(node, mission);
  const readiness = body
    ? evaluateTbMissionReadinessPolicyV2(body, mission, recommendation, catalog)
    : null;
  const portraitIds = [...requiredUnits, ...alternativeUnits].map((unit) => unit.baseId).filter(Boolean);

  return Object.freeze({
    id: text(node?.id),
    type: text(node?.type),
    top: Number(node?.top || 0),
    left: Number(node?.left || 0),
    label: text(node?.label || mission?.name),
    missionId: text(mission?.id),
    infrastructure: false,
    mission,
    entryRule: rule,
    requiredUnits,
    alternativeUnits,
    requiredCategories: Object.freeze([...array(rule?.categories)]),
    rewardBadges: rewardBadges(node, mission),
    assetAnchors: Object.freeze({
      portraits: Object.freeze(portraitIds),
      missionType: text(mission?.missionType || node?.type),
    }),
    recommendationId: text(recommendation?.id),
    readiness,
    note: text(node?.note),
  });
}

export function buildRoteTacticalPlanetModel(planetId, options = {}) {
  const id = text(planetId);
  const map = options.map || roteMissionMap(id);
  if (!map) return null;

  const resolved = resolveRoteMissionNodes(id, map);
  const catalog = options.catalog || {};
  const indexes = catalogIndexes(catalog);
  const nodes = resolved.nodes.map((node) => tacticalMissionNode(node, indexes, options.body || null, catalog));

  return Object.freeze({
    planetId: id,
    background: text(map?.background),
    nodes: Object.freeze(nodes),
    unresolvedNodeIds: Object.freeze([...resolved.unresolvedNodeIds]),
    unassignedMissionIds: Object.freeze([...resolved.unassignedMissionIds]),
    sourceMap: map,
  });
}

export function roteTacticalMissionNode(planetId, missionId, options = {}) {
  const model = buildRoteTacticalPlanetModel(planetId, options);
  if (!model) return null;
  return model.nodes.find((node) => node.missionId === text(missionId)) || null;
}
