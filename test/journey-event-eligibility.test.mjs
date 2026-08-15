import assert from "node:assert/strict";
import test from "node:test";
import {
  JOURNEY_EVENT_PROFILES,
  buildEventCandidatePlan,
  eligibleCatalogPool,
  eventProfileById,
  normalizeCandidateName,
  unitHasFaction,
} from "../public/journey-event-eligibility.js";

function unit(baseId, name, faction, extra = {}) {
  return {
    baseId,
    name,
    unitType: "Character",
    combatType: 1,
    factions: faction ? [faction] : [],
    categories: faction ? [`affiliation_${String(faction).toLowerCase().replaceAll(" ", "_")}`] : [],
    ...extra,
  };
}

function live(baseId, name, stars, power = 0, extra = {}) {
  return { baseId, name, stars, power, level: 85, gear: 12, relic: 0, ...extra };
}

test("normalizes punctuation variants without weakening pool verification", () => {
  assert.equal(normalizeCandidateName("Garazeb ‘Zeb’ Orrelios"), normalizeCandidateName('Garazeb "Zeb" Orrelios'));
});

test("Rebel-tagged unit outside verified event pool is rejected", () => {
  const profile = eventProfileById("LEGACY_EMPERORPALPATINE");
  const catalog = [
    unit("CLS", "Commander Luke Skywalker", "Rebel"),
    unit("FUTURE", "Future Rebel", "Rebel"),
  ];
  const result = eligibleCatalogPool(profile, catalog);
  assert.deepEqual(result.eligible.map((item) => item.baseId), ["CLS"]);
});

test("verified name with wrong faction is rejected", () => {
  const profile = eventProfileById("LEGACY_GRANDADMIRALTHRAWN");
  const result = eligibleCatalogPool(profile, [unit("HERA", "Hera Syndulla", "Rebel")]);
  assert.equal(result.eligible.length, 0);
});

test("raw current categories can verify faction even if humanized factions are absent", () => {
  const candidate = { baseId: "HERA", name: "Hera Syndulla", unitType: "Character", combatType: 1, categories: ["affiliation_phoenix"] };
  assert.equal(unitHasFaction(candidate, "Phoenix"), true);
});

test("Phoenix event pool only accepts current verified Phoenix names", () => {
  const profile = eventProfileById("LEGACY_GRANDADMIRALTHRAWN");
  const catalog = [
    unit("HERA", "Hera Syndulla", "Phoenix"),
    unit("EZRA", "Ezra Bridger", "Phoenix"),
    unit("FUTURE", "Future Phoenix", "Phoenix"),
  ];
  const result = eligibleCatalogPool(profile, catalog);
  assert.deepEqual(result.eligible.map((item) => item.baseId), ["EZRA", "HERA"]);
});

test("Daring Droid does not accept arbitrary Empire-tagged characters", () => {
  const profile = eventProfileById("LEGACY_R2D2");
  const catalog = [
    unit("VADER", "Darth Vader", "Empire"),
    unit("UNVERIFIED", "Unverified Large Empire Unit", "Empire"),
  ];
  const result = eligibleCatalogPool(profile, catalog);
  assert.deepEqual(result.eligible.map((item) => item.baseId), ["VADER"]);
});

test("best five prioritizes final-tier legal candidates then stars and live power", () => {
  const profile = eventProfileById("LEGACY_GRANDADMIRALTHRAWN");
  const catalog = [
    unit("HERA", "Hera Syndulla", "Phoenix"),
    unit("EZRA", "Ezra Bridger", "Phoenix"),
    unit("KANAN", "Kanan Jarrus", "Phoenix"),
    unit("SABINE", "Sabine Wren", "Phoenix"),
    unit("CHOPPER", "Chopper", "Phoenix"),
    unit("REX", "Captain Rex", "Phoenix"),
  ];
  const liveUnits = [
    live("HERA", "Hera Syndulla", 7, 10000),
    live("EZRA", "Ezra Bridger", 7, 20000),
    live("KANAN", "Kanan Jarrus", 7, 15000),
    live("SABINE", "Sabine Wren", 6, 50000),
    live("CHOPPER", "Chopper", 7, 12000),
    live("REX", "Captain Rex", 7, 30000),
  ];
  const result = buildEventCandidatePlan(profile, catalog, liveUnits);
  assert.deepEqual(result.bestFive.map((item) => item.baseId), ["REX", "EZRA", "KANAN", "CHOPPER", "HERA"]);
  assert.equal(result.complete, true);
});

test("four final-tier eligible owned characters is not final-tier ready", () => {
  const profile = eventProfileById("LEGACY_C3PO");
  const catalog = [
    unit("TEebo", "Teebo", "Ewok"),
    unit("WICKET", "Wicket", "Ewok"),
    unit("PAPLOO", "Paploo", "Ewok"),
    unit("ELDER", "Ewok Elder", "Ewok"),
    unit("CHIRPA", "Chief Chirpa", "Ewok"),
  ];
  const liveUnits = catalog.slice(0, 4).map((item, index) => live(item.baseId, item.name, 7, 10000 + index));
  const result = buildEventCandidatePlan(profile, catalog, liveUnits);
  assert.equal(result.finalTierEligibleCount, 4);
  assert.equal(result.complete, false);
});

test("future faction members fail closed until explicitly verified", () => {
  const profile = eventProfileById("LEGACY_PADME");
  const future = unit("FUTURESEP", "Brand New Separatist", "Separatist");
  const result = buildEventCandidatePlan(profile, [future], [live("FUTURESEP", future.name, 7, 99999)]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.complete, false);
});

test("legacy profile identities match current Journey Guide activity identities", () => {
  const expected = new Map([
    ["EMPERORPALPATINE", "progressionevent_EMPERORS_END"],
    ["GRANDMASTERYODA", "progressionevent_GRANDMASTERS_TRAINING"],
    ["GRANDADMIRALTHRAWN", "progressionevent_ARTIST_OF_WAR"],
    ["R2D2_LEGENDARY", "progressionevent_DARING_DROID"],
    ["BB8", "progressionevent_PIECES_AND_PLANS"],
    ["PADMEAMIDALA", "progressionevent_AGGRESSIVE_NEGOTIATIONS"],
    ["CHEWBACCALEGENDARY", "progressionevent_ONE_FAMOUS_WOOKIEE"],
    ["C3POLEGENDARY", "progressionevent_CONTACT_PROTOCOL"],
  ]);
  assert.equal(JOURNEY_EVENT_PROFILES.length, expected.size);
  for (const profile of JOURNEY_EVENT_PROFILES) assert.equal(profile.activityId, expected.get(profile.targetBaseId));
});
