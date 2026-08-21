import { buildExecutionChecklist, executionReady } from './gac-battle-execution-model.js';

const state = {
  key: '',
  assignments: [],
  roster: null,
  defenses: [],
  ownDefenses: [],
  open: new Set(),
  confirmations: new Map(),
  errors: new Map(),
  requestId: 0,
  timer: null,
  loading: false,
};

const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity() {
  const mine = allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode);
  const opponent = allyCode(document.getElementById('gacOpponentCode')?.value || document.querySelector('[data-gacv2-opponent]')?.value);
  const round = Number(document.getElementById('gacBracketRound')?.value || document.querySelector('[data-gacv2-round]')?.value);
  const size = Number(document.getElementById('gacMode')?.value || document.querySelector('[data-gacv2-mode]')?.value) === 3 ? 3 : 5;
  if (!/^\d{9}$/.test(mine) || !/^\d{9}$/.test(opponent) || ![1,2,3].includes(round)) return null;
  return Object.freeze({ mine, opponent, round, size, key: `${mine}|${opponent}|${round}|${size}` });
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function assignmentByDefense(defenseId) {
  return state.assignments.find((row) => Number(row?.defenseId) === Number(defenseId)) || null;
}
function defenseById(defenseId) {
  return state.defenses.find((row) => Number(row?.id) === Number(defenseId)) || null;
}
function confirmationFor(id) {
  if (!state.confirmations.has(id)) state.confirmations.set(id, { defense:false, defenderDatacron:false, attack:false, attackerDatacron:false });
  return state.confirmations.get(id);
}
function rosterIntegrity() {
  const detail = window.__gacRosterIntegrity;
  return detail && typeof detail === 'object' ? detail : null;
}

function rowHtml(row) {
  const icon = row.status === 'pass' ? '✓' : row.status === 'warn' ? '!' : '×';
  return `<div class="gac-exec-auto-row is-${escapeHtml(row.status)}"><b>${icon}</b><span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span></div>`;
}

function confirmationRows(assignment, checklist, confirmations) {
  const defenderDc = checklist.defenderDatacron;
  const attackerDc = checklist.attackerDatacron;
  const rows = [
    ['defense', 'I compared the exact enemy squad and slot with the game.', `Defense #${Number(assignment?.defenseId) || '?'} · ${escapeHtml(clean(checklist.fingerprint?.zone) || 'zone ?')} slot ${Number(checklist.fingerprint?.slot) + 1}`],
    ['defenderDatacron', defenderDc.state === 'none' ? 'I confirm the enemy has NO Datacron.' : 'I confirm this exact enemy Datacron is assigned.', escapeHtml(defenderDc.label)],
    ['attack', 'I selected this exact attacker squad and leader in-game.', `${checklist.fingerprint.attackerMembers.length} attackers · leader ${escapeHtml(checklist.fingerprint.attackerLeaderBaseId)}`],
    ['attackerDatacron', attackerDc.state === 'none' ? 'I will attack with NO Datacron.' : 'I selected this exact attacker Datacron in-game.', escapeHtml(attackerDc.label)],
  ];
  return rows.map(([key,label,detail]) => `<label class="gac-exec-confirm ${checklist.readyForConfirmation ? '' : 'is-disabled'}"><input type="checkbox" data-gac-exec-confirm="${key}" ${confirmations[key] ? 'checked' : ''} ${checklist.readyForConfirmation ? '' : 'disabled'}><span><strong>${label}</strong><small>${detail}</small></span></label>`).join('');
}

function checklistHtml(assignment, defense) {
  const id = Number(assignment?.id);
  const confirmations = confirmationFor(id);
  const checklist = buildExecutionChecklist({ assignment, defense, roster:state.roster, ownDefenses:state.ownDefenses, rosterIntegrity:rosterIntegrity() });
  const ready = executionReady(checklist, confirmations);
  const error = clean(state.errors.get(id));
  return `<section class="gac-execution-lock ${ready ? 'is-ready' : checklist.readyForConfirmation ? 'is-confirm' : 'is-blocked'}" data-gac-execution-lock="${id}">
    <header><div><span>PRE-BATTLE LOCK · B08</span><strong>${ready ? 'READY TO BEGIN ATTEMPT' : checklist.readyForConfirmation ? 'USER CONFIRMATION REQUIRED' : 'EXECUTION BLOCKED'}</strong><small>Server revalidates the exact lock again when BEGIN ATTEMPT is pressed.</small></div><b>${checklist.blockers.length ? `${checklist.blockers.length} BLOCKER${checklist.blockers.length===1?'':'S'}` : ready ? 'LOCK VERIFIED' : '4 CONFIRMATIONS'}</b></header>
    <div class="gac-exec-auto"><span>AUTOMATED TRUTH CHECKS</span>${checklist.rows.map(rowHtml).join('')}</div>
    <div class="gac-exec-manual"><span>COMPARE WITH THE GAME BEFORE BATTLE</span>${confirmationRows(assignment, checklist, confirmations)}</div>
    <div class="gac-exec-boundary"><strong>RESOURCE LOCK</strong><span>These attackers remain reserved to this defense. Once the attempt begins, result handling must preserve their consumption boundary.</span></div>
    <div class="gac-exec-boundary is-source"><strong>TACTICAL SOURCE</strong><span>This lock confirms battle identity and resources only. It does not unlock opener, target order, or other execution guidance that remains source-gated in Attack Brief.</span></div>
    ${error ? `<div class="gac-exec-error"><strong>SERVER BLOCKED ATTEMPT</strong><span>${escapeHtml(error)}</span></div>` : ''}
    <footer><button type="button" data-gac-exec-refresh>RECHECK LIVE STATE</button><button type="button" class="is-begin" data-gac-exec-begin ${ready && !state.loading ? '' : 'disabled'}>${state.loading ? 'VERIFYING…' : 'BEGIN ATTEMPT'}</button></footer>
  </section>`;
}

function renderCard(card) {
  card.querySelector('.gac-execution-lock')?.remove();
  const defenseId = Number(card?.dataset?.defenseId);
  const assignment = assignmentByDefense(defenseId);
  const oldAttempt = card.querySelector('[data-war-action="attempt"]');
  if (!assignment || clean(assignment.status).toLowerCase() !== 'planned') {
    if (oldAttempt) oldAttempt.textContent = 'Mark Attempt';
    return;
  }
  const defense = defenseById(defenseId);
  if (oldAttempt) {
    oldAttempt.textContent = state.open.has(Number(assignment.id)) ? 'Close Pre-Battle Checklist' : 'Pre-Battle Checklist';
    oldAttempt.classList.add('is-preflight');
  }
  if (!state.open.has(Number(assignment.id))) return;
  const host = card.querySelector('.gac-war-room') || card;
  host.insertAdjacentHTML('afterend', checklistHtml(assignment, defense || {}));
}

function renderAll() {
  for (const card of document.querySelectorAll('#gacBoardPlannerGrid .gac-saved-board-card')) renderCard(card);
}

async function load({ force = false } = {}) {
  const current = identity();
  if (!current) return;
  if (!force && state.key === current.key && state.assignments.length && state.roster) { renderAll(); return; }
  const requestId = ++state.requestId;
  state.loading = true;
  try {
    const [warRoom, roster, opponentBoard, ownBoard] = await Promise.all([
      fetchJson(`/api/gac/attack-plan/${current.mine}?round=${current.round}`),
      fetchJson(`/api/player/${current.mine}${force ? '?refresh=1' : ''}`),
      fetchJson(`/api/gac/current-board/${current.mine}/defense?round=${current.round}`),
      fetchJson(`/api/gac/current-board/${current.mine}/my-defense?round=${current.round}`),
    ]);
    if (requestId !== state.requestId) return;
    if (allyCode(opponentBoard?.opponent?.allyCode) !== current.opponent) throw new Error('Verified board opponent does not match the selected opponent.');
    if (state.key !== current.key) {
      state.open.clear(); state.confirmations.clear(); state.errors.clear();
    }
    state.key = current.key;
    state.assignments = Array.isArray(warRoom?.assignments) ? warRoom.assignments : [];
    state.roster = roster;
    state.defenses = Array.isArray(opponentBoard?.defenses) ? opponentBoard.defenses : [];
    state.ownDefenses = Array.isArray(ownBoard?.defenses) ? ownBoard.defenses : [];
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.warn('GAC B08 execution preflight unavailable', error);
  } finally {
    if (requestId === state.requestId) { state.loading = false; renderAll(); }
  }
}

async function beginAttempt(card) {
  const current = identity();
  const defenseId = Number(card?.dataset?.defenseId);
  if (!current || !defenseId) return;
  state.loading = true;
  renderAll();
  try {
    await load({ force:true });
    const assignment = assignmentByDefense(defenseId);
    const defense = defenseById(defenseId);
    if (!assignment || !defense || clean(assignment.status).toLowerCase() !== 'planned') throw new Error('The locked plan is no longer in planned state.');
    const confirmations = confirmationFor(Number(assignment.id));
    const checklist = buildExecutionChecklist({ assignment, defense, roster:state.roster, ownDefenses:state.ownDefenses, rosterIntegrity:rosterIntegrity() });
    if (!executionReady(checklist, confirmations)) throw new Error('The pre-battle checklist is not complete after refreshing live state.');
    await fetchJson(`/api/gac/attack-plan/${current.mine}`, {
      method:'PATCH',
      body:JSON.stringify({ id:Number(assignment.id), status:'attempted', banners:null, round:current.round, executionConfirmation:checklist.fingerprint }),
    });
    state.open.delete(Number(assignment.id));
    state.confirmations.delete(Number(assignment.id));
    state.errors.delete(Number(assignment.id));
    window.dispatchEvent(new CustomEvent('gac-war-room-updated',{detail:{action:'attempt-begun',assignmentId:Number(assignment.id),defenseId}}));
    await load({ force:true });
  } catch (error) {
    const assignment = assignmentByDefense(defenseId);
    if (assignment?.id) state.errors.set(Number(assignment.id), clean(error?.message || error));
  } finally {
    state.loading = false;
    renderAll();
  }
}

function schedule(delay = 80, force = false) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void load({ force }), Math.max(0, delay));
}

function injectStyle() {
  if (document.querySelector('link[data-gac-execution-lock-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/gac-battle-execution-ui.css?v=20260821-b08a'; link.dataset.gacExecutionLockStyle = 'true';
  document.head.appendChild(link);
}

function bind() {
  injectStyle();
  document.addEventListener('click', (event) => {
    const attempt = event.target.closest?.('#gacBoardPlannerGrid [data-war-action="attempt"]');
    if (attempt) {
      event.preventDefault(); event.stopImmediatePropagation();
      const card = attempt.closest('.gac-saved-board-card');
      const assignment = assignmentByDefense(Number(card?.dataset?.defenseId));
      if (!assignment?.id) { schedule(0,true); return; }
      const id = Number(assignment.id);
      if (state.open.has(id)) state.open.delete(id); else { state.open.add(id); state.errors.delete(id); }
      renderCard(card);
      return;
    }
    const begin = event.target.closest?.('[data-gac-exec-begin]');
    if (begin) { const card=begin.closest('.gac-saved-board-card'); if(card) void beginAttempt(card); return; }
    const refresh = event.target.closest?.('[data-gac-exec-refresh]');
    if (refresh) { void load({ force:true }); }
  }, true);
  document.addEventListener('change', (event) => {
    const input = event.target?.closest?.('[data-gac-exec-confirm]');
    if (input) {
      const panel = input.closest('[data-gac-execution-lock]');
      const id = Number(panel?.dataset?.gacExecutionLock);
      if (!id) return;
      const confirmations = confirmationFor(id);
      confirmations[input.dataset.gacExecConfirm] = input.checked === true;
      const card = input.closest('.gac-saved-board-card');
      if (card) renderCard(card);
      return;
    }
    if (['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id) || event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode]')) schedule(120,true);
  }, true);
  window.addEventListener('gac-saved-board-rendered', () => schedule(60,true));
  window.addEventListener('gac-war-room-updated', () => schedule(80,true));
  window.addEventListener('gac-board-evidence-updated', () => schedule(100,true));
  window.addEventListener('gac-roster-integrity-updated', () => renderAll());
  document.addEventListener('DOMContentLoaded', () => schedule(200,true), { once:true });
  schedule(350,true);
}

if (typeof document !== 'undefined') bind();

export { beginAttempt, confirmationFor, identity, renderAll };
