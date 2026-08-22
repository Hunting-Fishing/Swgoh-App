const clean = (value) => String(value ?? '').trim();

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function matrixRows() {
  const table = document.querySelector('.gac-counter-matrix-table');
  if (!table) return [];
  const rows = [];
  const header = ['Enemy Defense'];
  table.querySelectorAll('thead th').forEach((cell, index) => {
    if (index === 0) return;
    const name = clean(cell.querySelector('span')?.textContent || cell.textContent);
    header.push(name || `Counter ${index}`);
  });
  rows.push(header);
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const row = [];
    const defense = tr.querySelector('th span')?.textContent || tr.querySelector('th')?.textContent || 'Defense';
    row.push(clean(defense));
    tr.querySelectorAll('td').forEach((td) => {
      const cell = td.querySelector('.gac-matrix-cell');
      if (!cell || cell.disabled) { row.push(''); return; }
      const win = clean(cell.querySelector('b')?.textContent);
      const battles = clean(cell.querySelector('span')?.textContent);
      const banners = clean(cell.querySelector('small')?.textContent);
      row.push([win, battles ? `${battles} battles` : '', banners].filter(Boolean).join(' · '));
    });
    rows.push(row);
  });
  return rows;
}

function matrixCsv() {
  return matrixRows().map((row) => row.map(csvCell).join(',')).join('\n');
}

function matrixTsv() {
  return matrixRows().map((row) => row.map((cell) => String(cell ?? '').replaceAll('\t', ' ')).join('\t')).join('\n');
}

function battlePlanText() {
  const root = document.querySelector('[data-gac-board-optimization]');
  if (!root) return '';
  const summary = [...root.querySelectorAll('.gac-opt-summary article')].map((card) => {
    const value = clean(card.querySelector('b')?.textContent);
    const label = clean(card.querySelector('span')?.textContent);
    return value && label ? `${label}: ${value}` : '';
  }).filter(Boolean);
  const priorities = [...root.querySelectorAll('.gac-opt-priority')].map((card, index) => {
    const title = clean(card.querySelector('header span b')?.textContent);
    const slot = clean(card.querySelector('header span small')?.textContent);
    const scarcity = clean(card.querySelector('header i')?.textContent);
    const proposal = clean(card.querySelector('footer strong')?.textContent);
    const detail = clean(card.querySelector('footer small')?.textContent);
    return `${index + 1}. ${title}${slot ? ` — ${slot}` : ''}${scarcity ? ` [${scarcity}]` : ''}${proposal ? ` → ${proposal}` : ''}${detail ? ` (${detail})` : ''}`;
  });
  if (!summary.length && !priorities.length) return '';
  return ['SWGOH Command Center — GAC Whole-Board Plan', ...summary, '', ...priorities, '', 'Evidence-based planning only; current server Attack Plan remains authoritative.'].join('\n');
}

async function copyText(text, successLabel, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = successLabel;
    setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1200);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  if (!text) return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ensureMatrixExport() {
  const root = document.querySelector('[data-gac-counter-matrix]');
  if (!root || root.querySelector('[data-gac-matrix-export]')) return;
  const bar = document.createElement('div');
  bar.className = 'gac-intel-export';
  bar.dataset.gacMatrixExport = 'true';
  bar.innerHTML = '<span>MATRIX EXPORT</span><button type="button" data-gac-copy-matrix>COPY TSV</button><button type="button" data-gac-download-matrix>DOWNLOAD CSV</button>';
  root.appendChild(bar);
}

function ensurePlanExport() {
  const root = document.querySelector('[data-gac-board-optimization]');
  if (!root || root.querySelector('[data-gac-plan-export]')) return;
  const bar = document.createElement('div');
  bar.className = 'gac-intel-export';
  bar.dataset.gacPlanExport = 'true';
  bar.innerHTML = '<span>PLAN EXPORT</span><button type="button" data-gac-copy-plan>COPY PLAN</button><button type="button" data-gac-download-plan>DOWNLOAD TXT</button>';
  root.appendChild(bar);
}

function ensureExports() {
  if (location.hash && location.hash !== '#gac') return;
  ensureMatrixExport();
  ensurePlanExport();
}

function installIntelligenceExport() {
  if (window.__gacIntelligenceExportInstalled) return;
  window.__gacIntelligenceExportInstalled = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-gac-copy-matrix],[data-gac-download-matrix],[data-gac-copy-plan],[data-gac-download-plan]');
    if (!button) return;
    if (button.matches('[data-gac-copy-matrix]')) { void copyText(matrixTsv(), 'COPIED', button); return; }
    if (button.matches('[data-gac-download-matrix]')) { downloadText('swgoh-gac-counter-matrix.csv', matrixCsv(), 'text/csv;charset=utf-8'); return; }
    if (button.matches('[data-gac-copy-plan]')) { void copyText(battlePlanText(), 'COPIED', button); return; }
    if (button.matches('[data-gac-download-plan]')) downloadText('swgoh-gac-battle-plan.txt', battlePlanText());
  });
  const observer = new MutationObserver(() => queueMicrotask(ensureExports));
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', ensureExports, { once:true });
  window.addEventListener('hashchange', ensureExports);
  ensureExports();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installIntelligenceExport();
export { battlePlanText, csvCell, installIntelligenceExport, matrixCsv, matrixRows, matrixTsv };
