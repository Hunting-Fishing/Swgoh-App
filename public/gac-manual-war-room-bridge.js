import { buildOpenWarRoomPlan } from './gac-round-war-room.js';

const state = {
  key: '',
  requestId: 0,
  loading: false,
  timer: null,
  busy: new Set(),
  assignments: [],
  defenses: [],
  ownDefenses: [],
  openPlan: [],
  mineRoster: null,
  opponentRoster: null,
  error: '',
};

const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function identity() {
  const mine = allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode || window.__swgohPlayerRosterSnapshot?.allyCode);
  const opponent = allyCode(document.querySelector('[data-gacv2-opponent]')?.value || document.getElementById('gacOpponentCode')?.value);
  const round = Number(document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value);
  const size = Number(document.querySelector('[data-gac-board-format]')?.value || document.querySelector('[data-gacv2-mode]')?.value || document.getElementById('gacMode')?.value) === 3 ? 3 : 5;
  if (!/^\d{9}$/.test(mine) || !/^\d{9}$/.test(opponent) || ![1, 2, 3].includes(round)) return null;
  return Object.freeze({ mine, opponent, round, size, key: `${mine}|${opponent}|${round}|${size}` });
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type':'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function boardKey(defense = {}) {
  const zone = clean(defense?.zone).toUpperCase();
  const slot = Number(defense?.slot);
  return `${zone}|${Number.isInteger(slot) && slot >= 0 ? slot : ''}`;
}

function assignmentIndex(assignments = []) {
  return new Map((Array.isArray(assignments) ? assignments : [])
    .filter((row) => Number.isInteger(Number(row?.defenseId)))
    .map((row) => [Number(row.defenseId), row]));
}

function openPlanIndex(assignments = []) {
  return new Map((Array.isArray(assignments) ? assignments : [])
    .filter((row) => Number.isInteger(Number(row?.defenseId)))
    .map((row) => [Number(row.defenseId), row]));
}

function rosterIndex(roster = {}) {
  return new Map((Array.isArray(roster?.units) ? roster.units : [])
    .map((unit) => [normalizeId(unit?.baseId), unit])
    .filter(([id]) => Boolean(id)));
}

function portrait(unit = {}, fallback = '') {
  const id = normalizeId(unit?.baseId || fallback);
  const name = clean(unit?.name || id || 'Unknown');
  const image = clean(unit?.image || unit?.imageUrl || unit?.portrait || unit?.portraitUrl);
  return `<span class="gac-manual-war-unit" ${id ? `data-inspect-base-id="${escapeHtml(id)}"` : ''} title="${escapeHtml(name)}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<b>${escapeHtml(name.slice(0, 2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}

function statusLabel(statusInput) {
  const status = clean(statusInput).toLowerCase();
  if (status === 'planned') return 'LOCKED PLAN';
  if (status === 'attempted') return 'ATTEMPT IN PROGRESS';
  if (status === 'win') return 'DEFENSE CLEARED';
  if (status === 'loss') return 'LOSS · RETRY AVAILABLE';
  if (status === 'abandoned') return 'PLAN RELEASED';
  return 'READY TO PLAN';
}

function warRoomProgress(defenses = [], assignments = []) {
  const verifiedIds = new Set((Array.isArray(defenses) ? defenses : []).map((row) => Number(row?.id)).filter((id) => Number.isInteger(id) && id > 0));
  const relevant = (Array.isArray(assignments) ? assignments : []).filter((row) => verifiedIds.has(Number(row?.defenseId)));
  const won = relevant.filter((row) => clean(row?.status).toLowerCase() === 'win').length;
  const locked = relevant.filter((row) => ['planned', 'attempted'].includes(clean(row?.status).toLowerCase())).length;
  const attempted = relevant.filter((row) => clean(row?.status).toLowerCase() === 'attempted').length;
  const losses = relevant.filter((row) => clean(row?.status).toLowerCase() === 'loss').length;
  const total = verifiedIds.size;
  const completion = total ? Math.round((won / total) * 100) : 0;
  return Object.freeze({ total, won, locked, attempted, losses, open: Math.max(0, total - won), completion });
}

function recommendationMembers(openAssignment = {}) {
  return (Array.isArray(openAssignment?.recommendation?.squad) ? openAssignment.recommendation.squad : [])
    .map((unit) => normalizeId(unit?.baseId || unit))
    .filter(Boolean);
}

function lockedMembers(assignment = {}) {
  return (Array.isArray(assignment?.members) ? assignment.members : []).map(normalizeId).filter(Boolean);
}

function recommendationHtml(openAssignment, units) {
  const recommendation = openAssignment?.recommendation;
  if (!recommendation?.squad?.length) {
    return `<div class="gac-manual-war-counter is-empty"><div><strong>WAR ROOM · AUTHORITATIVE</strong><span>No non-overlapping legal counter remains for this defense.</span></div></div>`;
  }
  const evidence = openAssignment?.source === 'historical-counter-evidence';
  return `<div class="gac-manual-war-counter ${evidence ? 'is-evidence' : ''}"><div><strong>${evidence ? 'WAR ROOM · HISTORICAL EVIDENCE' : 'WAR ROOM · BOARD-WIDE PLAN'}</strong><span>${escapeHtml(openAssignment?.allocationReason || recommendation?.confidence || 'Remaining-roster allocation')}</span></div><div>${recommendation.squad.map((unit) => portrait(units.get(normalizeId(unit?.baseId)) || unit, unit?.baseId)).join('')}</div></div>`;
}

function lockedHtml(assignment, units) {
  const members = lockedMembers(assignment);
  return `<div class="gac-manual-war-counter is-locked"><div><strong>LOCKED ATTACK SQUAD</strong><span>Reserved to this exact defense until result or release.</span></div><div>${members.map((id) => portrait(units.get(id) || {}, id)).join('')}</div></div>`;
}

function controlsHtml(defense, assignment, openAssignment) {
  const defenseId = Number(defense?.id);
  const status = clean(assignment?.status).toLowerCase();
  const busy = state.busy.has(defenseId);
  const hasRecommendation = recommendationMembers(openAssignment).length > 0;
  if (!defenseId) return `<span class="gac-manual-war-note">SYNC THIS DEFENSE TO LOCK A COUNTER</span>`;
  if (!assignment || ['loss', 'abandoned'].includes(status)) {
    return hasRecommendation
      ? `<button type="button" data-gac-manual-war-action="lock" ${busy ? 'disabled' : ''}>${busy ? 'LOCKING…' : status === 'loss' ? 'LOCK RETRY COUNTER' : 'LOCK COUNTER'}</button>`
      : `<span class="gac-manual-war-note">NO LEGAL COUNTER AVAILABLE</span>`;
  }
  if (status === 'planned') {
    return `<button type="button" data-gac-manual-war-action="preflight">PRE-BATTLE CHECKLIST</button><button type="button" class="is-muted" data-gac-manual-war-action="release" ${busy ? 'disabled' : ''}>${busy ? 'RELEASING…' : 'RELEASE PLAN'}</button>`;
  }
  if (status === 'attempted') return `<button type="button" data-gac-manual-war-action="result">RECORD WIN / LOSS</button>`;
  if (status === 'win') return `<span class="gac-manual-war-cleared">✓ CLEARED${assignment?.banners == null ? '' : ` · ${Number(assignment.banners)} BANNERS`}</span>`;
  return '';
}

function renderSummary(ctx) {
  const host = document.querySelector('[data-gac-board-workspace] .gac-visible-board');
  if (!host) return;
  host.querySelector('[data-gac-manual-war-summary]')?.remove();
  const progress = warRoomProgress(state.defenses, state.assignments);
  const summary = document.createElement('section');
  summary.className = 'gac-manual-war-summary';
  summary.dataset.gacManualWarSummary = 'true';
  summary.innerHTML = `<div><span>ROUND ${ctx.round} ATTACK PLAN</span><strong>${progress.completion}% CLEARED</strong><small>${progress.won}/${progress.total} verified defenses cleared · ${progress.locked} locked · ${progress.losses} loss${progress.losses === 1 ? '' : 'es'}</small></div><div class="gac-manual-war-progress"><i style="--gac-manual-war-progress:${progress.completion}%"></i></div>`;
  const progressNode = host.querySelector('.gac-board-progress');
  if (progressNode) progressNode.insertAdjacentElement('afterend', summary); else host.prepend(summary);
}

function renderCards(ctx) {
  const defenseByKey = new Map(state.defenses.map((row) => [boardKey(row), row]));
  const assignments = assignmentIndex(state.assignments);
  const openAssignments = openPlanIndex(state.openPlan);
  const units = rosterIndex(state.mineRoster);
  for (const card of document.querySelectorAll('[data-gac-board-workspace] .gac-visible-defense')) {
    card.querySelector('[data-gac-manual-war-panel]')?.remove();
    const defense = defenseByKey.get(clean(card.dataset.gacBoardKey).toUpperCase()) || null;
    if (!defense?.id) {
      delete card.dataset.defenseId;
      continue;
    }
    const defenseId = Number(defense.id);
    card.dataset.defenseId = String(defenseId);
    const assignment = assignments.get(defenseId) || null;
    const openAssignment = openAssignments.get(defenseId) || null;
    const status = clean(assignment?.status).toLowerCase();
    const counter = card.querySelector('.gac-board-smart-counter');
    if (counter) {
      counter.classList.add('gac-manual-war-authoritative');
      if (assignment && ['planned', 'attempted'].includes(status)) counter.outerHTML = lockedHtml(assignment, units);
      else if (assignment && status === 'win') counter.outerHTML = `<div class="gac-manual-war-counter is-cleared"><strong>✓ DEFENSE CLEARED</strong><span>The War Room will not spend another squad here.</span></div>`;
      else counter.outerHTML = recommendationHtml(openAssignment, units);
    }
    const panel = document.createElement('section');
    panel.className = `gac-war-room gac-manual-war-panel is-${status || 'open'}`;
    panel.dataset.gacManualWarPanel = 'true';
    panel.dataset.assignmentId = assignment?.id == null ? '' : String(assignment.id);
    const members = assignment ? lockedMembers(assignment) : recommendationMembers(openAssignment);
    panel.innerHTML = `<header><div><span>ROUND WAR ROOM · SERVER AUTHORITY</span><strong>${escapeHtml(statusLabel(status))}</strong></div><b>${assignment?.attemptCount ? `${Number(assignment.attemptCount)} ATTEMPT${Number(assignment.attemptCount) === 1 ? '' : 'S'}` : `${members.length} ATTACKERS`}</b></header><small>${assignment ? `Defense #${defenseId} · assignment #${Number(assignment.id)}` : `Defense #${defenseId} · locking reserves the entire recommended squad.`}</small>${state.error ? `<div class="gac-manual-war-error">${escapeHtml(state.error)}</div>` : ''}<footer>${controlsHtml(defense, assignment, openAssignment)}</footer>`;
    const footer = card.querySelector(':scope > footer');
    if (footer) footer.insertAdjacentElement('beforebegin', panel); else card.append(panel);
  }
  renderSummary(ctx);
}

async function load({ force = false } = {}) {
  const ctx = identity();
  if (!ctx) return;
  if (!force && state.key === ctx.key && state.defenses.length && state.mineRoster) {
    renderCards(ctx);
    return;
  }
  const requestId = ++state.requestId;
  state.loading = true;
  state.error = '';
  try {
    const [warRoom, mineRoster, opponentRoster, opponentBoard, ownBoard] = await Promise.all([
      fetchJson(`/api/gac/attack-plan/${ctx.mine}?round=${ctx.round}`),
      fetchJson(`/api/player/${ctx.mine}`),
      fetchJson(`/api/player/${ctx.opponent}`),
      fetchJson(`/api/gac/current-board/${ctx.mine}/defense?round=${ctx.round}`),
      fetchJson(`/api/gac/current-board/${ctx.mine}/my-defense?round=${ctx.round}`),
    ]);
    if (requestId !== state.requestId) return;
    if (allyCode(opponentBoard?.opponent?.allyCode) !== ctx.opponent) throw new Error('Verified board opponent does not match the selected opponent.');
    const assignments = Array.isArray(warRoom?.assignments) ? warRoom.assignments : [];
    const defenses = Array.isArray(opponentBoard?.defenses) ? opponentBoard.defenses : [];
    const ownDefenses = Array.isArray(ownBoard?.defenses) ? ownBoard.defenses : [];
    const open = buildOpenWarRoomPlan(mineRoster, opponentRoster, defenses, ownDefenses, assignments, { size: ctx.size });
    state.key = ctx.key;
    state.assignments = assignments;
    state.defenses = defenses;
    state.ownDefenses = ownDefenses;
    state.openPlan = Array.isArray(open?.assignments) ? open.assignments : [];
    state.mineRoster = mineRoster;
    state.opponentRoster = opponentRoster;
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.error = clean(error?.message || error);
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      renderCards(ctx);
    }
  }
}

async function lockCounter(card) {
  const ctx = identity();
  const defenseId = Number(card?.dataset?.defenseId);
  const openAssignment = openPlanIndex(state.openPlan).get(defenseId);
  const members = recommendationMembers(openAssignment);
  const leaderBaseId = members[0] || '';
  if (!ctx || !defenseId || !members.length || !leaderBaseId || state.busy.has(defenseId)) return;
  state.busy.add(defenseId);
  state.error = '';
  renderCards(ctx);
  try {
    await fetchJson(`/api/gac/attack-plan/${ctx.mine}`, {
      method: 'POST',
      body: JSON.stringify({ round: ctx.round, defenseId, leaderBaseId, members, datacronId: '' }),
    });
    window.dispatchEvent(new CustomEvent('gac-war-room-updated', { detail: { action:'manual-board-counter-locked', defenseId } }));
    await load({ force: true });
  } catch (error) {
    state.error = clean(error?.message || error);
  } finally {
    state.busy.delete(defenseId);
    renderCards(ctx);
  }
}

async function releasePlan(card) {
  const ctx = identity();
  const defenseId = Number(card?.dataset?.defenseId);
  const assignment = assignmentIndex(state.assignments).get(defenseId);
  if (!ctx || !assignment?.id || clean(assignment.status).toLowerCase() !== 'planned' || state.busy.has(defenseId)) return;
  state.busy.add(defenseId);
  state.error = '';
  renderCards(ctx);
  try {
    await fetchJson(`/api/gac/attack-plan/${ctx.mine}`, {
      method: 'PATCH',
      body: JSON.stringify({ round: ctx.round, id: Number(assignment.id), status: 'abandoned' }),
    });
    window.dispatchEvent(new CustomEvent('gac-war-room-updated', { detail: { action:'manual-board-plan-released', defenseId, assignmentId:Number(assignment.id) } }));
    await load({ force: true });
  } catch (error) {
    state.error = clean(error?.message || error);
  } finally {
    state.busy.delete(defenseId);
    renderCards(ctx);
  }
}

function handoff(card, action) {
  const defenseId = Number(card?.dataset?.defenseId);
  if (!defenseId) return;
  const saved = document.querySelector(`#gacBoardPlannerGrid .gac-saved-board-card[data-defense-id="${defenseId}"]`);
  if (!saved) {
    window.dispatchEvent(new CustomEvent('gac-manual-war-room-handoff', { detail: { action, defenseId } }));
    state.error = 'The verified execution panel is not mounted yet. Re-open Board & Counters after the saved board refreshes.';
    const ctx = identity();
    if (ctx) renderCards(ctx);
    return;
  }
  const selector = action === 'preflight' ? '[data-war-action="attempt"]' : '[data-war-action="win"]';
  const button = saved.querySelector(selector);
  if (button) button.click();
  saved.scrollIntoView?.({ behavior:'smooth', block:'center' });
}

function schedule(delay = 80, force = false) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void load({ force }), Math.max(0, delay));
}

function injectStyle() {
  if (document.querySelector('link[data-gac-manual-war-bridge-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-manual-war-room-bridge.css?v=20260821-warbridge1';
  link.dataset.gacManualWarBridgeStyle = 'true';
  document.head.appendChild(link);
}

function bind() {
  injectStyle();
  document.addEventListener('click', (event) => {
    const action = event.target.closest?.('[data-gac-manual-war-action]');
    if (!action) return;
    const card = action.closest('.gac-visible-defense');
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const kind = clean(action.dataset.gacManualWarAction).toLowerCase();
    if (kind === 'lock') void lockCounter(card);
    else if (kind === 'release') void releasePlan(card);
    else if (kind === 'preflight') handoff(card, 'preflight');
    else if (kind === 'result') handoff(card, 'result');
  }, true);
  document.addEventListener('change', (event) => {
    if (['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id) || event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode],[data-gac-board-format]')) schedule(120, true);
  }, true);
  window.addEventListener('gac-visible-board-rendered', () => schedule(40, true));
  window.addEventListener('gac-board-evidence-updated', () => schedule(80, true));
  window.addEventListener('gac-war-room-updated', () => schedule(60, true));
  window.addEventListener('gac-current-opponent-manually-confirmed', () => schedule(80, true));
  document.addEventListener('DOMContentLoaded', () => schedule(180, true), { once:true });
  schedule(300, true);
}

if (typeof document !== 'undefined') bind();

export { boardKey, identity, recommendationMembers, statusLabel, warRoomProgress };
