const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const BRACCA_BATTLE_STRATEGY_SOURCES = Object.freeze([
  {
    id: "cg-zeffo-title-update",
    label: "Capital Games · Zeffo Title Update 6/28/2023",
    kind: "official",
    url: "https://swgoh.gg/news/title-update-6282023/",
  },
  {
    id: "cg-bracca-update",
    label: "Capital Games · Bracca Special Mission Update 3/29/2023",
    kind: "official",
    url: "https://swgoh.gg/news/update-3292023/",
  },
  {
    id: "tbcm-bracca",
    label: "TB Combat Missions · Bracca Cere / Cal mission guide",
    kind: "community-reference",
    url: "https://tbcm.pages.dev/bracca",
  },
  {
    id: "scrybe-bracca-2026",
    label: "Scrybe Gaming · 2026 Bracca post-IPD-buff guide",
    kind: "community-tested",
    url: "https://swgoh.tv/video/47330-unlock-zeffo-in-2026-post-ipd-buff-cere-cal-special-mission-on-bracca",
  },
  {
    id: "stillplays-bracca-jkck",
    label: "Still Plays · Cere + JKCK mechanics and strategy examples",
    kind: "community-tested",
    url: "https://swgoh.tv/video/37554-lvt-rote-tb-bracca-special-mission-cere-junda-jkck-no-re-mod-1x6dot-no-omi-swgoh",
  },
]);

export const BRACCA_ZEFFO_UNLOCK_STRATEGY = Object.freeze({
  id: "bracca-zeffo-unlock-v1",
  missionId: "bracca-zeffo-unlock",
  title: "Bracca · Cere + Any Cal · Unlock Zeffo",
  status: "community-tested",
  confidence: "official-entry-current-community-strategy",
  lastVerified: "2026-08-15",
  sources: BRACCA_BATTLE_STRATEGY_SOURCES,
  summary: "The official gate is Cere Junda R7 plus either Cal Kestis R7 or Jedi Knight Cal Kestis R7. The encounter uses Purge Troopers and an Imperial Probe Droid hazard; community references consistently treat Jedi Knight Cal as the easier variant, while the original Cal remains fully legal.",
  keyUnits: [
    { baseId: "CEREJUNDA", name: "Cere Junda", importance: "critical", reason: "Cere is mandatory in both legal mission variants." },
  ],
  requiredMechanics: [],
  keyAbilities: [],
  stages: [
    stage("wave-1", "Wave 1 · Purge Troopers and IPD hazard", [
      step("avoid-ipd", "Avoid deliberately targeting the Imperial Probe Droid when possible; current community guidance treats its repeated appearance/explosion pressure as the central encounter hazard.", { priority: "critical", confidence: "community-tested" }),
      step("remove-purge-troopers", "Control and remove the Purge Troopers while preserving enough Health/Protection and key cooldowns for the second encounter.", { priority: "high" }),
      step("jkck-riposte-warning", "If using Jedi Knight Cal, minimize unnecessary Windmill Defense / Riposte usage when it would cause protection-bypassing hits into the Probe Droid hazard.", { priority: "high", confidence: "community-variant-jkck" }),
    ], {
      objective: "Clear the Purge Troopers without triggering avoidable Probe Droid explosions or entering Wave 2 depleted.",
      hazards: ["Imperial Probe Droid explosion pressure", "Purge Trooper control/debuff pressure"],
    }),
    stage("wave-2", "Wave 2 · Second Sister encounter", [
      step("enter-stable", "Enter the Second Sister wave with the duo stabilized; do not trade survivability for a rushed transition from Wave 1.", { priority: "high" }),
      step("jkck-event-special", "If using Jedi Knight Cal, current community references advise against using the event special in this mission; treat the normal kit as the primary plan unless a newer verified encounter source supersedes that guidance.", { priority: "high", confidence: "community-variant-jkck" }),
      step("finish-controlled", "Focus the actual mission enemies and continue to avoid unnecessary Probe Droid interaction while closing the encounter.", { priority: "high" }),
    ], {
      objective: "Defeat the Second Sister encounter while respecting the same Probe Droid hazard model from Wave 1.",
    }),
  ],
  targetPriorities: [
    { target: "Purge Troopers", priority: "high", when: "Wave 1", reason: "They are the actual Wave-1 mission enemies; the Probe Droid is treated as a hazard rather than a normal priority target." },
    { target: "Second Sister", priority: "high", when: "Wave 2", reason: "She is the named second-wave encounter target in current Bracca mission references." },
    { target: "Imperial Probe Droid", priority: "info", when: "when it appears", reason: "Avoid targeting it when possible; current guides warn that interacting with it can trigger damaging explosion pressure." },
  ],
  failureRisks: [
    "Treating the legal roster pool as 'any two of Cere/Cal/JKCK' is wrong; Cere is mandatory and exactly one Cal variant fills the second slot.",
    "The original Cal Kestis is legal but community references consistently describe Jedi Knight Cal as the easier version; the app must not convert that preference into an entry restriction.",
    "Probe Droid behavior has changed over time. Strategy advice is therefore version/date scoped and should be reverified after meaningful encounter changes.",
    "Video titles claiming guaranteed success are not converted into a win probability or guarantee inside Roster Command.",
  ],
  evidenceBoundary: "The R7 Cere + either-Cal entry rule and 30-clear Zeffo unlock are official. Enemy composition and tactical guidance are current community references. JKCK-specific instructions apply only when that variant is selected. No guaranteed success rate or universal mod threshold is asserted.",
});

export function braccaBattleStrategyForMission(missionId) {
  return String(missionId || "") === BRACCA_ZEFFO_UNLOCK_STRATEGY.missionId ? BRACCA_ZEFFO_UNLOCK_STRATEGY : null;
}
