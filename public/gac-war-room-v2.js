import { compareRosters, rankRosterFitSquads, unitDeltaRows } from './gac-counter-engine.js';
import { rankEvidenceCounters } from './gac-counter-evidence.js';
import { abilityTierTotal } from './gac-ability-intelligence.js';

const state = {
  mine: null,
  opponent: null,
  opponentCode: '',
  selected: new Set(),
  leaderId: '',
  mode: 5,
  tab: sessionStorage.getItem('swgoh:gacv2:tab') || 'matchup',
  requestId: 0,
  mounted: false,
};

const number = new Intl.NumberFormat('en-US');
const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function ownerCode() {
  return allyCode(
    document.getElementById('allyCode')?.value ||
    window.__swgohAccountAllyCode ||
    window.__swgohPlayerRosterSnapshot?.allyCode ||
    window.__swgohLiveSnapshot?.allyCode
  );
}

function formatAllyCode(value) {
  return allyCode(value).replace(/(\d{3})(?=\d)/g, '$1-');
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: options.cache || 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function fetchRoster(code) {
  const body = await fetchJson(`/api/player/${allyCode(code)}`);
  if (!body?.player || !Array.isArray(body?.units)) {
    throw new Error('Command Center did not return a usable full roster for that Ally Code.');
  }
  return body;
}

function imageUrl(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}

function unitArt(unit = {}, extra = '') {
  const src = imageUrl(unit);
  const name = clean(unit.name || unit.baseId || 'Unknown');
  const baseId = clean(unit.baseId);
  return `<span class="gacv2-unit-art ${extra}" ${baseId ? `data-inspect-base-id="${escapeAttr(baseId)}"` : ''} title="${escapeAttr(name)}">
    ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(name)}" loading="lazy">` : `<span class="gacv2-unit-fallback">${escapeHtml(name.slice(0,2).toUpperCase())}</span>`}
  </span>`;
}

function deepRound(root) {
  const stack = [root];
  const seen = new WeakSet();
  let visited = 0;
  while (stack.length && visited < 5000) {
    const value = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value); visited += 1;
    for (const key of ['round','roundNumber','currentRound','currentRoundNumber']) {
      const round = Number(value?.[key]);
      if (Number.isInteger(round) && round >= 1 && round <= 3) return round;
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
  }
  return null;
}

function matchupOpponent(body = {}) {
  const candidates = [
    body?.matchup?.opponent,
    body?.currentOpponent,
    body?.opponent,
    body?.event?.opponent,
  ];
  for (const value of candidates) {
    const code = allyCode(value?.allyCode || value?.ally_code);
    if (/^\d{9}$/.test(code)) return { code, name: clean(value?.name), value };
  }
  return null;
}

function setStatus(kind, title, detail = '') {
  const host = document.querySelector('[data-gacv2-status]');
  if (!host) return;
  host.className = `gacv2-status is-${kind}`;
  host.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}`;
}

function setBusy(busy, label = 'Working…') {
  document.querySelectorAll('[data-gacv2-action]').forEach((button) => {
    button.disabled = busy;
  });
  const search = document.querySelector('[data-gacv2-search]');
  if (search) search.textContent = busy ? label : 'Search & Compare';
}

function renderMatchup() {
  const host = document.querySelector('[data-gacv2-matchup-summary]');
  if (!host) return;
  if (!state.mine || !state.opponent) {
    host.innerHTML = `<div class="gacv2-empty"><strong>No matchup loaded</strong><span>Use Auto Detect or enter the opponent's Ally Code.</span></div>`;
    return;
  }
  const comparison = compareRosters(state.mine, state.opponent);
  const left = comparison.left || {};
  const right = comparison.right || {};
  const delta = comparison.delta || {};
  const metric = (label, value) => `<div class="gacv2-metric"><span>${escapeHtml(label)}</span><strong class="${n(value) > 0 ? 'good' : n(value) < 0 ? 'bad' : ''}">${n(value) > 0 ? '+' : ''}${number.format(n(value))}</strong></div>`;
  host.innerHTML = `
    <div class="gacv2-versus">
      <article><span>YOUR ROSTER</span><strong>${escapeHtml(left.name || 'You')}</strong><small>${number.format(n(left.gp))} GP · ${number.format(n(left.relicUnits))} relic · ${number.format(n(left.omicrons))} omi</small></article>
      <b>VS</b>
      <article class="enemy"><span>OPPONENT</span><strong>${escapeHtml(right.name || formatAllyCode(state.opponentCode))}</strong><small>${number.format(n(right.gp))} GP · ${number.format(n(right.relicUnits))} relic · ${number.format(n(right.omicrons))} omi</small></article>
    </div>
    <div class="gacv2-metrics">
      ${metric('GP Δ', delta.gp)}${metric('Relic chars Δ', delta.relicUnits)}${metric('Relic score Δ', delta.relicTotal)}${metric('Omicron Δ', delta.omicrons)}${metric('Zeta Δ', delta.zetas)}${metric('Top speed Δ', delta.topSpeed)}${metric('6-dot mods Δ', delta.sixDotMods)}${metric('Character GP Δ', delta.characterGp)}
    </div>`;
}

function rosterCharacters(roster) {
  return Array.isArray(roster?.units)
    ? roster.units.filter((unit) => String(unit?.unitType || '').toLowerCase() !== 'ship').sort((a,b) => n(b.power)-n(a.power))
    : [];
}

function selectedEnemy() {
  const byId = new Map(rosterCharacters(state.opponent).map((unit) => [unit.baseId, unit]));
  const units = [...state.selected].map((id) => byId.get(id)).filter(Boolean);
  if (!state.leaderId) return units;
  const leader = units.find((unit) => unit.baseId === state.leaderId);
  return leader ? [leader, ...units.filter((unit) => unit.baseId !== state.leaderId)] : units;
}

function renderBoardSelector() {
  const host = document.querySelector('[data-gacv2-defense-grid]');
  const count = document.querySelector('[data-gacv2-defense-count]');
  if (!host) return;
  if (!state.opponent) {
    host.innerHTML = `<div class="gacv2-empty">Load an opponent to select the defense shown in-game.</div>`;
    return;
  }
  const query = clean(document.querySelector('[data-gacv2-defense-search]')?.value).toLowerCase();
  const rows = rosterCharacters(state.opponent).filter((unit) => !query || clean(unit.name).toLowerCase().includes(query)).slice(0, 120);
  host.innerHTML = rows.map((unit) => {
    const checked = state.selected.has(unit.baseId);
    return `<button type="button" class="gacv2-defense-unit ${checked ? 'selected' : ''}" data-gacv2-defender="${escapeAttr(unit.baseId)}">
      ${unitArt(unit)}
      <span><strong>${escapeHtml(unit.name)}</strong><small>R${n(unit.relic)} · ${number.format(n(unit.speed))} spd · Z${n(unit.zetas)} · O${n(unit.omicrons)}</small></span>
    </button>`;
  }).join('');
  if (count) count.textContent = `${state.selected.size}/${state.mode}`;
  renderCounterResults();
}

async function renderCounterResults() {
  const host = document.querySelector('[data-gacv2-counter-results]');
  if (!host) return;
  const enemy = selectedEnemy();
  if (!state.mine || !enemy.length) {
    host.innerHTML = `<div class="gacv2-empty">Select the enemy squad you see on the board.</div>`;
    return;
  }
  const heuristic = rankRosterFitSquads(state.mine, enemy, { size: state.mode });
  let evidence = [];
  if (enemy.length === state.mode && state.leaderId) {
    try {
      const format = state.mode === 3 ? '3v3' : '5v5';
      const body = await fetchJson(`/api/gac/counters?format=${format}&enemyLeader=${encodeURIComponent(state.leaderId)}&limit=200`);
      evidence = rankEvidenceCounters(state.mine, enemy, body?.observations || [], { size: state.mode });
    } catch { evidence = []; }
  }
  const cards = evidence.length ? evidence.slice(0,6).map((result, index) => counterCard(result, index, true)) : heuristic.slice(0,8).map((result,index) => counterCard(result,index,false));
  host.innerHTML = `<div class="gacv2-counter-source">${evidence.length ? 'HISTORICAL EVIDENCE' : 'ROSTER-FIT FALLBACK'}</div>${cards.join('') || '<div class="gacv2-empty">No roster-fit counter found.</div>'}`;
}

function counterCard(result, index, evidence) {
  const squad = Array.isArray(result?.squad) ? result.squad : [];
  const score = evidence ? `${Math.round(n(result.winRate)*100)}%` : number.format(n(result.score));
  return `<article class="gacv2-counter-card">
    <header><strong>#${index+1} ${escapeHtml(result?.confidence || (evidence ? 'EVIDENCE' : 'FIT'))}</strong><b>${escapeHtml(score)}</b></header>
    <div class="gacv2-counter-units">${squad.map((unit) => unitArt(unit)).join('')}</div>
    <small>${evidence ? `${number.format(n(result.battles))} recorded battles` : `Relic Δ ${n(result.relicDelta) >= 0 ? '+' : ''}${n(result.relicDelta)} · Speed Δ ${n(result.speedEdge) >= 0 ? '+' : ''}${n(result.speedEdge)}`}</small>
  </article>`;
}

function renderRosterDelta() {
  const host = document.querySelector('[data-gacv2-delta-grid]');
  if (!host) return;
  if (!state.mine || !state.opponent) {
    host.innerHTML = `<div class="gacv2-empty">Load a matchup to compare individual units.</div>`;
    return;
  }
  const query = clean(document.querySelector('[data-gacv2-delta-search]')?.value).toLowerCase();
  const rows = unitDeltaRows(state.mine, state.opponent).filter((row) => !query || clean(row.name).toLowerCase().includes(query)).slice(0,100);
  host.innerHTML = rows.map((row) => {
    const unit = row.theirs || row.mine || {};
    return `<article class="gacv2-delta-unit">
      ${unitArt(unit)}
      <div><strong>${escapeHtml(row.name)}</strong><small>You: ${row.mine ? `R${n(row.mine.relic)} · ${number.format(n(row.mine.speed))} spd · Z${n(row.mine.zetas)} · O${n(row.mine.omicrons)}` : 'Not owned'}</small><small>Them: ${row.theirs ? `R${n(row.theirs.relic)} · ${number.format(n(row.theirs.speed))} spd · Z${n(row.theirs.zetas)} · O${n(row.theirs.omicrons)}` : 'Not owned'}</small></div>
      <div class="gacv2-delta-badges"><span class="${n(row.relicDelta)>=0?'good':'bad'}">R ${n(row.relicDelta)>=0?'+':''}${n(row.relicDelta)}</span><span class="${n(row.speedDelta)>=0?'good':'bad'}">SPD ${n(row.speedDelta)>=0?'+':''}${n(row.speedDelta)}</span></div>
    </article>`;
  }).join('');
}

function historyCards(body = {}, label = '') {
  const rounds = Array.isArray(body?.rounds) ? body.rounds : [];
  if (!rounds.length) return `<div class="gacv2-empty">No persisted rounds available for ${escapeHtml(label)} yet.</div>`;
  return rounds.slice(0,24).map((round) => `<article class="gacv2-history-card">
    <span>R${n(round.round)} · ${escapeHtml(round?.event?.seasonId || round?.event?.id || 'GAC')}</span>
    <strong>${escapeHtml(round?.opponent?.name || round?.opponent?.allyCode || 'Unknown opponent')}</strong>
    <small>${escapeHtml(String(round?.result || 'unknown').toUpperCase())} · ${round?.playerBanners ?? '—'} / ${round?.opponentBanners ?? '—'} banners · ${escapeHtml(round?.source || 'history')}</small>
  </article>`).join('');
}

async function renderHistory() {
  const mineHost = document.querySelector('[data-gacv2-history-mine]');
  const enemyHost = document.querySelector('[data-gacv2-history-enemy]');
  if (!mineHost || !enemyHost || !state.mine || !state.opponent) return;
  const mineCode = allyCode(state.mine?.player?.allyCode || ownerCode());
  const enemyCode = allyCode(state.opponent?.player?.allyCode || state.opponentCode);
  const [mineHistory, enemyHistory] = await Promise.all([
    /^\d{9}$/.test(mineCode) ? fetchJson(`/api/gac/history/${mineCode}?limit=30`).catch(() => ({})) : {},
    /^\d{9}$/.test(enemyCode) ? fetchJson(`/api/gac/history/${enemyCode}?limit=30`).catch(() => ({})) : {},
  ]);
  mineHost.innerHTML = historyCards(mineHistory, 'your roster');
  enemyHost.innerHTML = historyCards(enemyHistory, 'the opponent');
}

async function loadOpponent(code, options = {}) {
  const owner = ownerCode();
  const opponent = allyCode(code);
  if (!/^\d{9}$/.test(owner)) throw new Error('Your verified Ally Code is not available yet.');
  if (!/^\d{9}$/.test(opponent) || opponent === owner) throw new Error('Enter a different valid 9-digit opponent Ally Code.');
  const requestId = ++state.requestId;
  setBusy(true, 'Loading rosters…');
  try {
    const [mine, enemy] = await Promise.all([fetchRoster(owner), fetchRoster(opponent)]);
    if (requestId !== state.requestId) return;
    state.mine = mine;
    state.opponent = enemy;
    state.opponentCode = opponent;
    state.selected.clear(); state.leaderId = '';
    const input = document.querySelector('[data-gacv2-opponent]');
    if (input) input.value = formatAllyCode(opponent);
    renderMatchup(); renderBoardSelector(); renderRosterDelta(); await renderHistory();
    setStatus(options.auto ? 'good' : 'ready', options.auto ? 'Current opponent loaded' : 'Roster comparison ready', `${formatAllyCode(owner)} vs ${formatAllyCode(opponent)}`);
  } finally { setBusy(false); }
}

async function autoDetect() {
  const owner = ownerCode();
  if (!/^\d{9}$/.test(owner)) {
    setStatus('warn','Waiting for verified Ally Code','Open Player once or load your roster.');
    return;
  }
  setBusy(true,'Detecting…');
  setStatus('working','Checking active GAC','Looking for exact live or confirmed opponent evidence.');
  try {
    let opponent = null;
    let source = '';
    try {
      const matchup = await fetchJson(`/api/gac/matchup/${owner}`);
      opponent = matchupOpponent(matchup);
      if (opponent) source = clean(matchup?.opponentResolution?.method || matchup?.source || 'matchup');
    } catch {}
    if (!opponent) {
      const bracket = await fetchJson(`/api/gac/bracket/by-player/${owner}?refresh=1`);
      if (bracket?.opponentResolution?.exact === true) {
        opponent = matchupOpponent(bracket);
        if (opponent) source = clean(bracket?.opponentResolution?.method || 'bracket');
      }
      const round = deepRound(bracket);
      const select = document.querySelector('[data-gacv2-round]');
      if (select && round) select.value = String(round);
    }
    if (!opponent) {
      setStatus('warn','Exact opponent not exposed','Enter the in-game Ally Code below; you can compare immediately and optionally confirm the pairing for this round.');
      return;
    }
    await loadOpponent(opponent.code,{auto:true});
    setStatus('good',`Current opponent · ${opponent.name || formatAllyCode(opponent.code)}`,`${formatAllyCode(opponent.code)} · ${source || 'exact evidence'}`);
  } catch (error) {
    setStatus('bad','Automatic detection unavailable',error?.message || 'Manual Ally Code comparison is still available.');
  } finally { setBusy(false); }
}

async function detectRound() {
  try {
    const body = await fetchJson('/api/gac/current-event');
    const round = deepRound(body);
    const select = document.querySelector('[data-gacv2-round]');
    if (select && round) select.value = String(round);
    return round;
  } catch { return null; }
}

async function confirmOpponent() {
  const owner = ownerCode();
  const opponent = allyCode(document.querySelector('[data-gacv2-opponent]')?.value);
  let round = Number(document.querySelector('[data-gacv2-round]')?.value);
  if (!Number.isInteger(round) || round < 1 || round > 3) round = await detectRound();
  if (!/^\d{9}$/.test(owner) || !/^\d{9}$/.test(opponent)) {
    setStatus('bad','Cannot confirm opponent','A valid verified player and opponent Ally Code are required.');
    return;
  }
  if (!round) {
    setStatus('warn','Select the current round','Choose Round 1, 2, or 3 exactly as shown in-game before saving the pairing.');
    return;
  }
  setBusy(true,'Confirming…');
  try {
    await fetchJson(`/api/gac/current-opponent/${owner}/confirm`, {
      method:'POST', body: JSON.stringify({opponentAllyCode:opponent,round}),
    });
    setStatus('good',`Round ${round} opponent confirmed`,`${formatAllyCode(opponent)} is now the verified pairing for this event/round.`);
    await loadOpponent(opponent,{auto:true});
    window.dispatchEvent(new CustomEvent('gac-current-opponent-manually-confirmed',{detail:{ownerAllyCode:owner,opponentAllyCode:opponent,round}}));
  } catch (error) {
    setStatus('bad','Opponent confirmation failed',error?.message || 'The pairing was not saved.');
  } finally { setBusy(false); }
}

function activateTab(id) {
  state.tab = ['matchup','board','delta','history','diagnostics'].includes(id) ? id : 'matchup';
  sessionStorage.setItem('swgoh:gacv2:tab',state.tab);
  document.querySelectorAll('[data-gacv2-tab]').forEach((button) => button.classList.toggle('active',button.dataset.gacv2Tab === state.tab));
  document.querySelectorAll('[data-gacv2-panel]').forEach((panel) => panel.hidden = panel.dataset.gacv2Panel !== state.tab);
}

function markup() {
  return `<section class="gacv2-shell" data-gacv2-root>
    <header class="gacv2-topline">
      <div><span>GAC WAR ROOM</span><strong>Current Matchup Command</strong></div>
      <div data-gacv2-status class="gacv2-status is-working"><strong>Checking active GAC…</strong></div>
    </header>
    <div class="gacv2-setup">
      <button type="button" data-gacv2-action data-gacv2-auto>Auto Detect</button>
      <input data-gacv2-opponent inputmode="numeric" maxlength="11" placeholder="Opponent Ally Code · 123-456-789">
      <select data-gacv2-round><option value="">Round</option><option value="1">Round 1</option><option value="2">Round 2</option><option value="3">Round 3</option></select>
      <button type="button" data-gacv2-action data-gacv2-search>Search & Compare</button>
      <button type="button" data-gacv2-action data-gacv2-confirm class="secondary">Confirm Current Opponent</button>
    </div>
    <nav class="gacv2-tabs">
      <button data-gacv2-tab="matchup">Matchup</button><button data-gacv2-tab="board">Board & Counters</button><button data-gacv2-tab="delta">Roster Delta</button><button data-gacv2-tab="history">Scouting & History</button><button data-gacv2-tab="diagnostics">Diagnostics</button>
    </nav>
    <div class="gacv2-panel" data-gacv2-panel="matchup"><div data-gacv2-matchup-summary></div></div>
    <div class="gacv2-panel" data-gacv2-panel="board" hidden>
      <div class="gacv2-panel-head"><div><strong>Enemy defense</strong><span>Select exactly what you see in-game.</span></div><div><select data-gacv2-mode><option value="5">5v5</option><option value="3">3v3</option></select><input data-gacv2-defense-search placeholder="Search opponent units…"><b data-gacv2-defense-count>0/5</b></div></div>
      <div data-gacv2-defense-grid class="gacv2-defense-grid"></div>
      <div data-gacv2-counter-results class="gacv2-counter-grid"></div>
    </div>
    <div class="gacv2-panel" data-gacv2-panel="delta" hidden><div class="gacv2-panel-head"><div><strong>Unit-by-unit roster delta</strong><span>Relic, speed, zeta and omicron differences.</span></div><input data-gacv2-delta-search placeholder="Search units…"></div><div data-gacv2-delta-grid class="gacv2-delta-grid"></div></div>
    <div class="gacv2-panel" data-gacv2-panel="history" hidden><div class="gacv2-history-columns"><section><h4>Your recent rounds</h4><div data-gacv2-history-mine></div></section><section><h4>Opponent recent rounds</h4><div data-gacv2-history-enemy></div></section></div></div>
    <div class="gacv2-panel gacv2-diagnostics" data-gacv2-panel="diagnostics" hidden><div class="gacv2-diagnostic-host" data-gacv2-legacy-host></div></div>
  </section>`;
}

function moveLegacy() {
  const root = document.querySelector('[data-gacv2-root]');
  const host = root?.querySelector('[data-gacv2-legacy-host]');
  const legacy = document.getElementById('gacCommandCenterPro');
  if (!root || !host || !legacy || root.contains(legacy)) return;
  host.appendChild(legacy);
}

function bind() {
  document.querySelector('[data-gacv2-auto]')?.addEventListener('click',()=>void autoDetect());
  document.querySelector('[data-gacv2-search]')?.addEventListener('click',()=>{
    const code = allyCode(document.querySelector('[data-gacv2-opponent]')?.value);
    loadOpponent(code).catch((error)=>setStatus('bad','Comparison failed',error?.message || 'Unable to load matchup.'));
  });
  document.querySelector('[data-gacv2-confirm]')?.addEventListener('click',()=>void confirmOpponent());
  document.querySelectorAll('[data-gacv2-tab]').forEach((button)=>button.addEventListener('click',()=>activateTab(button.dataset.gacv2Tab)));
  document.querySelector('[data-gacv2-mode]')?.addEventListener('change',(event)=>{state.mode=Number(event.target.value)===3?3:5;state.selected.clear();state.leaderId='';renderBoardSelector();});
  document.querySelector('[data-gacv2-defense-search]')?.addEventListener('input',renderBoardSelector);
  document.querySelector('[data-gacv2-delta-search]')?.addEventListener('input',renderRosterDelta);
  document.querySelector('[data-gacv2-defense-grid]')?.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-gacv2-defender]'); if(!button)return;
    const id=button.dataset.gacv2Defender;
    if(state.selected.has(id)){state.selected.delete(id);if(state.leaderId===id)state.leaderId='';}
    else if(state.selected.size<state.mode){state.selected.add(id);if(!state.leaderId)state.leaderId=id;}
    renderBoardSelector();
  });
}

function mount() {
  if (state.mounted || document.querySelector('[data-gacv2-root]')) return true;
  const legacy = document.getElementById('gacCommandCenterPro');
  if (!legacy) return false;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = markup();
  const root = wrapper.firstElementChild;
  legacy.insertAdjacentElement('beforebegin',root);
  state.mounted = true;
  bind(); moveLegacy(); activateTab(state.tab); renderMatchup(); renderBoardSelector(); renderRosterDelta();
  void detectRound();
  setTimeout(()=>void autoDetect(),120);
  return true;
}

let timer=null;
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(mount())moveLegacy();},30);}

if(typeof document!=='undefined'){
  schedule();
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('hashchange',schedule);
  window.addEventListener('swgoh:workspace-activated',(event)=>{if(event.detail?.id==='gac')schedule();});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
}

export { allyCode, deepRound, formatAllyCode, matchupOpponent, ownerCode };
