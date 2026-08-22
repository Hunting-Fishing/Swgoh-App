import { PLAYER_FACTIONS, canonicalFaction } from './gac-player-facing-factions.js';

const SELECTORS = Object.freeze([
  '[data-gac-manual-own-faction]',
  '[data-gac-manual-enemy-faction]',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function optionRank(rawValue, label) {
  const raw = clean(rawValue);
  const canonical = clean(label);
  if (raw.toLowerCase() === canonical.toLowerCase()) return 0;
  if (/^(species|affiliation|profession|role|faction|category|tag)[ _-]/i.test(raw)) return 1;
  return 2;
}

function escapeAttr(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function canonicalOptions(rawSelect) {
  const byLabel = new Map(PLAYER_FACTIONS.map((label) => [label, { label, rawValue: label, rank: 9 }]));
  for (const option of [...rawSelect.options]) {
    const rawValue = clean(option.value);
    if (!rawValue) continue;
    const label = canonicalFaction(option.textContent || rawValue) || canonicalFaction(rawValue);
    if (!label) continue;
    const candidate = { label, rawValue, rank: optionRank(rawValue, label) };
    const current = byLabel.get(label);
    if (!current || candidate.rank < current.rank || (candidate.rank === current.rank && rawValue.localeCompare(current.rawValue) < 0)) {
      byLabel.set(label, candidate);
    }
  }
  return PLAYER_FACTIONS.map((label) => byLabel.get(label)).filter(Boolean);
}

function injectStyle() {
  if (document.querySelector('link[data-gac-faction-picker-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-canonical-faction-filter.css?v=20260822-fulltaxonomy1';
  link.dataset.gacFactionPickerStyle = 'true';
  document.head.appendChild(link);
}

function closePicker(picker) {
  if (!picker) return;
  const menu = picker.querySelector('[data-gac-faction-menu]');
  const button = picker.querySelector('[data-gac-faction-trigger]');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function closeOtherPickers(except = null) {
  document.querySelectorAll('[data-gac-faction-picker]').forEach((picker) => {
    if (picker !== except) closePicker(picker);
  });
}

function syncPicker(rawSelect, picker, entries) {
  const selectedCanonical = canonicalFaction(rawSelect.selectedOptions?.[0]?.textContent || rawSelect.value) || canonicalFaction(rawSelect.value);
  const triggerLabel = picker.querySelector('[data-gac-faction-label]');
  if (triggerLabel) triggerLabel.textContent = selectedCanonical || 'All factions';
  picker.querySelectorAll('[data-gac-faction-value]').forEach((button) => {
    const active = clean(button.dataset.gacFactionLabel) === selectedCanonical;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const selectedEntry = entries.find((entry) => entry.label === selectedCanonical);
  picker.dataset.gacFactionSelected = selectedEntry?.label || '';
}

function filterMenu(picker, query = '') {
  const needle = clean(query).toLowerCase();
  let visible = 0;
  picker.querySelectorAll('[data-gac-faction-value]').forEach((button) => {
    const match = !needle || clean(button.dataset.gacFactionLabel).toLowerCase().includes(needle);
    button.hidden = !match;
    if (match) visible += 1;
  });
  const empty = picker.querySelector('[data-gac-faction-empty]');
  if (empty) empty.hidden = visible > 0;
}

function chooseFaction(rawSelect, picker, entries, label = '') {
  const entry = entries.find((candidate) => candidate.label === label);
  rawSelect.value = entry?.rawValue || '';
  rawSelect.dispatchEvent(new Event('change', { bubbles: true }));
  syncPicker(rawSelect, picker, entries);
  closePicker(picker);
}

function installSelect(rawSelect) {
  if (!(rawSelect instanceof HTMLSelectElement)) return;
  if (rawSelect.dataset.gacCanonicalFactionBound === 'true') return;
  rawSelect.dataset.gacCanonicalFactionBound = 'true';

  const entries = canonicalOptions(rawSelect);
  const picker = document.createElement('div');
  picker.className = 'gac-faction-picker';
  picker.dataset.gacFactionPicker = rawSelect.matches('[data-gac-manual-own-faction]') ? 'own' : 'enemy';
  picker.innerHTML = `
    <button type="button" class="gac-faction-trigger" data-gac-faction-trigger aria-haspopup="listbox" aria-expanded="false">
      <span data-gac-faction-label>All factions</span><b aria-hidden="true">⌄</b>
    </button>
    <div class="gac-faction-menu" data-gac-faction-menu role="listbox" hidden>
      <div class="gac-faction-menu-head">
        <strong>FILTER BY FACTION / ROLE</strong>
        <input type="search" data-gac-faction-search placeholder="Search factions…" autocomplete="off">
      </div>
      <div class="gac-faction-grid">
        <button type="button" class="is-all" data-gac-faction-value="" data-gac-faction-label="" role="option" aria-selected="false">All factions</button>
        ${entries.map((entry) => `<button type="button" data-gac-faction-value="${escapeAttr(entry.rawValue)}" data-gac-faction-label="${escapeAttr(entry.label)}" role="option" aria-selected="false">${entry.label}</button>`).join('')}
        <p data-gac-faction-empty hidden>No matching factions.</p>
      </div>
    </div>`;

  rawSelect.hidden = true;
  rawSelect.setAttribute('aria-hidden', 'true');
  rawSelect.insertAdjacentElement('afterend', picker);
  syncPicker(rawSelect, picker, entries);

  const trigger = picker.querySelector('[data-gac-faction-trigger]');
  const menu = picker.querySelector('[data-gac-faction-menu]');
  const search = picker.querySelector('[data-gac-faction-search]');

  trigger?.addEventListener('click', () => {
    const opening = menu?.hidden !== false;
    closeOtherPickers(picker);
    if (menu) menu.hidden = !opening;
    trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      filterMenu(picker, '');
      if (search) {
        search.value = '';
        queueMicrotask(() => search.focus());
      }
    }
  });

  picker.addEventListener('click', (event) => {
    const option = event.target.closest?.('[data-gac-faction-value]');
    if (!option) return;
    chooseFaction(rawSelect, picker, entries, clean(option.dataset.gacFactionLabel));
  });

  search?.addEventListener('input', () => filterMenu(picker, search.value));
  picker.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closePicker(picker);
    trigger?.focus();
  });
  rawSelect.addEventListener('change', () => syncPicker(rawSelect, picker, entries));
}

function refreshCanonicalFactionFilters(root = document) {
  for (const selector of SELECTORS) {
    root.querySelectorAll(selector).forEach(installSelect);
  }
}

function installCanonicalFactionFilters() {
  if (window.__gacCanonicalFactionFiltersInstalled) return;
  window.__gacCanonicalFactionFiltersInstalled = true;
  injectStyle();
  const refresh = () => refreshCanonicalFactionFilters(document);
  refresh();
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
  window.addEventListener('hashchange', refresh);
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('[data-gac-faction-picker]')) return;
    closeOtherPickers();
  }, true);
  new MutationObserver(() => queueMicrotask(refresh)).observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installCanonicalFactionFilters();

export { canonicalOptions, installCanonicalFactionFilters, refreshCanonicalFactionFilters };
