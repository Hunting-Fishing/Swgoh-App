function ensureStyle() {
  if (!document.querySelector('link[data-player-command-professional="true"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/player-command-professional.css?v=20260821-playerpro1';
    link.dataset.playerCommandProfessional = 'true';
    document.head.appendChild(link);
  }

  if (!document.querySelector('link[data-non-gac-responsive-polish="true"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/non-gac-responsive-polish.css?v=20260821-qa1';
    link.dataset.nonGacResponsivePolish = 'true';
    document.head.appendChild(link);
  }
}

function markReference(node) {
  if (!node || node.dataset.playerProReference === 'true') return;
  node.dataset.playerProReference = 'true';
}

function enhance() {
  ensureStyle();
  document.body?.classList.add('player-pro-enhanced');

  // The original roster controls/grid remain available as detailed reference
  // underneath Roster Commander instead of being discarded for presentation.
  markReference(document.getElementById('controls'));
  markReference(document.getElementById('roster'));

  // Gallery navigation and the V3/Master Plan are complementary views. Keep all.
  const farmPanel = document.querySelector('[data-workspace-panel="farm"]');
  if (farmPanel) {
    for (const node of farmPanel.querySelectorAll('[data-farm-v3-command],[data-farm-v3-surface],#farmMasterPlan')) {
      markReference(node);
    }
  }

  for (const id of ['roster', 'farm', 'mods', 'resources', 'events']) {
    document.querySelector(`[data-workspace-panel="${id}"]`)?.setAttribute('data-player-pro-enhanced', 'true');
  }
}

function schedule() {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(enhance);
}

if (typeof document !== 'undefined') {
  enhance();
  document.addEventListener('DOMContentLoaded', enhance, { once: true });
  window.addEventListener('swgoh:workspace-activated', schedule);
  window.addEventListener('swgoh:player-loaded', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
}

export { enhance, markReference };
