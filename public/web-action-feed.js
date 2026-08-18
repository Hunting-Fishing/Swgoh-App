const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { timer: 0, lastKey: '' };
const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0,9);
const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const compact = (value) => { const n = Number(value || 0); if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`; if (n >= 1_000) return `${Math.round(n / 100) / 10}K`; return new Intl.NumberFormat().format(n); };
const dateTime = (value) => { const stamp = Date.parse(text(value)); return Number.isFinite(stamp) ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(stamp)) : '—'; };

function ensureCss() {
  if (document.querySelector('link[data-web-action-feed-css]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/web-action-feed.css?v=20260818a'; link.dataset.webActionFeedCss = 'true'; document.head.appendChild(link);
}
function currentAlly() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = ''; try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query,input,stored].find((code) => code.length === 9) || '';
}
async function requestJson(path) {
  const response = await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  let body={}; try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body?.error||`Feed request failed (${response.status}).`);error.status=response.status;throw error;} return body;
}
function raidMaxItem(item) {
  const result = item?.run?.result || {};
  const summary = result.summary || item?.run?.summary || {};
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  return `<article class="web-action-feed-item"><div class="web-action-feed-item-head"><div><div class="web-action-feed-kicker">RAID MAX · ORDER 66</div><h4>${escapeHtml(result.player?.name || 'Shared Raid Plan')}</h4></div><div><div class="web-action-feed-score">${compact(summary.recommendedMaxScoreCeiling)} validated ceiling</div><div class="web-action-feed-time">${escapeHtml(dateTime(item.publishedAt || item.run.createdAt))}</div></div></div><div class="web-action-feed-attempts">${attempts.slice(0,5).map((attempt)=>`<span class="web-action-feed-chip">#${Number(attempt.attempt||0)} ${escapeHtml(attempt.name)} · ${escapeHtml(attempt.difficulty?.requirement||'')} ${attempt.source==='roster-only-fallback'?'· fallback':''}</span>`).join('')}</div></article>`;
}
function itemHtml(item) {
  if (item?.run?.actionKey === 'raid-max') return raidMaxItem(item);
  return `<article class="web-action-feed-item"><div class="web-action-feed-item-head"><div><div class="web-action-feed-kicker">COMMAND RESULT</div><h4>${escapeHtml(item?.run?.actionKey || 'Action')}</h4></div><div class="web-action-feed-time">${escapeHtml(dateTime(item?.publishedAt))}</div></div></article>`;
}
function feedHtml(title, subtitle, items) {
  return `<section class="web-action-feed" data-web-action-feed><div class="web-action-feed-head"><div><div class="web-action-feed-kicker">SHARED COMMAND RESULTS</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div><a href="/actions">Open Action Center →</a></div><div class="web-action-feed-list">${items.length?items.map(itemHtml).join(''):'<div class="web-action-feed-empty">No published website action results yet.</div>'}</div></section>`;
}
function playerAnchor() {
  const profile = document.getElementById('profile');
  return profile && !profile.classList.contains('hidden') ? profile : null;
}
function guildAnchor() {
  return document.getElementById('guildRouteContent');
}
function removeExisting() { document.querySelector('[data-web-action-feed]')?.remove(); }
async function renderPlayer(code) {
  const anchor = playerAnchor(); if (!anchor) return false;
  try {
    const body = await requestJson(`/api/account/web-actions/feed/player/${code}`);
    removeExisting();
    anchor.insertAdjacentHTML('afterend', feedHtml(`${body.player?.name || 'Player'} Command Feed`, 'Results this player chose to publish from website-native tools.', body.items || []));
  } catch (error) {
    if (![401,403,404].includes(error.status)) console.warn('Player action feed unavailable', error);
  }
  return true;
}
async function renderGuild(code) {
  const anchor = guildAnchor(); if (!anchor) return false;
  try {
    const body = await requestJson(`/api/account/web-actions/feed/guild/${code}`);
    removeExisting();
    anchor.insertAdjacentHTML('afterbegin', feedHtml(`${body.guild?.name || 'Guild'} Command Feed`, 'Website action results voluntarily shared by active Guild members.', body.items || []));
  } catch (error) {
    if (![401,403,404].includes(error.status)) console.warn('Guild action feed unavailable', error);
  }
  return true;
}
async function render() {
  const code = currentAlly(); if (code.length !== 9) return;
  const path = location.pathname.replace(/\/+$/,'') || '/';
  const mode = path === '/' ? 'player' : path === '/guild' ? 'guild' : '';
  if (!mode) return;
  const key = `${mode}|${code}`;
  if (state.lastKey === key && document.querySelector('[data-web-action-feed]')) return;
  const done = mode === 'player' ? await renderPlayer(code) : await renderGuild(code);
  if (done) state.lastKey = key;
}
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(render,180);}
function install(){ensureCss();schedule();new MutationObserver(()=>{const path=location.pathname.replace(/\/+$/,'')||'/';if(['/','/guild'].includes(path)&&!document.querySelector('[data-web-action-feed]'))schedule();}).observe(document.body,{childList:true,subtree:true});window.addEventListener('popstate',()=>{state.lastKey='';schedule();});window.addEventListener('swgoh:guild-command-snapshot',()=>{state.lastKey='';schedule();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
