import {
  missionVisualKind,
  TB_MISSION_VISUAL_ASSETS,
} from './tb-visual-assets-data.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function normalizedName(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function catalogIndexes(catalog = {}) {
  const units = array(catalog?.units);
  return Object.freeze({
    byId: new Map(units.map((unit) => [text(unit?.baseId), unit]).filter(([id]) => id)),
    byName: new Map(units.map((unit) => [normalizedName(unit?.name), unit]).filter(([name]) => name)),
  });
}

function catalogUnit(indexes, anchor = {}) {
  const id = text(anchor?.baseId);
  if (id && indexes.byId.has(id)) return indexes.byId.get(id);
  const name = normalizedName(anchor?.name);
  return name ? indexes.byName.get(name) || null : null;
}

function initials(value) {
  return text(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export function resolveRoteTacticalUnitAsset(anchor = {}, catalog = {}) {
  const indexes = catalogIndexes(catalog);
  const unit = catalogUnit(indexes, anchor);
  const src = text(unit?.image || anchor?.image);
  const name = text(unit?.name || anchor?.name || anchor?.baseId || 'Unknown unit');
  return Object.freeze({
    baseId: text(unit?.baseId || anchor?.baseId),
    name,
    src,
    alt: name,
    initials: initials(name),
    status: src ? 'resolved' : 'missing',
    source: src ? (text(unit?.image) ? 'catalog' : 'node-anchor') : 'none',
    fabricated: false,
  });
}

function unitAssets(anchors, catalog) {
  return Object.freeze(array(anchors).map((anchor) => resolveRoteTacticalUnitAsset(anchor, catalog)));
}

export function resolveRoteTacticalNodeAssets(node = {}, catalog = {}) {
  const kind = missionVisualKind(node?.label, node?.type || node?.mission?.missionType);
  const missionIcon = text(TB_MISSION_VISUAL_ASSETS[kind] || TB_MISSION_VISUAL_ASSETS.combat);
  const required = unitAssets(node?.requiredUnits, catalog);
  const alternatives = unitAssets(node?.alternativeUnits, catalog);
  const missingPortraits = [...required, ...alternatives].filter((asset) => asset.status === 'missing');

  return Object.freeze({
    nodeId: text(node?.id),
    missionId: text(node?.missionId),
    kind,
    missionIcon: Object.freeze({
      src: missionIcon,
      status: missionIcon ? 'resolved' : 'missing',
      source: missionIcon ? 'tb-visual-assets' : 'none',
      fabricated: false,
    }),
    required,
    alternatives,
    missingPortraits: Object.freeze(missingPortraits),
    complete: Boolean(missionIcon) && missingPortraits.length === 0,
    evidenceBoundary: 'Character and ship portraits resolve from the existing Command Center catalog/asset pipeline. Missing art remains explicitly missing; initials may be rendered as a UI fallback but are never labeled as game artwork.',
  });
}
