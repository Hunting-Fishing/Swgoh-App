import {
  aggregateTbMissionAttempts,
  aggregateTbMissionAttemptsBySquad,
} from './tb-mission-attempt-evidence.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace(/\.0$/, '')}%` : '—';
}

function samePlayer(attempt = {}, player = {}) {
  const playerId = text(player?.playerId || player?.id);
  const allyCode = digits(player?.allyCode);
  if (playerId && text(attempt?.playerId) === playerId) return true;
  return allyCode.length === 9 && digits(attempt?.allyCode) === allyCode;
}

export function buildRoteObservedMissionResults(options = {}) {
  const missionId = text(options?.missionId);
  const activeEventId = text(options?.activeEventId || options?.eventId);
  const evidenceLoaded = Array.isArray(options?.attempts) && Boolean(activeEventId);
  const scoped = evidenceLoaded
    ? array(options.attempts).filter((attempt) => text(attempt?.eventId) === activeEventId && (!missionId || text(attempt?.missionId) === missionId))
    : [];
  const guild = aggregateTbMissionAttempts(scoped, options?.samplePolicy || {});
  const bySquad = aggregateTbMissionAttemptsBySquad(scoped, options?.samplePolicy || {});
  const playerRows = scoped.filter((attempt) => samePlayer(attempt, options?.player || {}));
  const player = aggregateTbMissionAttempts(playerRows, options?.samplePolicy || {});

  return Object.freeze({
    source: 'rote-observed-mission-results-v1',
    missionId,
    activeEventId: evidenceLoaded ? activeEventId : '',
    evidenceLoaded,
    guild,
    bySquad,
    player,
    evidenceLabel: !evidenceLoaded
      ? 'ACTIVE EVENT EVIDENCE NOT LOADED'
      : guild.recorded === 0
        ? 'NO RECORDED ATTEMPTS'
        : 'GUILD EVIDENCE',
    evidenceBoundary: 'Recorded outcomes and observed completion rates describe past attempts in this active event. They are not predicted win probabilities for a future attempt.',
  });
}

function distributionMarkup(summary = {}) {
  return `<div class="rote-observed-distribution">
    <span><b>${Number(summary.complete || 0)}</b> complete</span>
    <span><b>${Number(summary.partial || 0)}</b> partial</span>
    <span><b>${Number(summary.failed || 0)}</b> failed</span>
    <span><b>${Number(summary.skipped || 0)}</b> skipped</span>
    <span><b>${Number(summary.unknown || 0)}</b> unknown</span>
  </div>`;
}

function squadLabel(signature = '') {
  const ids = text(signature).split('|').filter(Boolean);
  return ids.length ? ids.join(' · ') : 'UNKNOWN SQUAD';
}

export function roteObservedMissionResultsMarkup(model = null) {
  if (!model) return '';
  if (!model.evidenceLoaded) {
    return `<section class="rote-observed-results" data-rote-observed-results>
      <header><div><span>OBSERVED RESULTS · GUILD EVIDENCE</span><strong>Active-event mission evidence</strong></div><b>UNKNOWN</b></header>
      <div class="rote-observed-warning">ACTIVE EVENT EVIDENCE NOT LOADED · Recorded attempts cannot be inferred from missing data.</div>
      <p>${escapeHtml(model.evidenceBoundary)}</p>
    </section>`;
  }

  const guild = model.guild || {};
  const topSquads = array(model.bySquad).slice(0, 5);
  return `<section class="rote-observed-results" data-rote-observed-results>
    <header><div><span>OBSERVED RESULTS · GUILD EVIDENCE</span><strong>Active-event mission evidence</strong><small>${escapeHtml(model.evidenceLabel)} · ${Number(guild.recorded || 0)} recorded row(s)</small></div><b>${escapeHtml(guild.sampleLabel || 'RAW ATTEMPTS ONLY')}</b></header>
    <div class="rote-observed-summary">
      <article><span>COUNTABLE ATTEMPTS</span><strong>${Number(guild.attempts || 0)}</strong><small>Complete + partial + failed only</small></article>
      <article><span>OBSERVED COMPLETION</span><strong>${pct(guild.observedCompletionRate)}</strong><small>${guild.observedCompletionRate == null ? `Rate hidden below ${Number(guild.minimumRateSample || 0)} countable attempts` : 'Descriptive historical rate'}</small></article>
      <article><span>YOUR RECORDED ATTEMPTS</span><strong>${Number(model.player?.recorded || 0)}</strong><small>${escapeHtml(model.player?.sampleLabel || 'RAW ATTEMPTS ONLY')}</small></article>
    </div>
    ${distributionMarkup(guild)}
    <div class="rote-observed-squads">
      <div class="kicker">TOP RECORDED SQUADS</div>
      ${topSquads.length ? topSquads.map((row) => `<div class="rote-observed-squad"><span>${escapeHtml(squadLabel(row.squadSignature))}</span><strong>${Number(row.attempts || 0)} attempt(s)</strong><small>${pct(row.observedCompletionRate)} observed complete · ${escapeHtml(row.sampleLabel || '')}</small></div>`).join('') : '<div class="rote-observed-empty">No squad attempt evidence recorded for this mission in the active event.</div>'}
    </div>
    <p class="rote-observed-boundary">${escapeHtml(model.evidenceBoundary)}</p>
  </section>`;
}
