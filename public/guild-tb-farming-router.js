import { renderGuildTbFarmingGuidePage } from './guild-tb-farming-guide.js';

const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { catalog: null, catalogPromise: null, renderKey: '', rendering: false, timer: 0 };
const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function pathName() { return location.pathname.replace(/\/+$/, '') || '/'; }
function isGuildRoute() { return pathName() === '/guild' || pathName().startsWith('/guild/'); }
function isFarmingRoute() { return pathName() === '/guild/tb/farming'; }
function currentAllyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = ''; try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query,input,stored].find((code) => code.length === 9) || '';
}
function routeUrl(path) {
  const code = currentAllyCode();
  return code.length === 9 ? `${path}?allyCode=${encodeURIComponent(code)}` : path;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch('/data/catalog.json?guild-tb-farming=1',{cache:'no-store'})
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units)) throw new Error('Static game catalog is unavailable.');
      state.catalog = body.units;
      return state.catalog;
    })
    .finally(() => { state.catalogPromise = null; });
  return state.catalogPromise;
}

function ensureNav() {
  if (!isGuildRoute()) return;
  const nav = document.querySelector('.guild-route-nav');
  if (!nav) return;
  let link = nav.querySelector('[data-guild-tb-farming-nav]');
  if (!link) {
    link = document.createElement('a');
    link.dataset.guildTbFarmingNav = 'true';
    link.textContent = 'TB Farming';
    const tbLink = [...nav.querySelectorAll('a')].find((candidate) => {
      const path = String(candidate.getAttribute('href') || '').split('?')[0].replace(/\/+$/, '');
      return path === '/guild/tb';
    });
    if (tbLink) tbLink.insertAdjacentElement('afterend', link);
    else nav.appendChild(link);
  }
  link.href = routeUrl('/guild/tb/farming');
  link.classList.toggle('active', isFarmingRoute());
  if (isFarmingRoute()) {
    for (const other of nav.querySelectorAll('a')) if (other !== link) other.classList.remove('active');
  }
}

function ensureTbCallout() {
  if (pathName() !== '/guild/tb') return;
  const target = document.getElementById('guildRouteContent');
  const heading = target?.querySelector('.guild-route-page-heading');
  if (!target || !heading || target.querySelector('[data-guild-tb-farming-callout]')) return;
  const callout = document.createElement('section');
  callout.dataset.guildTbFarmingCallout = 'true';
  callout.className = 'guild-page-card guild-next-model';
  callout.innerHTML = `<strong>TB Roster Farming Guide</strong><span>Compare verified ROTE farm needs against Journey Guide, Galactic Legend and fleet prerequisites. Members can filter to themselves and find double-use farms.</span><a class="guild-route-card-link" href="${escapeHtml(routeUrl('/guild/tb/farming'))}">Open TB Farming Guide →</a>`;
  heading.insertAdjacentElement('afterend', callout);
}

function ensureOverviewCard() {
  if (pathName() !== '/guild') return;
  const grid = document.querySelector('#guildRouteContent .guild-route-card-grid');
  if (!grid || grid.querySelector('[data-guild-tb-farming-card]')) return;
  const card = document.createElement('article');
  card.dataset.guildTbFarmingCard = 'true';
  card.className = 'guild-capability-card';
  card.innerHTML = `<div class="kicker">TB + JOURNEY VALUE</div><div class="guild-capability-title"><h3>TB Farming Guide</h3><span>MEMBER ACCESS</span></div><p>Find ROTE upgrades that also advance Journey Guide, Galactic Legend or fleet prerequisites for each member.</p><a class="guild-route-card-link" href="${escapeHtml(routeUrl('/guild/tb/farming'))}">Open TB Farming Guide →</a>`;
  const tbCard = [...grid.children].find((node) => node.textContent?.includes('TB Command'));
  if (tbCard) tbCard.insertAdjacentElement('afterend', card);
  else grid.appendChild(card);
}

async function renderFarming(force = false) {
  if (!isFarmingRoute() || state.rendering) return;
  const target = document.getElementById('guildRouteContent');
  const snapshot = window.__swgohGuildCommandSnapshot;
  if (!target || !snapshot?.members) return;
  const code = currentAllyCode();
  const key = `${snapshot?.guild?.id || ''}|${snapshot?.fetchedAt || ''}|${code}`;
  if (!force && state.renderKey === key && target.querySelector('[data-tb-farm-list]')) return;
  state.rendering = true;
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Building TB farming and Journey overlap intelligence…</div></section>';
  try {
    const catalog = await loadCatalog();
    renderGuildTbFarmingGuidePage({ target, guildSnapshot: snapshot, catalog, allyCode: code });
    state.renderKey = key;
  } catch (error) {
    target.innerHTML = `<section class="guild-page-card"><div class="workspace-error">${escapeHtml(error?.message || 'TB Farming Guide is unavailable.')}</div></section>`;
  } finally {
    state.rendering = false;
  }
}

function postRender() {
  if (!isGuildRoute()) return;
  ensureNav();
  ensureTbCallout();
  ensureOverviewCard();
  if (isFarmingRoute()) renderFarming(false);
}

function schedule(force = false) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    postRender();
    if (force && isFarmingRoute()) renderFarming(true);
  }, 60);
}

function install() {
  if (!isGuildRoute()) return;
  postRender();
  new MutationObserver(() => schedule(false)).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('swgoh:guild-command-snapshot', () => { state.renderKey = ''; schedule(true); });
  window.addEventListener('popstate', () => { state.renderKey = ''; schedule(true); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
