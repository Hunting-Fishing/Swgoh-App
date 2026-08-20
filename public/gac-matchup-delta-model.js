import { squadAbilityReadiness } from "./gac-ability-intelligence.js";

const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function characterUnits(body = {}) {
  return (Array.isArray(body?.units) ? body.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() !== "ship");
}
function rosterIndex(body = {}) {
  return new Map(characterUnits(body)
    .map((unit) => [normalizeBaseId(unit?.baseId), unit])
    .filter(([id]) => Boolean(id)));
}
function sumMetric(units, key) {
  return (Array.isArray(units) ? units : []).reduce((sum, unit) => sum + finite(unit?.[key]), 0);
}
function fastestSpeed(units) {
  return (Array.isArray(units) ? units : []).reduce((max, unit) => Math.max(max, finite(unit?.speed)), 0);
}
function formatSigned(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  if (!numeric) return "0";
  return `${numeric > 0 ? "+" : "−"}${number.format(Math.abs(numeric))}`;
}
function abilityScore(readiness) {
  return readiness?.known === true && Number.isFinite(Number(readiness?.score)) ? Number(readiness.score) : null;
}
function matchupDelta(attackerUnits = [], defenderUnits = []) {
  const attackers = Array.isArray(attackerUnits) ? attackerUnits.filter(Boolean) : [];
  const defenders = Array.isArray(defenderUnits) ? defenderUnits.filter(Boolean) : [];
  if (!attackers.length || !defenders.length) {
    return Object.freeze({
      known: false,
      relicDelta: null,
      zetaDelta: null,
      omicronDelta: null,
      speedDelta: null,
      abilityDelta: null,
      attackerAbilityScore: null,
      defenderAbilityScore: null,
    });
  }

  const attackerAbility = squadAbilityReadiness(attackers);
  const defenderAbility = squadAbilityReadiness(defenders);
  const attackerAbilityScore = abilityScore(attackerAbility);
  const defenderAbilityScore = abilityScore(defenderAbility);
  const attackerFastest = fastestSpeed(attackers);
  const defenderFastest = fastestSpeed(defenders);
  const speedKnown = attackerFastest > 0 && defenderFastest > 0;

  return Object.freeze({
    known: true,
    relicDelta: sumMetric(attackers, "relic") - sumMetric(defenders, "relic"),
    zetaDelta: sumMetric(attackers, "zetas") - sumMetric(defenders, "zetas"),
    omicronDelta: sumMetric(attackers, "omicrons") - sumMetric(defenders, "omicrons"),
    speedDelta: speedKnown ? attackerFastest - defenderFastest : null,
    abilityDelta: attackerAbilityScore !== null && defenderAbilityScore !== null
      ? attackerAbilityScore - defenderAbilityScore
      : null,
    attackerAbilityScore,
    defenderAbilityScore,
    attackerAbilityKnown: attackerAbility?.known === true,
    defenderAbilityKnown: defenderAbility?.known === true,
    attackerAbilityCoverage: attackerAbility?.known === true ? finite(attackerAbility.coverage) : null,
    defenderAbilityCoverage: defenderAbility?.known === true ? finite(defenderAbility.coverage) : null,
  });
}
function unitsForIds(index, ids) {
  return (Array.isArray(ids) ? ids : [])
    .map(normalizeBaseId)
    .filter(Boolean)
    .map((id) => index.get(id))
    .filter(Boolean);
}

export {
  abilityScore,
  characterUnits,
  fastestSpeed,
  finite,
  formatSigned,
  matchupDelta,
  normalizeBaseId,
  rosterIndex,
  sumMetric,
  unitsForIds,
};
