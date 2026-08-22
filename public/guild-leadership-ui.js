import { loadPlayerPortraitRegistry, resolvePlayerPortraitUrl } from './guild-player-portrait-registry.js';

const clean = (value) => String(value ?? '').trim();
const number = new Intl.NumberFormat('en-US');
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/guild' || path === '/guild/members') return path;
  return '';
}

function roleTone(role) {
  if (role === 'Guild Leader') return 'leader';
  if (role === 'Officer') return 'officer';
  return 'member';
}

function roleSymbol(role) {
  return role === 'Guild Leader' ? '★' : role === 'Officer' ? '◆' : '•';
}

function safePortrait(member = {}) {
  return resolvePlayerPortraitUrl(
    member.playerPortrait || member.portraitKey,
    member.playerPortraitUrl || member.profilePortraitUrl,
  );
}

function identityMark(member = {}) {
  const role = clean(member.memberRole) || 'Member';
  const symbol = roleSymbol(role);
  const portrait = safePortrait(member);
  const portraitId = clean(member.playerPortrait);
  if (portrait) {
    return `<span class="guild-leadership-portrait has-image" data-portrait-fallback="${escapeAttr(symbol)}"${portraitId ? ` data-player-portrait-id="${escapeAttr(portraitId)}"` : ''}><img data-guild-portrait-image src="${escapeAttr(portrait)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="guild-leadership-portrait is-glyph"${portraitId ? ` data-player-portrait-id="${escapeAttr(portraitId)}" title="Game portrait ${escapeAttr(portraitId)} is captured; artwork will appear when the portrait registry resolves it."` : ''}>${symbol}</span>`;
}

function wirePortraitFallbacks(root) {
  for (const image of root?.querySelectorAll?.('[data-guild-portrait-image]') || []) {
    image.addEventListener('error', () => {
      const mark = image.closest('.guild-leadership-portrait');
      if (!mark) return;
      const fallback = clean(mark.dataset.portraitFallback) || '•';
      mark.classList.remove('has-image');
      mark.classList.add('is-glyph');
      mark.textContent = fallback;
    }, { once: true });
  }
}

function profileLink(member = {}) {
  const code = clean(member.allyCode).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? `/?allyCode=${encodeURIComponent(code)}#roster` : '';
}

function personCard(member = {}, compact = false) {
  const href = profileLink(member);
  const role = clean(member.memberRole) || 'Member';
  const title = clean(member.profileTitle);
  return `<article class="guild-leadership-person is-${roleTone(role)}${compact ? ' is-compact' : ''}">
    ${href ? `<a href="${escapeAttr(href)}" class="guild-leadership-avatar-link">${identityMark(member)}</a>` : identityMark(member)}
    <div class="guild-leadership-person-copy">
      <span class="guild-leadership-role">${escapeHtml(role)}</span>
      ${href ? `<a href="${escapeAttr(href)}" class="guild-leadership-name">${escapeHtml(member.name || 'Unknown')}</a>` : `<strong class="guild-leadership-name">${escapeHtml(member.name || 'Unknown')}</strong>`}
      <small>${number.format(Number(member.galacticPower) || 0)} GP${title ? ` · ${escapeHtml(title)}` : ''}</small>
    </div>
  </article>`;
}

function leadershipFromSnapshot(snapshot = {}) {
  const supplied = snapshot?.leadership;
  if (supplied?.leadership?.length || supplied?.leader || supplied?.officers?.length) return supplied;
  const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
  const leadership = members.filter((member) => ['Guild Leader', 'Officer'].includes(clean(member.memberRole)));
  return {
    leader: leadership.find((member) => clean(member.memberRole) === 'Guild Leader') || null,
    officers: leadership.filter((member) => clean(member.memberRole) === 'Officer'),
    leadership,
  };
}

function ensureStyles() {
  if (document.querySelector('link[data-guild-leadership-css="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-leadership-ui.css?v=20260822-tb2';
  link.dataset.guildLeadershipCss = 'true';
  document.head.appendChild(link);
}

function ensureRoot() {
  const content = document.getElementById('guildRouteContent');
  if (!content?.parentElement) return null;
  let root = document.querySelector('[data-guild-leadership-panel]');
  if (!root) {
    root = document.createElement('section');
    root.dataset.guildLeadershipPanel = 'true';
    root.className = 'guild-leadership-panel';
    content.insertAdjacentElement('beforebegin', root);
  }
  return root;
}

function render(snapshot = window.__swgohGuildCommandSnapshot) {
  const root = ensureRoot();
  if (!root) return;
  const currentRoute = route();
  if (!currentRoute || !snapshot) {
    root.hidden = true;
    return;
  }
  const leadership = leadershipFromSnapshot(snapshot);
  const leader = leadership?.leader || null;
  const officers = Array.isArray(leadership?.officers) ? leadership.officers : [];
  const identityReady = Boolean(leader || officers.length);
  root.hidden = false;
  root.innerHTML = `<header>
    <div><span>GUILD LEADERSHIP</span><strong>Leader & Officer Command Team</strong><small>${identityReady ? `${leader ? '1 leader' : 'Leader pending'} · ${officers.length} officer${officers.length === 1 ? '' : 's'}` : 'Guild rank data is pending the next canonical Guild refresh.'}</small></div>
    <div class="guild-leadership-badges"><b>${leader ? 'LEADER ✓' : 'LEADER ?'}</b><b>${officers.length} OFFICERS</b></div>
  </header>
  ${identityReady ? `<div class="guild-leadership-layout">
    <section><span class="guild-leadership-label">GUILD LEADER</span>${leader ? personCard(leader) : '<div class="guild-leadership-empty">Leader rank has not been captured yet.</div>'}</section>
    <section><span class="guild-leadership-label">OFFICERS</span><div class="guild-leadership-officers">${officers.length ? officers.map((row) => personCard(row, true)).join('') : '<div class="guild-leadership-empty">No officer ranks captured yet.</div>'}</div></section>
  </div>` : '<div class="guild-leadership-empty">The app stores the in-game rank field during Guild sync. After the identity read-shape migration and next Guild refresh, Leader and Officers appear here automatically.</div>'}`;
  wirePortraitFallbacks(root);
}

function install() {
  if (window.__guildLeadershipUiInstalled) return;
  window.__guildLeadershipUiInstalled = true;
  ensureStyles();
  window.addEventListener('swgoh:guild-command-snapshot', (event) => render(event.detail?.snapshot));
  window.addEventListener('swgoh:guild-route-changed', () => requestAnimationFrame(() => render()));
  window.addEventListener('popstate', () => requestAnimationFrame(() => render()));
  loadPlayerPortraitRegistry().then(() => requestAnimationFrame(() => render()));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(), { once: true });
  else render();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') install();

export { identityMark, leadershipFromSnapshot, render, roleSymbol, safePortrait, wirePortraitFallbacks };
