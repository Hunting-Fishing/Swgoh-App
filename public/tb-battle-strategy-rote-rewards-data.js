const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_REWARD_BATTLE_STRATEGY_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire mission modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "cg-zeffo-update", label: "Capital Games · Zeffo unlock update", kind: "official", url: "https://swgoh.gg/news/title-update-6282023/" },
  { id: "swgohgg-cere", label: "SWGOH.GG · Cere Junda current kit", kind: "current-reference", url: "https://swgoh.gg/units/cere-junda/" },
  { id: "swgohgg-jkck", label: "SWGOH.GG · Jedi Knight Cal Kestis current kit", kind: "current-reference", url: "https://swgoh.gg/units/jedi-knight-cal-kestis/" },
  { id: "tbcm-bracca", label: "TB Combat Missions · Bracca Cal/Cere special mission", kind: "community-tested", url: "https://tbcm.pages.dev/bracca" },
  { id: "swgohgg-qira", label: "SWGOH.GG · Qi'ra current kit and ROTE mission requirements", kind: "current-reference", url: "https://swgoh.gg/units/qira/" },
  { id: "swgohgg-yhan", label: "SWGOH.GG · Young Han Solo current kit", kind: "current-reference", url: "https://swgoh.gg/units/young-han-solo/" },
  { id: "swgohgg-l3", label: "SWGOH.GG · L3-37 current kit", kind: "current-reference", url: "https://swgoh.gg/units/l3-37/" },
  { id: "swgohgg-vandor", label: "SWGOH.GG · Vandor Chewbacca current kit", kind: "current-reference", url: "https://swgoh.gg/units/vandor-chewbacca/" },
  { id: "swgohgg-baylan", label: "SWGOH.GG · Baylan Skoll current kit", kind: "current-reference", url: "https://swgoh.gg/units/baylan-skoll/" },
  { id: "swgohgg-shin", label: "SWGOH.GG · Shin Hati current kit", kind: "current-reference", url: "https://swgoh.gg/units/shin-hati/" },
  { id: "swgohgg-marrok", label: "SWGOH.GG · Marrok current kit", kind: "current-reference", url: "https://swgoh.gg/units/marrok/" },
  { id: "starwarsfans-rote-teams", label: "StarWars-fans · Rise of Empire tested team notes", kind: "community-tested", url: "https://starwars-fans.com/2023/01/swgoh-rise-of-empire-best-teams/" },
  { id: "starwarsfans-kessel", label: "StarWars-fans · Kessel Qi'ra/L3 special mission walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2025/01/swgoh-rote-territory-battle-kessel-special-mission-with-qira-l3-37-walkthrough-tips/" },
  { id: "cg-yhan-vandor", label: "Capital Games · Young Han Solo & Vandor Chewbacca kit reveal", kind: "official", url: "https://forums.ea.com/discussions/swgoh-strategy-and-tips-en/kit-reveal-young-han-solo--vandor-chewbacca/4312797" },
]);

const sources = (...ids) => ROTE_REWARD_BATTLE_STRATEGY_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_REWARD_BATTLE_STRATEGIES = Object.freeze({
  "bracca-zeffo-unlock": Object.freeze({
    id: "bracca-zeffo-unlock-jkck-v1",
    missionId: "bracca-zeffo-unlock",
    title: "Bracca · Zeffo Unlock · Cere + Jedi Knight Cal",
    status: "community-tested",
    confidence: "official-entry-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-zeffo-update", "swgohgg-cere", "swgohgg-jkck", "tbcm-bracca"),
    summary: "This pack evaluates the higher-confidence Cere + Jedi Knight Cal route. Keep JKCK fast, do not target the Imperial Probe Droid unless unavoidable, do not use the event-granted Special with JKCK, and minimize Windmill Defense because its Riposte can ignore Protection and trigger dangerous IPD explosions. Wave 2 shifts control toward Second Sister while continuing to avoid the spawned IPD.",
    requiredLeaderBaseId: "CEREJUNDA",
    keyUnits: [
      { baseId: "CEREJUNDA", name: "Cere Junda", importance: "critical", reason: "Officially mandatory at R7+ for the Zeffo unlock mission." },
      { baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis", importance: "critical", reason: "Officially legal Cal option and the community-tested easier route encoded by this strategy variant." },
    ],
    keyAbilities: [
      { baseId: "JEDIKNIGHTCAL", abilityName: "Windmill Defense", importance: "high", expected: "Cleanse, assist, Protection Up and Riposte", reason: "Use sparingly in this mission because Riposte ignores Protection and community testing warns it can trigger IPD explosion pressure." },
      { baseId: "JEDIKNIGHTCAL", abilityName: "Impetuous Assault", importance: "high", expected: "First-use instant defeat plus Territory Battle damage/ramp at 30 Impetuous", reason: "Preserve the Impetuous engine for a high-impact legal target; do not waste the route on the spawned IPD." },
    ],
    stages: [
      stage("wave1", "Wave 1 · Purge Troopers and IPD discipline", [
        step("avoid-ipd", "Do not target the spawned Imperial Probe Droid when a legal alternative exists. Treat it as a mission hazard rather than the damage priority.", { priority: "critical", target: "Imperial Probe Droid" }),
        step("no-event-special", "Do not use the event-granted Special with Jedi Knight Cal in this strategy variant; community mission testing explicitly warns against it.", { priority: "critical" }),
        step("limit-windmill", "Use Windmill Defense only when its cleanse/assist/protection value outweighs the Riposte risk. Riposte ignores Protection and can contribute to IPD explosion triggers.", { priority: "high", ability: "Windmill Defense" }),
        step("build-cal", "Use JKCK's normal configuration/Impetuous cycle to prepare the decisive attack while keeping Cere alive.", { priority: "high" }),
      ], { objective: "Clear the Purge Troopers without turning the spawned IPD into the primary source of incoming damage." }),
      stage("wave2", "Wave 2 · Second Sister control", [
        step("second-sister", "Prioritize Second Sister as the named Wave 2 threat while continuing to avoid unnecessary attacks into the spawned IPD.", { priority: "critical", target: "Second Sister" }),
        step("impetuous-window", "Use the prepared JKCK Impetuous Assault window on the highest-impact legal enemy when it safely accelerates the clear.", { priority: "high", ability: "Impetuous Assault" }),
        step("preserve-cere", "Keep Cere active through the finish; the guild receives unlock credit only for a successful mission clear.", { priority: "high" }),
      ], { objective: "Remove Second Sister and finish without losing the two-unit core to IPD collateral damage." }),
    ],
    targetPriorities: [
      { target: "Second Sister", priority: "critical", when: "Wave 2", reason: "She is the named elite enemy in the second encounter and the preferred control/removal target." },
      { target: "Purge Trooper", priority: "high", when: "Wave 1 and remaining Wave 2 support", reason: "Advance the battle through normal enemies instead of feeding damage into the spawned IPD." },
      { target: "Imperial Probe Droid", priority: "info", when: "only when unavoidable", reason: "Community-tested guidance explicitly warns not to target IPD when it can be avoided." },
    ],
    failureRisks: [
      "This is specifically the Cere + Jedi Knight Cal strategy variant. Cal Kestis is also officially legal, but is not treated as strategically equivalent here.",
      "Using the event Special with JKCK or repeatedly creating Riposte through Windmill Defense can worsen IPD explosion risk.",
      "Do not inherit 'guaranteed' language from community video titles; this pack contains no success probability.",
    ],
    evidenceBoundary: "Cere plus either Cal variant at R7 and the 30-clear Zeffo unlock are official requirements. JKCK kit behavior is current-reference data. IPD avoidance, event-Special avoidance, speed advice and limited Windmill Defense are community-tested mission guidance; no guaranteed clear rate is claimed.",
  }),

  "corellia-qira": Object.freeze({
    id: "corellia-qira-yhan-v1",
    missionId: "corellia-qira",
    title: "Corellia · Qi'ra + Young Han Special Mission",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-qira", "swgohgg-yhan", "swgohgg-l3", "swgohgg-vandor", "starwarsfans-rote-teams"),
    summary: "Use the Qi'ra-led Prepared Scoundrel variant with mandatory Young Han. Track Corellia's Coaxium holder before relying on L3's Taunt, keep L3 protected/taunting when the modifier allows it, use Qi'ra's Scattering Blast for important buff or Taunt removal, and chain Qi'ra/Young Han/Vandor Prepared interactions rather than spending cooldowns only for raw damage.",
    requiredLeaderBaseId: "QIRA",
    keyUnits: [
      { baseId: "QIRA", name: "Qi'ra", importance: "critical", reason: "Officially required at R5+ and the leader used by this tested Prepared/Scoundrel strategy." },
      { baseId: "YOUNGHAN", name: "Young Han Solo", importance: "critical", reason: "Officially required at R5+ and supplies Prepared transfer, speed ramp and Scoundrel assists." },
      { baseId: "L3_37", name: "L3-37", importance: "high", reason: "Community-tested tank for the mission; Corellia Coaxium can still let enemies ignore Taunt to attack its holder." },
      { baseId: "YOUNGCHEWBACCA", name: "Vandor Chewbacca", importance: "high", reason: "Prepared Protection/recovery and Light Side Scoundrel revive engine." },
    ],
    keyAbilities: [
      { baseId: "QIRA", abilityName: "Scattering Blast", importance: "high", expected: "Target buff dispel, AOE Stagger; Prepared upgrades to dispel all enemy buffs", reason: "Hold for a meaningful Defense Up/Taunt/buff-control window rather than spending it as generic AOE damage." },
      { baseId: "QIRA", abilityName: "Joint Operation", importance: "high", expected: "Call ally to assist; Prepared calls all other Prepared allies", reason: "Use with Young Han or another strong Scoundrel to convert Prepared into controlled burst." },
      { baseId: "YOUNGCHEWBACCA", abilityName: "Freedom Fighter", importance: "helpful", expected: "Health recovery and Protection Up; stronger while Prepared", reason: "Use to keep the tank/core healthy and preserve Vandor's buff-dependent mitigation/revive engine." },
    ],
    stages: [
      stage("coaxium", "Opening · identify Coaxium before trusting Taunt", [
        step("track-holder", "Identify the current Coaxium holder before assuming L3 can protect the team. Enemies may ignore Taunt to target the Coaxium holder.", { priority: "critical" }),
        step("stabilize-l3", "When L3 is available, keep her healthy and taunting where targetability permits; pair Protection Up/recovery with her tank role instead of assuming Taunt is absolute.", { priority: "high" }),
        step("prepared-engine", "Build and transfer Prepared deliberately so Young Han, Vandor and Qi'ra can convert it into assists, recovery and buff control.", { priority: "high" }),
      ], { objective: "Establish the Prepared tank/assist engine without being surprised by Coaxium targetability." }),
      stage("control", "Midfight · use Qi'ra control for value", [
        step("scatter-buffs", "Use Scattering Blast when a priority enemy's buffs, Defense Up or Taunt materially obstruct the fight; if Qi'ra is Prepared it dispels all enemy buffs.", { priority: "critical", ability: "Scattering Blast" }),
        step("joint-young-han", "Use Joint Operation with Young Han or another high-value Scoundrel when the assist creates a meaningful kill or Prepared burst window.", { priority: "high", ability: "Joint Operation" }),
        step("highest-offense", "When no mission-specific hard target is present, remove the enemy creating the highest immediate offense/control pressure rather than following an invented fixed order.", { priority: "high" }),
      ], { objective: "Convert Prepared and assists into controlled removals while preserving the tank/revive shell." }),
      stage("finish", "Closeout · preserve the Scoundrel engine", [
        step("vandor-buffed", "Keep Vandor buffed where practical so his enemy damage reduction, counters, protection recovery and Prepared revive condition remain useful.", { priority: "high" }),
        step("coaxium-recheck", "Re-check Coaxium after attacks transfer it; targetability can change during cleanup.", { priority: "high" }),
      ], { objective: "Finish without allowing Coaxium transfer to expose a critical unit unexpectedly." }),
    ],
    targetPriorities: [
      { target: "Highest immediate offense/control threat", priority: "critical", when: "throughout", reason: "Community guidance prioritizes dangerous offense while the exact live enemy state can vary; no fabricated universal kill order is encoded." },
      { target: "Current Coaxium holder", priority: "info", when: "throughout", reason: "Track it because Corellia changes Speed, critical interactions and Taunt bypass around the holder." },
    ],
    failureRisks: [
      "Assuming L3 Taunt always protects Qi'ra/Young Han ignores Corellia's Coaxium Taunt-bypass rule.",
      "Spending Scattering Blast before an important buff/Taunt window can leave the team without its best broad dispel.",
      "Optional tested teammates remain advisories because Operations can remove them from availability.",
    ],
    evidenceBoundary: "Qi'ra/Young Han R5 entry and Corellia Coaxium/Scoundrel modifiers are official/current mission facts. Current Prepared and ability behavior comes from SWGOH.GG. L3/Vandor composition and sequencing are community-tested guidance; no anecdotal clear history is converted to a win probability.",
  }),

  "kessel-qira-l3": Object.freeze({
    id: "kessel-qira-l3-baylan-v1",
    missionId: "kessel-qira-l3",
    title: "Kessel · Qi'ra + L3-37 Special Mission · Baylan Variant",
    status: "community-tested",
    confidence: "official-modifier-current-kit-community-battle-reference",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-qira", "swgohgg-l3", "swgohgg-baylan", "swgohgg-shin", "swgohgg-marrok", "starwarsfans-kessel"),
    summary: "Use the tested Baylan Mercenary shell around mandatory Qi'ra and L3-37. Kessel's Confusing Tunnels makes every Special add Confuse to its user, so manage Special use as a resource and use the granted Recompute before critical buff/assist/Turn Meter windows are disabled. Baylan's Power. Such as You've Never Dreamed provides broad opening dispel + Stun control, with resisted Stuns still removing 50% Turn Meter.",
    requiredLeaderBaseId: "BAYLANSKOLL",
    keyUnits: [
      { baseId: "BAYLANSKOLL", name: "Baylan Skoll", importance: "critical", reason: "Leader for the tested modern Kessel strategy variant and source of broad opening control." },
      { baseId: "QIRA", name: "Qi'ra", importance: "critical", reason: "Officially required at R8+ for the Kessel special mission." },
      { baseId: "L3_37", name: "L3-37", importance: "critical", reason: "Officially required at R8+ and the durable tank in the tested shell." },
      { baseId: "SHINHATI", name: "Shin Hati", importance: "helpful", reason: "Community-tested Mercenary attacker/control partner; not a hard mission gate." },
      { baseId: "MARROK", name: "Marrok", importance: "helpful", reason: "Community-tested Mercenary support partner; not a hard mission gate." },
    ],
    keyAbilities: [
      { baseId: "BAYLANSKOLL", abilityName: "Power. Such as You've Never Dreamed", importance: "high", expected: "AOE buff dispel and Stun; resisted Stun removes 50% Turn Meter", reason: "Use as the primary broad control action, while accounting for the Confuse stack Baylan gains for using a Special." },
    ],
    stages: [
      stage("confuse-accounting", "Opening · budget Confuse", [
        step("special-cost", "Before every Special, account for another Confuse stack on its user. At increasing stacks, Kessel disables buff gain, then counter/assist/bonus Turn Meter, then makes Basic attacks increase cooldowns.", { priority: "critical" }),
        step("baylan-control", "Use Baylan's AOE dispel/Stun when it will suppress the opening Pyke/Pirate barrage. Even resisted Stuns remove 50% Turn Meter.", { priority: "critical", ability: "Power. Such as You've Never Dreamed" }),
        step("protect-qira", "Stabilize Qi'ra after the opening barrage; community testing shows she can be a fragile point while L3 absorbs pressure.", { priority: "high" }),
      ], { objective: "Gain early control without blindly pushing every key unit to harmful Confuse thresholds." }),
      stage("recompute", "Midfight · clear Confuse before key engine windows", [
        step("recompute-before-buffs", "Use the granted Recompute on a key character before a high-value buff action if that character is at the Confuse threshold that prevents buff gain.", { priority: "critical", ability: "Recompute" }),
        step("recompute-before-assists", "Clear Confuse before relying on an assist/counter/bonus-Turn-Meter sequence when the character has reached the stack threshold that disables those mechanics.", { priority: "critical", ability: "Recompute" }),
        step("basics-between", "Use productive Basics between essential Specials when control is stable; this slows Confuse accumulation and preserves future Special windows.", { priority: "high" }),
      ], { objective: "Treat Recompute as mission-resource management rather than an emergency-only button." }),
      stage("wave2", "Wave 2 · repeat control and resource discipline", [
        step("refresh-control", "Re-establish Baylan control on the second Pyke/Pirate wave when available, then continue cycling Basics and Recompute around essential Specials.", { priority: "high" }),
        step("keep-l3", "Keep L3 active as the durable front line while the Mercenary damage/control core removes the highest-pressure enemy.", { priority: "high" }),
      ], { objective: "Carry the same Confuse budget into Wave 2 rather than exhausting the squad's mechanics in Wave 1." }),
    ],
    targetPriorities: [
      { target: "Highest-impact Pyke/Pirate damage or control threat", priority: "critical", when: "each wave", reason: "The tested encounter consists of Pykes/Pirates, but a fixed kill order is not asserted beyond broad-control priority." },
    ],
    failureRisks: [
      "Spamming Specials without tracking Confuse can disable buffs, assists/counters/bonus Turn Meter, then punish Basics with cooldown increases.",
      "This is a Baylan-led tested variant, not a claim that Baylan is an official entry requirement.",
      "The modern community shell uses Shin Hati and Marrok as supporting Mercenaries; Operations/roster availability can require alternatives, so they remain advisories.",
    ],
    evidenceBoundary: "Qi'ra/L3 R8 entry and Confusing Tunnels/Recompute are official ROTE mechanics. Baylan's AOE Stun/Turn Meter fallback is current SWGOH.GG kit data. The Baylan/Shin/Marrok composition and two-wave usage are community-tested guidance; no guaranteed success percentage is asserted.",
  }),

  "vandor-yhan": Object.freeze({
    id: "vandor-yhan-prepared-v1",
    missionId: "vandor-yhan",
    title: "Vandor · Young Han + Vandor Chewbacca Special Mission",
    status: "kit-driven-conservative",
    confidence: "official-modifier-current-kit",
    lastVerified: "2026-08-15",
    sources: sources("cg-rote-details", "swgohgg-yhan", "swgohgg-vandor", "cg-yhan-vandor"),
    summary: "Build this R9 special mission around the mandatory Young Han + Vandor Chewbacca Prepared engine. Vandor's Sabacc Shift favors timing damage around advantageous dice states; independently, Young Han can pass Prepared while ramping Speed and Vandor converts Prepared into stronger Freedom Fighter recovery/damage and preserves his Light Side Scoundrel revive condition while buffed. Because a stable current enemy script is not independently verified, target priority remains adaptive.",
    requiredLeaderBaseId: null,
    keyUnits: [
      { baseId: "YOUNGHAN", name: "Young Han Solo", importance: "critical", reason: "Officially mandatory at R9 for the Vandor special mission and the Prepared-transfer/speed-ramp half of the core." },
      { baseId: "YOUNGCHEWBACCA", name: "Vandor Chewbacca", importance: "critical", reason: "Officially mandatory at R9; provides Protection Up, recovery, mitigation, counter pressure and Prepared-based Light Side Scoundrel revive." },
      { baseId: "QIRA", name: "Qi'ra", importance: "helpful", reason: "Natural Prepared/Scoundrel support option, but not an official Vandor mission requirement." },
    ],
    keyAbilities: [
      { baseId: "YOUNGHAN", abilityName: "Upper Hand", importance: "high", expected: "Protection Up, Retribution and permanent stacking Speed", reason: "Use to ramp Young Han while preserving his Protection/Prepared engine." },
      { baseId: "YOUNGHAN", abilityName: "Just In Time", importance: "high", expected: "Prepared-scaled damage, ally Protection recovery and Prepared transfer", reason: "Pass Prepared to Vandor or another key Scoundrel when that strengthens the survival/assist engine." },
      { baseId: "YOUNGCHEWBACCA", abilityName: "Freedom Fighter", importance: "high", expected: "Max-Health-based damage, ally recovery and Protection Up; stronger while Prepared", reason: "Convert Vandor's Prepared state into survival plus damage while keeping him buffed." },
    ],
    stages: [
      stage("prepared", "Opening · establish Prepared and buffs", [
        step("upper-hand", "Use Upper Hand to begin Young Han's permanent Speed ramp while giving him Protection Up/Retribution.", { priority: "high", ability: "Upper Hand" }),
        step("pass-prepared", "When Young Han is Prepared, use Just In Time to pass Prepared to Vandor when the revive/recovery engine needs to be primed.", { priority: "critical", ability: "Just In Time", target: "Vandor Chewbacca" }),
        step("keep-vandor-buffed", "Keep Vandor buffed where practical: his kit reduces enemy damage while he is buffed and his counter/protection-recovery loop helps him reach Prepared.", { priority: "critical" }),
      ], { objective: "Prime Vandor's Prepared survival engine while Young Han starts his encounter-long speed ramp." }),
      stage("sabacc", "Sabacc Shift · time the damage window", [
        step("read-dice", "Use the live Sabacc Shift state when deciding whether to commit major damage. Do not hard-code a dice result; the mission modifier changes damage opportunity based on the current roll/state.", { priority: "critical" }),
        step("prepared-freedom", "When Vandor is Prepared and the damage window is favorable, use Freedom Fighter to convert Prepared into increased damage, self/ally recovery and Protection Up.", { priority: "high", ability: "Freedom Fighter" }),
        step("preserve-revive", "Avoid consuming Vandor's Prepared state casually if a Light Side Scoundrel ally is at serious defeat risk; Prepared Vandor can revive a defeated Light Side Scoundrel ally.", { priority: "high" }),
      ], { objective: "Synchronize Prepared resources with the mission's changing Sabacc damage state." }),
      stage("closeout", "Closeout · maintain the engine", [
        step("adaptive-target", "Focus the highest immediate enemy damage/control threat while keeping Young Han and Vandor alive; no universal current encounter kill order is asserted without independent encounter verification.", { priority: "high" }),
        step("continue-ramp", "Continue Upper Hand/Prepared cycling as cooldowns permit so Young Han's speed and Vandor's recovery remain relevant through a long R9 fight.", { priority: "high" }),
      ], { objective: "Win through Prepared sustain and favorable damage windows instead of an invented scripted target order." }),
    ],
    targetPriorities: [
      { target: "Highest immediate damage/control threat", priority: "critical", when: "throughout", reason: "The mission-specific Sabacc mechanic is verified, but a stable current enemy script was not independently verified; target order remains adaptive." },
    ],
    failureRisks: [
      "Using Prepared only as a damage buff can throw away Vandor's revive/recovery safety net.",
      "Allowing Vandor to remain unbuffed weakens his mitigation, counter and Protection-recovery engine.",
      "This conservative pack intentionally does not invent exact Vandor enemies or a fixed kill order when current encounter evidence is incomplete.",
    ],
    evidenceBoundary: "Young Han/Vandor Chewbacca R9 entry and Vandor's Sabacc Shift are official ROTE information. Prepared, Upper Hand, Just In Time, Freedom Fighter and Vandor's revive/recovery interactions are official/current kit facts. Enemy-specific sequencing remains deliberately adaptive until independently verified; no win probability is generated.",
  }),
});

export function roteRewardBattleStrategyForMission(missionId) {
  return ROTE_REWARD_BATTLE_STRATEGIES[String(missionId || "")] || null;
}
