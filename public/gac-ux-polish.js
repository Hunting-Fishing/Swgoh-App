const GAME_ASSET_BASE = 'https://game-assets.swgoh.gg/textures';
const SWGOH_GG_ASSET_BASE = 'https://swgoh.gg/static/img/assets';
const COLLAPSE_KEY = 'swgoh:gac:ux:own-defense-collapsed';

let catalogPromise = null;
let catalogMap = new Map();
let scheduled = false;
let moveState = null;
const imageState = new WeakMap();

function clean(value) { return String(value ?? '').trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalizeAssetName(value) {
  return clean(value)
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^textures\//i, '')
    .replace(/\.(png|jpg|jpeg|webp)$/i, '');
}
function gameAssetUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const name = normalizeAssetName(raw);
  return name ? `${GAME_ASSET_BASE}/${encodeURIComponent(name)}.png` : '';
}
function swgohGgAssetUrl(value) {
  const name = normalizeAssetName(value);
  return name ? `${SWGOH_GG_ASSET_BASE}/${encodeURIComponent(name)}.png` : '';
}
function baseIdFromPortrait(node) { return clean(node?.dataset?.inspectBaseId).split(':')[0].toUpperCase(); }

async function loadCatalog() {
  if (catalogMap.size) return catalogMap;
  if (!catalogPromise) {
    catalogPromise = fetch('/data/catalog.json?gac-ux=assets1', { cache: 'force-cache', credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : {})
      .then((body) => {
        catalogMap = new Map((Array.isArray(body?.units) ? body.units : [])
          .map((unit) => [clean(unit?.baseId).toUpperCase(), unit])
          .filter(([id]) => Boolean(id)));
        return catalogMap;
      })
      .catch(() => catalogMap);
  }
  return catalogPromise;
}

function portraitCandidates(baseId, current = '') {
  const unit = catalogMap.get(baseId);
  return unique([
    clean(current),
    clean(unit?.image),
    clean(unit?.imageUrl),
    gameAssetUrl(unit?.thumbnailName),
    clean(unit?.imageFallback),
    swgohGgAssetUrl(unit?.thumbnailName),
  ]);
}

function advanceImage(img) {
  const state = imageState.get(img);
  if (!state) return false;
  for (let index = state.index + 1; index < state.candidates.length; index += 1) {
    const next = state.candidates[index];
    if (!next) continue;
    state.index = index;
    imageState.set(img, state);
    img.src = next;
    return true;
  }
  return false;
}

function prepareImage(img, baseId) {
  const candidates = portraitCandidates(baseId, img.getAttribute('src'));
  if (!candidates.length) return;
  const current = clean(img.currentSrc || img.src || img.getAttribute('src'));
  let index = candidates.findIndex((candidate) => {
    try { return new URL(candidate, location.href).href === new URL(current, location.href).href; }
    catch { return candidate === current; }
  });
  if (index < 0) index = 0;
  imageState.set(img, { candidates, index });
  img.dataset.gacAssetFallback = 'true';
}

function decoratePortraits(root = document) {
  for (const portrait of root.querySelectorAll?.('[data-gac-manual-counter-planner] .gac-manual-unit[data-inspect-base-id]') || []) {
    const baseId = baseIdFromPortrait(portrait);
    if (!baseId) continue;
    let img = portrait.querySelector('img');
    if (img) {
      if (!img.dataset.gacAssetFallback) prepareImage(img, baseId);
      continue;
    }
    const candidates = portraitCandidates(baseId);
    if (!candidates.length) continue;
    img = document.createElement('img');
    img.alt = clean(catalogMap.get(baseId)?.name || baseId);
    img.loading = 'lazy';
    img.decoding = 'async';
    img.dataset.gacAssetFallback = 'true';
    imageState.set(img, { candidates, index: 0 });
    img.src = candidates[0];
    portrait.prepend(img);
    const initials = [...portrait.children].find((child) => child.tagName === 'B');
    if (initials) initials.hidden = true;
  }
}

function cardPosition(card) {
  const section = card?.closest?.('.gac-manual-map-zone');
  const zone = section?.classList.contains('is-back-top') ? 'BACK-TOP'
    : section?.classList.contains('is-front-top') ? 'FRONT-TOP'
      : section?.classList.contains('is-back-bottom') ? 'BACK-BOTTOM'
        : section?.classList.contains('is-front-bottom') ? 'FRONT-BOTTOM' : '';
  const text = clean(card?.querySelector('header span')?.textContent || card?.textContent);
  const match = text.match(/SLOT\s+(\d+)/i);
  return { zone, slot: match ? Math.max(0, Number(match[1]) - 1) : null };
}
function defenseId(card) { return clean(card?.querySelector('[data-gac-manual-defense-edit]')?.dataset?.gacManualDefenseEdit); }
function defenseType(card) { return card?.classList.contains('is-fleet') || card?.closest('.is-back-top') ? 'fleet' : 'squad'; }
function compatible(type, zone) { return type === 'fleet' ? zone === 'BACK-TOP' : zone !== 'BACK-TOP'; }
function findEditButton(id) {
  return [...document.querySelectorAll('[data-gac-manual-defense-edit]')]
    .find((button) => clean(button.dataset.gacManualDefenseEdit) === id) || null;
}
function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function editPosition(id, zone, slot) {
  const edit = findEditButton(id);
  if (!edit) return false;
  edit.click();
  await tick();
  const editor = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-editor');
  const zoneSelect = editor?.querySelector('[data-gac-manual-editor-zone]');
  const slotInput = editor?.querySelector('[data-gac-manual-editor-slot]');
  if (!editor || !slotInput) return false;
  if (zoneSelect) {
    zoneSelect.value = zone;
    zoneSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  slotInput.value = String(Number(slot) + 1);
  slotInput.dispatchEvent(new Event('change', { bubbles: true }));
  const save = editor.querySelector('[data-gac-manual-editor-save]');
  if (!save || save.disabled) return false;
  save.click();
  await tick();
  return true;
}

function clearMoveMode() {
  moveState = null;
  document.querySelector('[data-gac-manual-counter-planner]')?.classList.remove('gac-ux-moving');
  document.querySelector('[data-gac-ux-move-banner]')?.remove();
  for (const node of document.querySelectorAll('.gac-ux-move-target,.gac-ux-swap-target')) {
    node.classList.remove('gac-ux-move-target', 'gac-ux-swap-target');
  }
}

function renderMoveTargets() {
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  if (!host || !moveState) return;
  host.classList.add('gac-ux-moving');
  const map = host.querySelector('.gac-manual-gac-map');
  if (!map) return;
  if (!host.querySelector('[data-gac-ux-move-banner]')) {
    map.insertAdjacentHTML('beforebegin', `<div class="gac-ux-move-banner" data-gac-ux-move-banner><div><span>REARRANGE BOARD</span><strong>${moveState.type === 'fleet' ? 'Move fleet' : 'Move squad'} · choose an empty slot or occupied slot to swap</strong></div><button type="button" data-gac-ux-move-cancel>Cancel</button></div>`);
  }
  for (const node of map.querySelectorAll('[data-gac-league-slot-add]')) {
    if (compatible(moveState.type, clean(node.dataset.zone).toUpperCase())) node.classList.add('gac-ux-move-target');
  }
  for (const placement of map.querySelectorAll('.gac-league-placement.is-filled')) {
    const card = placement.querySelector('.gac-manual-defense-card');
    const id = defenseId(card);
    const pos = cardPosition(card);
    if (id && id !== moveState.id && compatible(moveState.type, pos.zone) && defenseType(card) === moveState.type) placement.classList.add('gac-ux-swap-target');
  }
}

function startMove(card) {
  const id = defenseId(card);
  const pos = cardPosition(card);
  if (!id || !pos.zone || !Number.isInteger(pos.slot)) return;
  clearMoveMode();
  moveState = { id, type: defenseType(card), zone: pos.zone, slot: pos.slot };
  renderMoveTargets();
}

async function moveToEmpty(node) {
  if (!moveState) return;
  const target = { zone: clean(node.dataset.zone).toUpperCase(), slot: Number(node.dataset.slot) };
  const source = { ...moveState };
  clearMoveMode();
  await editPosition(source.id, target.zone, target.slot);
  scheduleDecorate();
}

async function swapWith(placement) {
  if (!moveState) return;
  const targetCard = placement.querySelector('.gac-manual-defense-card');
  const targetId = defenseId(targetCard);
  const targetPos = cardPosition(targetCard);
  const source = { ...moveState };
  if (!targetId || !targetPos.zone || !Number.isInteger(targetPos.slot)) return;
  clearMoveMode();
  const first = await editPosition(targetId, source.zone, source.slot);
  if (first) await editPosition(source.id, targetPos.zone, targetPos.slot);
  scheduleDecorate();
}

function decorateMoveButtons(root = document) {
  for (const card of root.querySelectorAll?.('[data-gac-manual-counter-planner] .gac-manual-defense-card') || []) {
    const footer = card.querySelector('footer');
    if (!footer || footer.querySelector('[data-gac-ux-move]')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.gacUxMove = 'true';
    button.textContent = 'Move';
    footer.insertBefore(button, footer.firstChild);
  }
}

function ownDefenseCollapsed() { return localStorage.getItem(COLLAPSE_KEY) === 'true'; }
function applyOwnDefenseCollapse() {
  const section = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense');
  if (!section) return;
  const collapsed = ownDefenseCollapsed();
  section.classList.toggle('gac-ux-collapsed', collapsed);
  const header = section.querySelector(':scope > header');
  if (!header) return;
  let button = header.querySelector('[data-gac-ux-collapse-defense]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.gacUxCollapseDefense = 'true';
    header.appendChild(button);
  }
  const label = collapsed ? 'Show roster' : 'Collapse roster';
  if (button.textContent !== label) button.textContent = label;
}

function ensureWorkspaceNav() {
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  if (!host || host.querySelector('[data-gac-ux-nav]')) return;
  const head = host.querySelector('.gac-manual-head');
  if (!head) return;
  head.insertAdjacentHTML('afterend', `<nav class="gac-ux-nav" data-gac-ux-nav><button type="button" data-gac-ux-jump="setup">1 Opponent</button><button type="button" data-gac-ux-jump="defense">2 My Defense</button><button type="button" data-gac-ux-jump="board">3 Battle Table</button><button type="button" data-gac-ux-jump="counters">4 Counters</button></nav>`);
}

function jumpTarget(name) {
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  if (name === 'setup') return host?.querySelector('.gac-manual-setup');
  if (name === 'defense') return host?.querySelector('.gac-manual-own-defense');
  if (name === 'board') return host?.querySelector('.gac-manual-enemy-board');
  if (name === 'counters') return host?.querySelector('.gac-manual-plan');
  return null;
}

async function decorate(root = document) {
  await loadCatalog();
  decoratePortraits(root);
  decorateMoveButtons(root);
  ensureWorkspaceNav();
  applyOwnDefenseCollapse();
  if (moveState && !document.querySelector('[data-gac-ux-move-banner]')) renderMoveTargets();
}

function scheduleDecorate() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await decorate(document);
  });
}

function injectStyle() {
  if (document.querySelector('link[data-gac-ux-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-ux-polish.css?v=20260821-ux1';
  link.dataset.gacUxStyle = 'true';
  document.head.appendChild(link);
}

if (typeof window !== 'undefined') {
  injectStyle();
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.closest?.('[data-gac-manual-counter-planner] .gac-manual-unit')) return;
    if (!advanceImage(img)) {
      img.hidden = true;
      const initials = [...(img.parentElement?.children || [])].find((child) => child.tagName === 'B');
      if (initials) initials.hidden = false;
    }
  }, true);
  document.addEventListener('click', (event) => {
    const move = event.target.closest?.('[data-gac-ux-move]');
    if (move) {
      event.preventDefault();
      event.stopImmediatePropagation();
      startMove(move.closest('.gac-manual-defense-card'));
      return;
    }
    if (event.target.closest?.('[data-gac-ux-move-cancel]')) {
      event.preventDefault(); clearMoveMode(); return;
    }
    if (moveState) {
      const empty = event.target.closest?.('.gac-ux-move-target[data-gac-league-slot-add]');
      if (empty) { event.preventDefault(); event.stopImmediatePropagation(); void moveToEmpty(empty); return; }
      const filled = event.target.closest?.('.gac-ux-swap-target');
      if (filled) { event.preventDefault(); event.stopImmediatePropagation(); void swapWith(filled); return; }
    }
    const jump = event.target.closest?.('[data-gac-ux-jump]');
    if (jump) {
      event.preventDefault();
      jumpTarget(jump.dataset.gacUxJump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const collapse = event.target.closest?.('[data-gac-ux-collapse-defense]');
    if (collapse) {
      event.preventDefault();
      localStorage.setItem(COLLAPSE_KEY, ownDefenseCollapsed() ? 'false' : 'true');
      applyOwnDefenseCollapse();
    }
  }, true);
  new MutationObserver(scheduleDecorate).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleDecorate);
  window.addEventListener('swgoh:workspace-activated', scheduleDecorate);
  scheduleDecorate();
}

export { decoratePortraits, gameAssetUrl, swgohGgAssetUrl };
