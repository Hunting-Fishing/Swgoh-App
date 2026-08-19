const API = '/api/account/web-actions/tb';
const ROUTE = '/guild/tb';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function routeActive() {
  const path = typeof location === 'undefined' ? '' : location.pathname.replace(/\/+$/, '') || '/';
  return path === ROUTE;
}

function timeLabel(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not set';
}

function relativePhaseTime(value, nowMs = Date.now()) {
  const end = Date.parse(text(value));
  if (!Number.isFinite(end)) return 'Phase end not set';
  const delta = end - nowMs;
  if (delta <= 0) return 'Phase timer ended';
  const minutes = Math.floor(delta / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h remaining`;
  if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
  return `${Math.max(1, minutes)}m remaining`;
}

export function warRoomEventSummary(input = {}, nowMs = Date.now()) {
  const configured = input?.configured === true && Boolean(input?.event);
  if (!configured) {
    return Object.freeze({
      configured: false,
      phase: '',
      sourceKind: '',
      phaseEndsAt: '',
      phaseTime: 'No active TB event',
      zoneCount: 0,
      currentTp: 0,
      currentStars: 0,
      targetStars: 0,
      commandCounts: Object.freeze({ attack: 0, preload: 0, hold: 0, deploy: 0, stop: 0 }),
      urgentCount: 0,
      evidenceBoundary: text(input?.evidenceBoundary),
    });
  }
  const zones = array(input.zones);
  const commandCounts = { attack: 0, preload: 0, hold: 0, deploy: 0, stop: 0 };
  for (const zone of zones) {
    const command = text(zone?.commandState).toLowerCase();
    if (Object.hasOwn(commandCounts, command)) commandCounts[command] += 1;
  }
  return Object.freeze({
    configured: true,
    phase: text(input.event.currentPhase),
    sourceKind: text(input.event.sourceKind),
    phaseEndsAt: text(input.event.phaseEndsAt),
    phaseTime: relativePhaseTime(input.event.phaseEndsAt, nowMs),
    zoneCount: zones.length,
    currentTp: zones.reduce((sum, zone) => sum + Number(zone?.currentTp || 0), 0),
    currentStars: zones.reduce((sum, zone) => sum + Number(zone?.currentStars || 0), 0),
    targetStars: zones.reduce((sum, zone) => sum + Number(zone?.targetStars || 0), 0),
    commandCounts: Object.freeze(commandCounts),
    urgentCount: commandCounts.stop + commandCounts.hold,
    evidenceBoundary: text(input.evidenceBoundary),
  });
}

async function fetchEvent() {
  const response = await fetch(`${API}/event`, { cache: 'no-store', credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `TB event state returned HTTP ${response.status}`);
    error.status = response.status;
    error.code = body?.code || '';
    throw error;
  }
  return body;
}

function commandBadge(command, count) {
  if (!count) return '';
  return `<span class="tb-war-command command-${escapeAttr(command)}"><b>${escapeHtml(command.toUpperCase())}</b>${number(count)}</span>`;
}

function zoneCard(zone = {}) {
  const command = text(zone.commandState || 'attack').toLowerCase();
  const preload = zone.preloadCapTp == null ? '' : `<small>Preload cap <b>${number(zone.preloadCapTp)} TP</b></small>`;
  return `<article class="tb-war-zone command-${escapeAttr(command)}">
    <header><span>${escapeHtml(zone.planetId || 'Territory')}</span><b>${escapeHtml(command.toUpperCase())}</b></header>
    <div><strong>${number(zone.currentTp)} TP</strong><span>${number(zone.currentStars)}★ now · ${number(zone.targetStars)}★ target</span></div>
    ${preload}
    <p>${escapeHtml(zone.commandMessage || 'No officer message')}</p>
  </article>`;
}

function configuredMarkup(data) {
  const summary = warRoomEventSummary(data);
  const zoneRows = array(data.zones);
  const sourceClass = summary.sourceKind === 'canonical' ? 'canonical' : 'officer';
  return `<section class="tb-war-room-entry" data-tb-war-room-entry>
    <header class="tb-war-room-head">
      <div>
        <span>TB LIVE COMMAND LAYER</span>
        <h3>${escapeHtml(summary.phase || 'ROTE')} War Room</h3>
        <p>Durable event state drives Today in TB. Static mission/map intelligence remains separate.</p>
      </div>
      <div class="tb-war-room-state ${escapeAttr(sourceClass)}"><small>${escapeHtml(summary.sourceKind.toUpperCase() || 'STATE')}</small><strong>${escapeHtml(summary.phaseTime)}</strong><span>Ends ${escapeHtml(timeLabel(summary.phaseEndsAt))}</span></div>
    </header>
    <div class="tb-war-room-kpis">
      <div><span>Configured zones</span><strong>${number(summary.zoneCount)}</strong></div>
      <div><span>Recorded zone TP</span><strong>${number(summary.currentTp)}</strong></div>
      <div><span>Current stars</span><strong>${number(summary.currentStars)}</strong></div>
      <div><span>Zone targets</span><strong>${number(summary.targetStars)}</strong></div>
      <div><span>Urgent holds/stops</span><strong>${number(summary.urgentCount)}</strong></div>
    </div>
    <div class="tb-war-command-strip">${Object.entries(summary.commandCounts).map(([command, count]) => commandBadge(command, count)).join('') || '<span class="tb-war-no-command">No zone commands configured</span>'}</div>
    ${zoneRows.length ? `<div class="tb-war-zones">${zoneRows.map(zoneCard).join('')}</div>` : '<div class="tb-war-empty">No current-phase territory state has been entered yet. Officers can configure it from Today in TB.</div>'}
    <div class="tb-war-room-actions">
      <a class="primary" href="/guild/tb/today">Open Today in TB</a>
      <a href="/guild/tb/today#officer-controls">Edit Event & Territory Commands</a>
      <button type="button" data-tb-war-refresh>Refresh Event State</button>
    </div>
    <small class="tb-war-boundary">${escapeHtml(summary.evidenceBoundary || '')}</small>
  </section>`;
}

function unconfiguredMarkup(data = {}) {
  return `<section class="tb-war-room-entry unconfigured" data-tb-war-room-entry>
    <header class="tb-war-room-head"><div><span>TB LIVE COMMAND LAYER</span><h3>Activate the War Room</h3><p>The ROTE map and mission database are ready, but no durable active TB event is configured.</p></div><div class="tb-war-room-state"><small>EVENT STATE</small><strong>NOT CONFIGURED</strong><span>Reference data stays reference-only</span></div></header>
    <div class="tb-war-room-actions"><a class="primary" href="/guild/tb/today#officer-controls">Configure Active TB Event</a><a href="/guild/tb/today">Open Today in TB</a><button type="button" data-tb-war-refresh>Check Again</button></div>
    <small class="tb-war-boundary">${escapeHtml(data.evidenceBoundary || 'Static ROTE reference data is not being presented as live event state.')}</small>
  </section>`;
}

function authMarkup(error) {
  return `<section class="tb-war-room-entry unconfigured" data-tb-war-room-entry>
    <header class="tb-war-room-head"><div><span>TB LIVE COMMAND LAYER</span><h3>Sign in for live Guild orders</h3><p>The existing ROTE officer tools remain available. The durable event/Today layer requires a verified Command Center identity.</p></div><div class="tb-war-room-state"><small>ACCOUNT</small><strong>SIGN-IN REQUIRED</strong><span>${escapeHtml(error?.code || 'AUTH_REQUIRED')}</span></div></header>
    <div class="tb-war-room-actions"><a class="primary" href="/account">Open Account</a><a href="/guild/tb/today">Open Today in TB</a></div>
  </section>`;
}

function mountHost() {
  if (!routeActive() || typeof document === 'undefined') return null;
  const content = document.getElementById('guildRouteContent');
  if (!content) return null;
  let host = document.getElementById('tbWarRoomEntryHost');
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.id = 'tbWarRoomEntryHost';
  host.className = 'tb-war-room-entry-host';
  const heading = content.querySelector(':scope > .guild-route-page-heading');
  if (heading) heading.insertAdjacentElement('afterend', host);
  else content.prepend(host);
  return host;
}

let loading = false;
let loadedAt = 0;
async function renderWarRoom({ force = false } = {}) {
  const host = mountHost();
  if (!host || loading) return;
  if (!force && host.dataset.loaded === '1' && Date.now() - loadedAt < 15000) return;
  loading = true;
  host.innerHTML = '<section class="tb-war-room-entry loading"><strong>Synchronizing TB event state…</strong><span>Loading current phase and officer territory commands.</span></section>';
  try {
    const data = await fetchEvent();
    host.innerHTML = data.configured ? configuredMarkup(data) : unconfiguredMarkup(data);
    host.dataset.loaded = '1';
    loadedAt = Date.now();
    host.querySelector('[data-tb-war-refresh]')?.addEventListener('click', () => renderWarRoom({ force: true }));
  } catch (error) {
    host.innerHTML = error.status === 401 || error.status === 403 ? authMarkup(error) : `<section class="tb-war-room-entry error"><strong>TB event state unavailable</strong><span>${escapeHtml(error.message)}</span><button type="button" data-tb-war-refresh>Retry</button></section>`;
    host.querySelector('[data-tb-war-refresh]')?.addEventListener('click', () => renderWarRoom({ force: true }));
  } finally {
    loading = false;
  }
}

function install() {
  if (!routeActive() || typeof document === 'undefined') return;
  renderWarRoom({ force: true });
  window.addEventListener('swgoh:guild-command-snapshot', () => renderWarRoom({ force: true }));
  const observer = new MutationObserver(() => {
    if (!document.getElementById('tbWarRoomEntryHost')) renderWarRoom({ force: false });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0), { once: true });
  else setTimeout(install, 0);
}
