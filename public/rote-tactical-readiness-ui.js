import { TB_READINESS_EVIDENCE } from './tb-mission-readiness-v2.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function evidenceClass(state) {
  if (state === TB_READINESS_EVIDENCE.PASS) return 'pass';
  if (state === TB_READINESS_EVIDENCE.FAIL) return 'fail';
  if (state === TB_READINESS_EVIDENCE.UNKNOWN) return 'unknown';
  if (state === TB_READINESS_EVIDENCE.NOT_APPLICABLE) return 'na';
  return 'advisory';
}

function evidenceText(check = {}) {
  if (check.state === TB_READINESS_EVIDENCE.UNKNOWN) return 'UNKNOWN';
  if (check.state === TB_READINESS_EVIDENCE.NOT_APPLICABLE) return 'N/A';
  if (check.target != null && check.current != null) return `${check.current} / ${check.target}`;
  if (check.minimum != null && check.current != null) return `${check.current} / ${check.minimum}+`;
  if (check.installed != null) return check.installed ? 'INSTALLED' : 'MISSING';
  if (check.currentTier != null && check.targetTier != null) return `T${check.currentTier} / T${check.targetTier}`;
  return check.state || '—';
}

function progressionMarkup(rows = []) {
  if (!rows.length) return '<div class="rote-tactical-empty">No selected-team progression evidence.</div>';
  return `<div class="rote-tactical-progression-grid">${rows.map((row) => {
    const checks = [
      ['LVL', row.level],
      ['★', row.stars],
      ['GEAR', row.gear],
      ['RELIC', row.relic],
    ];
    return `<article class="rote-tactical-progress-unit"><strong>${escapeHtml(row.name || row.baseId || 'Unit')}</strong><div>${checks.map(([label, check]) => `<span class="${evidenceClass(check?.state)}"><small>${label}</small><b>${escapeHtml(evidenceText(check || {}))}</b></span>`).join('')}</div></article>`;
  }).join('')}</div>`;
}

function guidanceMarkup(title, rows = [], emptyText) {
  if (!rows.length) return `<section class="rote-tactical-evidence-section"><h6>${escapeHtml(title)}</h6><div class="rote-tactical-empty">${escapeHtml(emptyText)}</div></section>`;
  return `<section class="rote-tactical-evidence-section"><h6>${escapeHtml(title)}</h6><div class="rote-tactical-evidence-list">${rows.map((row) => `<article class="${evidenceClass(row.state)}"><div><strong>${escapeHtml(row.name || row.stat || row.baseId || title)}</strong>${row.baseId ? `<small>${escapeHtml(row.baseId)}</small>` : ''}</div><b>${escapeHtml(evidenceText(row))}</b>${row.reason ? `<p>${escapeHtml(row.reason)}</p>` : ''}</article>`).join('')}</div></section>`;
}

function statsMarkup(rows = []) {
  if (!rows.length) return '<section class="rote-tactical-evidence-section"><h6>Mods & Stats</h6><div class="rote-tactical-empty">No sourced mission-specific stat target yet.</div></section>';
  return `<section class="rote-tactical-evidence-section"><h6>Mods & Stats</h6><div class="rote-tactical-evidence-list">${rows.map((row) => `<article class="${evidenceClass(row.state)}"><div><strong>${escapeHtml(row.name || row.stat || 'Stat target')}</strong><small>${escapeHtml([row.baseId, row.stat].filter(Boolean).join(' · '))}</small></div><b>${escapeHtml(evidenceText(row))}</b>${row.reason ? `<p>${escapeHtml(row.reason)}</p>` : ''}</article>`).join('')}</div></section>`;
}

export function roteTacticalReadinessMarkup(readiness = null) {
  if (!readiness) return '<section class="rote-tactical-readiness-panel unloaded"><header><span>TACTICAL READINESS</span><strong>ROSTER NOT LOADED</strong></header><p>Load a player roster to evaluate Level, Gear/Relic, abilities, Zetas, TB-active Omicrons and sourced mod/stat targets.</p></section>';

  const official = readiness.officialEntryReady === true;
  const unknownCount = array(readiness.unknownEvidence).length;
  const progressionFailures = array(readiness.progressionFailures).length;

  return `<section class="rote-tactical-readiness-panel ${official ? 'entry-ready' : 'entry-blocked'}">
    <header><div><span>TACTICAL READINESS V2</span><strong>${escapeHtml(readiness.verdict || 'UNKNOWN')}</strong></div><b>${official ? 'ENTRY LEGAL' : 'ENTRY BLOCKED'}</b></header>
    <div class="rote-tactical-readiness-summary">
      <span>Official entry <b>${official ? 'PASS' : 'FAIL'}</b></span>
      <span>Progression gaps <b>${progressionFailures}</b></span>
      <span>Unknown evidence <b>${unknownCount}</b></span>
      <span>Battle evidence <b>${readiness.battleEvidenceComplete ? 'COMPLETE' : 'PARTIAL'}</b></span>
    </div>
    <section class="rote-tactical-evidence-section"><h6>Level · Stars · Gear · Relic</h6>${progressionMarkup(readiness.progression)}</section>
    <div class="rote-tactical-evidence-columns">
      ${guidanceMarkup('Required / Sourced Abilities', readiness.abilities, 'No hard mission-specific ability target encoded yet.')}
      ${guidanceMarkup('Zetas', readiness.zetas, 'No sourced Zeta requirement encoded yet.')}
      ${guidanceMarkup('TB-active Omicrons', readiness.omicrons, 'No sourced TB Omicron requirement encoded yet.')}
      ${statsMarkup(readiness.stats)}
    </div>
    <footer>${escapeHtml(readiness.evidenceBoundary || 'Official entry rules remain separate from battle-preparation guidance.')}</footer>
  </section>`;
}
