const CAPTURED_AT = "2026-08-20";

function source(name, ref, published = "") {
  return Object.freeze({ name, ref, published, capturedAt: CAPTURED_AT });
}

function referenceGuide(value) {
  return Object.freeze({
    progressionSystem: "reference-only",
    requirementsKnown: false,
    tiers: Object.freeze([]),
    ...value,
    sources: Object.freeze(value.sources || []),
  });
}

function eraGuide(value) {
  return Object.freeze({
    progressionSystem: "era",
    requirementsKnown: false,
    tiers: Object.freeze([]),
    ...value,
    tiers: Object.freeze((value.tiers || []).map((tier) => Object.freeze({
      ...tier,
      requiredNames: Object.freeze(tier.requiredNames || []),
    }))),
    sources: Object.freeze(value.sources || []),
  });
}

/**
 * Current Journey Guide evidence that does not fit the legacy STAR/GEAR/RELIC
 * preset contract in farm-presets.js.
 *
 * IMPORTANT:
 * - These records are display/provenance records until their exact progression
 *   evidence can be represented by our roster contract.
 * - Era Journey readiness must NOT be reduced to a percentage from legacy
 *   Relic/Gear fields. Era Level is a separate progression system.
 */
export const CURRENT_JOURNEY_GUIDES = Object.freeze([
  referenceGuide({
    id: "CURRENT_JMMW",
    name: "Jedi Master Mace Windu",
    targetName: "Jedi Master Mace Windu",
    journeyTier: 3,
    category: "Journey Guide",
    availabilityLabel: "PERMANENT",
    statusNote: "Capital Games made the Jedi Master Mace Windu event permanently available in August 2026.",
    sources: [
      source(
        "SWGOH.GG · Journey Guide Reorganization",
        "https://swgoh.gg/news/upcoming-cantina-update-more/",
        "2026-05"
      ),
      source(
        "SWGOH.GG · JMMW Event Now Permanent",
        "https://swgoh.gg/news/",
        "2026-08"
      ),
    ],
  }),
  referenceGuide({
    id: "CURRENT_CASSIAN_UNDERCOVER",
    name: "Cassian Andor (Undercover)",
    targetName: "Cassian Andor (Undercover)",
    journeyTier: 4,
    category: "Journey Guide",
    availabilityLabel: "2026 RERUN",
    statusNote: "The August 2026 Cassian Andor Journey Guide rerun window was extended to 28 days. Exact event progression requirements are not normalized in Command Center yet.",
    sources: [
      source(
        "SWGOH.GG · Journey Guide Reorganization",
        "https://swgoh.gg/news/upcoming-cantina-update-more/",
        "2026-05"
      ),
      source(
        "SWGOH.GG · Cassian Andor Journey Guide Event Update",
        "https://swgoh.gg/news/?page=1",
        "2026-08"
      ),
    ],
  }),
  eraGuide({
    id: "CURRENT_MAUL_HATE_FUELED",
    name: "Maul (Hate-Fueled)",
    targetName: "Maul (Hate-Fueled)",
    journeyTier: 4,
    category: "Era Journey",
    availabilityLabel: "ERA JOURNEY",
    statusNote: "Maul (Hate-Fueled) was the Anniversary Era Journey unit. Era Journey units use Era Levels during their Era, so legacy Relic readiness is not substituted.",
    sources: [
      source(
        "SWGOH.GG · 10-Year Anniversary Title Update",
        "https://swgoh.gg/news/title-update-and-10-year-anniversary-announcement-post/",
        "2025-11"
      ),
      source(
        "SWGOH.GG · Journey Guide Reorganization",
        "https://swgoh.gg/news/upcoming-cantina-update-more/",
        "2026-05"
      ),
    ],
  }),
  eraGuide({
    id: "CURRENT_ROTTA_HUTT",
    name: "Rotta the Hutt",
    targetName: "Rotta the Hutt",
    category: "Era Journey",
    availabilityLabel: "2026 RERUN",
    statusNote: "Rotta the Hutt has a Journey Guide event using Era-Level progression. A June 2026 fix specifically adjusted Tier 1 materials to reach Era Level 105. Full entry requirements are not normalized here yet.",
    sources: [
      source(
        "SWGOH.GG · Update 6-29-2026",
        "https://swgoh.gg/news/update-6-29-2026/",
        "2026-06-29"
      ),
      source(
        "SWGOH.GG · Rotta Journey Guide Event Rerun",
        "https://swgoh.gg/news/",
        "2026-07"
      ),
    ],
  }),
  eraGuide({
    id: "CURRENT_DARTH_JAR_JAR",
    name: "Darth Jar Jar",
    targetName: "Darth Jar Jar",
    category: "Era Journey",
    availabilityLabel: "CURRENT ERA",
    requirementsKnown: true,
    statusNote: "Myths & Legends Era Journey. Star gates and Era-Level gates are preserved separately; Command Center withholds readiness until Era Level becomes authoritative roster evidence.",
    tiers: [
      {
        tier: 1,
        stars: 4,
        eraLevel: 90,
        eraLevelUnitName: "Yoda (Dark Side Vision)",
        requiredNames: [
          "Mara Jade Skywalker",
          "Yoda (Dark Side Vision)",
          "Starkiller (Luke Concept)",
          "Stormtrooper (Concept)",
          "Jaxxon",
        ],
      },
      {
        tier: 2,
        stars: 5,
        eraLevel: 95,
        eraLevelUnitName: "Starkiller (Luke Concept)",
        requiredNames: [
          "Mara Jade Skywalker",
          "Yoda (Dark Side Vision)",
          "Starkiller (Luke Concept)",
          "Stormtrooper (Concept)",
          "Jaxxon",
        ],
      },
      {
        tier: 3,
        stars: 6,
        eraLevel: 110,
        eraLevelUnitName: "Mara Jade Skywalker",
        requiredNames: [
          "Mara Jade Skywalker",
          "Yoda (Dark Side Vision)",
          "Starkiller (Luke Concept)",
          "Stormtrooper (Concept)",
          "Jaxxon",
          "The Ronin",
        ],
      },
      {
        tier: 4,
        stars: 7,
        eraLevel: 125,
        eraLevelUnitName: "ALL REQUIRED UNITS",
        requiredNames: [
          "Mara Jade Skywalker",
          "Yoda (Dark Side Vision)",
          "Starkiller (Luke Concept)",
          "Stormtrooper (Concept)",
          "Jaxxon",
          "The Ronin",
        ],
      },
    ],
    sources: [
      source(
        "SWGOH.GG · Era of Myths & Legends",
        "https://swgoh.gg/news/era-of-myths-legends/",
        "2026-07"
      ),
    ],
  }),
]);

export function currentJourneyGuideById(id) {
  return CURRENT_JOURNEY_GUIDES.find((guide) => guide.id === id) || null;
}
