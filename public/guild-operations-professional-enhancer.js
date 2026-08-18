const PATH = '/guild/operations';
const ALLY_STORAGE_KEY = 'swgoh:guild-route-ally-code';
const state = { catalog: null, roster: null, workspace: null, timer: 0, enhancing: false };

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const isRoute = () => location.pathname.replace(/\/+$/, '') === PATH;

function allyCode() {
  const query = digits(new URLSearchParams(location.search).get('allyCode'));
  const input = digits(document.getElementById('allyCode')?.value);
  let stored = '';
  try { stored = digits(localStorage.getItem(ALLY_STORAGE_KEY)); } catch {}
  return [query, input, stored].find((value) => value.length === 9) || '';
}

function api(suffix = '') {
  return `/api/account/guild-operations/${allyCode()}${suffix}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `${url} returned HTTP ${response.status}`);
    error.code = body?.code;
    throw error;
  }
  return body;
}

async function loadReferenceData() {
  const code = allyCode();
  if (code.length !== 9) return;
  const [workspace, roster, catalog] = await Promise.all([
    fetchJson(api('/workspace')),
    fetchJson(`/api/guild/by-player/${code}/roster`),
    fetchJson('/data/catalog.json?guild-ops-professional=1'),
  ]);
  state.workspace = workspace;
  state.roster = roster;
  state.catalog = Array.isArray(catalog?.units) ? catalog.units : [];
}

function ensureStyle() {
  if (document.querySelector('link[data-guild-ops-professional-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-operations-professional.css?v=20260818-ops2';
  link.dataset.guildOpsProfessionalStyle = 'true';
  document.head.appendChild(link);
}

function relativeAge(value) {
  const when = Date.parse(value || '');
  if (!Number.isFinite(when)) return 'unknown freshness';
  const seconds = Math.max(0, Math.floor((Date.now() - when) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h old`;
  return `${Math.floor(seconds / 86400)}d old`;
}

function freshnessTone(value) {
  const age = Date.now() - Date.parse(value || 0);
  if (!Number.isFinite(age)) return 'warn';
  if (age <= 30 * 60 * 1000) return 'ready';
  if (age <= 3 * 60 * 60 * 1000) return 'warn';
  return 'risk';
}

function injectFreshnessBar() {
  const shell = document.querySelector('.guild-ops-shell');
  const hero = shell?.querySelector('.guild-ops-hero');
  if (!shell || !hero || document.querySelector('[data-ops-professional-freshness]')) return;
  const syncedAt = state.workspace?.guild?.lastSyncedAt;
  const bar = document.createElement('div');
  bar.className = 'guild-ops-professional-bar';
  bar.dataset.opsProfessionalFreshness = 'true';
  bar.innerHTML = `
    <div>
      <span class="guild-ops-chip ${freshnessTone(syncedAt)}">ROSTER · ${escapeHtml(relativeAge(syncedAt))}</span>
      <small>Last canonical Guild sync: ${escapeHtml(syncedAt ? new Date(syncedAt).toLocaleString() : 'unknown')}</small>
    </div>
    <div class="guild-ops-professional-actions">
      <span class="guild-ops-shortcut-hint">⌘/Ctrl+S save · ⌘/Ctrl+Enter preview · Alt+1…5 workflow</span>
      <button type="button" id="opsProfessionalRefresh" class="guild-ops-button secondary">Refresh Guild Now</button>
    </div>`;
  hero.insertAdjacentElement('afterend', bar);
  document.getElementById('opsProfessionalRefresh')?.addEventListener('click', refreshGuild);
}

async function refreshGuild() {
  const button = document.getElementById('opsProfessionalRefresh');
  if (button) { button.disabled = true; button.textContent = 'Refreshing…'; }
  try {
    await fetchJson(`/api/guild/by-player/${allyCode()}/roster?refresh=1`);
    window.dispatchEvent(new CustomEvent('swgoh:guild-command-snapshot', { detail: { force: true, source: 'guild-operations' } }));
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = 'Refresh failed — retry'; button.title = error.message; }
  }
}

function catalogOptions() {
  return (state.catalog || [])
    .filter((unit) => unit?.baseId && unit?.name)
    .slice()
    .sort((a, b) => text(a.name).localeCompare(text(b.name)))
    .map((unit) => `<option value="${escapeHtml(unit.baseId)}">${escapeHtml(unit.name)} · ${escapeHtml(unit.baseId)}</option>`)
    .join('');
}

function ensureUnitDatalist() {
  if (document.getElementById('guildOpsUnitIds')) return;
  const datalist = document.createElement('datalist');
  datalist.id = 'guildOpsUnitIds';
  datalist.innerHTML = (state.catalog || [])
    .filter((unit) => unit?.baseId && unit?.name)
    .slice()
    .sort((a, b) => text(a.name).localeCompare(text(b.name)))
    .map((unit) => `<option value="${escapeHtml(unit.baseId)}">${escapeHtml(unit.name)}</option>`)
    .join('');
  document.body.appendChild(datalist);
  for (const id of ['opsRuleWhen', 'opsRuleThen']) {
    const input = document.getElementById(id);
    if (input) input.setAttribute('list', 'guildOpsUnitIds');
  }
}

function currentPlanId() {
  return text(document.getElementById('opsTbPlanSelect')?.value);
}

async function mutateTbPlan(mutator) {
  const id = currentPlanId();
  if (!id) throw new Error('Save or select a ROTE plan first.');
  const detail = await fetchJson(api(`/tb/plans/${id}`));
  const plan = detail?.plan;
  if (!plan?.id) throw new Error('The selected ROTE plan could not be loaded.');
  const next = JSON.parse(JSON.stringify(plan));
  mutator(next);
  await fetchJson(api('/tb/plans'), { method: 'POST', body: JSON.stringify({ ...next, status: 'draft' }) });
  location.reload();
}

function requirementEditor() {
  if (document.querySelector('[data-ops-requirement-editor]')) return;
  const board = document.getElementById('guildOpsRequirements');
  const slotSelect = document.getElementById('opsPreSlot');
  if (!board || !slotSelect) return;
  const card = document.createElement('section');
  card.className = 'guild-ops-card guild-ops-requirement-editor';
  card.dataset.opsRequirementEditor = 'true';
  const slotOptions = [...slotSelect.options].map((option) => option.outerHTML).join('');
  card.innerHTML = `
    <div class="kicker">OFFICER REQUIREMENT EDITOR</div>
    <h3>Override, ignore, or restore a specific Operation slot</h3>
    <p>Canonical requirements remain untouched. Every change below is stored as an officer overlay and appears in the audit trail.</p>
    <div class="guild-ops-grid three">
      <label class="guild-ops-field"><span>Operation slot</span><select id="opsOverrideSlot">${slotOptions}</select></label>
      <label class="guild-ops-field"><span>Replacement unit</span><select id="opsOverrideUnit"><option value="">Keep canonical unit</option>${catalogOptions()}</select></label>
      <label class="guild-ops-field"><span>Required relic</span><input id="opsOverrideRelic" type="number" min="0" max="9" placeholder="Keep canonical"></label>
      <label class="guild-ops-field"><span>Required rarity</span><input id="opsOverrideRarity" type="number" min="1" max="7" placeholder="Keep canonical"></label>
    </div>
    <div class="guild-ops-actions">
      <button type="button" id="opsOverrideSave">Save Officer Override</button>
      <button type="button" id="opsOverrideReset" class="secondary">Restore Canonical Requirement</button>
      <button type="button" id="opsOverrideIgnore" class="secondary">Ignore This Slot</button>
      <button type="button" id="opsOverrideInclude" class="secondary">Re-include This Slot</button>
    </div>
    <div id="opsOverrideResult" class="guild-ops-inline-result"></div>`;
  board.insertAdjacentElement('afterend', card);

  const run = async (fn) => {
    const result = document.getElementById('opsOverrideResult');
    try { if (result) result.textContent = 'Saving officer overlay…'; await fn(); }
    catch (error) { if (result) result.innerHTML = `<span class="guild-ops-chip risk">${escapeHtml(error.message)}</span>`; }
  };
  document.getElementById('opsOverrideSave')?.addEventListener('click', () => run(async () => {
    const slotId = text(document.getElementById('opsOverrideSlot')?.value);
    if (!slotId) throw new Error('Choose an Operation slot.');
    const baseId = text(document.getElementById('opsOverrideUnit')?.value).toUpperCase();
    const relicRaw = text(document.getElementById('opsOverrideRelic')?.value);
    const rarityRaw = text(document.getElementById('opsOverrideRarity')?.value);
    if (!baseId && !relicRaw && !rarityRaw) throw new Error('Choose at least one override field.');
    await mutateTbPlan((plan) => {
      plan.requirementOverrides = plan.requirementOverrides || {};
      plan.requirementOverrides[slotId] = {
        ...(baseId ? { baseId } : {}),
        ...(relicRaw ? { requiredRelic: Number(relicRaw) } : {}),
        ...(rarityRaw ? { requiredRarity: Number(rarityRaw) } : {}),
      };
    });
  }));
  document.getElementById('opsOverrideReset')?.addEventListener('click', () => run(() => mutateTbPlan((plan) => {
    plan.requirementOverrides = plan.requirementOverrides || {};
    delete plan.requirementOverrides[text(document.getElementById('opsOverrideSlot')?.value)];
  })));
  document.getElementById('opsOverrideIgnore')?.addEventListener('click', () => run(() => mutateTbPlan((plan) => {
    const slotId = text(document.getElementById('opsOverrideSlot')?.value);
    if (!slotId) throw new Error('Choose an Operation slot.');
    plan.ignoredSlots = [...new Set([...(plan.ignoredSlots || []), slotId])];
  })));
  document.getElementById('opsOverrideInclude')?.addEventListener('click', () => run(() => mutateTbPlan((plan) => {
    const slotId = text(document.getElementById('opsOverrideSlot')?.value);
    if (!slotId) throw new Error('Choose an Operation slot.');
    plan.ignoredSlots = (plan.ignoredSlots || []).filter((value) => text(value) !== slotId);
  })));
}

function enhanceIgnoreField(inputId, title) {
  const input = document.getElementById(inputId);
  if (!input || input.parentElement?.querySelector('[data-ignore-chips]')) return;
  const values = text(input.value).split(',').map((v) => v.trim()).filter(Boolean);
  const wrap = document.createElement('div');
  wrap.className = 'guild-ops-ignore-chips';
  wrap.dataset.ignoreChips = 'true';
  wrap.innerHTML = values.length
    ? values.map((value) => `<button type="button" class="guild-ops-chip warn" data-remove-ignore="${escapeHtml(value)}" title="Re-include ${escapeHtml(title)}">${escapeHtml(value)} ×</button>`).join('')
    : `<small>No ignored ${escapeHtml(title)}.</small>`;
  input.insertAdjacentElement('afterend', wrap);
  for (const button of wrap.querySelectorAll('[data-remove-ignore]')) button.addEventListener('click', () => {
    const remove = button.dataset.removeIgnore;
    input.value = text(input.value).split(',').map((v) => v.trim()).filter((v) => v && v !== remove).join(', ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    wrap.remove();
    enhanceIgnoreField(inputId, title);
  });
}

function twStructuredBuilder() {
  const raw = document.getElementById('opsTwTeamUnits');
  if (!raw || document.querySelector('[data-tw-unit-builder]')) return;
  raw.placeholder = 'Structured picker below writes this field automatically';
  const builder = document.createElement('div');
  builder.className = 'guild-ops-unit-builder';
  builder.dataset.twUnitBuilder = 'true';
  builder.innerHTML = `
    <label class="guild-ops-field"><span>Find unit</span><select id="opsTwUnitPicker"><option value="">Search/select unit</option>${catalogOptions()}</select></label>
    <label class="guild-ops-field"><span>Minimum relic</span><select id="opsTwUnitRelic">${Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${i === 5 ? 'selected' : ''}>R${i}</option>`).join('')}</select></label>
    <button type="button" id="opsTwUnitAdd" class="guild-ops-button secondary">Add Unit to Team</button>`;
  raw.insertAdjacentElement('afterend', builder);
  document.getElementById('opsTwUnitAdd')?.addEventListener('click', () => {
    const baseId = text(document.getElementById('opsTwUnitPicker')?.value).toUpperCase();
    const relic = Number(document.getElementById('opsTwUnitRelic')?.value || 0);
    if (!baseId) return;
    const tokens = text(raw.value).split(',').map((v) => v.trim()).filter(Boolean);
    const filtered = tokens.filter((token) => text(token.split(':')[0]).toUpperCase() !== baseId);
    filtered.push(`${baseId}:R${relic}`);
    raw.value = filtered.join(', ');
    raw.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function humanizePreassignments() {
  const map = new Map((state.roster?.members || []).map((member) => [text(member.playerId || member.id), member]));
  const card = [...document.querySelectorAll('.guild-ops-card')].find((node) => /PRE-ASSIGNMENTS/.test(text(node.querySelector('.kicker')?.textContent)));
  if (!card || card.dataset.humanized === 'true') return;
  for (const row of card.querySelectorAll('tbody tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;
    const id = text(cells[2].textContent);
    const member = map.get(id);
    if (member) cells[2].innerHTML = `<strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.allyCode || '')}</small>`;
  }
  card.dataset.humanized = 'true';
}

function installKeyboardShortcuts() {
  if (document.body.dataset.guildOpsShortcuts === 'true') return;
  document.body.dataset.guildOpsShortcuts = 'true';
  document.addEventListener('keydown', (event) => {
    if (!isRoute()) return;
    const target = event.target;
    const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const button = document.querySelector('.guild-ops-tab.active')?.textContent?.includes('TW')
        ? document.getElementById('opsTwSave') : document.getElementById('opsTbSave');
      button?.click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      const button = document.querySelector('.guild-ops-tab.active')?.textContent?.includes('TW')
        ? document.getElementById('opsTwPreview') : document.getElementById('opsTbPreview');
      button?.click();
      return;
    }
    if (!typing && event.altKey && /^[1-5]$/.test(event.key)) {
      event.preventDefault();
      document.querySelectorAll('.guild-ops-step')[Number(event.key) - 1]?.click();
    }
  });
}

function addAccessibilityLabels() {
  for (const button of document.querySelectorAll('.guild-ops-step, .guild-ops-tab')) {
    if (!button.getAttribute('type')) button.setAttribute('type', 'button');
  }
  for (const table of document.querySelectorAll('.guild-ops-table')) table.setAttribute('role', 'table');
}

async function enhance() {
  if (!isRoute() || state.enhancing || !document.querySelector('.guild-ops-shell')) return;
  state.enhancing = true;
  try {
    ensureStyle();
    if (!state.workspace || !state.catalog || !state.roster) await loadReferenceData();
    injectFreshnessBar();
    ensureUnitDatalist();
    enhanceIgnoreField('opsIgnoredMissions', 'missions');
    enhanceIgnoreField('opsIgnoredPlatoons', 'Operations');
    requirementEditor();
    twStructuredBuilder();
    humanizePreassignments();
    installKeyboardShortcuts();
    addAccessibilityLabels();
  } catch (error) {
    console.warn('Guild Operations professional enhancement unavailable:', error?.message || error);
  } finally {
    state.enhancing = false;
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(enhance, 90);
}

function install() {
  if (!location.pathname.startsWith('/guild')) return;
  schedule();
  new MutationObserver((mutations) => {
    if (!isRoute()) return;
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === 1))) schedule();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('swgoh:guild-command-snapshot', () => {
    state.workspace = null;
    state.roster = null;
    schedule();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
