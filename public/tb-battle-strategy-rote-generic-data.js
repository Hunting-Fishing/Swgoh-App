const step = (id, instruction, priority = "high", extra = {}) => ({ id, instruction, priority, ...extra });
const stage = (id, label, steps, objective = "") => ({ id, label, steps, ...(objective ? { objective } : {}) });

export const ROTE_GENERIC_SOURCES = Object.freeze([
  { id: "cg-rote", label: "Capital Games · Rise of the Empire planet modifiers", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "cg-mandalore", label: "Capital Games · Mandalore Bonus Zone Information", kind: "official", url: "https://swgoh.gg/news/mandalore-bonus-zone-information/" },
  { id: "cg-eleventh-hour-fix", label: "Capital Games · Eleventh Hour text correction", kind: "official", url: "https://swgoh.gg/news/update-5222024/" },
  { id: "bitdynasty-mandalore", label: "BitDynasty · Mandalore Phase 4 battle reference", kind: "community-tested", url: "https://www.swgoh.tv/video/41634-mandalore-bonus-planet-mix-s4-bkm-dtmg-jmk-levi-executrix-gauntlet-rote-tb-swgoh" },
]);
const source = (id) => ROTE_GENERIC_SOURCES.find((row) => row.id === id);
const officialSources = () => [source("cg-rote")];

const endlessRanks = () => stage("ranks", "Exhaust Endless Ranks", [
  step("repeat", "Repeatedly defeat one accessible Imperial Trooper while Endless Ranks remains; each defeat removes one stack from every Imperial Trooper before that unit revives at 60% Health and Protection.", "critical"),
  step("permanent", "Once the shared stacks are gone, convert the next defeats into permanent kills rather than spreading damage.", "critical"),
], "Treat the revive mechanic as a finite shared stack pool.");
const imperialSupremacy = () => step("supremacy", "Control the Empire Leader and dangerous Special users: each Empire Special permanently increases allied Empire damage by 10% for the encounter and calls the other Empire allies to assist.", "high");

const templates = Object.freeze({
  mustafar: {
    title: "Mustafar · Open Dark Side Combat Mission",
    summary: "Lava Fields inflicts unavoidable Burning for 1 turn whenever a character uses an ability. Build around sustain and efficient kills instead of trying to resist the environmental Burning.",
    stages: [stage("lava", "Respect Lava Fields", [step("burn", "Expect Burning after every character ability; it cannot be evaded or resisted.", "critical"), step("sustain", "Favor durable recovery or a strong ramp engine so repeated self-Burning does not collapse the support shell."), step("finish", "Once stable, remove the highest-pressure enemy rather than extending the attrition fight.")])],
    risks: ["Tenacity, Evasion and ordinary resistance logic cannot prevent Lava Fields Burning."],
  },
  corellia: {
    title: "Corellia · Open Mixed Combat Mission",
    summary: "Scrumrats moves Coaxium from its current holder to any character that attacks that holder. Coaxium grants Speed/Critical Damage but lowers Accuracy, guarantees incoming crits when possible and lets enemies ignore Taunt to target the holder.",
    stages: [stage("coaxium", "Track the Coaxium carrier", [step("identify", "Identify the current Coaxium holder before choosing a target or relying on Taunt.", "critical"), step("transfer", "Attacking the holder transfers Coaxium to the attacker; plan the next targeting window around the new carrier.", "critical"), step("scoundrel", "If One Step Ahead is active, buffed enemy Scoundrels take 30% less damage and counter more often; dispel/control before a major burst when practical.")])],
    risks: ["Ignoring Coaxium can invalidate a normal Taunt-based protection plan."],
  },
  coruscant: {
    title: "Coruscant · Open Light Side Combat Mission",
    summary: "Buffs and debuffs build Democracy charge. The enemy Leader cannot be normally destroyed or fall below 1% Health while allies remain; three Democracy uses apply three No Confidence stacks and instantly defeat that Leader, including a Galactic Legend.",
    stages: [stage("democracy", "Build and spend Democracy three times", [step("charge", "Use productive buffs and debuffs to add 5% Democracy energy to all allies per trigger.", "critical"), step("protected", "Do not waste destroy effects on the protected enemy Leader while another enemy remains.", "critical"), step("spend", "At full charge, use Democracy on the enemy Leader for No Confidence and an unavoidable Stun; repeat until the third stack executes the Leader.", "critical", { ability: "Democracy", target: "Enemy Leader" })])],
    risks: ["Normal destroy effects do not bypass the protected enemy-Leader rule."],
  },
  geonosis: {
    title: "Geonosis · Open Dark Side Combat Mission",
    summary: "Every Special grants its user a permanent Entertainment stack: +10% Max Health, Offense and Potency. Prefer Dark Side teams whose Specials already provide useful control, sustain or ramp.",
    stages: [stage("arena", "Scale Entertainment through productive Specials", [step("specials", "Use Specials when they create real tactical value; every user also gains another permanent Entertainment stack."), step("convert", "As stacks build, convert the stat advantage into focused kills before the enemy's own Special users scale too far.")])],
    risks: ["The enemy can also scale through Special use, so uncontrolled long fights become more dangerous."],
  },
  felucia: {
    title: "Felucia · Open Mixed Combat Mission",
    summary: "Nysillin gives the acting character a 10% Heal Over Time, +25% Defense and immunity to Buff Immunity while the HoT is active; expiry grants Offense Up, and all recovery is 20% stronger.",
    stages: [stage("nysillin", "Use the Nysillin recovery state", [step("hot", "Expect the acting unit's HoT plus temporary Defense and Buff-Immunity immunity.", "critical"), step("recover", "Favor meaningful healing/protection recovery because Felucia increases recovery by 20%."), step("debuff", "Delay Buff Immunity-dependent control until the target's Nysillin HoT is gone.")])],
    risks: ["Buff Immunity will not land while the target has the Nysillin Heal Over Time."],
  },
  bracca: {
    title: "Bracca · Open Light Side Combat Mission",
    summary: "Bracca combines Endless Ranks with Imperial Supremacy. Burn the shared Imperial Trooper revive pool while controlling Empire Specials before their permanent damage ramp and mass assists snowball.",
    stages: [stage("opening", "Control the Empire ramp", [imperialSupremacy()]), endlessRanks()],
    risks: ["Spreading damage without Trooper defeats does not reduce Endless Ranks.", "Uncontrolled Empire Specials permanently ramp enemy damage."],
  },
  dathomir: {
    title: "Dathomir · Open Dark Side Combat Mission",
    summary: "Dark Magick revives every defeated character at 50% Health every 10 turns. Control and soften the board, then compress final defeats into one post-revive window.",
    stages: [stage("timer", "Track the 10-turn mass revive", [step("count", "Count the global turn cadence so you know when all defeated characters will return at 50% Health.", "critical"), step("control", "Use control to hold damaged enemies instead of feeding the encounter isolated kills.")]), stage("wipe", "Finish inside one revive window", [step("burst", "Immediately after a revive pulse—or when the board can be cleared before the next one—commit the strongest synchronized damage cycle.", "critical")])],
    risks: ["A trickle of isolated kills can be erased every 10 turns."],
  },
  tatooine: {
    title: "Tatooine · Open Mixed Combat Mission",
    summary: "Dune Sandstorm applies unavoidable Damage Over Time to all units at the end of every other turn. Bring sustain, ramp or efficient burst; cleanse can manage current damage but cannot stop later Sandstorm applications.",
    stages: [stage("sandstorm", "Win the recurring-DoT attrition race", [step("unavoidable", "Do not spend turn economy trying to resist Dune Sandstorm; it cannot be resisted.", "critical"), step("recover", "Use recovery/cleanse when it materially changes survival, knowing the DoT will return."), step("focus", "Once stable, focus the highest-pressure enemy to shorten the environmental race.")])],
    risks: ["A cleanse does not disable future Dune Sandstorm applications."],
  },
  kashyyyk: {
    title: "Kashyyyk · Open Light Side Combat Mission",
    summary: "Righteous Retribution gives +20% stacking Critical Damage whenever a unit takes damage until it crits, restores 10% Protection whenever a unit is debuffed, and grants a random ally a bonus turn whenever a unit is defeated. Empire encounters can also use Imperial Supremacy.",
    stages: [stage("retribution", "Manage Kashyyyk's damage/recovery swings", [step("crit", "Track units that have taken repeated non-critical damage; their next critical hit may carry heavily stacked Critical Damage."), step("debuff", "Every debuff restores 10% Protection to its target; use a control debuff only when the prevented action is worth that recovery.", "critical"), step("defeat", "A defeat gives a random ally a bonus turn, so plan kills around the resulting tempo swing."), imperialSupremacy()])],
    risks: ["Debuff-heavy teams can unintentionally restore large amounts of enemy Protection."],
  },
  haven: {
    title: "Haven · Open Dark Side Combat Mission",
    summary: "Brain Worms deal 5% Health damage per stack at start of turn ignoring Protection and cannot be removed by allied dispels. Specials add a Brain Worm stack to the target enemy. Brain Freeze removes all stacks from a target ally but applies an unavoidable Stun.",
    stages: [stage("worms", "Trade a controlled Stun for Brain Worm removal", [step("track", "Track Brain Worms on every core ally; the start-turn Health damage ignores Protection.", "critical"), step("special", "Use Specials deliberately because they add another Brain Worm stack to the target enemy."), step("freeze", "Use Brain Freeze before a key ally's stack count becomes lethal, accepting the unavoidable Stun as the cost of clearing all stacks.", "critical", { ability: "Brain Freeze" })])],
    risks: ["Ordinary allied dispels cannot remove Brain Worms."],
  },
  kessel: {
    title: "Kessel · Open Mixed Combat Mission",
    summary: "Each Special adds Confuse. At 1 stack the character cannot gain buffs; at 2 it cannot counter, assist or gain bonus Turn Meter; at 3 its Basic increases cooldowns. Ground characters use Clear Head to remove all Confuse.",
    stages: [stage("confuse", "Budget Specials and Clear Head", [step("one", "At 1 Confuse, do not plan a buff-dependent window."), step("two", "At 2 Confuse, assists/counters/bonus TM are disabled; use Clear Head before a critical engine or tempo window.", "critical", { ability: "Clear Head" }), step("three", "At 3 Confuse, Basics increase cooldowns; clear the stacks rather than accepting a broken cooldown cycle.", "high", { ability: "Clear Head" })])],
    risks: ["Recompute is the fleet version; ground characters use Clear Head."],
  },
  lothal: {
    title: "Lothal · Open Light Side Combat Mission",
    summary: "Every on-turn Special calls a random ally to assist. Out-of-turn attacks build Rebellious: +2% Critical Chance/Critical Damage per stack and +30% additional Offense at 20 stacks. Endless Ranks may also protect Imperial Troopers.",
    stages: [stage("rebellious", "Build Rebellious through useful Specials", [step("special", "Use Specials when both the ability and random assist provide real value."), step("twenty", "Track frequent out-of-turn attackers as they approach the 20-stack +30% Offense breakpoint.")]), endlessRanks()],
    risks: ["Spending every Special just to trigger an assist can waste critical control/recovery cooldowns."],
  },
  malachor: {
    title: "Malachor · Open Dark Side Combat Mission",
    summary: "Drain Essence removes 25% Max Health/Protection from every other ally, grants the acting unit 5% Offense per ally affected and a bonus turn. Rebels below 40% Health become Cornered (+30% Offense and a Rebel assist on ability use); healing above 70% removes Cornered but grants permanent Offense.",
    stages: [stage("thresholds", "Convert Drain Essence before Rebels snowball", [step("cost", "Treat Drain Essence as a real durability cost, not a free bonus turn.", "critical"), step("cornered", "Finish or control Rebels that drop below 40% and become Cornered before their abilities trigger extra assists.", "critical"), step("heal", "Avoid repeatedly letting a dangerous Rebel heal above 70%; each Cornered removal grants another permanent Offense stack.")])],
    risks: ["Repeated Cornered→healed cycles can permanently ramp enemy Rebel Offense."],
  },
  vandor: {
    title: "Vandor · Open Mixed Combat Mission",
    summary: "Sabacc Shift alternates temporary Health Up/Health Down. Boxed In applies unpreventable Healing Immunity and modifier DoTs, but an enemy that damages the indestructible Crate recovers 50% Health/Protection unpreventably and removes those modifier DoTs.",
    stages: [stage("boxed", "Maintain pressure through Crate resets", [step("crate", "Healing Immunity does not stop the Crate's 50% Health/Protection recovery.", "critical"), step("dot", "A Crate hit also removes Boxed In's modifier DoTs from that enemy."), step("sabacc", "Treat Sabacc Shift as Health Up/Health Down state management, not a dice/attack-roll system.")])],
    risks: ["Healing Immunity does not prevent Boxed In Crate recovery."],
  },
  kafrene: {
    title: "Ring of Kafrene · Open Light Side Combat Mission",
    summary: "Critical Intel secretly assigns one allied and one enemy Informant. Critical hits reveal them; the first Informant defeated awards the surviving Informant's side +50% Armor Penetration/Critical Chance, +25% Critical Damage and +20 Speed.",
    stages: [stage("informant", "Win the first-Informant-defeat race", [step("reveal", "Use safe critical hits to reveal the enemy Informant."), step("protect", "If your Informant is revealed, preserve it; losing it first can hand the enemy the Critical Intel package.", "critical"), step("enemy", "Once the enemy Informant is known, prioritize its defeat while your Informant remains active.", "critical", { target: "Enemy Informant" }), imperialSupremacy()])],
    risks: ["Losing your Informant first can award the enemy the major Critical Intel stat package."],
  },
  "death-star": {
    title: "Death Star · Open Dark Side Combat Mission",
    summary: "Volatile Energies/Superlaser starts at 0%, gains 5% at the start of each unit's turn and increases damage by stored energy. At full charge, Superlaser Blast destroys a target with an unavoidable anti-revive defeat.",
    stages: [stage("laser", "Control the Superlaser energy race", [step("track", "Track both sides' 5%-per-turn energy climb and rising normal damage.", "critical"), step("control", "Use control or fast kills against enemies approaching dangerous energy levels."), step("execute", "At full charge, spend Superlaser Blast on the highest-value legal target when the anti-revive removal creates the best closeout.", "critical", { ability: "Superlaser Blast" })])],
    risks: ["Hoth's Deadly Storm/Smells Bad on the Outside does not apply on Death Star."],
  },
  hoth: {
    title: "Hoth · Open Mixed Combat Mission",
    summary: "Frostbite is unavoidable each start of turn, removes 2% Critical Chance/Potency/Speed per stack and defeats the unit at 10; Thermoregulate removes two stacks. Deadly Storm separately reduces combat stats and deals 10% Max-Health start-turn damage until Smells Bad on the Outside removes it from self.",
    stages: [stage("cold", "Manage Deadly Storm and Frostbite separately", [step("storm", "Use Smells Bad on the Outside when clearing Deadly Storm from a key unit creates the best combat-stat window.", "critical", { ability: "Smells Bad on the Outside" }), step("frostbite", "Track Frostbite on every essential ally; 10 stacks defeats the unit regardless of current Health/Protection.", "critical"), step("thermo", "Use Thermoregulate before a core ally reaches the dangerous Frostbite threshold.", "critical", { ability: "Thermoregulate" }), step("bacta", "Treat the first would-be-defeat Bacta rescue as insurance, not a replacement for Frostbite control.")])],
    risks: ["Full Health/Protection does not protect a unit at 10 Frostbite stacks."],
  },
  scarif: {
    title: "Scarif · Open Light Side Combat Mission",
    summary: "Every 10 turns all characters take massive unavoidable damage, while Endless Ranks may give Imperial Troopers a shared revive pool. Track the global pulse, preserve recovery/revive resources for its aftermath and repeatedly defeat Troopers until their shared stacks are exhausted.",
    stages: [stage("pulse", "Prepare for the 10-turn massive-damage pulse", [step("count", "Track the global turn cadence; every 10 turns all characters take massive damage that cannot be evaded.", "critical"), step("resources", "Hold the strongest recovery/revive/prevention resource when practical for the pulse aftermath.")]), endlessRanks()],
    risks: ["A healthy-looking team can still collapse to the next Scarif pulse if recovery resources are exhausted."],
  },
});

const missionCounts = Object.freeze({ mustafar: 3, corellia: 1, coruscant: 2, geonosis: 3, felucia: 1, bracca: 2, dathomir: 2, tatooine: 1, kashyyyk: 2, haven: 4, kessel: 2, lothal: 1, mandalore: 1, malachor: 3, vandor: 2, kafrene: 3, "death-star": 2, hoth: 2, scarif: 2 });
const cache = new Map();

function identity(id) {
  const match = String(id || "").match(/^(.+)-generic-(\d+)$/);
  if (!match) return null;
  const planetId = match[1];
  const index = Number(match[2]);
  return Number.isInteger(missionCounts[planetId]) && index >= 1 && index <= missionCounts[planetId] ? { planetId, index } : null;
}

function mandalorePartial(id, index) {
  return Object.freeze({
    id: `${id}-v1`, missionId: id, title: `Mandalore · Open Combat Mission ${index}`,
    status: "official-modifier-partial", confidence: "official-existence-community-battle-reference-partial", lastVerified: "2026-08-16",
    sources: [source("cg-mandalore"), source("cg-eleventh-hour-fix"), source("bitdynasty-mandalore")],
    summary: "Mandalore uses the Eleventh Hour modifier and has community-tested Phase 4 clears. Capital Games corrected Eleventh Hour to specify that defeated summoned allies are excluded, but the complete modifier rule text is not exposed by the indexed authoritative source used here. The app therefore keeps this open mission partial rather than inventing the missing rule.",
    keyUnits: [], keyAbilities: [],
    stages: [stage("evidence", "Stay inside verified Mandalore evidence", [step("summons", "Do not count defeated summoned allies toward Eleventh Hour behavior.", "critical"), step("pending", "Keep detailed Eleventh Hour sequencing pending until the complete authoritative modifier text is normalized.", "critical")])],
    targetPriorities: [], failureRisks: ["Inferring the missing Eleventh Hour rule from its name would create unsupported strategy data."],
    evidenceBoundary: "Mandalore Bonus Zone and Eleventh Hour are official, and CG explicitly corrected the modifier to exclude defeated summoned allies. The complete modifier text is not currently normalized, so this mission is intentionally partial.",
  });
}

function build(id, parsed) {
  if (parsed.planetId === "mandalore") return mandalorePartial(id, parsed.index);
  const template = templates[parsed.planetId];
  if (!template) return null;
  return Object.freeze({
    id: `${id}-v1`, missionId: id, title: `${template.title} ${parsed.index}`,
    status: "verified-mechanic-core", confidence: "official-planet-mechanic-core", lastVerified: "2026-08-16",
    sources: officialSources(), summary: template.summary, keyUnits: [], keyAbilities: [], stages: template.stages,
    targetPriorities: [], failureRisks: template.risks || [],
    evidenceBoundary: "The planet modifier and generic mission context are official Capital Games mechanics. This pack provides modifier-first execution guidance and does not fabricate an encounter-specific kill order where one has not been independently normalized.",
  });
}

export function roteGenericBattleStrategyForMission(missionId) {
  const id = String(missionId || "");
  const parsed = identity(id);
  if (!parsed) return null;
  if (!cache.has(id)) cache.set(id, build(id, parsed));
  return cache.get(id) || null;
}

export const ROTE_GENERIC_MISSION_COUNTS = missionCounts;
