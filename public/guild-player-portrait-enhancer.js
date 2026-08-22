import { loadPlayerPortraitRegistry, resolvePlayerPortraitUrl } from './guild-player-portrait-registry.js';

const clean = (value) => String(value ?? '').trim();
let observer = null;
let registryReady = false;

function enhancePortraitMark(mark) {
  if (!(mark instanceof HTMLElement) || mark.dataset.playerPortraitEnhanced) return false;
  const portraitId = clean(mark.dataset.playerPortraitId);
  if (!portraitId) return false;
  const direct = clean(mark.dataset.playerPortraitUrl);
  const imageUrl = resolvePlayerPortraitUrl(portraitId, direct);
  if (!imageUrl) return false;

  const fallback = clean(mark.textContent) || '•';
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.dataset.guildPortraitImage = 'true';
  image.addEventListener('error', () => {
    mark.classList.remove('has-image');
    mark.classList.add('is-rank', 'is-glyph');
    mark.textContent = fallback;
    mark.dataset.playerPortraitEnhanced = 'failed';
  }, { once: true });

  mark.textContent = '';
  mark.appendChild(image);
  mark.classList.add('has-image');
  mark.classList.remove('is-rank', 'is-glyph');
  mark.dataset.playerPortraitEnhanced = 'true';
  mark.title = `In-game portrait ${portraitId}`;
  return true;
}

function enhancePlayerPortraits(root = document) {
  if (!registryReady || !root?.querySelectorAll) return 0;
  let count = 0;
  if (root instanceof HTMLElement && root.matches('[data-player-portrait-id]')) count += enhancePortraitMark(root) ? 1 : 0;
  for (const mark of root.querySelectorAll('[data-player-portrait-id]')) count += enhancePortraitMark(mark) ? 1 : 0;
  return count;
}

function installPlayerPortraitEnhancer() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__guildPortraitEnhancerInstalled) return;
  window.__guildPortraitEnhancerInstalled = true;
  loadPlayerPortraitRegistry().then(() => {
    registryReady = true;
    enhancePlayerPortraits(document);
    if (!document.body || observer) return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) if (node instanceof HTMLElement) enhancePlayerPortraits(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPlayerPortraitEnhancer, { once: true });
  else installPlayerPortraitEnhancer();
}

export { enhancePlayerPortraits, enhancePortraitMark, installPlayerPortraitEnhancer };
