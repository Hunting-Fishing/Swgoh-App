import { resolveRoteTacticalNodeAssets } from './rote-tactical-asset-model.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;

function assetPortrait(asset = {}, role = 'required') {
  const roleLabel = role === 'alternative' ? 'ALTERNATIVE' : 'REQUIRED';
  const portrait = asset?.src
    ? `<img src="${escapeAttr(asset.src)}" alt="${escapeAttr(asset.alt || asset.name)}" loading="lazy" decoding="async">`
    : `<span aria-hidden="true">${escapeHtml(asset?.initials || '?')}</span>`;
  return `<span class="rote-tactical-portrait ${escapeAttr(role)} ${asset?.status === 'missing' ? 'missing' : 'resolved'}" title="${escapeAttr(`${roleLabel}: ${asset?.name || asset?.baseId || 'unit'}`)}" data-asset-source="${escapeAttr(asset?.source || 'none')}">${portrait}<small>${role === 'alternative' ? 'OR' : 'REQ'}</small></span>`;
}

function readinessClass(readiness) {
  const verdict = text(readiness?.verdict).toLowerCase();
  if (!verdict) return 'unknown';
  if (verdict.includes('blocked')) return 'blocked';
  if (verdict.includes('needs')) return 'warning';
  if (verdict.includes('ready')) return 'ready';
  return 'unknown';
}

function readinessLabel(readiness) {
  return text(readiness?.verdict || 'ROSTER NOT LOADED');
}

export function roteTacticalNodeMarkup(node = {}, catalog = {}) {
  const assets = resolveRoteTacticalNodeAssets(node, catalog);
  const required = assets.required.map((asset) => assetPortrait(asset, 'required')).join('');
  const alternatives = assets.alternatives.map((asset) => assetPortrait(asset, 'alternative')).join('');
  const portraits = `${required}${alternatives}`;
  const missionIcon = assets.missionIcon?.src
    ? `<img class="rote-tactical-mission-icon" src="${escapeAttr(assets.missionIcon.src)}" alt="" loading="lazy" decoding="async">`
    : '<span class="rote-tactical-mission-icon missing" aria-hidden="true">?</span>';
  const reward = array(node?.rewardBadges)[0] || '';
  const requiredCount = array(node?.requiredUnits).length;
  const alternativeCount = array(node?.alternativeUnits).length;
  const gate = node?.entryRule?.threshold?.join(' · ') || '';

  if (node?.infrastructure) {
    return `<span class="rote-tactical-node-shell infrastructure">${missionIcon}<span class="rote-tactical-node-copy"><strong>${escapeHtml(node?.label || node?.type || 'TB node')}</strong>${reward ? `<small>${escapeHtml(reward)}</small>` : ''}</span></span>`;
  }

  return `<span class="rote-tactical-node-shell mission ${escapeAttr(readinessClass(node?.readiness))}">
    <span class="rote-tactical-node-main">${missionIcon}<span class="rote-tactical-node-copy"><strong>${escapeHtml(node?.mission?.name || node?.label || 'Mission')}</strong><small>${escapeHtml(gate || node?.mission?.missionType || '')}</small></span></span>
    ${portraits ? `<span class="rote-tactical-portrait-strip" aria-label="${escapeAttr(`${requiredCount} required, ${alternativeCount} alternatives`)}">${portraits}</span>` : ''}
    <span class="rote-tactical-readiness ${escapeAttr(readinessClass(node?.readiness))}">${escapeHtml(readinessLabel(node?.readiness))}</span>
    ${reward ? `<span class="rote-tactical-reward">${escapeHtml(reward)}</span>` : ''}
  </span>`;
}

export function hydrateRoteTacticalNodeButtons(root, tacticalModel, catalog = {}) {
  if (!root || !tacticalModel) return Object.freeze({ hydrated: 0, missingButtons: Object.freeze([]) });
  const missingButtons = [];
  let hydrated = 0;

  for (const node of array(tacticalModel.nodes)) {
    const button = root.querySelector(`[data-rote-zoom-node="${CSS.escape(text(node.id))}"]`);
    if (!button) {
      missingButtons.push(text(node.id));
      continue;
    }
    button.innerHTML = roteTacticalNodeMarkup(node, catalog);
    button.classList.add('rote-tactical-node-v2');
    button.dataset.tacticalMissionId = text(node.missionId);
    button.dataset.tacticalReadiness = text(node?.readiness?.verdict || 'UNKNOWN');
    hydrated += 1;
  }

  return Object.freeze({ hydrated, missingButtons: Object.freeze(missingButtons) });
}
