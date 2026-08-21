import { LEAGUES, leagueBoard, leagueLabel, normalizeLeague, zoneCapacity } from './gac-league-board-model.js';

const STORAGE_KEY = 'swgoh:gac-manual-counter:league';
const ZONES = Object.freeze(['BACK-TOP', 'FRONT-TOP', 'BACK-BOTTOM', 'FRONT-BOTTOM']);
let scheduled = false;
let selectedKey = '';

function clean(value) { return String(value ?? '').trim(); }
function escapeHtml(value) { return clean(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function formatValue() { return document.querySelector('[data-gac-manual-format]')?.value || localStorage.getItem('swgoh:gac-manual-counter:format') || '5v5'; }
function leagueValue() { return normalizeLeague(localStorage.getItem(STORAGE_KEY)); }
function setLeague(value) { const league = normalizeLeague(value); if (league) localStorage.setItem(STORAGE_KEY, league); else localStorage.removeItem(STORAGE_KEY); return league; }
function slotKey(zone, slot) { return `${String(zone || '').toUpperCase()}|${Number(slot)}`; }

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

function portraitMarkup(node, className = '') {
  if (!node) return '<b>?</b>';
  const clone = node.cloneNode(true);
  clone.classList.add('gac-league-node-portrait');
  if (className) clone.classList.add(className);
  clone.querySelector('small')?.remove();
  return clone.outerHTML;
}

function cardSnapshot(card) {
  const portraits = [...(card?.querySelectorAll?.('.gac-manual-team .gac-manual-unit') || [])];
  const name = clean(card?.querySelector?.('header strong')?.textContent || portraits[0]?.querySelector?.('small')?.textContent || 'Defense');
  const edit = card?.querySelector?.('[data-gac-manual-defense-edit]');
  const remove = card?.querySelector?.('[data-gac-manual-defense-delete]');
  return {
    name,
    leader: portraitMarkup(portraits[0], 'is-leader'),
    members: portraits.slice(1, 5).map((node) => portraitMarkup(node, 'is-member')).join(''),
    defenseId: clean(edit?.dataset?.gacManualDefenseEdit || remove?.dataset?.gacManualDefenseDelete),
  };
}

function emptySlot(zone, slot, fleet) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gac-league-slot-node is-open ${fleet ? 'is-fleet' : 'is-squad'} ${selectedKey === slotKey(zone, slot) ? 'is-selected' : ''}`;
  button.dataset.gacLeagueSlotAdd = 'true';
  button.dataset.zone = zone;
  button.dataset.slot = String(slot);
  button.innerHTML = `<span class="gac-league-node-orbit"><b>+</b></span><strong>${fleet ? 'FLEET' : 'SQUAD'} ${slot + 1}</strong><small>${fleet ? 'Enter visible fleet' : 'Enter visible defense'}</small>`;
  return button;
}

function filledSlot(card, slot, zone, fleet) {
  const snapshot = cardSnapshot(card);
  const wrapper = document.createElement('div');
  wrapper.className = `gac-league-placement is-filled ${selectedKey === slotKey(zone, slot) ? 'is-selected' : ''}`;
  wrapper.dataset.slot = String(slot);
  wrapper.dataset.zone = zone;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gac-league-slot-node is-filled ${fleet ? 'is-fleet' : 'is-squad'}`;
  button.dataset.gacLeagueSlotEdit = 'true';
  button.dataset.zone = zone;
  button.dataset.slot = String(slot);
  button.dataset.defenseId = snapshot.defenseId;
  button.setAttribute('aria-label', `${fleet ? 'Fleet' : 'Squad'} ${slot + 1}: ${snapshot.name}`);
  button.innerHTML = `<span class="gac-league-node-orbit">${snapshot.leader}</span><span class="gac-league-node-pips">${snapshot.members}</span><strong>${escapeHtml(snapshot.name)}</strong><small>${fleet ? `FLEET ${slot + 1}` : `SLOT ${slot + 1}`}</small>`;

  const storage = document.createElement('div');
  storage.className = 'gac-league-card-storage';
  storage.appendChild(card);
  wrapper.append(button, storage);
  return wrapper;
}

function enhanceZone(zone, league, format) {
  const section = document.querySelector(`[data-gac-manual-counter-planner] .gac-manual-map-zone${zoneClass(zone)}`);
  if (!section) return;
  const capacity = zoneCapacity(format, league, zone);
  if (!Number.isInteger(capacity)) return;
  const slots = section.querySelector('.gac-manual-map-slots');
  if (!slots) return;

  const cards = [...slots.querySelectorAll('.gac-manual-defense-card')];
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
    slots.appendChild(bySlot.has(slot) ? filledSlot(bySlot.get(slot), slot, zone, fleet) : emptySlot(zone, slot, fleet));
  }

  if (overflow.length) {
    const box = document.createElement('div');
    box.className = 'gac-league-overflow';
    box.innerHTML = `<strong>OUTSIDE ${escapeHtml(leagueLabel(league).toUpperCase())} CAPACITY</strong><small>Saved placements are preserved. Change league or move/delete these entries.</small>`;
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
  const buttons = LEAGUES.map((value) => `<button type="button" data-gac-league-rank="${value}" class="is-${value} ${league === value ? 'is-active' : ''}" aria-pressed="${league === value ? 'true' : 'false'}"><span>${leagueLabel(value)}</span></button>`).join('');
  const summary = board
    ? `<div class="gac-league-current"><span>${escapeHtml(board.label.toUpperCase())} · ${escapeHtml(board.format.toUpperCase())}</span><strong><b>${board.squadCount}</b> squads <i>+</i> <b>${board.fleetCount}</b> fleet${board.fleetCount === 1 ? '' : 's'} <i>=</i> <b>${board.totalPlacements}</b> total</strong></div>`
    : `<div class="gac-league-current is-missing"><span>SET LEAGUE</span><strong>Select the active GAC league.</strong></div>`;
  return `<div class="gac-league-rank-strip" data-gac-league-rank-strip>${summary}<nav>${buttons}</nav></div>`;
}

function rulesMarkup(format, activeLeague) {
  const rows = LEAGUES.map((league) => {
    const board = leagueBoard(format, league);
    return `<tr class="${league === activeLeague ? 'is-active' : ''}"><td>${escapeHtml(leagueLabel(league))}</td><td>${board?.squadCount ?? 0}</td><td>${board?.fleetCount ?? 0}</td><td>${board?.totalPlacements ?? 0}</td></tr>`;
  }).join('');
  return `<section class="gac-live-rules"><header><span>DEFENSE REQUIREMENTS</span><b>${escapeHtml(String(format).toUpperCase())}</b></header><table><thead><tr><th>League</th><th>Squad</th><th>Fleet</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function selectedPlacement(map) {
  if (!selectedKey) return null;
  const [zone, slotText] = selectedKey.split('|');
  const slot = Number(slotText);
  return map.querySelector(`.gac-league-placement.is-filled[data-zone="${zone}"][data-slot="${slot}"]`) || null;
}

function selectedPanelMarkup(map, format, league) {
  if (!selectedKey) return `<section class="gac-live-selected"><header><span>SELECTED SLOT</span><strong>Choose a defense circle</strong></header><div class="gac-live-selected-empty"><b>+</b><span>Click a circle on the arena to enter or edit the defense shown in-game.</span></div></section>${rulesMarkup(format, league)}`;
  const [zone, slotText] = selectedKey.split('|');
  const slot = Number(slotText);
  const capacity = zoneCapacity(format, league, zone);
  if (!Number.isInteger(capacity) || slot < 0 || slot >= capacity) {
    selectedKey = '';
    return selectedPanelMarkup(map, format, league);
  }
  const placement = selectedPlacement(map);
  const card = placement?.querySelector('.gac-manual-defense-card') || null;
  const snapshot = card ? cardSnapshot(card) : null;
  const fleet = zone === 'BACK-TOP';
  const label = zone === 'BACK-TOP' ? 'Fleet Territory' : zone.replaceAll('-', ' ');
  return `<section class="gac-live-selected"><header><span>SELECTED SLOT</span><strong>${escapeHtml(label)} · ${fleet ? 'Fleet' : 'Slot'} ${slot + 1}</strong></header>
    <div class="gac-live-selected-leader">${snapshot ? snapshot.leader : '<div class="gac-live-selected-placeholder">+</div>'}<div><span>${fleet ? 'CAPITAL / LEADER' : 'LEADER'}</span><strong>${escapeHtml(snapshot?.name || 'Empty defense slot')}</strong><small>${snapshot ? 'Defense entered · click edit to change the lineup.' : `Click the selected circle or use the editor to enter the visible ${fleet ? 'fleet' : 'squad'}.`}</small></div></div>
    ${snapshot?.members ? `<div class="gac-live-selected-members"><span>${fleet ? 'VISIBLE SHIPS' : 'SQUAD MEMBERS'}</span><div>${snapshot.members}</div></div>` : ''}
    <div class="gac-live-selected-actions">${snapshot ? '<button type="button" data-gac-live-edit-selected>EDIT DEFENSE</button><button type="button" class="is-danger" data-gac-live-delete-selected>DELETE</button>' : `<button type="button" data-gac-live-open-selected>ENTER ${fleet ? 'FLEET' : 'DEFENSE'}</button>`}</div>
  </section>${rulesMarkup(format, league)}`;
}

function syncSidePanel(host, map, format, league) {
  const section = map.closest('.gac-manual-enemy-board');
  if (!section) return;
  section.classList.add('gac-live-arena-layout');
  const editor = section.querySelector(':scope > .gac-manual-editor');
  let panel = section.querySelector(':scope > [data-gac-live-side]');
  if (editor) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement('aside');
    panel.className = 'gac-live-arena-side';
    panel.dataset.gacLiveSide = 'true';
    map.insertAdjacentElement('afterend', panel);
  }
  panel.innerHTML = selectedPanelMarkup(map, format, league);
}

function enhanceMap() {
  ensureSetupControl();
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  const map = host?.querySelector('.gac-manual-gac-map');
  if (!host || !map) return;
  host.classList.add('gac-live-arena-mode');
  const format = formatValue();
  const league = leagueValue();
  const signature = `${format}|${league || 'none'}`;

  let strip = host.querySelector('[data-gac-league-rank-strip]');
  const markup = rankStripMarkup(format, league);
  if (!strip) map.insertAdjacentHTML('beforebegin', markup);
  else if (strip.dataset.signature !== signature) strip.outerHTML = markup;
  strip = host.querySelector('[data-gac-league-rank-strip]');
  if (strip) strip.dataset.signature = signature;

  map.classList.toggle('gac-league-board-active', Boolean(league));
  map.dataset.gacLeague = league || '';
  map.dataset.gacFormat = format;
  if (league) for (const zone of ZONES) enhanceZone(zone, league, format);
  syncSidePanel(host, map, format, league);
  map.dataset.gacLeagueEnhanced = signature;
}

function replayZoneOpen(zone, slot) {
  selectedKey = slotKey(zone, slot);
  const add = document.querySelector(`[data-gac-manual-counter-planner] [data-gac-manual-map-add="${zone}"]`);
  if (!add) return;
  add.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  queueMicrotask(() => {
    const input = document.querySelector('[data-gac-manual-counter-planner] [data-gac-manual-editor-slot]');
    if (!input) return;
    input.value = String(Number(slot) + 1);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    scheduleEnhance();
  });
}

function editSelected() {
  const map = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-gac-map');
  const card = selectedPlacement(map)?.querySelector('.gac-manual-defense-card');
  card?.querySelector('[data-gac-manual-defense-edit]')?.click();
}

function deleteSelected() {
  const map = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-gac-map');
  const card = selectedPlacement(map)?.querySelector('.gac-manual-defense-card');
  card?.querySelector('[data-gac-manual-defense-delete]')?.click();
  selectedKey = '';
}

function bind() {
  if (window.__gacLeagueBoardBound) return;
  window.__gacLeagueBoardBound = true;

  document.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-gac-league-select]')) {
      setLeague(event.target.value);
      selectedKey = '';
      scheduleEnhance();
      return;
    }
    if (event.target.matches?.('[data-gac-manual-format]')) { selectedKey = ''; scheduleEnhance(); }
  }, true);

  document.addEventListener('click', (event) => {
    const rank = event.target.closest?.('[data-gac-league-rank]');
    if (rank) {
      event.preventDefault();
      setLeague(rank.dataset.gacLeagueRank);
      selectedKey = '';
      const select = document.querySelector('[data-gac-league-select]');
      if (select) select.value = rank.dataset.gacLeagueRank;
      scheduleEnhance();
      return;
    }

    const empty = event.target.closest?.('[data-gac-league-slot-add]');
    if (empty) {
      event.preventDefault();
      event.stopImmediatePropagation();
      replayZoneOpen(empty.dataset.zone, Number(empty.dataset.slot));
      return;
    }

    const filled = event.target.closest?.('[data-gac-league-slot-edit]');
    if (filled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectedKey = slotKey(filled.dataset.zone, filled.dataset.slot);
      const card = filled.closest('.gac-league-placement')?.querySelector('.gac-manual-defense-card');
      card?.querySelector('[data-gac-manual-defense-edit]')?.click();
      scheduleEnhance();
      return;
    }

    if (event.target.closest?.('[data-gac-live-edit-selected]')) { event.preventDefault(); editSelected(); scheduleEnhance(); return; }
    if (event.target.closest?.('[data-gac-live-delete-selected]')) { event.preventDefault(); deleteSelected(); scheduleEnhance(); return; }
    if (event.target.closest?.('[data-gac-live-open-selected]')) {
      event.preventDefault();
      const [zone, slot] = selectedKey.split('|');
      replayZoneOpen(zone, Number(slot));
    }
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
  link.href = '/gac-league-board.css?v=20260822-livearena2';
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
