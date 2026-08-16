const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function formatAllyCode(value) {
  const code = digits(value);
  return code.length === 9 ? code.replace(/(\d{3})(?=\d)/g, "$1-") : code || "N/A";
}

function route(path, allyCode, extra = {}) {
  const params = new URLSearchParams();
  const code = digits(allyCode);
  if (code.length === 9) params.set("allyCode", code);
  for (const [key, value] of Object.entries(extra)) if (value != null && String(value) !== "") params.set(key, String(value));
  return `${path}${params.toString() ? `?${params.toString()}` : ""}`;
}

function playerLink(allyCode) {
  const code = digits(allyCode);
  return code.length === 9 ? `/?allyCode=${encodeURIComponent(code)}#roster` : "/#roster";
}

function stat(label, value, tone = "", detail = "") {
  return `<div class="guild-member-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function rankLabel(rank, total) {
  return rank ? `#${number(rank)} / ${number(total)}` : "N/A";
}

function modeCard(kicker, title, body, href, metrics) {
  return `<article class="guild-member-mode-card"><div class="kicker">${escapeHtml(kicker)}</div><h3>${escapeHtml(title)}</h3><div class="guild-member-mode-metrics">${metrics}</div><p>${escapeHtml(body)}</p><a href="${escapeAttr(href)}">Open ${escapeHtml(title)} →</a></article>`;
}

function missionRef(row) {
  return `${row?.planetName || row?.planetId || "ROTE"} · ${row?.mission?.name || row?.mission?.id || "Mission"}`;
}

function assignmentRequirement(row) {
  return row?.unitType === "Ship" ? `${number(row?.requiredRarity)}★` : `R${number(row?.requiredRelic)}`;
}

function renderTb(profile) {
  const tb = profile.tb;
  const ally = profile.member.allyCode;
  const sole = tb.soleOwnerRows.slice(0, 8);
  const assignments = tb.operationAssignments.slice(0, 10);
  const farms = tb.farmRows.slice(0, 8);
  return `<section class="guild-member-section" id="guildMemberTb"><div class="guild-member-section-head"><div><div class="kicker">TERRITORY BATTLES</div><h2>ROTE contribution</h2></div><a href="${escapeAttr(route("/guild/tb", ally))}">Open Guild TB →</a></div>
    <div class="guild-member-section-stats">${stat("Exact-Ready Missions", tb.exactReady, "good")}${stat("Sole-Owner Missions", tb.soleOwner, tb.soleOwner ? "warn" : "good")}${stat("Close Missions", tb.close)}${stat("Mission Leads", tb.missionLeads)}${stat("Operation Assignments", tb.operationAssignedCount)}${stat("HELP / Risk Assignments", tb.operationRiskCount, tb.operationRiskCount ? "warn" : "good")}${stat("Protected Units", tb.protectedUnits.length)}${stat("Partial Known Gates", tb.knownGate)}</div>
    <div class="guild-member-two-col">
      <div class="guild-member-panel"><h3>Sole-owner mission dependency</h3>${sole.length ? `<div class="guild-member-list">${sole.map((row) => `<div><strong>${escapeHtml(missionRef(row))}</strong><span>${escapeHtml(row.phase || "")}</span></div>`).join("")}</div>` : '<div class="guild-member-clean">No exact mission currently depends on this member as its only ready owner.</div>'}</div>
      <div class="guild-member-panel"><h3>Current safe Operation draft</h3>${assignments.length ? `<div class="guild-member-list">${assignments.map((row) => `<div class="${row?.safety?.help ? "risk" : ""}"><strong>${escapeHtml(row.name || row.baseId)} · ${escapeHtml(assignmentRequirement(row))}</strong><span>${escapeHtml(row.phase || "")} · ${escapeHtml(row.conflictId || "Operation")}${row?.safety?.help ? " · HELP" : ""}</span></div>`).join("")}</div>` : '<div class="guild-member-clean">No Operation assignments in the current safe draft.</div>'}</div>
    </div>
    ${farms.length ? `<div class="guild-member-panel"><h3>Guild mission upgrade pressure</h3><div class="guild-member-farm-grid">${farms.map((row) => `<div><strong>${escapeHtml(row.unitName || row.baseId)}</strong><span>${escapeHtml(row.gapLabel || "Upgrade needed")}</span><small>${number(row.missionImpact || 0)} mission impact · ${number(row.mandatoryImpact || 0)} mandatory</small><a href="${escapeAttr(route("/guild/units", ally, { unit: row.baseId }))}">Guild ownership →</a></div>`).join("")}</div></div>` : ""}
  </section>`;
}

function renderTw(profile) {
  const tw = profile.tw;
  const ally = profile.member.allyCode;
  return `<section class="guild-member-section" id="guildMemberTw"><div class="guild-member-section-head"><div><div class="kicker">TERRITORY WARS</div><h2>Faction roster depth</h2></div><a href="${escapeAttr(route("/guild/tw/members", ally))}">Open Guild TW →</a></div>
    <div class="guild-member-section-stats">${stat("5-Unit Factions", tw.completeFactions)}${stat("R5 Faction Cores", tw.r5Factions)}${stat("R7 Faction Cores", tw.r7Factions, "good")}${stat("Leader-Capable", tw.leaderCapableFactions)}</div>
    <div class="guild-member-panel"><h3>Strongest faction cores</h3>${tw.strongestFactions.length ? `<div class="guild-member-faction-grid">${tw.strongestFactions.map((row) => `<a href="${escapeAttr(route("/guild/tw/teams", ally, { faction: row.faction }))}"><strong>${escapeHtml(row.faction)}</strong><span>Relic floor R${number(row.relicFloor)}</span><small>${number(row.combinedGp)} selected-core GP</small></a>`).join("")}</div>` : '<div class="workspace-note">No complete five-character faction cores detected from the current hydrated roster.</div>'}</div>
    <div class="guild-member-evidence">Roster depth only — not a claim that these are current TW offense/defense teams or counters.</div>
  </section>`;
}

function renderRaid(profile) {
  const raid = profile.raid;
  const ally = profile.member.allyCode;
  return `<section class="guild-member-section" id="guildMemberRaid"><div class="guild-member-section-head"><div><div class="kicker">ORDER 66 RAID</div><h2>Eligible roster depth</h2></div><a href="${escapeAttr(route("/guild/raids/members", ally))}">Open Guild Raids →</a></div>
    <div class="guild-member-section-stats">${stat("Eligible Owned", raid.eligibleOwned)}${stat("G12+ Eligible", raid.bands.g12 || 0)}${stat("R5+ Eligible", raid.bands.r5 || 0)}${stat("R7+ Eligible", raid.bands.r7 || 0, "good")}${stat("R8+ Eligible", raid.bands.r8 || 0)}${stat("R9 Eligible", raid.bands.r9 || 0, "good")}${stat("5-Char R5 Pools", raid.fiveCharacterPools.r5 || 0)}${stat("5-Char R7 Pools", raid.fiveCharacterPools.r7 || 0)}</div>
    <div class="guild-member-two-col"><div class="guild-member-panel"><h3>Strongest eligible characters</h3>${raid.strongestEligible.length ? `<div class="guild-member-list">${raid.strongestEligible.map((unit) => `<div><strong>${escapeHtml(unit.name)}</strong><span>${escapeHtml(unit.progression)} · ${number(unit.power)} GP · ${escapeHtml(unit.raidGroup || "Eligible")}</span></div>`).join("")}</div>` : '<div class="workspace-note">No Order 66-eligible characters detected.</div>'}</div><div class="guild-member-panel"><h3>Eligible groups</h3>${raid.groups.length ? `<div class="guild-member-list">${raid.groups.map((row) => `<div><strong>${escapeHtml(row.group)}</strong><span>${number(row.count)} owned</span></div>`).join("")}</div>` : '<div class="workspace-note">No eligible group ownership detected.</div>'}</div></div>
    <div class="guild-member-evidence">Eligible ownership/progression only — not submitted attempts, team damage or projected Raid score.</div>
  </section>`;
}

export function renderGuildMemberCommandPage({ target, profile } = {}) {
  if (!target || !profile?.member) return;
  const member = profile.member;
  const hydrated = profile.hydration?.hydrated || profile.hydration?.requested || 0;
  const ally = member.allyCode;
  target.innerHTML = `
    <section class="guild-member-command-header"><div><div class="kicker">GUILD MEMBER COMMAND PROFILE</div><h1>${escapeHtml(member.name)}</h1><p>${escapeHtml(formatAllyCode(ally))} · ${number(member.galacticPower)} GP · ${member.rosterAvailable ? "Hydrated live roster" : "Roster unavailable"}</p><div class="guild-member-header-links"><a href="${escapeAttr(route("/guild/members", ally))}">← Guild Members</a><a href="${escapeAttr(playerLink(ally))}">Open Player Roster →</a></div></div><div class="guild-member-rank-grid">${stat("Guild GP Rank", rankLabel(profile.ranks.gp, hydrated))}${stat("TB Coverage Rank", rankLabel(profile.ranks.tb, hydrated))}${stat("TW R7 Depth Rank", rankLabel(profile.ranks.tw, hydrated))}${stat("Raid R7 Depth Rank", rankLabel(profile.ranks.raid, hydrated))}</div></section>
    <nav class="guild-member-subnav" aria-label="Guild member profile"><a href="#guildMemberOverview">Overview</a><a href="#guildMemberTb">TB</a><a href="#guildMemberTw">TW</a><a href="#guildMemberRaid">Raids</a></nav>
    <section class="guild-member-section" id="guildMemberOverview"><div class="guild-member-section-head"><div><div class="kicker">ROSTER FOUNDATION</div><h2>Member overview</h2></div><a href="${escapeAttr(route("/guild/units", ally))}">Open Unit Matrix →</a></div><div class="guild-member-overview-stats">${stat("Total GP", number(member.galacticPower))}${stat("Character GP", number(member.characterGp))}${stat("Ship GP", number(member.shipGp))}${stat("Characters", number(member.characterCount))}${stat("Ships", number(member.shipCount))}${stat("Galactic Legends", number(member.galacticLegendCount), "good")}${stat("R7+ Characters", number(member.relic7))}${stat("R9 Characters", number(member.relic9))}</div><div class="guild-member-mode-grid">${modeCard("TB", "Territory Battles", `${tbSentence(profile)}`, route("/guild/tb", ally), `<strong>${number(profile.tb.exactReady)}</strong><span>exact-ready missions</span>`)}${modeCard("TW", "Territory Wars", `${twSentence(profile)}`, route("/guild/tw", ally), `<strong>${number(profile.tw.r7Factions)}</strong><span>R7 faction cores</span>`)}${modeCard("RAID", "Order 66 Raid", `${raidSentence(profile)}`, route("/guild/raids", ally), `<strong>${number(profile.raid.bands.r7 || 0)}</strong><span>R7+ eligible units</span>`)}</div></section>
    ${renderTb(profile)}
    ${renderTw(profile)}
    ${renderRaid(profile)}
    <div class="guild-member-evidence"><strong>Cross-mode boundary:</strong> each metric above keeps its own game-mode meaning. The app does not collapse GP, TB coverage, TW faction depth and Raid eligibility into a fabricated universal member score.</div>`;
}

function tbSentence(profile) {
  if (profile.tb.soleOwner) return `${profile.tb.soleOwner} exact ROTE mission${profile.tb.soleOwner === 1 ? "" : "s"} currently depend on this member as the only exact-ready owner.`;
  return `${profile.tb.exactReady} exact ROTE mission entries are currently available from this roster.`;
}

function twSentence(profile) {
  return `${profile.tw.r7Factions} five-character faction core${profile.tw.r7Factions === 1 ? "" : "s"} are fully R7+ by the roster-depth model.`;
}

function raidSentence(profile) {
  return `${profile.raid.bands.r7 || 0} Order 66-eligible characters meet R7+, with ${profile.raid.bands.r9 || 0} at R9.`;
}
