const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);

function ownerCode() {
  return allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode || window.__swgohPlayerRosterSnapshot?.allyCode);
}
function opponentCode() {
  return allyCode(document.querySelector('[data-gacv2-opponent]')?.value || document.getElementById('gacOpponentCode')?.value);
}
function currentRound() {
  const round = Number(document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : 0;
}
function format() {
  return Number(document.querySelector('[data-gacv2-mode]')?.value || document.getElementById('gacMode')?.value) === 3 ? '3v3' : '5v5';
}
function storageKey({ owner = ownerCode() || 'anonymous', opponent = opponentCode() || 'manual', round = currentRound(), formatName = format() } = {}) {
  return `swgoh:gac-visible-board:v1:${owner}:${opponent}:${round}:${formatName}`;
}
function parseRows(key) {
  try {
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function mergeRows(left = [], right = []) {
  const index = new Map();
  const key = (row) => `${clean(row?.zone).toUpperCase()}|${Number.isInteger(Number(row?.slot)) ? Number(row.slot) : ''}`;
  for (const row of [...left, ...right]) index.set(key(row), row);
  return [...index.values()];
}
function migrateDraftContext() {
  const owner = ownerCode() || 'anonymous';
  const opponent = opponentCode() || 'manual';
  const round = currentRound();
  if (!round) return false;
  const targetKey = storageKey({ owner, opponent, round });
  let target = parseRows(targetKey);
  const candidates = [
    storageKey({ owner, opponent, round: 0 }),
    storageKey({ owner, opponent: 'manual', round: 0 }),
    storageKey({ owner, opponent: 'manual', round }),
  ].filter((value, index, rows) => value !== targetKey && rows.indexOf(value) === index);
  let changed = false;
  for (const sourceKey of candidates) {
    const source = parseRows(sourceKey);
    if (!source.length) continue;
    target = mergeRows(source, target).map((row) => ({ ...row, opponentAllyCode: opponent === 'manual' ? clean(row?.opponentAllyCode) : opponent }));
    localStorage.removeItem(sourceKey);
    changed = true;
  }
  if (changed) localStorage.setItem(targetKey, JSON.stringify(target));
  return changed;
}

function dispatchMatchupRefresh() {
  window.dispatchEvent(new CustomEvent('gac-v2-matchup-loaded', {
    detail: { ownerAllyCode: ownerCode(), opponentAllyCode: opponentCode(), round: currentRound() || null },
  }));
}

function bindMatchupObserver() {
  const summary = document.querySelector('[data-gacv2-matchup-summary]');
  if (!summary || summary.dataset.gacManualContextObserved === 'true') return false;
  summary.dataset.gacManualContextObserved = 'true';
  new MutationObserver(() => {
    if (!summary.querySelector('.gacv2-versus')) return;
    migrateDraftContext();
    dispatchMatchupRefresh();
  }).observe(summary, { childList: true, subtree: true, characterData: true });
  return true;
}

function bind() {
  if (document.documentElement.dataset.gacManualContextBridge === 'true') return;
  document.documentElement.dataset.gacManualContextBridge = 'true';
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('[data-gacv2-round],[data-gacv2-opponent],[data-gacv2-mode]') || event.target?.id === 'allyCode') {
      const changed = migrateDraftContext();
      if (changed) dispatchMatchupRefresh();
    }
  }, true);
  bindMatchupObserver();
  new MutationObserver(bindMatchupObserver).observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') bind();

export { mergeRows, migrateDraftContext, storageKey };
