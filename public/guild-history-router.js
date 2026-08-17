const HISTORY_PATH = '/guild/history';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const VIEWS = Object.freeze([
  ['membership', 'Membership'],
  ['growth', 'GP / Roster'],
  ['tickets', 'Tickets'],
  ['raids', 'Raids'],
  ['rote', 'ROTE'],
  ['reva', 'Reva'],
  ['progression', 'GL / Inquisitor'],
]);
const GL_BASES = new Set(['GLAHSOKATANO','JABBATHEHUTT','JEDIMASTERKENOBI','GRANDMASTERLUKE','GLLEIA','LORDVADER','GLHONDO','GLREY','SITHPALPATINE','SUPREMELEADERKYLOREN']);
const INQ_BASES = new Set(['EIGHTHBROTHER','FIFTHBROTHER','GRANDINQUISITOR','INQUISITORBARRISS','MARROK','NINTHSISTER','SECONDSISTER','SEVENTHSISTER','THIRDSISTER']);

const state = { loading: false, code: '', view: 'membership', coverage: null, sections: new Map(), catalog: null, renderedKey: '' };
const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : '—';
const pct = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : '—';

function isHistoryRoute() { return location.pathname.replace(/\/+$/, '') === HISTORY_PATH; }
function currentAllyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || '';
}
function requestedView() {
  const view = String(new URLSearchParams(location.search).get('view') || 'membership');
  return VIEWS.some(([id]) => id === view) ? view : 'membership';
}
function routeUrl(view = state.view) {
  const params = new URLSearchParams(location.search);
  if (state.code) params.set('allyCode', state.code);
  params.set('view', view);
  return `${HISTORY_PATH}?${params.toString()}`;
}
function formatDay(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}
function formatTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function formatAlly(value) {
  const code = digits(value);
  return code.length === 9 ? code.replace(/(\d{3})(?=\d)/g, '$1-') : code || '—';
}
function ensureStyle() {
  if (document.querySelector('link[data-guild-history-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-history.css?v=20260818-guildhistory1';
  link.dataset.guildHistoryStyle = 'true';
  document.head.appendChild(link);
}
function ensureNav() {
  const nav = document.querySelector('.guild-route-nav');
  if (!nav) return;
  let link = nav.querySelector('[data-guild-history-nav]');
  if (!link) {
    link = document.createElement('a');
    link.dataset.guildHistoryNav = 'true';
    link.dataset.guildRouteNav = 'true';
    link.dataset.guildRoutePath = HISTORY_PATH;
    link.textContent = 'History';
    nav.appendChild(link);
  }
  link.href = state.code ? `${HISTORY_PATH}?allyCode=${encodeURIComponent(state.code)}` : HISTORY_PATH;
  if (isHistoryRoute()) for (const item of nav.querySelectorAll('a')) item.classList.toggle('active', item === link);
}
async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}
async function section(name) {
  if (state.sections.has(name)) return state.sections.get(name);
  const body = await fetchJson(`/api/guild/by-player/${state.code}/history/archive?section=${encodeURIComponent(name)}`);
  const data = body?.data;
  state.sections.set(name, data);
  return data;
}
async function dictionary() { return section('dict'); }
async function catalogIndex() {
  if (state.catalog) return state.catalog;
  try {
    const body = await fetchJson('/data/catalog.json?guild-history=1');
    state.catalog = new Map((Array.isArray(body?.units) ? body.units : []).map((row) => [String(row.baseId || '').toUpperCase(), row]));
  } catch { state.catalog = new Map(); }
  return state.catalog;
}
function stat(label, value, detail = '') {
  return `<div class="guild-history-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;
}
function sparkline(values, label = 'Historical trend') {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length < 2) return '';
  const min = Math.min(...nums), max = Math.max(...nums), span = Math.max(1, max - min);
  const points = nums.map((value, index) => `${(index / (nums.length - 1)) * 100},${30 - ((value - min) / span) * 28}`).join(' ');
  return `<svg class="guild-history-spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="${escapeAttr(label)}"><polyline points="${points}" vector-effect="non-scaling-stroke" /></svg>`;
}
function empty(message) { return `<div class="workspace-note">${escapeHtml(message)}</div>`; }
function viewTabs() {
  return `<nav class="guild-history-tabs" aria-label="Historical Guild Intelligence">${VIEWS.map(([id,label]) => `<a href="${escapeAttr(routeUrl(id))}" data-history-view="${id}" class="${id === state.view ? 'active' : ''}">${escapeHtml(label)}</a>`).join('')}</nav>`;
}
function shell(content) {
  const target = document.getElementById('guildRouteContent');
  if (!target) return;
  const c = state.coverage || {};
  target.innerHTML = `<div class="guild-history-shell">
    <section class="guild-history-hero">
      <div><div class="kicker">GUILD INTELLIGENCE · HISTORICAL ARCHIVE</div><h2>Ludus Venatus Historical Command</h2><p>Provenance-backed Guild history from ${escapeHtml(formatDay(c.firstObservedAt))} through ${escapeHtml(formatDay(c.lastObservedAt))}, joined to the canonical live timeline. Exact events remain exact; observation gaps remain bounded windows.</p></div>
      <div class="guild-history-source"><span>ARCHIVE V${number(c.payloadVersion)}</span><small>${escapeHtml(c.source || 'historical source')}</small><small>SHA ${escapeHtml(String(c.sourceSha256 || '').slice(0,12))}…</small></div>
    </section>
    ${viewTabs()}
    <section id="guildHistoryView" class="guild-history-view">${content}</section>
  </div>`;
  bindTabs();
}
function bindTabs() {
  for (const link of document.querySelectorAll('[data-history-view]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const view = link.dataset.historyView;
      if (!VIEWS.some(([id]) => id === view)) return;
      state.view = view;
      history.replaceState(null, '', routeUrl(view));
      renderView();
    });
  }
}
function loadingView() { shell('<div class="guild-history-loading">Decrypting historical holocron…</div>'); }

async function renderMembership() {
  const [dict, periods, returns] = await Promise.all([dictionary(), section('membershipPeriods'), section('returns')]);
  const allies = Array.isArray(dict?.allies) ? dict.allies : [];
  const names = Array.isArray(dict?.names) ? dict.names : [];
  const decodedReturns = (Array.isArray(returns) ? returns : []).map((r) => ({
    allyCode: allies[r[0]] || '', name: names[r[0]] || allies[r[0]] || 'Unknown', returnedAt: r[1], priorPresent: r[2], firstAbsent: r[3], reobserved: r[4],
  })).sort((a,b) => String(b.returnedAt).localeCompare(String(a.returnedAt)));
  const decodedPeriods = (Array.isArray(periods) ? periods : []).map((r) => ({
    allyCode: allies[r[0]] || '', name: names[r[0]] || allies[r[0]] || 'Unknown', period: r[1], joinedAt: r[2], firstObserved: r[3], lastObserved: r[4], firstAbsent: r[5],
  }));
  const currentTenures = decodedPeriods.filter((row) => !row.firstAbsent).length;
  const returnedPlayers = new Set(decodedReturns.map((row) => row.allyCode)).size;
  const rows = decodedReturns.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(formatAlly(row.allyCode))}</small></td><td><strong>RETURNED</strong><small>Exact reported Guild join</small></td><td>${escapeHtml(formatTime(row.returnedAt))}</td><td><span class="bounded">${escapeHtml(formatDay(row.priorPresent))} → ${escapeHtml(formatDay(row.firstAbsent))}</span><small>prior presence → first observed absence</small></td><td>${escapeHtml(formatDay(row.reobserved))}</td></tr>`).join('');
  const recentPeriods = decodedPeriods.slice().sort((a,b) => String(b.joinedAt || b.firstObserved).localeCompare(String(a.joinedAt || a.firstObserved))).slice(0,40).map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(formatAlly(row.allyCode))}</small></td><td>#${number(row.period)}</td><td>${escapeHtml(formatDay(row.joinedAt || row.firstObserved))}</td><td>${row.firstAbsent ? `<span class="bounded">${escapeHtml(formatDay(row.lastObserved))} → ${escapeHtml(formatDay(row.firstAbsent))}</span><small>bounded leave window</small>` : '<span class="current">CURRENT / LAST OBSERVED</span>'}</td></tr>`).join('');
  return `<div class="guild-history-stat-grid">${stat('Membership Periods',number(decodedPeriods.length))}${stat('Confirmed Returns',number(decodedReturns.length))}${stat('Players Who Returned',number(returnedPlayers))}${stat('Open / Current Periods',number(currentTenures))}</div>
    <section class="guild-history-card"><div class="kicker">CONFIRMED RETURN EVENTS</div><h3>Exact return timestamps</h3><p>Same Ally Code, prior complete-roster presence, observed absence, then a fresh game-reported Guild join timestamp.</p><div class="guild-history-table-wrap"><table><thead><tr><th>Player</th><th>Event</th><th>Returned</th><th>Evidence Window</th><th>Re-observed</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No confirmed returns.</td></tr>'}</tbody></table></div></section>
    <section class="guild-history-card"><div class="kicker">TENURE LEDGER</div><h3>Continuous membership periods</h3><p>Leave dates are not fabricated. Where an exact leave timestamp does not exist, the UI shows the bounded window from last observed present to first observed absent.</p><div class="guild-history-table-wrap"><table><thead><tr><th>Player</th><th>Tenure</th><th>Reported Join / First Seen</th><th>End</th></tr></thead><tbody>${recentPeriods}</tbody></table></div></section>`;
}

async function renderGrowth() {
  const [snapshots, monthly] = await Promise.all([section('guildSnapshots'), section('playerMonthly')]);
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const first = rows[0], last = rows.at(-1);
  const gain = first && last ? Number(last[2]) - Number(first[2]) : 0;
  const months = (Array.isArray(monthly) ? monthly : []).slice().sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  const monthRows = months.slice().reverse().map((r) => `<tr><td>${escapeHtml(r[0])}</td><td>${number(r[1])}</td><td>${number(r[2])}</td><td>${number(r[3])}</td><td>${number(r[4])}</td></tr>`).join('');
  const recent = rows.slice(-40).reverse().map((r) => `<tr><td>${escapeHtml(formatTime(r[0]))}</td><td>${number(r[1])}</td><td>${number(r[2])}</td></tr>`).join('');
  return `<div class="guild-history-stat-grid">${stat('Exact Guild Snapshots',number(rows.length))}${stat('First GP',number(first?.[2]),formatDay(first?.[0]))}${stat('Latest Archived GP',number(last?.[2]),formatDay(last?.[0]))}${stat('Archived GP Growth',`${gain >= 0 ? '+' : ''}${number(gain)}`)}</div>
    <section class="guild-history-card"><div class="kicker">GUILD GP TRAJECTORY</div><h3>Exact archived Guild snapshots</h3>${sparkline(rows.map((r)=>r[2]),'Guild GP history')}<div class="guild-history-table-wrap"><table><thead><tr><th>Snapshot</th><th>Members</th><th>Guild GP</th></tr></thead><tbody>${recent}</tbody></table></div></section>
    <section class="guild-history-card"><div class="kicker">MONTHLY ROSTER DEVELOPMENT</div><h3>Player-observation aggregates</h3><p>The monthly lane aggregates 1,723 raw player-month observations. Character + ship GP remain separate evidence streams.</p><div class="guild-history-table-wrap"><table><thead><tr><th>Month</th><th>Player observations</th><th>Total GP</th><th>Character GP</th><th>Ship GP</th></tr></thead><tbody>${monthRows}</tbody></table></div></section>`;
}

async function renderTickets() {
  const data = (Array.isArray(await section('tickets')) ? await section('tickets') : []).slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const latest = data.at(-1) || [];
  const best = data.reduce((a,b)=>Number(b[3]||0)>Number(a?.[3]||0)?b:a, data[0] || []);
  const rows = data.slice(-120).reverse().map((r)=>`<tr><td>${escapeHtml(r[0])}</td><td>${number(r[1])}</td><td>${number(r[2])}</td><td><strong>${number(r[3])}</strong></td><td class="bad">${number(r[4])}</td><td>${number(r[5])}</td></tr>`).join('');
  return `<div class="guild-history-stat-grid">${stat('Ticket Days',number(data.length))}${stat('Latest Tickets',number(latest[2]),latest[0] || '')}${stat('Latest 600s',number(latest[3]),`${number(latest[1])} members`)}${stat('Latest Zeroes',number(latest[4]))}${stat('Best Full-600 Count',number(best[3]),best[0] || '')}</div>
    <section class="guild-history-card"><div class="kicker">DAILY RAID TICKETS</div><h3>Guild participation discipline</h3>${sparkline(data.map((r)=>r[2]),'Daily Raid ticket totals')}<p><strong>Zero</strong> is a subset of <strong>Below 600</strong>; they are intentionally shown separately.</p><div class="guild-history-table-wrap"><table><thead><tr><th>Date</th><th>Members</th><th>Total Tickets</th><th>Exactly 600</th><th>Zero</th><th>Below 600</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

async function renderRaids() {
  const raw = Array.isArray(await section('raids')) ? await section('raids') : [];
  const seen = new Set();
  const data = raw.filter((r)=>{ const key=[r[0],r[1],r[3],r[4]].join('|'); if(seen.has(key)) return false; seen.add(key); return true; }).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const latest = data.at(-1) || [];
  const best = data.reduce((a,b)=>Number(b[3]||0)>Number(a?.[3]||0)?b:a,data[0]||[]);
  const rows = data.slice().reverse().map((r)=>`<tr><td>${escapeHtml(r[0])}</td><td><strong>${escapeHtml(r[1])}</strong></td><td>${number(r[3])}</td><td>${number(r[4])} / ${number(r[2])}</td><td>${pct(Number(r[2]) ? Number(r[4])/Number(r[2])*100 : null)}</td></tr>`).join('');
  return `<div class="guild-history-stat-grid">${stat('Raid Events',number(data.length),raw.length !== data.length ? `${raw.length-data.length} exact source duplicate(s) hidden` : '')}${stat('Latest Raid',latest[1] || '—',latest[0] || '')}${stat('Latest Score',number(latest[3]))}${stat('Best Archived Score',number(best[3]),best[1] || '')}</div>
    <section class="guild-history-card"><div class="kicker">RAID HISTORY</div><h3>Speeder Bike → Naboo → Order 66</h3>${sparkline(data.map((r)=>r[3]),'Historical Raid score')}<div class="guild-history-table-wrap"><table><thead><tr><th>Date</th><th>Raid</th><th>Score</th><th>Participants</th><th>Participation</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

async function renderRote() {
  const data = (Array.isArray(await section('rote')) ? await section('rote') : []).slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const latest = data.at(-1) || [];
  const rows = data.slice().reverse().map((r)=>`<tr><td>${escapeHtml(r[0])}</td><td>${number(r[1])}</td><td>${number(r[2])}</td><td>${number(r[3])}</td><td>${number(r[4])}</td><td>${number(r[5])}</td><td class="bad">${number(r[6])}</td><td>${number(r[7])}</td><td>${number(r[8])}</td><td>${number(r[9])}</td></tr>`).join('');
  return `<div class="guild-history-stat-grid">${stat('ROTE Events',number(data.length))}${stat('Latest Deployed TP',number(latest[3]),latest[0] || '')}${stat('Latest Mission TP',number(latest[4]))}${stat('Mission Attempts',number(latest[5]))}${stat('Missed Phase Obs.',number(latest[6]))}</div>
    <section class="guild-history-card"><div class="kicker">ROTE PERFORMANCE HISTORY</div><h3>Deployment, mission and participation evidence</h3>${sparkline(data.map((r)=>r[3]),'ROTE deployed Territory Points')}<p><strong>Member/phase GP aggregate</strong> is a workbook aggregation across member/phase records. It is deliberately not labeled as simple Guild GP.</p><div class="guild-history-table-wrap"><table><thead><tr><th>Date</th><th>Member Records</th><th>Member/Phase GP Aggregate</th><th>Deployed TP</th><th>Mission TP</th><th>Attempts</th><th>Missed Phases</th><th>Zeffo</th><th>Mandalore</th><th>Reva</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

async function renderReva() {
  const data = (Array.isArray(await section('reva')) ? await section('reva') : []).slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const latest = data.at(-1) || [];
  const total = data.reduce((sum,r)=>sum+Number(r[1]||0),0);
  const rows = data.slice().reverse().map((r)=>`<tr><td>${escapeHtml(r[0])}</td><td><strong>${number(r[1])}</strong></td><td>${number(r[2])}</td><td>${r[3] === null || r[3] === undefined ? '—' : number(r[3])}</td></tr>`).join('');
  return `<div class="guild-history-stat-grid">${stat('Reva Events',number(data.length))}${stat('Archived Shards Earned',number(total))}${stat('Latest Earned',number(latest[1]),latest[0] || '')}${stat('Latest In-Guild Earners',latest[3] == null ? '—' : number(latest[3]),latest[3] == null ? 'source unavailable' : '')}</div>
    <section class="guild-history-card"><div class="kicker">REVA SHARD HISTORY</div><h3>Earned shards and Guild-side earner evidence</h3>${sparkline(data.map((r)=>r[1]),'Reva shards earned per event')}<p>Missing late-source <em>inGuild</em> counts are shown as <strong>—</strong>, never converted to zero.</p><div class="guild-history-table-wrap"><table><thead><tr><th>Date</th><th>Earned</th><th>Guild Members</th><th>In-Guild Earners</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function milestoneLabel(value) { return String(value || '').replaceAll('_',' ').replaceAll('+',' + ').replace(/\b\w/g,(m)=>m.toUpperCase()); }
async function renderProgression() {
  const [dict, milestones, catalog] = await Promise.all([dictionary(), section('trackedUnitMilestones'), catalogIndex()]);
  const bases = Array.isArray(dict?.bases) ? dict.bases : [];
  const eventTypes = Array.isArray(dict?.eventTypes) ? dict.eventTypes : [];
  const rows = (Array.isArray(milestones) ? milestones : []).map((r)=>({ baseId:bases[r[0]] || 'UNKNOWN', event:eventTypes[r[1]] || 'event', count:r[2], first:r[3], last:r[4] }));
  const renderGroup = (title,set) => {
    const list = rows.filter((r)=>set.has(r.baseId));
    const byUnit = new Map();
    for (const row of list) { if(!byUnit.has(row.baseId)) byUnit.set(row.baseId,[]); byUnit.get(row.baseId).push(row); }
    return `<section class="guild-history-card"><div class="kicker">${escapeHtml(title)}</div><h3>Historical progression milestones</h3><p>Counts are raw observed milestone events grouped by unit/event type—not current owner counts.</p><div class="guild-history-unit-grid">${[...byUnit.entries()].map(([baseId,events])=>{ const unit=catalog.get(baseId)||{}; return `<article><h4>${escapeHtml(unit.name || baseId)}</h4><small>${escapeHtml(baseId)}</small>${events.sort((a,b)=>String(a.event).localeCompare(String(b.event))).map((e)=>`<div><strong>${number(e.count)}</strong><span>${escapeHtml(milestoneLabel(e.event))}</span><small>${escapeHtml(formatDay(e.first))} → ${escapeHtml(formatDay(e.last))}</small></div>`).join('')}</article>`; }).join('')}</div></section>`;
  };
  return `<div class="guild-history-stat-grid">${stat('Raw Milestone Events',number(state.coverage?.counts?.trackedUnitMilestones || 0))}${stat('Grouped Series',number(rows.length))}${stat('Tracked GLs',number(GL_BASES.size))}${stat('Tracked Inquisitors',number(INQ_BASES.size))}</div>${renderGroup('GALACTIC LEGENDS',GL_BASES)}${renderGroup('INQUISITORIUS',INQ_BASES)}`;
}

async function renderView() {
  if (!isHistoryRoute()) return;
  const target = document.getElementById('guildHistoryView');
  if (target) target.innerHTML = '<div class="guild-history-loading">Loading selected historical lane…</div>';
  else loadingView();
  try {
    let html = '';
    if (state.view === 'membership') html = await renderMembership();
    else if (state.view === 'growth') html = await renderGrowth();
    else if (state.view === 'tickets') html = await renderTickets();
    else if (state.view === 'raids') html = await renderRaids();
    else if (state.view === 'rote') html = await renderRote();
    else if (state.view === 'reva') html = await renderReva();
    else if (state.view === 'progression') html = await renderProgression();
    shell(html || empty('No historical data is available for this lane.'));
  } catch (error) {
    shell(`<div class="workspace-error">${escapeHtml(error?.message || 'Historical Guild Intelligence is unavailable.')}</div>`);
  }
}

async function load(force = false) {
  if (!isHistoryRoute() || state.loading) return;
  const code = currentAllyCode();
  if (code.length !== 9) { shell(empty('Load any current Guild member Ally Code to open historical Guild Intelligence.')); return; }
  const key = `${code}|${requestedView()}`;
  if (!force && state.renderedKey === key && state.coverage) { state.view=requestedView(); renderView(); return; }
  state.loading = true; state.code = code; state.view = requestedView();
  if (force || state.code !== code) state.sections.clear();
  loadingView();
  try {
    state.coverage = await fetchJson(`/api/guild/by-player/${code}/history/coverage`);
    state.renderedKey = key;
    await renderView();
  } catch (error) {
    shell(`<div class="workspace-error">${escapeHtml(error?.message || 'Historical Guild archive is unavailable.')}</div>`);
  } finally { state.loading = false; }
}

function postRender() { ensureStyle(); ensureNav(); if (isHistoryRoute()) load(false); }
function install() {
  if (!location.pathname.startsWith('/guild')) return;
  postRender();
  const observer = new MutationObserver(() => postRender());
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('swgoh:guild-command-snapshot', () => { if (isHistoryRoute()) { state.renderedKey=''; load(true); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true}); else setTimeout(install,0);
