const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const LS_GEO_STRATEGY_SOURCES = Object.freeze([
  { id: "swgoh-wiki-lsgeo", label: "SWGOH Wiki · Geonosis Republic Offensive", kind: "current-reference", url: "https://swgoh.wiki/wiki/Geonosis_Republic_Offensive" },
  { id: "swgohgg-padme", label: "SWGOH.GG · Padmé Amidala current kit", kind: "current-reference", url: "https://swgoh.gg/units/padme-amidala/" },
  { id: "ahnald-padme-p1", label: "AhnaldT101 · Phase 1 Padmé Special Mission guide", kind: "community-tested", url: "https://swgoh.tv/video/504-how-to-beat-padme-special-mission-in-phase-1-republic-offensive-without-maxed-relics-swgoh" },
  { id: "swgohgg-gas", label: "SWGOH.GG · General Skywalker current kit", kind: "current-reference", url: "https://swgoh.gg/units/general-skywalker/" },
  { id: "swgohgg-ahsoka-snips", label: "SWGOH.GG · Ahsoka Tano (Snips) current kit", kind: "current-reference", url: "https://swgoh.gg/units/ahsoka-tano-snips/" },
  { id: "bitdynasty-gas-p2-p4", label: "BitDynasty · GAS+Ahsoka P2 and GAS+501st P4 LS Geo guide", kind: "community-tested", url: "https://swgoh.tv/video/26935-gas-ahsoka-gas-501st-guide-phase-2-4-max-waves-ls-geo-tb-swgoh" },
  { id: "swgohgg-gk", label: "SWGOH.GG · General Kenobi current kit", kind: "current-reference", url: "https://swgoh.gg/units/general-kenobi/" },
  { id: "swgohgg-cody", label: "SWGOH.GG · CC-2224 Cody current kit", kind: "current-reference", url: "https://swgoh.gg/units/cc-2224-cody/" },
  { id: "swgohgg-clone-sergeant", label: "SWGOH.GG · Clone Sergeant Phase I current kit", kind: "current-reference", url: "https://swgoh.gg/units/clone-sergeant-phase-i/" },
  { id: "swgoh-farming-gr-special", label: "SWGOH Wiki · LS Geo P2 GK/Cody/Clone Sergeant requirement reference", kind: "community-reference", url: "https://swgoh.wiki/wiki/Farming_Guide/F2P_Nation%27s_2022_Farming_Guide" },
  { id: "swgohgg-kam", label: "SWGOH.GG · Ki-Adi-Mundi current kit", kind: "current-reference", url: "https://swgoh.gg/units/ki-adi-mundi/" },
  { id: "swgohgg-shaakti", label: "SWGOH.GG · Shaak Ti current kit", kind: "current-reference", url: "https://swgoh.gg/units/shaak-ti/" },
  { id: "bitdynasty-badbatch-padme", label: "BitDynasty · Bad Batch/Shaak/Padmé/Rey LS Geo multi-phase testing", kind: "community-tested", url: "https://swgoh.tv/video/30441-bad-batch-shaak-ti-padme-rey-guide-p1-p2-p4-max-waves-phase-ls-geo-tb-swgoh" },
]);

const source = (id) => LS_GEO_STRATEGY_SOURCES.find((row) => row.id === id);
const sources = (...ids) => ids.map(source).filter(Boolean);

const PADME_P1 = Object.freeze({
  id: "p1-mid-sm-padme-v1",
  missionId: "p1-mid-sm",
  title: "Count Dooku's Hangar · Padmé Galactic Republic Special Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-lsgeo", "swgohgg-padme", "ahnald-padme-p1"),
  summary: "The tested Phase 1 Padmé special-mission priority is explicit: remove B2 Super Battle Droid before it can repeatedly disrupt the Galactic Republic Protection Up/Courage engine. Padmé's current Unwavering Courage converts Protection Up into Courage while protecting Light Side allies from critical hits and debuffs, so the plan is to preserve that engine, delete B2, then reassess the remaining wave threats.",
  requiredLeaderBaseId: "PADMEAMIDALA",
  keyUnits: [
    { baseId: "PADMEAMIDALA", name: "Padmé Amidala", importance: "critical", reason: "Padmé is mission-mandatory and the tested strategy uses her Galactic Republic Protection Up/Courage engine." },
  ],
  keyAbilities: [
    { baseId: "PADMEAMIDALA", abilityName: "Unwavering Courage", importance: "critical", minimumTier: 8, requiresZeta: true, expected: "Protection Up protection and Courage conversion for Galactic Republic allies", reason: "The mission plan depends on keeping the Protection Up/Courage engine functioning while B2 is removed." },
  ],
  stages: [
    stage("opening", "Opening · remove B2 before the engine collapses", [
      step("find-b2", "If B2 Super Battle Droid is present, make it the immediate kill/control priority rather than spreading Courage damage across lower-impact targets.", { priority: "critical", target: "B2 Super Battle Droid" }),
      step("protect-up", "Preserve Protection Up on the Galactic Republic team where possible so Padmé's leader can convert it into Courage and maintain debuff/critical-hit protection.", { priority: "critical", ability: "Unwavering Courage" }),
      step("commit-b2", "Commit assists and Courage damage into B2 until it is removed; the tested mission guide explicitly treats B2 survival as the principal opening failure risk.", { priority: "critical", target: "B2 Super Battle Droid" }),
    ], { objective: "Remove the enemy unit most capable of repeatedly stripping/disrupting the Padmé engine." }),
    stage("wave-loop", "Each wave · rebuild Protection Up and focus threats", [
      step("rebuild", "After B2 or the immediate disruption threat is gone, rebuild Protection Up/Courage before spending the next major damage window.", { priority: "high" }),
      step("support-next", "Prioritize the next healer, revive source, or high-impact AoE/control enemy rather than using a fixed name order across all four waves.", { priority: "high" }),
      step("transition", "When a wave is controlled, avoid unnecessary cooldown spending so Protection Up, recovery and assist tools enter the next wave available.", { priority: "high" }),
    ], { objective: "Carry the Padmé sustain/damage engine through the four-wave mission." }),
  ],
  targetPriorities: [
    { target: "B2 Super Battle Droid", priority: "critical", when: "whenever present", reason: "The mission-specific tested guide explicitly calls for removing B2 at all costs." },
    { target: "Healer / revive / high-impact AoE or control threat", priority: "high", when: "after B2 is removed", reason: "Preserve the Protection Up/Courage engine by preventing the next action that can destabilize it." },
  ],
  failureRisks: [
    "Leaving B2 alive can repeatedly disrupt buffs and destabilize the Protection Up/Courage cycle.",
    "Spreading Courage damage while the primary control threat remains active can waste the team's strongest damage windows.",
    "A fixed four-wave kill order is not asserted; enemy composition can vary and the pack keeps later target selection adaptive.",
  ],
  evidenceBoundary: "Padmé's current leader mechanics are current-reference facts. The B2-first priority is explicit mission-specific community-tested guidance from AhnaldT101. Later-wave target order remains adaptive; no guaranteed clear percentage or universal spawn order is claimed.",
});

const GAS_AHSOKA_P2 = Object.freeze({
  id: "p2-mid-gas-v1",
  missionId: "p2-mid-gas",
  title: "Battleground · General Skywalker + Ahsoka Restricted Combat",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-lsgeo", "swgohgg-gas", "swgohgg-ahsoka-snips", "bitdynasty-gas-p2-p4"),
  summary: "This exact Phase 2 two-character mission has community-tested GAS+Ahsoka clears. The current kit interaction is a compact control/burst loop: GAS applies Daze with Force Grip and Armor Shred with Sundering Strike, while Ahsoka's Daring Padawan can assist when her Galactic Republic leader uses Specials. Use GAS control to suppress the highest-impact enemy, then concentrate the duo's assisted damage rather than spreading pressure.",
  requiredLeaderBaseId: "GENERALSKYWALKER",
  keyUnits: [
    { baseId: "GENERALSKYWALKER", name: "General Skywalker", importance: "critical", reason: "Mandatory member and the duo's control/damage engine." },
    { baseId: "AHSOKATANO", name: "Ahsoka Tano", importance: "critical", reason: "Mandatory second member; Daring Padawan supplies out-of-turn assist pressure with a Galactic Republic leader." },
  ],
  keyAbilities: [
    { baseId: "GENERALSKYWALKER", abilityName: "Force Grip", importance: "critical", expected: "AOE Daze for 2 turns", reason: "Daze is the duo's broad control tool against dangerous enemy assists/counters and helps GAS's Telekinesis cooldown interaction." },
    { baseId: "GENERALSKYWALKER", abilityName: "Sundering Strike", importance: "high", expected: "Armor Shred; double damage into Dazed targets", reason: "Use Armor Shred on the target the duo intends to finish rather than a low-impact enemy." },
    { baseId: "AHSOKATANO", abilityName: "Daring Padawan", importance: "high", requiresZeta: true, expected: "Assist when another Galactic Republic ally uses a Special under a Galactic Republic leader", reason: "GAS Specials can create additional Ahsoka damage/utility through the current unique." },
  ],
  stages: [
    stage("control", "Opening · establish GAS control", [
      step("daze", "Use Force Grip when the enemy board has multiple dangerous assist/counter/control threats; Daze is the duo's broadest control window.", { priority: "critical", ability: "Force Grip" }),
      step("select-kill", "Choose the enemy whose next special, heal, revive or AoE most threatens the two-character team and concentrate both characters on that target.", { priority: "critical" }),
      step("armor-shred", "Apply Sundering Strike/Armor Shred to the selected durable priority target when the duo needs a sustained damage lane rather than spending it randomly.", { priority: "high", ability: "Sundering Strike" }),
    ], { objective: "Prevent the enemy rotation from overwhelming a two-character squad before GAS control is established." }),
    stage("assist-loop", "Damage loop · GAS Specials feed Ahsoka pressure", [
      step("special-assist", "When Ahsoka's Daring Padawan zeta is active and GAS is leading, use meaningful GAS Specials to generate the additional Ahsoka assist pressure instead of wasting the Special into a low-value target.", { priority: "high", ability: "Daring Padawan" }),
      step("finish", "Finish the controlled/Armor Shredded priority enemy before moving to cleanup; do not split damage unless targetability forces it.", { priority: "high" }),
      step("reset", "Before the next wave or target cycle, preserve a control Special if the current board is already safe.", { priority: "high" }),
    ], { objective: "Convert GAS control and Ahsoka assists into a stable numbers advantage." }),
  ],
  targetPriorities: [{ target: "Highest-impact support / AoE / control enemy", priority: "critical", when: "each wave", reason: "The exact two-character mission is tested, but a single universal enemy spawn order is not asserted; control the enemy action most likely to end the run." }],
  failureRisks: [
    "The duo has little redundancy; wasting Force Grip or Armor Shred can leave the next enemy threat uncontrolled.",
    "Ahsoka's assist interaction depends on the current Daring Padawan upgrade and a Galactic Republic leader context.",
    "The tested guide supports the mission/team, not a guaranteed deterministic kill order for every enemy variant.",
  ],
  evidenceBoundary: "The exact GAS+Ahsoka Phase 2 mission has community-tested guide evidence. GAS Daze/Armor Shred behavior and Ahsoka's Galactic Republic assist interaction are current SWGOH.GG kit facts. Target order after identifying the highest-impact enemy remains adaptive and no clear percentage is generated.",
});

const GK_CODY_SERGEANT_P2 = Object.freeze({
  id: "p2-bot-sm-gk-cody-sergeant-v1",
  missionId: "p2-bot-sm",
  title: "Sand Dunes · General Kenobi + Cody + Clone Sergeant Special Mission",
  status: "current-entry-partial-strategy",
  confidence: "current-entry-partial",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-lsgeo", "swgohgg-gk", "swgohgg-cody", "swgohgg-clone-sergeant", "swgoh-farming-gr-special"),
  summary: "The three-character entry contract is established: General Kenobi, CC-2224 Cody and Clone Sergeant Phase I at the mission's progression gate. Current kit data supports a tank/clone damage shell, but this pack deliberately remains partial because a current mission-specific wave/target script has not been independently re-verified.",
  keyUnits: [
    { baseId: "GENERALKENOBI", name: "General Kenobi", importance: "critical", reason: "Mandatory mission member and the trio's durability anchor." },
    { baseId: "CC2224", name: "CC-2224 Cody", importance: "critical", reason: "Mandatory mission member and Clone team coordinator." },
    { baseId: "CLONESERGEANTPHASEI", name: "Clone Sergeant - Phase I", importance: "critical", reason: "Mandatory mission member; current basic can gain Turn Meter on a critical hit." },
  ],
  keyAbilities: [
    { baseId: "CLONESERGEANTPHASEI", abilityName: "Z-6 Rotary Blaster", importance: "high", expected: "Gain 50% Turn Meter on a critical hit at max level", reason: "Critical hits are a tempo tool for the trio, but not a substitute for a verified mission-specific kill order." },
  ],
  stages: [
    stage("entry", "Entry · preserve the mandatory trio", [
      step("verify", "Confirm all three mandatory characters clear the 7-star/21,000+ power gate; no substitute is legal for this restricted mission.", { priority: "critical" }),
      step("kenobi-anchor", "Use General Kenobi as the durability anchor and avoid exposing Cody/Clone Sergeant to avoidable focus while the current enemy board is being assessed.", { priority: "high" }),
      step("adaptive-target", "Focus the enemy healer, revive source or highest-impact AoE/control threat; exact wave-specific ordering remains under verification.", { priority: "high" }),
    ], { objective: "Keep the mandatory three-character shell alive while using only evidence-supported tactical guidance." }),
  ],
  targetPriorities: [{ target: "Highest-impact healer / revive / AoE threat", priority: "high", when: "each wave", reason: "No current mission-specific fixed target order is asserted." }],
  failureRisks: ["Presenting a generic Clone rotation as a verified mission script would overstate the available evidence."],
  evidenceBoundary: "The exact three-character mission gate is current-reference/community-reference supported and already encoded in the canonical LS Geo mission data. Current character kit behavior is sourced from SWGOH.GG. Exact wave-specific sequencing remains under verification, so this pack stays partial.",
});

const KAM_SHAAK_P4 = Object.freeze({
  id: "p4-mid-sm-kam-shaak-v1",
  missionId: "p4-mid-sm",
  title: "Factory Waste · KAM + Shaak Ti Galactic Republic Jedi Special Mission",
  status: "current-entry-partial-strategy",
  confidence: "current-entry-community-reference-partial",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-lsgeo", "swgohgg-kam", "swgohgg-shaakti", "bitdynasty-badbatch-padme"),
  summary: "Ki-Adi-Mundi and Shaak Ti are the hard core of this Phase 4 Galactic Republic Jedi special mission. The current app can correctly enforce the 23,000+ GR Jedi entry contract and evaluate the player's legal Jedi depth, but it does not yet claim a current exact four-wave rotation or universal three-Jedi complement.",
  keyUnits: [
    { baseId: "KIADIMUNDI", name: "Ki-Adi-Mundi", importance: "critical", reason: "Mandatory Phase 4 special-mission member." },
    { baseId: "SHAAKTI", name: "Shaak Ti", importance: "critical", reason: "Mandatory Phase 4 special-mission member and support/sustain core." },
  ],
  keyAbilities: [],
  stages: [
    stage("preflight", "Preflight · build around the mandatory Jedi pair", [
      step("verify-pair", "Verify Ki-Adi-Mundi and Shaak Ti both clear the 23,000+ power gate before ranking the remaining Galactic Republic Jedi slots.", { priority: "critical" }),
      step("three-jedi", "Fill the remaining slots with the strongest legal Galactic Republic Jedi whose tanking, control and damage complement the mandatory pair; do not label one historical trio universally mandatory.", { priority: "high" }),
      step("adaptive", "In battle, control the enemy action most likely to collapse the Jedi sustain engine; wave-specific kill sequencing remains under verification.", { priority: "high" }),
    ], { objective: "Produce a legal, roster-aware GR Jedi shell without fabricating an exact current mission script." }),
  ],
  targetPriorities: [{ target: "Highest-impact enemy control / AoE / sustain unit", priority: "high", when: "each wave", reason: "The exact wave-specific priority order remains under verification." }],
  failureRisks: ["Treating a generic Phase 4 Galactic Republic guide as proof of this exact KAM+Shaak special-mission rotation would overstate the evidence."],
  evidenceBoundary: "The KAM+Shaak hard entry pair and GR Jedi progression gate are canonical mission-data facts. Current kit references and broader Phase 4 Galactic Republic testing inform roster planning, but exact mission-specific wave sequencing is not independently re-verified here; the pack remains partial.",
});

const GAS_501_P4 = Object.freeze({
  id: "p4-bot-501-v1",
  missionId: "p4-bot-501",
  title: "Canyons · General Skywalker + 501st Combat Mission",
  status: "community-tested",
  confidence: "community-validated",
  lastVerified: "2026-08-16",
  sources: sources("swgoh-wiki-lsgeo", "swgohgg-gas", "bitdynasty-gas-p2-p4"),
  summary: "The exact Phase 4 GAS+501st mission has community-tested max-wave guide evidence. GAS's current leader turns the full 501st shell into a protection/cover engine, Force Grip supplies team-wide Daze, Sundering Strike supplies Armor Shred, and the team's objective is to preserve the clones while GAS alternates Advance/Cover and concentrates damage into the current wave's highest-impact threat.",
  requiredLeaderBaseId: "GENERALSKYWALKER",
  keyUnits: [
    { baseId: "GENERALSKYWALKER", name: "General Skywalker", importance: "critical", reason: "Mission-mandatory leader and the 501st protection/cover engine." },
    { baseId: "CT7567", name: "CT-7567 Rex", importance: "high", reason: "Canonical 501st tempo/cleanse/damage component in the tested GAS shell." },
    { baseId: "CT5555", name: "CT-5555 Fives", importance: "high", reason: "Canonical 501st durability/stat-transfer safety component." },
    { baseId: "CT210408", name: "CT-21-0408 Echo", importance: "high", reason: "Canonical 501st damage/control component." },
    { baseId: "ARCTROOPER501ST", name: "ARC Trooper", importance: "high", reason: "Canonical 501st damage/support component." },
  ],
  keyAbilities: [
    { baseId: "GENERALSKYWALKER", abilityName: "Force Grip", importance: "critical", expected: "AOE Daze for 2 turns", reason: "Use to suppress enemy counter/assist/tempo engines before committing the wave's damage cycle." },
    { baseId: "GENERALSKYWALKER", abilityName: "Sundering Strike", importance: "high", expected: "Armor Shred; double damage into Dazed targets", reason: "Build sustained damage on the durable priority enemy after control is established." },
    { baseId: "GENERALSKYWALKER", abilityName: "General of the 501st", importance: "critical", requiresZeta: true, expected: "501st protection/Advance/Cover engine and anti-revive", reason: "The tested mission composition is built around GAS leading a full 501st squad." },
  ],
  stages: [
    stage("opening", "Opening · establish Daze and protect the clone engine", [
      step("daze", "Use Force Grip when it suppresses the current wave's assist/counter/control threats; avoid wasting the broad Daze window on an already harmless board.", { priority: "critical", ability: "Force Grip" }),
      step("priority", "Identify the healer, revive source, sniper/high-burst attacker or control unit most capable of forcing GAS into Cover too early and focus that enemy.", { priority: "critical" }),
      step("shred", "Apply Armor Shred to the durable priority target when the wave needs sustained focus damage.", { priority: "high", ability: "Sundering Strike" }),
    ], { objective: "Keep the 501st shell intact while GAS controls the first dangerous enemy rotation." }),
    stage("cover-cycle", "Midfight · manage Advance/Cover and clone survival", [
      step("clone-life", "When GAS takes Cover, protect the remaining 501st allies and use their turns to rebuild GAS Protection instead of exposing a weakened clone unnecessarily.", { priority: "critical" }),
      step("focus", "Maintain focus on the current priority enemy through the Cover cycle; do not spread damage while the enemy support engine remains alive.", { priority: "high" }),
      step("transition", "Before completing a safe wave, preserve Force Grip or other key 501st control tools when possible for the next opening.", { priority: "high" }),
    ], { objective: "Use GAS's leader mechanics as a repeatable survival/damage cycle across all four waves." }),
  ],
  targetPriorities: [{ target: "Healer / revive source / highest-burst or control enemy", priority: "critical", when: "each wave", reason: "The exact mission/team is tested, but enemy variants make adaptive threat selection safer than asserting one universal name order." }],
  failureRisks: [
    "Losing a key 501st ally unnecessarily can weaken GAS's protection/cover cycle before later waves.",
    "Wasting Daze or Armor Shred on low-impact targets can leave the actual wave threat free to act.",
    "The community guide demonstrates the exact mission/team, not a guaranteed clear rate or fixed enemy spawn order.",
  ],
  evidenceBoundary: "The Phase 4 GAS+501st mission has direct community-tested max-wave guide evidence. GAS's current leader, Daze and Armor Shred behavior are current SWGOH.GG facts. Exact per-wave enemy priority remains adaptive and no win percentage is fabricated.",
});

export const LS_GEO_BATTLE_STRATEGIES = Object.freeze({
  "p1-mid-sm": PADME_P1,
  "p2-mid-gas": GAS_AHSOKA_P2,
  "p2-bot-sm": GK_CODY_SERGEANT_P2,
  "p4-mid-sm": KAM_SHAAK_P4,
  "p4-bot-501": GAS_501_P4,
});

export function lsGeoBattleStrategyForMission(missionId) {
  return LS_GEO_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
