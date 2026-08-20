import { findStrategyProvenance } from './gac-strategy-provenance.js';

const state = { boardKey: '', board: null, boardPromise: null, timer: null };
const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity() {
  const mine = allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode);
  const opponent = allyCode(document.getElementById('gacOpponentCode')?.value || document.querySelector('[data-gacv2-opponent]')?.value);
  const round = Number(document.getElementById('gacBracketRound')?.value || document.querySelector('[data-gacv2-round]')?.value);
  const size = Number(document.getElementById('gacMode')?.value || document.querySelector('[data-gacv2-mode]')?.value) === 3 ? 3 : 5;
  return /^\d{9}$/.test(mine) && /^\d{9}$/.test(opponent) && Number.isInteger(round) && round >= 1 && round <= 3
    ? Object.freeze({ mine, opponent, round, size, format: size === 3 ? '3v3' : '5v5', key: `${mine}|${opponent}|${round}|${size}` })
    : null;
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

async function loadBoard(current) {
  if (state.boardKey === current.key && state.board) return state.board;
  if (state.boardKey === current.key && state.boardPromise) return state.boardPromise;
  const promise = fetchJson(`/api/gac/current-board/${current.mine}/defense?round=${current.round}`)
    .then((body) => {
      if (allyCode(body?.opponent?.allyCode) !== current.opponent) throw new Error('Saved board opponent mismatch.');
      const board = Object.freeze({ defenses: Object.freeze(Array.isArray(body?.defenses) ? body.defenses : []) });
      state.boardKey = current.key;
      state.board = board;
      return board;
    }).finally(() => { if (state.boardPromise === promise) state.boardPromise = null; });
  state.boardKey = current.key;
  state.boardPromise = promise;
  return promise;
}

function ids(value) {
  return clean(value).split(',').map(normalizeId).filter(Boolean);
}

function dateLabel(value) {
  const parsed = Date.parse(clean(value));
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.DateTimeFormat('en-US', { year:'numeric', month:'short', day:'numeric' }).format(new Date(parsed));
}

function sourceAnchor(name, ref) {
  const label = escapeHtml(name || 'Source');
  const url = clean(ref);
  return /^https:\/\//i.test(url)
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`
    : `<strong>${label}</strong>`;
}

function renderValidationRefs(rows = []) {
  if (!rows.length) return '';
  return `<div class="gac-prov-validations"><span>CURRENT RELEVANCE CHECKS</span>${rows.slice(0,4).map((row) => `<article><div>${sourceAnchor(row.sourceName, row.sourceRef)}<small>${escapeHtml(row.kind || 'validation')}</small></div><p>${escapeHtml(row.note || 'Supporting validation reference.')}</p></article>`).join('')}</div>`;
}

function renderPanel(provenance, executionUnlocked) {
  if (executionUnlocked) {
    return `<section class="gac-brief-provenance is-unlocked" data-gac-provenance-panel><div class="gac-prov-head"><span>TACTIC PROVENANCE</span><strong>APPROVED EXECUTION RECORD ACTIVE</strong></div><p>The Attack Brief matched an approved production strategy record after exact composition, validity, and Datacron gates. The execution section above remains the authority for the sourced sequence.</p></section>`;
  }
  const status = provenance?.status || 'none';
  if (status === 'none') {
    return `<section class="gac-brief-provenance is-none" data-gac-provenance-panel><div class="gac-prov-head"><span>TACTIC PROVENANCE</span><strong>NO EXACT SOURCE RECORD</strong></div><p>No approved or quarantined tactical source matches this exact attacker + defender composition. Historical counter statistics may still exist, but no execution sequence is inferred from them.</p></section>`;
  }
  const blockers = Array.isArray(provenance?.blockers) ? provenance.blockers : [];
  return `<section class="gac-brief-provenance is-locked" data-gac-provenance-panel>
    <div class="gac-prov-head"><span>TACTIC PROVENANCE</span><strong>${escapeHtml(provenance.label || 'TACTIC FOUND · EXECUTION LOCKED')}</strong></div>
    <div class="gac-prov-source"><div>${sourceAnchor(provenance.sourceName, provenance.sourceRef)}<small>Source updated ${dateLabel(provenance.sourceUpdatedAt)} · captured ${dateLabel(provenance.capturedAt)}</small></div><p>${escapeHtml(provenance.validityNotes || provenance.detail || '')}</p></div>
    ${blockers.length ? `<div class="gac-prov-blockers"><span>WHY EXECUTION IS LOCKED</span>${blockers.map((label) => `<b>⚠ ${escapeHtml(label)}</b>`).join('')}</div>` : ''}
    ${renderValidationRefs(provenance.validationRefs)}
    <small class="gac-prov-boundary">Quarantined source metadata is visible for audit. Unapproved opening moves, target order, and tactical instructions are not loaded into runtime.</small>
  </section>`;
}

async function inspectCard(card) {
  const details = card?.querySelector('.gac-war-room-attack-brief');
  const body = details?.querySelector('.gac-war-room-attack-brief-body');
  if (!details?.open || !body || body.querySelector('[data-gac-provenance-panel]')) return;
  const execution = body.querySelector('.gac-brief-execution');
  if (!execution) return;
  const executionUnlocked = !execution.classList.contains('is-gated');
  if (executionUnlocked) {
    body.querySelector('.gac-brief-footer')?.insertAdjacentHTML('beforebegin', renderPanel(null, true));
    return;
  }
  const current = identity();
  const defenseId = Number(card.dataset.defenseId || 0);
  const attackerMembers = ids(card.dataset.recommendedAttackerMembers);
  if (!current || !defenseId || !attackerMembers.length) return;
  try {
    const board = await loadBoard(current);
    const defense = board.defenses.find((row) => Number(row?.id) === defenseId);
    if (!defense) return;
    const provenance = await findStrategyProvenance({
      format: current.format,
      defenderMembers: (Array.isArray(defense.members) ? defense.members : []).map(normalizeId).filter(Boolean),
      attackerMembers,
    });
    if (!details.open || body.querySelector('[data-gac-provenance-panel]')) return;
    body.querySelector('.gac-brief-footer')?.insertAdjacentHTML('beforebegin', renderPanel(provenance, false));
  } catch {
    // Provenance is supplemental. Attack Brief remains fail-closed without it.
  }
}

function inspectAll() {
  for (const card of document.querySelectorAll('#gacBoardPlannerGrid .gac-saved-board-card')) void inspectCard(card);
}

function invalidate() {
  state.boardKey = ''; state.board = null; state.boardPromise = null;
  document.querySelectorAll('[data-gac-provenance-panel]').forEach((node) => node.remove());
}

function schedule(delay = 80) {
  clearTimeout(state.timer);
  state.timer = setTimeout(inspectAll, delay);
}

function injectStyle() {
  if (document.querySelector('link[data-gac-provenance-inspector]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/gac-war-room-provenance-inspector.css?v=20260821-b05'; link.dataset.gacProvenanceInspector = 'true';
  document.head.appendChild(link);
}

if (typeof document !== 'undefined') {
  injectStyle();
  document.addEventListener('toggle', (event) => { if (event.target?.classList?.contains('gac-war-room-attack-brief')) schedule(20); }, true);
  document.addEventListener('change', (event) => {
    if (['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id) || event.target?.matches?.('[data-gacv2-round],[data-gacv2-mode],[data-gacv2-opponent]')) { invalidate(); schedule(140); }
  }, true);
  window.addEventListener('gac-war-room-updated', () => { invalidate(); schedule(100); });
  window.addEventListener('gac-board-evidence-updated', () => { invalidate(); schedule(120); });
  new MutationObserver(() => schedule(60)).observe(document.documentElement, { childList:true, subtree:true });
  schedule(300);
}

export { identity, ids, renderPanel };
