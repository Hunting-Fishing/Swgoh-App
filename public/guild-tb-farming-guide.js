import { JOURNEY_PRESETS } from './farm-presets.js';
import { buildGuildRoteMissionCoverage } from './guild-rote-mission-coverage-model.js';
import { buildGuildTbFarmingGuide, filterGuildTbFarmingRows } from './guild-tb-farming-guide-model.js';

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '').slice(0, 9);
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const escapeAttr = escapeHtml;

function ensureCss() {
  if (document.querySelector('link[data-guild-tb-farming-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/guild-tb-farming-guide.css?v=20260819a';
  link.dataset.guildTbFarmingCss = 'true';
  document.head.appendChild(link);
}

function memberId(member = {}) {
  return text(member.id || member.playerId || member.allyCode || member.name);
}

function formatAlly(value) {
  const code = digits(value);
  return code.length === 9 ? code.replace(/(\d{3})(?=\d)/g, '$1-') : code;
}

function classLabel(value) {
  if (value === 'multi-unlock') return 'MULTI-UNLOCK';
  if (value === 'direct') return 'DIRECT DOUBLE-USE';
  if (value === 'partial') return 'PARTIAL DOUBLE-USE';
  return 'TB ONLY';
}

function overlapStatusLabel(entry) {
  if (entry.status === 'direct') return `TB target satisfies ${entry.requirementLabel}`;
  if (entry.status === 'partial') return `TB advances toward ${entry.requirementLabel}`;
  return `${entry.requirementLabel} already satisfied`;
}

function journeyChip(entry) {
  const tone = entry.status === 'direct' ? 'direct' : entry.status === 'partial' ? 'partial' : 'already';
  return `<span class="guild-tb-farm-journey-chip ${tone}"><strong>${escapeHtml(entry.shortName || entry.eventName)}</strong><small>${escapeHtml(overlapStatusLabel(entry))}</small></span>`;
}

function missionChip(mission) {
  return `<span class="guild-tb-farm-mission-chip"><strong>${escapeHtml(text(mission.phase))} · ${escapeHtml(text(mission.planetName))}</strong><small>${escapeHtml(text(mission.mission?.name || mission.key || 'Verified mission'))}</small></span>`;
}

function rowHtml(row, guildAllyCode) {
  const activeOverlaps = row.journeyOverlaps.filter((entry) => entry.status === 'direct' || entry.status === 'partial');
  const already = row.journeyOverlaps.filter((entry) => entry.status === 'already');
  const memberAlly = digits(row.member?.allyCode);
  const playerFarmHref = memberAlly.length === 9 ? `/?allyCode=${encodeURIComponent(memberAlly)}#farm` : '/#farm';
  const unitHref = row.baseId ? `/guild/units?allyCode=${encodeURIComponent(digits(guildAllyCode))}&unit=${encodeURIComponent(row.baseId)}` : '';
  return `<article class="guild-tb-farm-row ${escapeAttr(row.classification)}">
    <div class="guild-tb-farm-rankline">
      <span class="guild-tb-farm-class">${escapeHtml(classLabel(row.classification))}</span>
      <span>${number(row.missionImpact)} TB mission${row.missionImpact === 1 ? '' : 's'}</span>
    </div>
    <div class="guild-tb-farm-main">
      <div class="guild-tb-farm-member">
        <span>MEMBER</span>
        <strong>${escapeHtml(row.member?.name || 'Guild member')}</strong>
        <small>${escapeHtml(formatAlly(row.member?.allyCode))}</small>
      </div>
      <div class="guild-tb-farm-unit">
        <span>TB FARM</span>
        <strong>${escapeHtml(row.unitName)}</strong>
        <small>${escapeHtml(row.currentLabel)} → <b>${escapeHtml(row.tbTargetLabel)}</b></small>
        <em>${escapeHtml(row.gapLabel)}</em>
      </div>
      <div class="guild-tb-farm-impact">
        <span>TB IMPACT</span>
        <strong>${number(row.mandatoryImpact)} mandatory · ${number(row.poolImpact)} pool</strong>
        <small>${number(row.missionImpact)} verified mission entr${row.missionImpact === 1 ? 'y' : 'ies'} affected</small>
      </div>
      <div class="guild-tb-farm-overlap-summary">
        <span>JOURNEY VALUE</span>
        <strong>${number(row.directCount)} direct · ${number(row.partialCount)} partial</strong>
        <small>${activeOverlaps.length ? `${number(activeOverlaps.length)} active prerequisite overlap${activeOverlaps.length === 1 ? '' : 's'}` : 'No active Journey prerequisite gain'}</small>
      </div>
    </div>
    <div class="guild-tb-farm-detail-grid">
      <div><span class="guild-tb-farm-detail-title">Verified TB missions</span><div class="guild-tb-farm-chip-wrap">${row.missionRefs.slice(0,6).map(missionChip).join('')}${row.missionRefs.length > 6 ? `<span class="guild-tb-farm-more">+${row.missionRefs.length - 6} more</span>` : ''}</div></div>
      <div><span class="guild-tb-farm-detail-title">Journey / GL / Fleet overlap</span><div class="guild-tb-farm-chip-wrap">${activeOverlaps.length ? activeOverlaps.map(journeyChip).join('') : '<span class="guild-tb-farm-none">No active Journey overlap from this TB upgrade.</span>'}${already.length ? `<span class="guild-tb-farm-already-note">${already.length} additional prerequisite${already.length === 1 ? '' : 's'} already met before this TB upgrade.</span>` : ''}</div></div>
    </div>
    <div class="guild-tb-farm-actions">
      <a href="${escapeAttr(playerFarmHref)}">Open Member Farm Tools →</a>
      ${unitHref ? `<a href="${escapeAttr(unitHref)}">Guild Unit Ownership →</a>` : ''}
    </div>
  </article>`;
}

function summaryHtml(guide) {
  const s = guide.summary;
  return `<div class="guild-tb-farm-summary">
    <article><span>EXACT TB COVERAGE</span><strong>${s.exactCoveragePercent}%</strong><small>Verified mission-entry coverage</small></article>
    <article><span>PRIORITY MEMBER FARMS</span><strong>${number(s.priorityRows)}</strong><small>Member + unit recommendations</small></article>
    <article><span>DOUBLE-USE ROWS</span><strong>${number(s.rowsWithJourneyOverlap)}</strong><small>TB farms that also advance Journey requirements</small></article>
    <article><span>JOURNEY TARGETS</span><strong>${number(s.journeyTargets)}</strong><small>Distinct GL / Journey / Fleet targets touched</small></article>
    <article><span>MULTI-UNLOCK FARMS</span><strong>${number(s.multiUnlockRows)}</strong><small>One TB farm advances multiple unlock paths</small></article>
  </div>`;
}

export function renderGuildTbFarmingGuidePage({ target, guildSnapshot, catalog = [], allyCode = '' } = {}) {
  if (!target || !guildSnapshot?.members) return;
  ensureCss();
  const coverage = buildGuildRoteMissionCoverage(guildSnapshot, catalog, { redundancyTarget: 2 });
  const guide = buildGuildTbFarmingGuide(coverage, JOURNEY_PRESETS);
  const members = coverage.members.slice().sort((a,b) => text(a.name).localeCompare(text(b.name)));
  const loaded = members.find((member) => digits(member.allyCode) === digits(allyCode));
  const phases = [...new Set(guide.rows.flatMap((row) => row.missionRefs.map((mission) => text(mission.phase))).filter(Boolean))].sort();
  const state = {
    search: '',
    member: loaded ? memberId(loaded) : 'all',
    phase: 'All',
    overlap: 'all',
    impact: 'All',
    sort: 'tb-impact',
  };

  target.innerHTML = `
    <section class="guild-route-page-heading guild-tb-farm-heading">
      <div><div class="kicker">TERRITORY BATTLES · FARMING</div><h2>TB Roster Farming Guide</h2><p>See which member upgrades improve verified ROTE mission coverage and which of those same farms also advance Journey Guide, Galactic Legend or fleet prerequisites.</p></div>
      <a class="guild-tb-farm-back" href="/guild/tb?allyCode=${encodeURIComponent(digits(allyCode))}">← TB Command</a>
    </section>
    ${summaryHtml(guide)}
    <section class="guild-tb-farm-explainer">
      <strong>Double-use means prerequisite value—not an automatic unlock.</strong>
      <span><b>Direct</b> means the TB target reaches/exceeds the Journey prerequisite. <b>Partial</b> means the TB upgrade moves the unit toward a higher Journey requirement. Exact TB mission evidence only; gate-only fleet evidence does not create farm claims.</span>
    </section>
    <section class="guild-tb-farm-controls" aria-label="TB farming filters">
      <label>Search<input type="search" data-tb-farm-search placeholder="Unit, member, mission, Journey target…"></label>
      <label>Member<select data-tb-farm-member><option value="all">All Guild members</option>${members.map((member) => `<option value="${escapeAttr(memberId(member))}"${state.member === memberId(member) ? ' selected' : ''}>${escapeHtml(member.name)}${member.allyCode ? ` · ${escapeHtml(formatAlly(member.allyCode))}` : ''}</option>`).join('')}</select></label>
      <label>Phase<select data-tb-farm-phase><option>All</option>${phases.map((phase) => `<option>${escapeHtml(phase)}</option>`).join('')}</select></label>
      <label>TB impact<select data-tb-farm-impact><option>All</option><option>Mandatory</option><option>Pool</option></select></label>
      <label>Journey overlap<select data-tb-farm-overlap><option value="all">All TB farms</option><option value="double">Double-use only</option><option value="direct">Direct prerequisite completion</option><option value="partial">Partial Journey progress</option><option value="multi">Multi-unlock</option><option value="tb-only">TB only</option></select></label>
      <label>Sort<select data-tb-farm-sort><option value="tb-impact">TB mission impact</option><option value="journey-overlap">Journey overlap</option><option value="gap">Closest upgrade</option><option value="member">Member name</option></select></label>
    </section>
    <div class="guild-tb-farm-count" data-tb-farm-count></div>
    <section class="guild-tb-farm-list" data-tb-farm-list></section>
    <section class="guild-tb-farm-boundary"><strong>Evidence boundary</strong><span>Recommendations come from the current exact ROTE mission-entry model plus the versioned Journey preset requirement graph. This view does not fabricate farming time, material cost, mission success probability, or an unlock guarantee.</span></section>`;

  const list = target.querySelector('[data-tb-farm-list]');
  const count = target.querySelector('[data-tb-farm-count]');
  function renderRows() {
    const rows = filterGuildTbFarmingRows(guide.rows, state);
    count.textContent = `${number(rows.length)} recommendation${rows.length === 1 ? '' : 's'} shown`;
    list.innerHTML = rows.length ? rows.slice(0,100).map((row) => rowHtml(row, allyCode)).join('') : '<div class="guild-tb-farm-empty">No TB farm recommendations match these filters.</div>';
    if (rows.length > 100) list.insertAdjacentHTML('beforeend', `<div class="guild-tb-farm-empty">Showing the first 100 of ${number(rows.length)} matching recommendations. Narrow the member/phase/search filters for a more focused plan.</div>`);
  }

  target.querySelector('[data-tb-farm-search]')?.addEventListener('input', (event) => { state.search = event.target.value || ''; renderRows(); });
  target.querySelector('[data-tb-farm-member]')?.addEventListener('change', (event) => { state.member = event.target.value || 'all'; renderRows(); });
  target.querySelector('[data-tb-farm-phase]')?.addEventListener('change', (event) => { state.phase = event.target.value || 'All'; renderRows(); });
  target.querySelector('[data-tb-farm-impact]')?.addEventListener('change', (event) => { state.impact = event.target.value || 'All'; renderRows(); });
  target.querySelector('[data-tb-farm-overlap]')?.addEventListener('change', (event) => { state.overlap = event.target.value || 'all'; renderRows(); });
  target.querySelector('[data-tb-farm-sort]')?.addEventListener('change', (event) => { state.sort = event.target.value || 'tb-impact'; renderRows(); });
  renderRows();
}
