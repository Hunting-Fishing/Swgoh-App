const step = (id, instruction, extra = {}) => ({ id, instruction, ...extra });
const stage = (id, label, steps, extra = {}) => ({ id, label, steps, ...extra });

export const ROTE_DEATHSTAR_SOURCES = Object.freeze([
  { id: "cg-rote-details", label: "Capital Games · Rise of the Empire Death Star modifier and requirements", kind: "official", url: "https://forums.ea.com/discussions/swgoh-general-discussion-en/new-territory-battle---rise-of-the-empire-details/10661373" },
  { id: "swgohgg-vader", label: "SWGOH.GG · Darth Vader current kit", kind: "current-reference", url: "https://swgoh.gg/units/darth-vader/" },
  { id: "swgohgg-iden", label: "SWGOH.GG · Iden Versio current kit", kind: "current-reference", url: "https://swgoh.gg/units/iden-versio/" },
  { id: "starwarsfans-deathstar-vader", label: "StarWars-fans · Death Star Darth Vader combat walkthrough", kind: "community-tested", url: "https://starwars-fans.com/2026/01/swgoh-rote-territory-battle-phase-6-death-star-darth-vader-combat-mission-walkthrough-tips/" },
  { id: "starwarsfans-rote-hub", label: "StarWars-fans · ROTE battle team hub", kind: "community-reference", url: "https://starwars-fans.com/rote-special-missions/" },
]);

const sources = (...ids) => ROTE_DEATHSTAR_SOURCES.filter((source) => ids.includes(source.id));

export const ROTE_DEATHSTAR_STRATEGIES = Object.freeze({
  "death-star-vader": Object.freeze({
    id: "death-star-vader-v2",
    missionId: "death-star-vader",
    title: "Death Star · Darth Vader Solo Combat Mission",
    status: "community-tested-high-risk",
    confidence: "official-modifier-current-kit-community-partial",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-vader", "starwarsfans-deathstar-vader"),
    summary: "This is an R9 Darth Vader solo mission and should be treated as survivability-sensitive rather than a routine relic check. Death Star's Volatile Energies/Superlaser mechanic starts at 0% energy, gains 5% at the start of each unit's turn, and increases that unit's damage by its current energy. At full energy the granted Superlaser Blast can expend the charge to destroy a target with anti-revive. Vader's Merciless Massacre and Ability Block remain the main tempo tools while both sides race toward lethal Superlaser windows.",
    requiredLeaderBaseId: "VADER",
    keyUnits: [
      { baseId: "VADER", name: "Darth Vader", importance: "critical", reason: "Officially required solo unit at R9." },
    ],
    keyAbilities: [
      { baseId: "VADER", abilityName: "Merciless Massacre", importance: "critical", expected: "Sequential bonus turns against marked enemies", reason: "Primary control/tempo resource; use its extra actions to reduce enemy pressure while advancing Vader's own Superlaser energy on subsequent full turns." },
      { baseId: "VADER", abilityName: "Terrifying Swing", importance: "high", expected: "Ability Block against Jedi/Rebel targets", reason: "Limit dangerous enemy specials during the solo control cycle." },
      { baseId: "VADER", abilityName: "Force Crush", importance: "high", expected: "AOE Damage Over Time and Speed Down", reason: "Sets up Vader's debuff-based damage while preserving the solo survival plan." },
    ],
    stages: [
      stage("energy-race", "Opening · control the Superlaser energy race", [
        step("track-energy", "Track both Vader's and the enemy side's Volatile Energies. Each unit gains 5% energy at the start of its turn and deals increased damage equal to its stored energy.", { priority: "critical" }),
        step("merciless", "Use Merciless Massacre as the primary tempo window to spread Ability Block/debuff pressure and reduce the number of dangerous enemy actions Vader must absorb.", { priority: "critical", ability: "Merciless Massacre" }),
        step("do-not-invent-cleanse", "Do not look for a Deadly Storm cleanse or 'Smells Bad on the Outside' button here; those belong to Hoth's Bacta Tanks modifier, not Death Star.", { priority: "critical" }),
      ], { objective: "Survive long enough to convert Vader's control and rising energy into a decisive turn." }),
      stage("superlaser", "Full energy · spend Superlaser deliberately", [
        step("execute", "When Superlaser Blast is fully energized, use it on the highest-value legal enemy when the instant defeat materially shortens the fight; the defeat cannot be evaded and the target cannot revive.", { priority: "critical", ability: "Superlaser Blast" }),
        step("survival", "Do not delay a safe Superlaser execution merely for a larger normal-damage number if Vader is at risk of losing the solo mission first.", { priority: "high" }),
      ], { objective: "Convert 100% energy into an anti-revive instant defeat before the enemy's own escalating energy becomes lethal." }),
    ],
    targetPriorities: [
      { target: "Highest-impact enemy special-ability threat", priority: "critical", when: "Merciless/Ability Block or Superlaser window", reason: "In a solo battle, reducing incoming enemy actions has higher survival value than spreading damage." },
    ],
    failureRisks: [
      "R9 is only the entry gate; community attempts document losses at R9 and remod sensitivity.",
      "Ignoring the escalating Volatile Energies damage bonus makes later enemy turns progressively more dangerous.",
      "Hoth's Deadly Storm/Bacta Tank mechanics must never be applied to this Death Star mission.",
    ],
    evidenceBoundary: "The R9 Darth Vader requirement and Volatile Energies/Superlaser behavior are official. Vader sequencing and high-risk survivability guidance are community-tested. No guaranteed clear rate or fabricated odds are generated.",
  }),

  "death-star-iden": Object.freeze({
    id: "death-star-iden-v2",
    missionId: "death-star-iden",
    title: "Death Star · Iden Versio Combat Mission",
    status: "community-reference-partial",
    confidence: "official-modifier-current-kit-community-team-reference",
    lastVerified: "2026-08-16",
    sources: sources("cg-rote-details", "swgohgg-iden", "starwarsfans-rote-hub"),
    summary: "A current community reference uses Iden Versio with Supreme Leader Kylo Ren, Darth Malgus, Darth Malak and Sith Empire Trooper at R9+. That mixed Dark Side shell does not satisfy Iden's normal all-non-Droid-Imperial-Trooper/no-other-Leader conditional engine, so do not model her Trooper revive loop as active. Instead, use Iden's unconditional control where applicable while tracking Death Star's Volatile Energies: energy rises 5% at each unit's turn, amplifies damage, and at full charge unlocks an anti-revive Superlaser instant defeat.",
    keyUnits: [
      { baseId: "IDENVERSIO", name: "Iden Versio", importance: "critical", reason: "Mission-mandatory R9 unit." },
      { baseId: "SUPREMELEADERKYLOREN", name: "Supreme Leader Kylo Ren", importance: "helpful", reason: "Published community mixed Dark Side shell; not an official entry requirement." },
      { baseId: "DARTHMALGUS", name: "Darth Malgus", importance: "helpful", reason: "Published community durability shell." },
      { baseId: "DARTHMALAK", name: "Darth Malak", importance: "helpful", reason: "Published community durability shell." },
      { baseId: "SITHTROOPER", name: "Sith Empire Trooper", importance: "helpful", reason: "Published fifth member of the mixed Dark Side shell." },
    ],
    keyAbilities: [
      { baseId: "IDENVERSIO", abilityName: "Push Forward", importance: "helpful", expected: "AOE Vulnerable plus target dispel, Healing Immunity and Stun; Rebel control is unresistable", reason: "Its unconditional control remains useful even when Iden's conditional Imperial Trooper branches are disabled by the mixed squad." },
      { baseId: "IDENVERSIO", abilityName: "We Can Grieve Later", importance: "info", expected: "Imperial Trooper cleanse/protection; conditional branch depends on no other Leader-tag ally", reason: "Do not assume the full conditional package is active in the published SLKR mixed shell." },
    ],
    stages: [
      stage("opening", "Opening · separate real synergies from conditional ones", [
        step("conditional", "With SLKR in the published mixed shell, do not plan around Iden's no-other-Leader or all-non-Droid-Imperial-Trooper conditional branches.", { priority: "critical" }),
        step("energy", "Track Volatile Energies on both sides. Stored energy increases normal damage and reaches a Superlaser execution at full charge.", { priority: "critical" }),
        step("control", "Use Iden's unconditional dispel/Healing Immunity/Stun control on the highest-impact Rebel target when applicable while the GL/Sith core supplies raw durability and damage.", { priority: "high", ability: "Push Forward" }),
      ], { objective: "Avoid false Iden synergy assumptions while managing the escalating Death Star damage race." }),
      stage("superlaser", "Full energy · remove the highest-value threat", [
        step("execute", "At full Superlaser energy, spend the anti-revive instant defeat on the enemy whose removal most improves the survival/closeout state.", { priority: "critical", ability: "Superlaser Blast" }),
      ], { objective: "Use the mission modifier as a controlled execution tool rather than allowing the enemy energy race to decide the fight." }),
    ],
    targetPriorities: [],
    failureRisks: [
      "Assuming Iden's full revive/assist engine is active with SLKR is incorrect because the published mixed squad does not satisfy her conditional team requirements.",
      "The available community source confirms a team shell but does not justify a deterministic wave-by-wave kill order.",
      "Hoth's Deadly Storm/Bacta Tank mechanics do not apply on Death Star.",
    ],
    evidenceBoundary: "Death Star's Volatile Energies/Superlaser mechanic and Iden's current conditional kit behavior are official/current-reference facts. The mixed SLKR/Malgus/Malak/Sith Empire Trooper composition is community-reference guidance; exact target sequencing remains intentionally unclaimed.",
  }),
});

export function roteDeathStarStrategyForMission(missionId) {
  return ROTE_DEATHSTAR_STRATEGIES[String(missionId || "")] || null;
}
