import { LEAGUES, leagueBoard, leagueLabel, normalizeLeague, zoneCapacity } from './gac-league-board-model.js';

const STORAGE_KEY = 'swgoh:gac-manual-counter:league';
const ZONES = Object.freeze(['BACK-TOP', 'FRONT-TOP', 'BACK-BOTTOM', 'FRONT-BOTTOM']);
let scheduled = false;

function clean(value) { return String(value ?? '').trim(); }
function escapeHtml(value) { return clean(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function formatValue() { return document.querySelector('[data-gac-manual-format]')?.value || localStorage.getItem('swgoh:gac-manual-counter:format') || '5v5'; }
function leagueValue() { return normalizeLeague(localStorage.getItem(STORAGE_KEY)); }
function setLeague(value) { const league = normalizeLeague(value); if (league) localStorage.setItem(STORAGE_KEY, league); else localStorage.removeItem(STORAGE_KEY); return league; }

function leagueSelectMarkup(selected) {
  return `<select data-gac-league-select aria-label="GAC League"><option value="" ${selected ? '' : 'selected'}>Select League</option>${LEAGUES.map((league) => `<option value="${league}" ${selected === league ? 'selected' : ''}>${leagueLabel(league)}</option>`).join('')}</select>`;
}

function ensureSetupControl() {
  const setup = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-setup');
  if (!setup || setup.querySelector('[data-gac-league-select]')) return;
  const format = setup.querySelector('[data-gac-manual-format]');
  if (!format) return;
  const wrapper = document.createElement('label');
  wrapper.className = 'gac-league-setup-control';
  wrapper.innerHTML = `<span>LEAGUE</span>${leagueSelectMarkup(leagueValue())}`;
  format.insertAdjacentElement('afterend', wrapper);
}

function slotFromCard(card) {
  const match = clean(card?.textContent).match(/SLOT\s+(\d+)/i);
  return match ? Math.max(0, Number(match[1]) - 1) : null;
}

function zoneClass(zone) { return `.is-${zone.toLowerCase()}`; }

function emptySlot(zone, slot, fleet) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gac-league-slot-node ${fleet ? 'is-fleet' : 'is-squad'}`;
  button.dataset.gacLeagueSlotAdd = 'true';
  button.dataset.zone = zone;
  button.dataset.slot = String(slot);
  button.innerHTML = `<span class="gac-league-node-orbit"><b>+</b></span><strong>${fleet ? 'FLEET' : 'SQUAD'} ${slot + 1}</strong><small>${fleet ? 'Enter visible fleet' : 'Enter visible defense'}</small>`;
  return button;
}

function filledSlot(card, slot) {
  const wrapper = document.createElement('div');
  wrapper.className = 'gac-league-placement is-filled';
  wrapper.dataset.slot = String(slot);
  wrapper.appendChild(card);
  return wrapper;
}

function enhanceZone(zone, league, format) {
  const section = document.querySelector(`[data-gac-manual-counter-planner] .gac-manual-map-zone${zoneClass(zone)}`);
  if (!section) return;
  const capacity = zoneCapacity(format, league, zone);
  if (!Number.isInteger(capacity)) return;
  const slots = section.querySelector('.gac-manual-map-slots');
  if (!slots) return;

  const cards = [...slots.querySelectorAll(':scope > .gac-manual-defense-card, :scope > .gac-league-placement > .gac-manual-defense-card, :scope > .gac-league-overflow .gac-manual-defense-card')];
  const bySlot = new Map();
  const overflow = [];
  for (const card of cards) {
    const slot = slotFromCard(card);
    if (Number.isInteger(slot) && slot < capacity && !bySlot.has(slot)) bySlot.set(slot, card);
    else overflow.push(card);
  }

  slots.replaceChildren();
  slots.classList.add('gac-league-placement-grid');
  const fleet = zone === 'BACK-TOP';
  for (let slot = 0; slot < capacity; slot += 1) {
    slots.appendChild(bySlot.has(slot) ? filledSlot(bySlot.get(slot), slot) : emptySlot(zone, slot, fleet));
  }

  if (overflow.length) {
    const box = document.createElement('div');
    box.className = 'gac-league-overflow';
    box.innerHTML = `<strong>OUTSIDE ${escapeHtml(leagueLabel(league).toUpperCase())} CAPACITY</strong><small>These saved placements are preserved but exceed the selected league layout. Change league or delete/edit them.</small>`;
    overflow.forEach((card) => box.appendChild(card));
    slots.appendChild(box);
  }

  const header = section.querySelector(':scope > header');
  if (header) {
    header.querySelector('.gac-league-capacity')?.remove();
    const filled = [...bySlot.keys()].length;
    const chip = document.createElement('div');
    chip.className = 'gac-league-capacity';
    chip.innerHTML = `<b>${filled}/${capacity}</b><span>${fleet ? 'FLEETS' : 'SQUADS'}</span>`;
    header.appendChild(chip);
  }
  section.dataset.gacLeagueCapacity = String(capacity);
}

function rankStripMarkup(format, league) {
  const board = leagueBoard(format, league);
  const buttons = LEAGUES.map((value) => `<button type="button" data-gac-league-rank="${value}" class="is-${value} ${league === value ? 'is-active' : ''}" aria-pressed="${league === value ? 'true' : 'false'}"><span class="gac-league-medal">${value === 'carbonite' ? 'C' : value === 'bronzium' ? 'B' : value === 'chromium' ? 'Cr' : value === 'aurodium' ? 'A' : 'K'}</span><b>${leagueLabel(value)}</b></button>`).join('');
  const summary = board
    ? `<div class="gac-league-current"><span>${escapeHtml(board.label.toUpperCase())} · ${escapeHtml(board.format.toUpperCase())}</span><strong>${board.squadCount} squad defenses · ${board.fleetCount} fleet${board.fleetCount === 1 ? '' : 's'}</strong></div>`
    : `<div class="gac-league-current is-missing"><span>SET LEAGUE</span><strong>Select your current GAC league to render the correct defense slots.</strong></div>`;
  return `<div class="gac-league-rank-strip" data-gac-league-rank-strip>${buttons}${summary}</div>`;
}

function enhanceMap() {
  ensureSetupControl();
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  const map = host?.querySelector('.gac-manual-gac-map');
  if (!host || !map) return;
  const format = formatValue();
  const league = leagueValue();
  const signature = `${format}|${league || 'none'}`;
  if (map.dataset.gacLeagueEnhanced === signature) return;
  map.dataset.gacLeagueEnhanced = signature;

  let strip = host.querySelector('[data-gac-league-rank-strip]');
  if (!strip) {
    map.insertAdjacentHTML('beforebegin', rankStripMarkup(format, league));
  } else {
    strip.outerHTML = rankStripMarkup(format, league);
  }

  map.classList.toggle('gac-league-board-active', Boolean(league));
  map.dataset.gacLeague = league || '';
  map.dataset.gacFormat = format;
  if (!league) return;
  for (const zone of ZONES) enhanceZone(zone, league, format);
}

function replayZoneOpen(zone, slot) {
  const add = document.querySelector(`[data-gac-manual-counter-planner] [data-gac-manual-map-add="${zone}"]`);
  if (!add) return;
  add.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  queueMicrotask(() => {
    const input = document.querySelector('[data-gac-manual-counter-planner] [data-gac-manual-editor-slot]');
    if (!input) return;
    input.value = String(Number(slot) + 1);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function bind() {
  if (window.__gacLeagueBoardBound) return;
  window.__gacLeagueBoardBound = true;

  document.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-gac-league-select]')) {
      setLeague(event.target.value);
      document.querySelector('.gac-manual-gac-map')?.removeAttribute('data-gac-league-enhanced');
      enhanceMap();
      return;
    }
    if (event.target.matches?.('[data-gac-manual-format]')) scheduleEnhance();
  }, true);

  document.addEventListener('click', (event) => {
    const rank = event.target.closest?.('[data-gac-league-rank]');
    if (rank) {
      event.preventDefault();
      setLeague(rank.dataset.gacLeagueRank);
      const select = document.querySelector('[data-gac-league-select]');
      if (select) select.value = rank.dataset.gacLeagueRank;
      document.querySelector('.gac-manual-gac-map')?.removeAttribute('data-gac-league-enhanced');
      enhanceMap();
      return;
    }
    const slot = event.target.closest?.('[data-gac-league-slot-add]');
    if (!slot) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    replayZoneOpen(slot.dataset.zone, Number(slot.dataset.slot));
  }, true);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceMap();
  });
}

function injectStyle() {
  if (document.querySelector('link[data-gac-league-board-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-league-board.css?v=20260821-league1';
  link.dataset.gacLeagueBoardStyle = 'true';
  document.head.appendChild(link);
}

if (typeof window !== 'undefined') {
  injectStyle();
  bind();
  document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  window.addEventListener('hashchange', scheduleEnhance);
  window.addEventListener('swgoh:workspace-activated', scheduleEnhance);
  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhance();
}

export { enhanceMap, leagueValue, setLeague };
