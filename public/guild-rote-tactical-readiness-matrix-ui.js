import {
  buildGuildRoteTacticalReadinessMatrix,
  GUILD_ROTE_TACTICAL_STATE,
  GUILD_ROTE_TACTICAL_STATE_ORDER,
} from './guild-rote-tactical-readiness-matrix.js';
import { roteTacticalReadinessMarkup } from './rote-tactical-readiness-ui.js';

const state = {
  matrix: null,
  allyCode: '',
  dataSignature: '',
  phase: 'All',
  tacticalState: 'All',
  search: '',
  selectedKey: '',
};

let scheduled = false;

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const normalize = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;
const stateSlug = (value) => normalize(value).replaceAll(' ', '-');

function ensureStylesheet() {
  if (document.querySelector('link[data-guild-rote-tactical-matrix-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-rote-tactical-readiness-matrix-ui.css?v=20260822-n4';
  link.dataset.guildRoteTacticalMatrixCss = 'true';
  document.head.appendChild(link);
}

function guildPanel() {
  return document.querySelector('[data-workspace-panel="guild"]');
}

function ensureShell() {
  const panel = guildPanel();
  if (!panel) return null;
  let shell = document.getElementById('guildRoteTacticalMatrix');
  if (shell) return shell;
  shell = document.createElement('section');
  shell.id = 'guildRoteTacticalMatrix';
  shell.className = 'card guild-rote-tactical-matrix';
  shell.innerHTML = '<div class="guild-rote-tactical-empty">Load Guild Mission Coverage to calculate tactical readiness.</div>';
  const coverage = document.getElementById('guildRoteMissionCoverage');
  if (coverage?.parentNode === panel) coverage.after(shell);
  else panel.appendChild(shell);
  return shell;
}

function attemptSignature(snapshot = null, attempts = null) {
  if (!snapshot || !Array.isArray(attempts)) return 'no-active-attempt-evidence';
  const explicit = text(snapshot?.signature || snapshot?.version || snapshot?.fetchedAt);
  if (explicit) return explicit;
  return attempts.map((row) => [
    text(row?.id),
    text(row?.eventId || row?.event_id),
    text(row?.missionId || row?.mission_id),
    text(row?.playerId || row?.player_id || row?.allyCode || row?.ally_code),
    text(row?.reportedAt || row?.reported_at),
  ].join(':')).join('|');
}

function snapshotInput() {
  const guildSnapshot = window.__swgohGuildRosterSnapshot || null;
  const catalogSnapshot = window.__swgohCatalogSnapshot || null;
  const attemptSnapshot = window.__swgohTbMissionAttemptSnapshot || null;
  const guild = guildSnapshot?.body || null;
  const catalog = catalogSnapshot?.body || null;
  if (!Array.isArray(guild?.members) || !Array.isArray(catalog?.units)) return null;

  const inputCode = digits(document.getElementById('allyCode')?.value);
  const snapshotCode = digits(guildSnapshot?.allyCode);
  if (inputCode.length === 9 && snapshotCode.length === 9 && inputCode !== snapshotCode) return null;

  const redundancyTarget = Math.max(1, Math.min(5, Math.floor(Number(window.__swgohGuildRoteRedundancyTarget || 2) || 2)));
  const activeEventId = text(attemptSnapshot?.eventId || attemptSnapshot?.event?.id);
  const attempts = Array.isArray(attemptSnapshot?.attempts) ? attemptSnapshot.attempts : null;
  return {
    allyCode: snapshotCode || inputCode,
    guild,
    catalog: catalog.units,
    redundancyTarget,
    activeEvent: activeEventId ? { id: activeEventId } : null,
    attempts,
    signature: [
      snapshotCode || inputCode,
      guildSnapshot?.fetchedAt || 0,
      catalogSnapshot?.fetchedAt || 0,
      redundancyTarget,
      activeEventId || 'no-active-event',
      attemptSignature(attemptSnapshot, attempts),
    ].join('|'),
  };
}

function phaseOptions(matrix, selected) {
  const phases = [...new Set(array(matrix?.missions).map((row) => text(row?.phase)).filter(Boolean))];
  return ['All', ...phases].map((phase) => `<option value="${escapeAttr(phase)}"${selected === phase ? ' selected' : ''}>${escapeHtml(phase === 'All' ? 'All phases' : phase)}</option>`).join('');
}

function stateOptions(selected) {
  return ['All', ...GUILD_ROTE_TACTICAL_STATE_ORDER].map((value) => `<option value="${escapeAttr(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(value === 'All' ? 'All readiness states' : value)}</option>`).join('');
}

function filteredMatrix(matrix, options = {}) {
  const phase = text(options.phase || 'All');
  const tacticalState = text(options.tacticalState || 'All');
  const query = normalize(options.search);
  const allMembers = array(matrix?.members);
  const memberMatches = query
    ? allMembers.filter((member) => normalize(`${member?.name || ''} ${member?.allyCode || ''} ${member?.id || ''}`).includes(query))
    : [];
  const members = query && memberMatches.length ? memberMatches : allMembers;
  const memberIds = new Set(members.map((member) => text(member?.id)));

  const missions = array(matrix?.missions).filter((mission) => {
    if (phase !== 'All' && text(mission?.phase) !== phase) return false;
    const visibleCells = array(mission?.cells).filter((cell) => memberIds.has(text(cell?.member?.id)));
    if (tacticalState !== 'All' && !visibleCells.some((cell) => cell?.state === tacticalState)) return false;
    if (!query || memberMatches.length) return true;
    return normalize(`${mission?.phase || ''} ${mission?.planetName || ''} ${mission?.lane || ''} ${mission?.mission?.name || ''} ${mission?.key || ''}`).includes(query);
  });

  return { members, missions };
}

function compactCellLabel(cell = {}) {
  if (cell.state === GUILD_ROTE_TACTICAL_STATE.SAFER_READY) return 'SAFER READY';
  if (cell.state === GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY) return 'MIN READY';
  if (cell.state === GUILD_ROTE_TACTICAL_STATE.ENTRY_READY) return 'ENTRY READY';
  if (cell.state === GUILD_ROTE_TACTICAL_STATE.BLOCKED) return 'BLOCKED';
  return 'UNKNOWN';
}

function cellKey(mission, cell) {
  return `${text(mission?.key)}|${text(cell?.member?.id)}`;
}

function fallbackMissionSummary(mission = {}) {
  const summary = mission?.missionSummary || mission?.summary || {};
  const counts = summary?.counts || {};
  const saferReady = Number(summary?.saferReady ?? counts[GUILD_ROTE_TACTICAL_STATE.SAFER_READY] ?? 0);
  const minimumReady = Number(summary?.minimumReady ?? ((counts[GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY] || 0) + saferReady));
  const officialEntryReady = Number(summary?.officialEntryReady ?? (
    (counts[GUILD_ROTE_TACTICAL_STATE.ENTRY_READY] || 0)
    + (counts[GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY] || 0)
    + saferReady
  ));
  return {
    officialEntryReady,
    minimumReady,
    saferReady,
    blocked: Number(summary?.blocked ?? counts[GUILD_ROTE_TACTICAL_STATE.BLOCKED] ?? 0),
    unknownEvidence: Number(summary?.unknownEvidence ?? counts[GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE] ?? 0),
    outstandingAvailable: summary?.outstandingAvailable === true,
    outstanding: summary?.outstandingAvailable === true ? Number(summary?.outstanding || 0) : null,
    attemptsRecorded: summary?.outstandingAvailable === true ? Number(summary?.attemptsRecorded || 0) : null,
  };
}

function missionReadinessText(mission = {}) {
  const summary = fallbackMissionSummary(mission);
  const parts = [
    `ENTRY ${summary.officialEntryReady}`,
    `MIN ${summary.minimumReady}`,
    `SAFER ${summary.saferReady}`,
    `BLOCKED ${summary.blocked}`,
    `UNKNOWN ${summary.unknownEvidence}`,
  ];
  if (summary.outstandingAvailable) parts.push(`OUTSTANDING ${summary.outstanding}`);
  return parts.join(' · ');
}

function matrixSummaryMarkup(matrix = {}) {
  const summary = matrix?.summary || { total: 0, known: 0, battleReady: 0, counts: {} };
  const count = (key) => Number(summary?.counts?.[key] || 0);
  const saferReady = Number(summary?.saferReady ?? count(GUILD_ROTE_TACTICAL_STATE.SAFER_READY));
  const minimumReady = Number(summary?.minimumReady ?? (count(GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY) + saferReady));
  const officialEntryReady = Number(summary?.officialEntryReady ?? (count(GUILD_ROTE_TACTICAL_STATE.ENTRY_READY) + count(GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY) + saferReady));
  return `<div class="guild-rote-tactical-summary">
    <article><span>BATTLE READY</span><strong>${minimumReady}</strong><small>Minimum or safer target met</small></article>
    <article><span>SAFER READY</span><strong>${saferReady}</strong><small>Safer target met</small></article>
    <article><span>MINIMUM READY</span><strong>${minimumReady}</strong><small>Cumulative: includes safer</small></article>
    <article><span>OFFICIAL ENTRY READY</span><strong>${officialEntryReady}</strong><small>Legal entry; tactical state separate</small></article>
    <article><span>BLOCKED</span><strong>${Number(summary?.blocked ?? count(GUILD_ROTE_TACTICAL_STATE.BLOCKED))}</strong><small>Official entry fails</small></article>
    <article><span>UNKNOWN EVIDENCE</span><strong>${Number(summary?.unknownEvidence ?? count(GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE))}</strong><small>${Number(summary.known || 0)}/${Number(summary.total || 0)} cells known</small></article>
  </div>`;
}

function missionCell(mission, member, selectedKey) {
  const cell = array(mission?.cells).find((row) => text(row?.member?.id) === text(member?.id));
  if (!cell) return '<td></td>';
  const key = cellKey(mission, cell);
  const selected = key === selectedKey;
  const detail = cell.tacticalGap || cell.verdict || cell.state;
  return `<td><button type="button" class="guild-rote-tactical-cell state-${escapeAttr(stateSlug(cell.state))}${selected ? ' selected' : ''}" data-guild-rote-tactical-cell="${escapeAttr(key)}" title="${escapeAttr(`${cell.state} · ${detail}`)}"><strong>${escapeHtml(compactCellLabel(cell))}</strong><small>${escapeHtml(detail)}</small></button></td>`;
}

function matrixTableMarkup(matrix, options = {}) {
  const filtered = filteredMatrix(matrix, options);
  if (!filtered.missions.length || !filtered.members.length) {
    return '<div class="guild-rote-tactical-empty">No mission × member cells match the current filters.</div>';
  }
  return `<div class="guild-rote-tactical-scroll"><table class="guild-rote-tactical-table">
    <thead><tr><th><strong>MISSION</strong><small>${filtered.missions.length} rows · ${filtered.members.length} members</small></th>${filtered.members.map((member) => `<th><strong>${escapeHtml(member.name || member.id)}</strong><small>${escapeHtml(member.allyCode || 'No Ally Code')}</small></th>`).join('')}</tr></thead>
    <tbody>${filtered.missions.map((mission) => `<tr>
      <th class="guild-rote-tactical-mission"><button type="button" data-guild-mission-planet="${escapeAttr(mission.planetId)}"><span>${escapeHtml(`${mission.phase} · ${mission.planetName} · ${mission.lane}`)}</span><strong>${escapeHtml(mission.mission?.name || mission.key)}</strong><small>${escapeHtml(mission.evidence === 'exact' ? 'Verified entry evidence' : 'Partial entry evidence')}</small><small>${escapeHtml(missionReadinessText(mission))}</small></button></th>
      ${filtered.members.map((member) => missionCell(mission, member, options.selectedKey)).join('')}
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function findSelected(matrix, selectedKey) {
  if (!selectedKey) return null;
  for (const mission of array(matrix?.missions)) {
    for (const cell of array(mission?.cells)) {
      if (cellKey(mission, cell) === selectedKey) return { mission, cell };
    }
  }
  return null;
}

function memberProfileHref(member = {}, guildAllyCode = '') {
  const memberCode = digits(member?.allyCode);
  if (memberCode.length !== 9) return '';
  const params = new URLSearchParams();
  const guildCode = digits(guildAllyCode);
  if (guildCode.length === 9) params.set('allyCode', guildCode);
  return `/guild/members/${memberCode}${params.toString() ? `?${params}` : ''}`;
}

function missionIntelligenceMarkup(mission = {}) {
  const summary = fallbackMissionSummary(mission);
  return `<div class="guild-rote-tactical-detail-grid">
    <div><span>Guild entry-ready</span><strong>${summary.officialEntryReady}</strong></div>
    <div><span>Minimum-ready</span><strong>${summary.minimumReady}</strong></div>
    <div><span>Safer-ready</span><strong>${summary.saferReady}</strong></div>
    <div><span>Blocked / Unknown</span><strong>${summary.blocked} / ${summary.unknownEvidence}</strong></div>
    ${summary.outstandingAvailable ? `<div><span>Active-event outstanding</span><strong>${summary.outstanding}</strong></div><div><span>Recorded attempts</span><strong>${summary.attemptsRecorded}</strong></div>` : '<div><span>Active-event outstanding</span><strong>UNKNOWN</strong></div><div><span>Participation evidence</span><strong>NOT LOADED</strong></div>'}
  </div>`;
}

export function guildRoteTacticalCellDetailMarkup(matrix, selectedKey, guildAllyCode = '') {
  const selected = findSelected(matrix, selectedKey);
  if (!selected) return '<div class="guild-rote-tactical-empty">Select a mission/member cell to inspect tactical readiness evidence.</div>';
  const { mission, cell } = selected;
  const member = cell.member || {};
  const profileHref = memberProfileHref(member, guildAllyCode);
  const official = cell.officialEntryReady === true ? 'PASS' : cell.officialEntryReady === false ? 'FAIL' : 'UNKNOWN';
  const unknown = Number(cell.unknownEvidenceCount || 0);
  const progression = Number(cell.progressionFailureCount || 0);
  return `<section class="guild-rote-tactical-detail">
    <header><div><span>${escapeHtml(`${mission.phase} · ${mission.planetName} · ${member.name || member.id}`)}</span><strong>${escapeHtml(mission.mission?.name || mission.key)}</strong></div><b>${escapeHtml(cell.state)}</b></header>
    <div class="kicker">GUILD MISSION INTELLIGENCE</div>
    ${missionIntelligenceMarkup(mission)}
    <div class="kicker">MEMBER READINESS EVIDENCE</div>
    <div class="guild-rote-tactical-detail-grid">
      <div><span>Official entry</span><strong>${escapeHtml(official)}</strong></div>
      <div><span>Tactical verdict</span><strong>${escapeHtml(cell.verdict || cell.tacticalGap || 'UNKNOWN')}</strong></div>
      <div><span>Progression gaps</span><strong>${progression}</strong></div>
      <div><span>Unknown evidence</span><strong>${unknown}</strong></div>
    </div>
    <div class="guild-rote-tactical-actions">
      <button type="button" data-guild-mission-planet="${escapeAttr(mission.planetId)}">Open Mission Planet</button>
      ${profileHref ? `<a href="${escapeAttr(profileHref)}">Open Guild Member Profile</a>` : ''}
    </div>
    ${cell.readiness ? roteTacticalReadinessMarkup(cell.readiness) : `<div class="guild-rote-tactical-empty">${escapeHtml(cell.tacticalGap || 'Detailed readiness evidence is unavailable for this cell.')}</div>`}
  </section>`;
}

export function guildRoteTacticalMatrixMarkup(matrix, options = {}) {
  if (!matrix) return '<div class="guild-rote-tactical-empty">Guild tactical readiness is not loaded.</div>';
  const selectedKey = text(options.selectedKey);
  return `
    <div class="guild-rote-tactical-head">
      <div><div class="kicker">ROTE TACTICAL READINESS · GUILD MATRIX</div><h2>Mission × Member Readiness</h2><p>Entry legality and tactical battle preparation stay separate. Every mission shows cumulative Guild entry/minimum/safer readiness plus blocked and unknown evidence; active-event outstanding counts appear only when matching attempt evidence is loaded.</p></div>
      <span class="status ready">${Number(matrix.summary?.battleReady || 0)} battle-ready cells</span>
    </div>
    ${matrixSummaryMarkup(matrix)}
    <div class="guild-rote-tactical-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(matrix.evidenceBoundary || 'UNKNOWN evidence is never converted into a fake pass or failure.')}</div>
    <div class="guild-rote-tactical-toolbar">
      <label>Phase<select data-guild-rote-tactical-phase>${phaseOptions(matrix, options.phase || 'All')}</select></label>
      <label>Readiness<select data-guild-rote-tactical-state>${stateOptions(options.tacticalState || 'All')}</select></label>
      <label class="search">Search mission or member<input type="search" data-guild-rote-tactical-search value="${escapeAttr(options.search || '')}" placeholder="Hondo, P2, member name, Ally Code…"></label>
    </div>
    ${matrixTableMarkup(matrix, { ...options, selectedKey })}
    ${guildRoteTacticalCellDetailMarkup(matrix, selectedKey, options.guildAllyCode || '')}`;
}

function render() {
  const shell = ensureShell();
  if (!shell) return;
  shell.innerHTML = guildRoteTacticalMatrixMarkup(state.matrix, {
    phase: state.phase,
    tacticalState: state.tacticalState,
    search: state.search,
    selectedKey: state.selectedKey,
    guildAllyCode: state.allyCode,
  });
}

function refreshFromSnapshots() {
  scheduled = false;
  const input = snapshotInput();
  const shell = ensureShell();
  if (!shell) return;
  if (!input) {
    if (!state.matrix) shell.innerHTML = '<div class="guild-rote-tactical-empty">Load Guild Mission Coverage to calculate tactical readiness.</div>';
    return;
  }
  if (state.dataSignature === input.signature && state.matrix) return;

  state.allyCode = input.allyCode;
  state.dataSignature = input.signature;
  state.matrix = buildGuildRoteTacticalReadinessMatrix(input.guild, input.catalog, {
    redundancyTarget: input.redundancyTarget,
    activeEvent: input.activeEvent,
    attempts: input.attempts,
  });
  state.selectedKey = '';
  render();
}

function scheduleRefresh() {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return;
  scheduled = true;
  requestAnimationFrame(refreshFromSnapshots);
}

function install() {
  ensureStylesheet();
  ensureShell();
  scheduleRefresh();

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('swgoh:workspace-activated', scheduleRefresh);
  window.addEventListener('swgoh:guild-rote-redundancy-target', () => {
    state.dataSignature = '';
    scheduleRefresh();
  });
  window.addEventListener('swgoh:tb-mission-attempts-updated', () => {
    state.dataSignature = '';
    scheduleRefresh();
  });
  document.getElementById('allyForm')?.addEventListener('submit', () => {
    state.matrix = null;
    state.dataSignature = '';
    state.selectedKey = '';
    setTimeout(scheduleRefresh, 650);
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-guild-rote-tactical-phase]')) state.phase = event.target.value || 'All';
    else if (event.target.matches?.('[data-guild-rote-tactical-state]')) state.tacticalState = event.target.value || 'All';
    else return;
    render();
  });

  document.addEventListener('input', (event) => {
    if (!event.target.matches?.('[data-guild-rote-tactical-search]')) return;
    state.search = event.target.value || '';
    render();
  });

  document.addEventListener('click', (event) => {
    const cell = event.target.closest?.('[data-guild-rote-tactical-cell]');
    if (!cell) return;
    state.selectedKey = cell.dataset.guildRoteTacticalCell || '';
    render();
  });

  return Object.freeze({ observer, scheduleRefresh });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
