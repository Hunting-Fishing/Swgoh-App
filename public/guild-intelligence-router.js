const INTELLIGENCE_PATH = '/guild/intelligence';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { loading: false, renderedKey: '', body: null };

const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : '0';

function isIntelligenceRoute() {
  return location.pathname.replace(/\/+$/, '') === INTELLIGENCE_PATH;
}

function currentAllyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((code) => code.length === 9) || '';
}

function routeUrl(path, allyCode = currentAllyCode()) {
  const code = digits(allyCode);
  return code.length === 9 ? `${path}?allyCode=${encodeURIComponent(code)}` : path;
}

function ensureStyles() {
  if (document.querySelector('link[data-guild-intelligence-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-intelligence.css?v=20260818-intel1';
  link.dataset.guildIntelligenceStyle = 'true';
  document.head.appendChild(link);
}

function ensureNav() {
  const nav = document.querySelector('.guild-route-nav');
  if (!nav) return;
  let link = nav.querySelector('[data-guild-intelligence-nav]');
  if (!link) {
    link = document.createElement('a');
    link.dataset.guildIntelligenceNav = 'true';
    link.dataset.guildRouteNav = 'true';
    link.dataset.guildRoutePath = INTELLIGENCE_PATH;
    link.textContent = 'Intelligence';
    nav.appendChild(link);
  }
  link.href = routeUrl(INTELLIGENCE_PATH);
  for (const item of nav.querySelectorAll('a')) item.classList.toggle('active', item === link ? isIntelligenceRoute() : (!isIntelligenceRoute() && item.classList.contains('active')));
}

function statusLabel(value) {
  const status = String(value || 'not_captured');
  const labels = {
    captured: 'Captured',
    partial: 'Partial',
    source_pending: 'Source Pending',
    not_applicable: 'Legacy / N/A',
    failed: 'Failed',
    not_captured: 'Not Captured Yet',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

function badgeTone(value) {
  const status = String(value || '');
  if (status === 'captured' || status === 'active') return 'ready';
  if (status === 'partial') return 'partial';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function formatDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 'Not yet' : date.toLocaleString();
}

function pageCard(page) {
  const capture = String(page.captureStatus || 'not_captured');
  const sources = Array.isArray(page.expectedSources) ? page.expectedSources.join(' · ') : '';
  return `<article class="guild-intelligence-page ${page.userFacing === false ? 'guild-intelligence-internal' : ''}" data-capture="${escapeHtml(capture)}">
    <div class="guild-intelligence-page-head">
      <div><div class="guild-intelligence-sheet">${escapeHtml(page.workbookSheet)}</div><h4>${escapeHtml(page.title)}</h4></div>
      <span class="guild-intelligence-badge ${badgeTone(capture)}">${escapeHtml(statusLabel(capture))}</span>
    </div>
    <div class="guild-intelligence-badges">
      <span class="guild-intelligence-badge ${badgeTone(page.implementationStatus)}">${escapeHtml(String(page.implementationStatus || '').replaceAll('_', ' '))}</span>
      <span class="guild-intelligence-badge">Phase ${number(page.phase)}</span>
      ${page.userFacing === false ? '<span class="guild-intelligence-badge">Data / Internal</span>' : '<span class="guild-intelligence-badge">Officer Page</span>'}
    </div>
    <p>${escapeHtml(page.description || '')}</p>
    <div class="guild-intelligence-sources">Sources: ${escapeHtml(sources || 'registry / future source')}</div>
    <div class="guild-intelligence-sources">Latest capture: ${escapeHtml(page.capturedAt ? formatDate(page.capturedAt) : 'not captured yet')}</div>
    ${page.error ? `<div class="workspace-error">${escapeHtml(page.error)}</div>` : ''}
  </article>`;
}

function summaryStat(label, value, detail = '') {
  return `<div class="guild-intelligence-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;
}

function renderBody(body) {
  const target = document.getElementById('guildRouteContent');
  if (!target || !isIntelligenceRoute()) return;
  const pages = Array.isArray(body?.pages) ? body.pages : [];
  const summary = body?.summary || {};
  const settings = body?.settings || {};
  const report = body?.latestReport || null;
  const groups = new Map();
  for (const page of pages) {
    const category = String(page.category || 'Other');
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(page);
  }
  const groupedHtml = [...groups.entries()].map(([category, rows]) => `
    <section class="guild-intelligence-group">
      <div class="guild-intelligence-group-header"><h3>${escapeHtml(category)}</h3><span>${number(rows.length)} workbook module${rows.length === 1 ? '' : 's'}</span></div>
      <div class="guild-intelligence-grid">${rows.map(pageCard).join('')}</div>
    </section>`).join('');

  target.innerHTML = `<div class="guild-intelligence-shell">
    <section class="guild-intelligence-hero">
      <div class="kicker">SWGOH COMMAND CENTER · GUILD INTELLIGENCE</div>
      <h2>Daily Guild Intelligence Ledger</h2>
      <p>Every worksheet from the Ludus Venatus tracker is registered here as a durable Command Center data product. Each Guild-local midnight report records all 29 modules, including pages whose dedicated event source is still scheduled for a later build phase.</p>
    </section>
    <div class="guild-intelligence-summary">
      ${summaryStat('Workbook Pages', number(summary.totalPages))}
      ${summaryStat('Captured', number(summary.captured))}
      ${summaryStat('Partial', number(summary.partial))}
      ${summaryStat('Source Pending', number(summary.sourcePending))}
      ${summaryStat('Legacy / N/A', number(summary.notApplicable))}
      ${summaryStat('Returned', number(summary.returnedTotal), 'membership events')}
    </div>
    <section class="guild-intelligence-schedule">
      <div><div class="kicker">AUTOMATED DAILY CAPTURE</div><strong>Guild-local midnight report</strong><p>Timezone <code>${escapeHtml(settings.report_timezone || 'America/Phoenix')}</code> · local capture time <code>${escapeHtml(settings.report_local_time || '00:00:00')}</code></p></div>
      <div><span class="guild-intelligence-badge ${report?.status === 'failed' ? 'failed' : report?.status === 'completed' ? 'ready' : 'partial'}">${escapeHtml(report?.status || 'baseline pending')}</span><p>Latest: ${escapeHtml(report?.report_date || 'none')} · ${escapeHtml(report?.completed_at ? formatDate(report.completed_at) : 'not completed')}</p></div>
    </section>
    <div class="guild-intelligence-note"><strong>Capture semantics:</strong> Captured = the workbook capability is backed by a durable source now. Partial = useful fields are being captured but parity is not complete. Source Pending = the page is registered and receives a daily ledger row, but its dedicated ROTE/Raid/EchoBase source still belongs to a later phase. Legacy / N/A = retained for historical migration rather than new daily game events.</div>
    <div class="guild-intelligence-groups">${groupedHtml}</div>
  </div>`;
}

async function load(force = false) {
  if (!isIntelligenceRoute() || state.loading) return;
  const target = document.getElementById('guildRouteContent');
  if (!target) return;
  const code = currentAllyCode();
  if (code.length !== 9) {
    target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Load any current Guild member Ally Code to open Guild Intelligence.</div></section>';
    return;
  }
  const key = `${code}|${location.pathname}`;
  if (!force && state.body && state.renderedKey === key) {
    renderBody(state.body);
    return;
  }
  state.loading = true;
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Loading the 29-page Guild Intelligence registry and latest daily report…</div></section>';
  try {
    const response = await fetch(`/api/guild/by-player/${code}/intelligence`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `Guild Intelligence returned HTTP ${response.status}`);
    state.body = body;
    state.renderedKey = key;
    renderBody(body);
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || 'Guild Intelligence is unavailable.')}</div></section>`;
  } finally {
    state.loading = false;
  }
}

function postRender() {
  ensureStyles();
  ensureNav();
  if (isIntelligenceRoute()) load(false);
}

function install() {
  if (!location.pathname.startsWith('/guild')) return;
  postRender();
  const observer = new MutationObserver(() => postRender());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('swgoh:guild-command-snapshot', () => {
    if (!isIntelligenceRoute()) return;
    state.renderedKey = '';
    load(true);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);
