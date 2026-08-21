const clean = (value) => String(value ?? '').trim();
const normalizeBaseId = (value) => clean(value).split(':')[0].toUpperCase();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
let scheduled = false;

function formatValue() {
  return document.querySelector('[data-gac-manual-format]')?.value ||
    localStorage.getItem('swgoh:gac-manual-counter:format') || '5v5';
}

function storageKey() {
  const owner = allyCode(
    document.getElementById('allyCode')?.value ||
    window.__swgohAccountAllyCode ||
    window.__swgohPlayerRosterSnapshot?.allyCode
  );
  const opponent = allyCode(
    document.querySelector('[data-gac-manual-opponent]')?.value ||
    localStorage.getItem('swgoh:gac-manual-counter:last-opponent')
  );
  return `swgoh:gac-manual-counter:v1:${owner || 'anonymous'}:${opponent || 'manual'}:${formatValue()}`;
}

function savedDefense(defenseId) {
  const id = clean(defenseId);
  if (!id) return null;
  try {
    const body = JSON.parse(localStorage.getItem(storageKey()) || '{}');
    return (Array.isArray(body?.defenses) ? body.defenses : [])
      .find((row) => clean(row?.id) === id) || null;
  } catch {
    return null;
  }
}

function portraitId(node) {
  return normalizeBaseId(node?.dataset?.inspectBaseId);
}

function clonePortrait(node, className) {
  if (!node) return null;
  const clone = node.cloneNode(true);
  clone.classList.add('gac-league-node-portrait', className);
  clone.querySelector('small')?.remove();
  return clone;
}

function decoratePlacement(placement) {
  const button = placement?.querySelector?.(':scope > [data-gac-league-slot-edit]');
  const card = placement?.querySelector?.('.gac-manual-defense-card');
  if (!button || !card) return false;
  const defense = savedDefense(button.dataset.defenseId);
  const leaderId = normalizeBaseId(defense?.leaderBaseId || defense?.capitalShipBaseId);
  if (!leaderId || placement.dataset.gacActualLeader === leaderId) return false;

  const portraits = [...card.querySelectorAll('.gac-manual-team .gac-manual-unit[data-inspect-base-id]')];
  const leaderNode = portraits.find((node) => portraitId(node) === leaderId) || portraits[0];
  if (!leaderNode) return false;

  const orbit = button.querySelector('.gac-league-node-orbit');
  const pips = button.querySelector('.gac-league-node-pips');
  const title = button.querySelector(':scope > strong');
  const leaderClone = clonePortrait(leaderNode, 'is-leader');
  if (orbit && leaderClone) orbit.replaceChildren(leaderClone);
  if (pips) {
    pips.replaceChildren(...portraits
      .filter((node) => node !== leaderNode)
      .slice(0, 4)
      .map((node) => clonePortrait(node, 'is-member'))
      .filter(Boolean));
  }
  const name = clean(leaderNode.querySelector('small')?.textContent || leaderNode.getAttribute('title') || leaderId);
  if (title && name) title.textContent = name;
  placement.dataset.gacActualLeader = leaderId;
  return true;
}

function decorateSelectedPanel() {
  const selected = document.querySelector('[data-gac-manual-counter-planner] .gac-league-placement.is-filled.is-selected');
  const panel = document.querySelector('[data-gac-manual-counter-planner] .gac-live-selected');
  const button = selected?.querySelector?.(':scope > [data-gac-league-slot-edit]');
  const card = selected?.querySelector?.('.gac-manual-defense-card');
  if (!panel || !button || !card) return false;
  const defense = savedDefense(button.dataset.defenseId);
  const leaderId = normalizeBaseId(defense?.leaderBaseId || defense?.capitalShipBaseId);
  if (!leaderId || panel.dataset.gacActualLeader === leaderId) return false;
  const portraits = [...card.querySelectorAll('.gac-manual-team .gac-manual-unit[data-inspect-base-id]')];
  const leaderNode = portraits.find((node) => portraitId(node) === leaderId) || portraits[0];
  if (!leaderNode) return false;
  const target = panel.querySelector('.gac-live-selected-leader > :first-child');
  const leaderClone = clonePortrait(leaderNode, 'is-leader');
  if (target && leaderClone) target.replaceWith(leaderClone);
  const name = clean(leaderNode.querySelector('small')?.textContent || leaderNode.getAttribute('title') || leaderId);
  const nameNode = panel.querySelector('.gac-live-selected-leader > div > strong');
  if (nameNode && name) nameNode.textContent = name;
  panel.dataset.gacActualLeader = leaderId;
  return true;
}

function decorate() {
  for (const placement of document.querySelectorAll('[data-gac-manual-counter-planner] .gac-league-placement.is-filled')) {
    decoratePlacement(placement);
  }
  decorateSelectedPanel();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    decorate();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  window.addEventListener('swgoh:workspace-activated', schedule);
  window.addEventListener('hashchange', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}

export { decoratePlacement, savedDefense, storageKey };
