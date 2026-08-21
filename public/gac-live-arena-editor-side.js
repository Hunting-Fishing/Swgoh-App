import { LEAGUES, leagueBoard, leagueLabel, normalizeLeague } from './gac-league-board-model.js';

const COLLAPSE_KEY = 'swgoh:gac:ux:own-defense-collapsed';
let scheduled = false;

const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function formatValue() {
  return document.querySelector('[data-gac-manual-format]')?.value ||
    localStorage.getItem('swgoh:gac-manual-counter:format') || '5v5';
}

function leagueValue() {
  return normalizeLeague(localStorage.getItem('swgoh:gac-manual-counter:league'));
}

function requirementTable(format, activeLeague) {
  return `<section class="gac-live-rules"><header><span>DEFENSE REQUIREMENTS</span><b>${escapeHtml(format.toUpperCase())}</b></header><table><thead><tr><th>League</th><th>Squad</th><th>Fleet</th><th>Total</th></tr></thead><tbody>${LEAGUES.map((league) => {
    const row = leagueBoard(format, league);
    return `<tr class="${league === activeLeague ? 'is-active' : ''}"><td>${escapeHtml(leagueLabel(league))}</td><td>${row?.squadCount ?? 0}</td><td>${row?.fleetCount ?? 0}</td><td>${row?.totalPlacements ?? 0}</td></tr>`;
  }).join('')}</tbody></table></section>`;
}

function selectedEditorSummary(editor) {
  const zone = clean(editor.querySelector('[data-gac-manual-editor-zone]')?.value || 'FRONT-TOP');
  const slot = Math.max(1, Number(editor.querySelector('[data-gac-manual-editor-slot]')?.value || 1));
  const type = clean(editor.querySelector('[data-gac-manual-editor-type]')?.value) === 'fleet' ? 'fleet' : 'squad';
  const chosen = [...editor.querySelectorAll('.gac-manual-enemy-selected > div:not(.is-empty)')];
  const leader = chosen.find((node) => node.classList.contains('is-leader')) || chosen[0] || null;
  const leaderPortrait = leader?.querySelector('.gac-manual-unit')?.cloneNode(true) || null;
  if (leaderPortrait) {
    leaderPortrait.classList.add('gac-live-editor-leader-portrait');
    leaderPortrait.querySelector('small')?.remove();
  }
  const leaderName = clean(leader?.querySelector('.gac-manual-unit small')?.textContent || leader?.querySelector('.gac-manual-unit')?.getAttribute('title') || 'Select a leader');
  const territory = zone === 'BACK-TOP' ? 'Fleet Territory' : zone.replaceAll('-', ' ');
  return { type, territory, slot, chosen, leaderPortrait, leaderName };
}

function renderEditorSide(section, editor) {
  let aside = section.querySelector(':scope > [data-gac-live-editor-side]');
  if (!aside) {
    aside = document.createElement('aside');
    aside.className = 'gac-live-editor-side';
    aside.dataset.gacLiveEditorSide = 'true';
    section.appendChild(aside);
  }
  const summary = selectedEditorSummary(editor);
  const format = formatValue();
  const league = leagueValue();
  const signature = `${summary.type}|${summary.territory}|${summary.slot}|${summary.chosen.length}|${summary.leaderName}|${format}|${league}`;
  if (aside.dataset.signature === signature) return;
  const portrait = summary.leaderPortrait?.outerHTML || '<div class="gac-live-selected-placeholder">+</div>';
  aside.innerHTML = `<section class="gac-live-selected"><header><span>SELECTED SLOT</span><strong>${escapeHtml(summary.territory)} · ${summary.type === 'fleet' ? 'Fleet' : 'Slot'} ${summary.slot}</strong></header><div class="gac-live-selected-leader">${portrait}<div><span>${summary.type === 'fleet' ? 'CAPITAL / LEADER' : 'LEADER'}</span><strong>${escapeHtml(summary.leaderName)}</strong><small>${summary.chosen.length} ${summary.type === 'fleet' ? 'ships' : 'characters'} currently selected.</small></div></div><div class="gac-live-editor-progress"><b>${summary.chosen.length}</b><span>${summary.type === 'fleet' ? 'VISIBLE SHIPS SELECTED' : `${format === '3v3' ? 3 : 5} REQUIRED`}</span></div></section>${requirementTable(format, league)}`;
  aside.dataset.signature = signature;
}

function decorate() {
  const section = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-enemy-board.gac-live-arena-layout');
  if (!section) return;
  const editor = section.querySelector(':scope > .gac-manual-editor');
  const old = section.querySelector(':scope > [data-gac-live-editor-side]');
  if (!editor) {
    old?.remove();
    section.classList.remove('has-live-editor');
    return;
  }
  section.classList.add('has-live-editor');
  renderEditorSide(section, editor);
}

function compactDefaults() {
  if (localStorage.getItem(COLLAPSE_KEY) === null) {
    localStorage.setItem(COLLAPSE_KEY, 'true');
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    compactDefaults();
    decorate();
  });
}

if (typeof document !== 'undefined') {
  compactDefaults();
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  window.addEventListener('swgoh:workspace-activated', schedule);
  window.addEventListener('hashchange', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}

export { compactDefaults, decorate, selectedEditorSummary };
