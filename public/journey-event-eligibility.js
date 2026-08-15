const VERIFIED_AT = "2026-08-15";
const GAME_DATA_VERSION = "0.40.5";

function profile({ id, targetBaseId, name, activityId, faction, verifiedNames, notes = "" }) {
  return Object.freeze({
    id,
    targetBaseId,
    name,
    activityId,
    group: "Legacy Event Eligibility",
    requiredCount: 5,
    targetStars: 7,
    faction,
    selectionMode: "ANY_VERIFIED_POOL",
    verification: Object.freeze({ checkedAt: VERIFIED_AT, gameDataVersion: GAME_DATA_VERSION }),
    verifiedNames: Object.freeze(verifiedNames),
    notes,
  });
}

export const JOURNEY_EVENT_PROFILES = Object.freeze([
  profile({
    id: "LEGACY_EMPERORPALPATINE",
    targetBaseId: "EMPERORPALPATINE",
    name: "Emperor Palpatine",
    activityId: "progressionevent_EMPERORS_END",
    faction: "Rebel",
    verifiedNames: [
      "Threepio & Chewie", "Cassian Andor", "Lando Calrissian", "Commander Luke Skywalker", "Luke Skywalker (Farmboy)",
      "Obi-Wan Kenobi (Old Ben)", "Captain Rex", "Cara Dune", "Hoth Rebel Soldier", "Bistan", "Chirrut Îmwe",
      "Stormtrooper Luke", "Biggs Darklighter", "Lobot", "Bodhi Rook", "Kleya Marki", "Vel Sartha", "Captain Drogan",
      "Garazeb ‘Zeb’ Orrelios", "Garazeb \"Zeb\" Orrelios", "Hoth Rebel Scout", "Cassian Andor (Undercover)", "Stormtrooper Han",
      "Ahsoka Tano (Fulcrum)", "Princess Leia", "Admiral Raddus", "Kanan Jarrus", "Rebel Officer Leia Organa", "Pao", "K-2SO",
      "Chewbacca", "Han Solo", "Captain Han Solo", "Admiral Ackbar", "C-3PO", "Luthen Rael", "Hera Syndulla", "R2-D2",
      "Sabine Wren", "Baze Malbus", "Scarif Rebel Pathfinder", "Saw Gerrera", "Jyn Erso", "Wedge Antilles", "Mon Mothma",
      "Leia Organa", "Chopper", "Ezra Bridger", "Cinta Kaz", "Kyle Katarn",
    ],
  }),
  profile({
    id: "LEGACY_GRANDMASTERYODA",
    targetBaseId: "GRANDMASTERYODA",
    name: "Grand Master Yoda",
    activityId: "progressionevent_GRANDMASTERS_TRAINING",
    faction: "Jedi",
    verifiedNames: [
      "Hermit Yoda", "Ezra Bridger (Exile)", "Obi-Wan Kenobi (Old Ben)", "Yoda & Chewie", "Temple Guard", "Qui-Gon Jinn",
      "Barriss Offee", "Bastila Shan", "Eeth Koth", "Ahsoka Tano (Snips)", "Satele Shan", "Padawan Obi-Wan", "Jedi Consular",
      "General Skywalker", "Kelleran Beq", "Depa Billaba", "General Kenobi", "Jedi Master Kenobi", "Aayla Secura", "Plo Koon",
      "Kanan Jarrus", "Ima-Gun Di", "Grand Master Yoda", "Jedi Knight Luke Skywalker", "Luminara Unduli",
      "Jedi Master Luke Skywalker", "Jedi Knight Cal Kestis", "Kit Fisto", "Master Qui-Gon", "Jedi Master Mace Windu", "Jocasta Nu",
      "Ki-Adi-Mundi", "Jedi Knight Guardian", "Shaak Ti", "Jedi Knight Revan", "Mace Windu", "Jedi Knight Anakin", "Jolee Bindo",
      "Juhani", "Ezra Bridger", "Kyle Katarn",
    ],
  }),
  profile({
    id: "LEGACY_GRANDADMIRALTHRAWN",
    targetBaseId: "GRANDADMIRALTHRAWN",
    name: "Grand Admiral Thrawn",
    activityId: "progressionevent_ARTIST_OF_WAR",
    faction: "Phoenix",
    verifiedNames: [
      "Captain Rex", "Garazeb ‘Zeb’ Orrelios", "Garazeb \"Zeb\" Orrelios", "Kanan Jarrus", "Hera Syndulla", "Sabine Wren", "Chopper", "Ezra Bridger",
    ],
    notes: "Any combination must still come from the verified Phoenix event pool.",
  }),
  profile({
    id: "LEGACY_R2D2",
    targetBaseId: "R2D2_LEGENDARY",
    name: "R2-D2",
    activityId: "progressionevent_DARING_DROID",
    faction: "Empire",
    verifiedNames: [
      "Colonel Starck", "Imperial Super Commando", "Moff Gideon", "Darth Vader", "General Veers", "Fifth Brother",
      "Darth Vader (Duel’s End)", "Darth Vader (Duel's End)", "KX Security Droid", "Magmatrooper", "Emperor Palpatine", "RC-1262 ‘Scorch’",
      "RC-1262 \"Scorch\"", "Second Sister", "Snowtrooper", "Major Partagaz", "Royal Guard", "Imperial Probe Droid",
      "Disguised Clone Trooper", "Admiral Piett", "CC-1119 ‘Appo’", "CC-1119 \"Appo\"", "Director Krennic", "Lord Vader",
      "Ninth Sister", "Mara Jade, The Emperor’s Hand", "Mara Jade, The Emperor's Hand", "Range Trooper", "Third Sister",
      "Grand Moff Tarkin", "CX-2", "Gar Saxon", "Shoretrooper", "Scout Trooper", "Grand Inquisitor", "Dark Trooper", "Dedra Meero",
      "Stormtrooper", "Seventh Sister", "Death Trooper", "Inquisitor Barriss", "Eighth Brother", "Dark Trooper Moff Gideon",
      "TIE Fighter Pilot", "Iden Versio", "Grand Admiral Thrawn",
    ],
    notes: "Daring Droid has event-specific exclusions; the verified allowlist intentionally prevents arbitrary Empire-tagged units from entering suggestions.",
  }),
  profile({
    id: "LEGACY_BB8",
    targetBaseId: "BB8",
    name: "BB-8",
    activityId: "progressionevent_PIECES_AND_PLANS",
    faction: "First Order",
    verifiedNames: [
      "First Order SF TIE Pilot", "Captain Phasma", "First Order TIE Pilot", "First Order Stormtrooper", "Supreme Leader Kylo Ren",
      "First Order Officer", "General Hux", "Kylo Ren (Unmasked)", "Sith Trooper", "Rey (Dark Side Vision)",
      "First Order Executioner", "Kylo Ren",
    ],
  }),
  profile({
    id: "LEGACY_PADME",
    targetBaseId: "PADMEAMIDALA",
    name: "Padmé Amidala",
    activityId: "progressionevent_AGGRESSIVE_NEGOTIATIONS",
    faction: "Separatist",
    verifiedNames: [
      "Poggle the Lesser", "Sun Fac", "Droideka", "Geonosian Spy", "IG-100 MagnaGuard", "Admiral Trench", "Asajj Ventress",
      "STAP", "General Grievous", "Nute Gunray", "Jango Fett", "Geonosian Soldier", "Geonosian Brood Alpha", "Count Dooku",
      "B1 Battle Droid", "B2 Super Battle Droid", "Wat Tambor",
    ],
  }),
  profile({
    id: "LEGACY_CHEWBACCA",
    targetBaseId: "CHEWBACCALEGENDARY",
    name: "Chewbacca",
    activityId: "progressionevent_ONE_FAMOUS_WOOKIEE",
    faction: "Bounty Hunter",
    verifiedNames: [
      "Jabba the Hutt", "IG-88", "Cad Bane", "Embo", "4-LOM", "Zam Wesell", "Dengar", "Aurra Sing", "Zuckuss",
      "Boushh (Leia Organa)", "Asajj Ventress (Dark Disciple)", "Jango Fett", "Boba Fett, Scion of Jango", "Fennec Shand",
      "The Mandalorian", "Bossk", "Greef Karga", "Krrsantan", "Greedo", "Boba Fett", "IG-90",
    ],
  }),
  profile({
    id: "LEGACY_C3PO",
    targetBaseId: "C3POLEGENDARY",
    name: "C-3PO",
    activityId: "progressionevent_CONTACT_PROTOCOL",
    faction: "Ewok",
    verifiedNames: ["Teebo", "Princess Kneesaa", "Wicket", "Paploo", "Ewok Elder", "Logray", "Ewok Scout", "Chief Chirpa"],
  }),
]);

export function normalizeCandidateName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizedSet(values = []) {
  return new Set(values.map(normalizeCandidateName).filter(Boolean));
}

function factionTokens(unit) {
  const factions = Array.isArray(unit?.factions) ? unit.factions : [];
  const categories = Array.isArray(unit?.categories) ? unit.categories : [];
  return normalizedSet([
    ...factions,
    ...categories.map((category) => String(category).replace(/^(affiliation|profession)_/i, "").replaceAll("_", " ")),
  ]);
}

export function unitHasFaction(unit, faction) {
  return factionTokens(unit).has(normalizeCandidateName(faction));
}

function isCharacter(unit) {
  return String(unit?.unitType || "").toLowerCase() === "character" || Number(unit?.combatType || 0) === 1;
}

export function eligibleCatalogPool(profileConfig, catalog = []) {
  if (!profileConfig) return { eligible: [], unresolvedVerifiedNames: [] };
  const allowed = normalizedSet(profileConfig.verifiedNames || []);
  const eligible = (Array.isArray(catalog) ? catalog : [])
    .filter((unit) => isCharacter(unit))
    .filter((unit) => unitHasFaction(unit, profileConfig.faction))
    .filter((unit) => allowed.has(normalizeCandidateName(unit?.name)))
    .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
  const resolvedNames = normalizedSet(eligible.map((unit) => unit?.name));
  const unresolvedVerifiedNames = [...new Set((profileConfig.verifiedNames || [])
    .filter((name) => !resolvedNames.has(normalizeCandidateName(name))))];
  return { eligible, unresolvedVerifiedNames };
}

function unitProgress(unit) {
  return {
    stars: Number(unit?.stars ?? unit?.rarity ?? 0),
    level: Number(unit?.level ?? 0),
    gear: Number(unit?.gear ?? unit?.gearTier ?? unit?.gearLevel ?? 0),
    relic: Number(unit?.relic ?? unit?.relicTier ?? unit?.relicLevel ?? 0),
    power: Number(unit?.power ?? 0),
  };
}

function compareCandidates(a, b) {
  return Number(b.finalTierReady) - Number(a.finalTierReady)
    || b.stars - a.stars
    || b.power - a.power
    || b.relic - a.relic
    || b.gear - a.gear
    || a.name.localeCompare(b.name);
}

export function buildEventCandidatePlan(profileConfig, catalog = [], liveUnits = []) {
  const { eligible, unresolvedVerifiedNames } = eligibleCatalogPool(profileConfig, catalog);
  const liveMap = new Map((Array.isArray(liveUnits) ? liveUnits : []).map((unit) => [String(unit?.baseId || ""), unit]));
  const candidates = eligible.map((catalogUnit) => {
    const live = liveMap.get(String(catalogUnit?.baseId || "")) || null;
    const progress = unitProgress(live || {});
    return {
      baseId: String(catalogUnit?.baseId || ""),
      name: String(live?.name || catalogUnit?.name || catalogUnit?.baseId || "Unknown"),
      image: String(live?.image || catalogUnit?.image || ""),
      owned: Boolean(live?.baseId),
      ...progress,
      finalTierReady: Boolean(live?.baseId) && progress.stars >= Number(profileConfig?.targetStars || 7),
      verified: true,
      factionVerified: true,
    };
  }).sort(compareCandidates);

  const ownedCandidates = candidates.filter((candidate) => candidate.owned);
  const bestFive = ownedCandidates.slice(0, Number(profileConfig?.requiredCount || 5));
  const finalTierEligible = candidates.filter((candidate) => candidate.finalTierReady);
  const requiredCount = Number(profileConfig?.requiredCount || 5);
  const targetStars = Number(profileConfig?.targetStars || 7);
  const starProgress = Array.from({ length: requiredCount }, (_, index) => {
    const candidate = bestFive[index];
    return candidate ? Math.min(1, candidate.stars / targetStars) : 0;
  });
  const percent = Math.round((starProgress.reduce((sum, value) => sum + value, 0) / requiredCount) * 100);

  return {
    profile: profileConfig,
    poolSize: candidates.length,
    ownedCount: ownedCandidates.length,
    finalTierEligibleCount: finalTierEligible.length,
    requiredCount,
    targetStars,
    complete: finalTierEligible.length >= requiredCount,
    percent,
    candidates,
    bestFive,
    unresolvedVerifiedNames,
    verificationWarnings: unresolvedVerifiedNames.length
      ? [`${unresolvedVerifiedNames.length} verified pool name(s) did not resolve against the current local catalog; they are excluded until remapped.`]
      : [],
  };
}

export function eventProfileById(id) {
  return JOURNEY_EVENT_PROFILES.find((item) => item.id === id) || null;
}
