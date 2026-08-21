import { canonicalFaction } from './gac-player-facing-factions.js';

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
  if (/^(species|affiliation|profession|faction|category|tag)[ _-]/i.test(raw)) return 1;
  return 2;
}

function canonicalOptions(rawSelect) {
  const byLabel = new Map();
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
  return [...byLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function installSelect(rawSelect) {
  if (!(rawSelect instanceof HTMLSelectElement)) return;
  if (rawSelect.dataset.gacCanonicalFactionBound === 'true') return;
  rawSelect.dataset.gacCanonicalFactionBound = 'true';

  const entries = canonicalOptions(rawSelect);
  const currentCanonical = canonicalFaction(rawSelect.selectedOptions?.[0]?.textContent || rawSelect.value) || canonicalFaction(rawSelect.value);
  const replacement = document.createElement('select');
  replacement.className = rawSelect.className;
  replacement.dataset.gacCanonicalFaction = rawSelect.matches('[data-gac-manual-own-faction]') ? 'own' : 'enemy';
  replacement.setAttribute('aria-label', 'Faction');
  replacement.innerHTML = `<option value="">All factions</option>${entries.map((entry) => `<option value="${entry.rawValue.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}">${entry.label}</option>`).join('')}`;

  const selectedEntry = entries.find((entry) => entry.label === currentCanonical);
  replacement.value = selectedEntry?.rawValue || '';

  replacement.addEventListener('change', () => {
    rawSelect.value = replacement.value;
    rawSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  rawSelect.hidden = true;
  rawSelect.setAttribute('aria-hidden', 'true');
  rawSelect.insertAdjacentElement('afterend', replacement);
}

function refreshCanonicalFactionFilters(root = document) {
  for (const selector of SELECTORS) {
    root.querySelectorAll(selector).forEach(installSelect);
  }
}

function installCanonicalFactionFilters() {
  if (window.__gacCanonicalFactionFiltersInstalled) return;
  window.__gacCanonicalFactionFiltersInstalled = true;
  const refresh = () => refreshCanonicalFactionFilters(document);
  refresh();
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
  window.addEventListener('hashchange', refresh);
  new MutationObserver(() => queueMicrotask(refresh)).observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installCanonicalFactionFilters();

export { canonicalOptions, installCanonicalFactionFilters, refreshCanonicalFactionFilters };
