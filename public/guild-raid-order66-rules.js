const asArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const ORDER66_RAID = Object.freeze({
  id: "order-66",
  name: "Order 66",
  evidence: "official-ea-plus-versioned-catalog",
  sourceLabel: "Capital Games · Order 66 raid announcement",
  rosterSize: 5,
  eligibilityTagHints: Object.freeze([
    "order 66 raid",
    "order66 raid",
    "raid order66 allowed",
    "raid order 66 allowed",
  ]),
  progressionBands: Object.freeze([
    Object.freeze({ id: "none", label: "No Requirement", gear: 0, relic: 0, multiplier: 1 }),
    Object.freeze({ id: "g12", label: "Gear 12", gear: 12, relic: 0, multiplier: 1.5 }),
    Object.freeze({ id: "r1", label: "Relic 1", gear: 13, relic: 1, multiplier: 2 }),
    Object.freeze({ id: "r3", label: "Relic 3", gear: 13, relic: 3, multiplier: 3 }),
    Object.freeze({ id: "r5", label: "Relic 5", gear: 13, relic: 5, multiplier: 4 }),
    Object.freeze({ id: "r7", label: "Relic 7", gear: 13, relic: 7, multiplier: 6 }),
    Object.freeze({ id: "r8", label: "Relic 8", gear: 13, relic: 8, multiplier: 9 }),
    Object.freeze({ id: "r9", label: "Relic 9", gear: 13, relic: 9, multiplier: 12 }),
  ]),
  guildMilestones: Object.freeze([
    Object.freeze({ tier: 1, score: 10_000_000, mk1: 12_500, mk2: 5_500, mk3: 500 }),
    Object.freeze({ tier: 2, score: 14_500_000, mk1: 16_500, mk2: 8_400, mk3: 1_000 }),
    Object.freeze({ tier: 3, score: 20_500_000, mk1: 16_500, mk2: 9_700, mk3: 1_250 }),
    Object.freeze({ tier: 4, score: 28_500_000, mk1: 16_500, mk2: 9_700, mk3: 1_500 }),
    Object.freeze({ tier: 5, score: 41_500_000, mk1: 16_500, mk2: 9_700, mk3: 2_000 }),
    Object.freeze({ tier: 6, score: 63_500_000, mk1: 16_500, mk2: 9_700, mk3: 2_500 }),
    Object.freeze({ tier: 7, score: 98_500_000, mk1: 16_500, mk2: 9_700, mk3: 3_000 }),
    Object.freeze({ tier: 8, score: 147_500_000, mk1: 16_500, mk2: 9_700, mk3: 4_000 }),
    Object.freeze({ tier: 9, score: 245_000_000, mk1: 16_500, mk2: 9_700, mk3: 5_250 }),
    Object.freeze({ tier: 10, score: 375_000_000, mk1: 16_500, mk2: 9_700, mk3: 6_770 }),
    Object.freeze({ tier: 11, score: 520_000_000, mk1: 16_500, mk2: 9_700, mk3: 8_770 }),
  ]),
});

const FALLBACK_EXACT_NAMES = Object.freeze([
  "Omega (Fugitive)",
  "Batcher",
  "Hunter (Mercenary)",
  "Wrecker (Mercenary)",
  "Crosshair (Scarred)",
  "CC-1119 ‘Appo’",
  "CC-1119 \"Appo\"",
  "CX-2",
  "Disguised Clone Trooper",
  "RC-1262 ‘Scorch’",
  "RC-1262 \"Scorch\"",
  "Grand Moff Tarkin",
  "Jedi Master Mace Windu",
  "Jocasta Nu",
  "Depa Bilaba",
  "Depa Billaba",
  "Jedi Temple Guard",
  "Aayla Secura",
  "Barriss Offee",
  "Eeth Koth",
  "Ima-Gun Di",
  "Jedi Consular",
  "Jedi Knight Guardian",
  "Kelleran Beq",
  "Kit Fisto",
  "Luminara Unduli",
  "Plo Koon",
  "Qui-Gon Jinn",
  "Shaak Ti",
]);

const FALLBACK_NAME_SET = new Set(FALLBACK_EXACT_NAMES.map(normalize));
const PIRATE_HINTS = new Set(["pirate", "pirates"]);
const JEDI_VANGUARD_HINTS = new Set(["jedi vanguard"]);
const DARK_CLONE_HINTS = new Set(["dark side clone trooper", "dark side clone troopers"]);

function unitLabels(unit = {}) {
  const values = [
    ...asArray(unit.factions),
    ...asArray(unit.categories),
    ...asArray(unit.categoryIds),
    ...asArray(unit.tags),
  ];
  return values.map((value) => normalize(typeof value === "string" ? value : value?.name || value?.id || value?.categoryId)).filter(Boolean);
}

function hasAnyLabel(labels, set) {
  return labels.some((label) => set.has(label));
}

export function order66EligibilityEvidence(unit = {}) {
  const labels = unitLabels(unit);
  const name = normalize(unit?.name);
  const tagMatch = labels.some((label) => ORDER66_RAID.eligibilityTagHints.some((hint) => label.includes(normalize(hint))));
  if (tagMatch) return Object.freeze({ allowed: true, source: "catalog-tag", group: "Order 66 Raid" });
  if (hasAnyLabel(labels, PIRATE_HINTS)) return Object.freeze({ allowed: true, source: "official-fallback", group: "Pirates" });
  if (hasAnyLabel(labels, JEDI_VANGUARD_HINTS)) return Object.freeze({ allowed: true, source: "official-fallback", group: "Jedi Vanguard" });
  if (hasAnyLabel(labels, DARK_CLONE_HINTS)) return Object.freeze({ allowed: true, source: "official-fallback", group: "Dark Side Clone Troopers" });
  if (FALLBACK_NAME_SET.has(name)) return Object.freeze({ allowed: true, source: "official-fallback", group: "Named Eligible" });
  return Object.freeze({ allowed: false, source: "none", group: "" });
}

export function resolveOrder66EligibleUnits(catalog = []) {
  const rows = asArray(catalog)
    .filter((unit) => String(unit?.unitType || "Character") !== "Ship")
    .map((unit) => ({ unit, evidence: order66EligibilityEvidence(unit) }))
    .filter((row) => row.evidence.allowed)
    .map((row) => Object.freeze({
      ...row.unit,
      eligibilitySource: row.evidence.source,
      raidGroup: row.evidence.group,
    }))
    .sort((a, b) => String(a.name || a.baseId).localeCompare(String(b.name || b.baseId)));
  const tagCount = rows.filter((row) => row.eligibilitySource === "catalog-tag").length;
  return Object.freeze({
    units: Object.freeze(rows),
    evidenceMode: tagCount > 0 ? "catalog-tag+fallback" : "official-fallback",
    tagResolvedCount: tagCount,
    fallbackResolvedCount: rows.length - tagCount,
  });
}

export function unitMeetsRaidBand(unit = {}, band = {}) {
  if (!unit?.baseId) return false;
  const stars = Number(unit?.stars || 0);
  const gear = Number(unit?.gear || 0);
  const relic = Number(unit?.relic || 0);
  if (Number(band?.relic || 0) > 0) return stars >= 7 && gear >= 13 && relic >= Number(band.relic);
  if (Number(band?.gear || 0) > 0) return stars >= 7 && gear >= Number(band.gear);
  return true;
}
