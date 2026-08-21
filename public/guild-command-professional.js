const state = { scheduled: false };

const clean = (value) => String(value ?? '').trim().toLowerCase();

function injectStylesheet() {
  if (document.querySelector('link[data-guild-command-professional]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-command-professional.css?v=20260821-guildpro1';
  link.dataset.guildCommandProfessional = 'true';
  document.head.appendChild(link);
}

function classifyCapabilityCards(root) {
  for (const card of root.querySelectorAll('.guild-capability-card')) {
    const text = clean(card.textContent);
    card.classList.toggle('is-tb', text.includes('territory battles') || text.includes('tb command'));
    card.classList.toggle('is-tw', text.includes('territory wars') || text.includes('tw command'));
    card.classList.toggle('is-raid', text.includes('raid command') || text.includes('raids'));
  }
}

function classifyStats(root) {
  for (const card of root.querySelectorAll('.guild-page-stat')) {
    const label = clean(card.querySelector('span')?.textContent);
    card.classList.remove('guild-pro-gold', 'guild-pro-purple', 'guild-pro-orange', 'guild-pro-green');
    if (label.includes('galactic legend') || label.includes('guild gp') || label.includes('highest gp')) {
      card.classList.add('guild-pro-gold');
    } else if (label.includes('r9') || label.includes('relic')) {
      card.classList.add('guild-pro-orange');
    } else if (label.includes('ship')) {
      card.classList.add('guild-pro-purple');
    } else if (label.includes('member') || label.includes('hydrated')) {
      card.classList.add('guild-pro-green');
    }
  }
}

function enhanceTabs(root) {
  const icons = [
    ['overview', '⌂'],
    ['member', '◉'],
    ['tb', '✦'],
    ['tw', '⚔'],
    ['raid', '◆'],
  ];
  for (const button of root.querySelectorAll('.guild-page-tabs button')) {
    if (button.dataset.guildProIcon === 'true') continue;
    const text = clean(button.textContent);
    const match = icons.find(([token]) => text.includes(token));
    const icon = match?.[1] || '◇';
    const span = document.createElement('span');
    span.className = 'guild-pro-tab-icon';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = icon;
    button.prepend(span);
    button.dataset.guildProIcon = 'true';
  }
}

function enhance(root) {
  if (!root) return;
  injectStylesheet();
  root.classList.add('guild-pro-enhanced');
  classifyCapabilityCards(root);
  classifyStats(root);
  enhanceTabs(root);
}

function run() {
  state.scheduled = false;
  enhance(document.querySelector('.guild-command-page'));
}

function schedule() {
  if (state.scheduled) return;
  state.scheduled = true;
  requestAnimationFrame(run);
}

if (typeof document !== 'undefined') {
  injectStylesheet();
  schedule();
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  window.addEventListener('swgoh:guild-command-snapshot', schedule);
  window.addEventListener('swgoh:workspace-activated', schedule);
  document.addEventListener('click', schedule, true);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
}

export { classifyCapabilityCards, classifyStats, enhanceTabs };
