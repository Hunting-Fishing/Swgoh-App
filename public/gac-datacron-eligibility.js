import { loadDatacronCatalog, resolveAffix, resolveDatacron } from "./gac-datacron-catalog.js";

let unitCatalogPromise = null;

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }

function alignmentNumber(value) {
  const text = clean(value).toLowerCase();
  if (text === "neutral") return 1;
  if (text === "light") return 2;
  if (text === "dark") return 3;
  const numeric = finite(value);
  return numeric && [1, 2, 3].includes(numeric) ? numeric : null;
}

function unitCategories(staticUnit = {}) {
  return new Set(asArray(staticUnit?.categories || staticUnit?.categoryId).map(clean).filter(Boolean));
}

function ruleMatch(liveUnit = {}, staticUnit = {}, targetRule = null) {
  if (!targetRule) {
    return Object.freeze({ known: false, eligible: null, reasons: Object.freeze(["target-rule-unresolved"]) });
  }
  if (!staticUnit || !normalizeBaseId(staticUnit.baseId || staticUnit.id)) {
    return Object.freeze({ known: false, eligible: null, reasons: Object.freeze(["unit-catalog-missing"]) });
  }

  const reasons = [];
  const categories = unitCategories(staticUnit);
  const exclusions = asArray(targetRule.excludeCategories).filter(Boolean);
  const excluded = exclusions.find((category) => categories.has(category));
  if (excluded) reasons.push(`excluded:${excluded}`);

  // C-3PO's datacron mapper treats each positive category entry as a separate
  // target family. Do not collapse several entries into one giant AND rule.
  const allowed = asArray(targetRule.includeCategories).filter(Boolean);
  if (allowed.length && !allowed.some((category) => categories.has(category))) reasons.push("target-category-mismatch");

  const alignments = asArray(targetRule.forceAlignments).map(Number).filter(Number.isFinite);
  const alignment = alignmentNumber(staticUnit.alignment);
  if (alignments.length && alignment !== null && !alignments.includes(alignment)) reasons.push("alignment-mismatch");
  if (alignments.length && alignment === null) reasons.push("alignment-unknown");

  // CG battleTargetingRule.unitClass uses its own enum (for example 6 on
  // ordinary ally/self character target rules). It is not roster combatType,
  // so it is deliberately not evaluated here.
  const unknown = reasons.some((reason) => reason.endsWith("-unknown"));
  const failed = reasons.some((reason) => !reason.endsWith("-unknown"));
  return Object.freeze({
    known: !unknown,
    eligible: unknown && !failed ? null : !failed,
    reasons: Object.freeze(reasons),
  });
}

function gateMatch(liveUnit = {}, affix = {}) {
  const reasons = [];
  const requiredRelicTier = finite(affix?.requiredRelicTier);
  const relic = finite(liveUnit?.relic);
  if (requiredRelicTier !== null) {
    if (relic === null) reasons.push("relic-unknown");
    else if (relic < requiredRelicTier) reasons.push(`requires-r${requiredRelicTier}`);
  }

  // requiredUnitTier is preserved in the raw evidence but is not interpreted
  // as gear tier here; current reference implementations expose the datacron
  // relic requirement directly and do not equate this field with roster gear.
  const unknown = reasons.some((reason) => reason.endsWith("-unknown"));
  const failed = reasons.some((reason) => !reason.endsWith("-unknown"));
  return Object.freeze({
    known: !unknown,
    eligible: unknown && !failed ? null : !failed,
    reasons: Object.freeze(reasons),
  });
}

function evaluateAffixForUnit(affix = {}, liveUnit = {}, staticUnit = {}, catalog = null) {
  if (!clean(affix?.abilityId)) {
    return Object.freeze({ known: false, eligible: null, reasons: Object.freeze(["not-ability-affix"]) });
  }
  const resolved = catalog ? resolveAffix(affix, catalog) : null;
  const target = ruleMatch(liveUnit, staticUnit, resolved?.targetRule || null);
  const gate = gateMatch(liveUnit, affix);
  const reasons = [...target.reasons, ...gate.reasons];
  const known = target.known && gate.known;
  const eligible = target.eligible === false || gate.eligible === false
    ? false
    : known
      ? true
      : null;
  return Object.freeze({
    known,
    eligible,
    tier: finite(affix?.tier),
    abilityId: clean(affix?.abilityId),
    targetRuleId: clean(affix?.targetRule),
    scopeLabel: clean(resolved?.scopeLabel),
    reasons: Object.freeze(reasons),
  });
}

function buildUnitIndex(catalogBody = {}) {
  return new Map(asArray(catalogBody?.units).map((unit) => [normalizeBaseId(unit?.baseId || unit?.id), unit]).filter(([id]) => id));
}

function squadCoverage(datacron = {}, squad = [], unitIndex = new Map(), catalog = null) {
  const abilityAffixes = asArray(datacron?.affixes).filter((affix) => clean(affix?.abilityId));
  if (!abilityAffixes.length) {
    return Object.freeze({
      known: false,
      datacron,
      squadSize: squad.length,
      eligibleMembers: 0,
      unknownMembers: squad.length,
      coverage: null,
      leaderEligible: null,
      abilityAffixes: 0,
      eligibleAbilityHits: 0,
      members: Object.freeze([]),
      reason: "no-ability-affix-evidence",
    });
  }

  const members = squad.map((liveUnit, index) => {
    const baseId = normalizeBaseId(liveUnit?.baseId || liveUnit?.id);
    const staticUnit = unitIndex.get(baseId) || null;
    const affixResults = abilityAffixes.map((affix) => evaluateAffixForUnit(affix, liveUnit, staticUnit, catalog));
    const eligibleHits = affixResults.filter((result) => result.eligible === true).length;
    const knownResults = affixResults.filter((result) => result.eligible !== null).length;
    const benefitEligible = eligibleHits > 0 ? true : knownResults === affixResults.length ? false : null;
    const failures = [...new Set(affixResults.flatMap((result) => result.reasons).filter((reason) => reason && reason !== "not-ability-affix"))];
    return Object.freeze({
      index,
      baseId,
      name: clean(liveUnit?.name || staticUnit?.name || baseId),
      benefitEligible,
      eligibleHits,
      abilityAffixes: affixResults.length,
      failures: Object.freeze(failures),
      affixes: Object.freeze(affixResults),
    });
  });

  const eligibleMembers = members.filter((member) => member.benefitEligible === true).length;
  const unknownMembers = members.filter((member) => member.benefitEligible === null).length;
  const known = squad.length > 0 && unknownMembers === 0;
  return Object.freeze({
    known,
    datacron,
    squadSize: squad.length,
    eligibleMembers,
    unknownMembers,
    coverage: squad.length ? eligibleMembers / squad.length : 0,
    leaderEligible: members[0]?.benefitEligible ?? null,
    abilityAffixes: abilityAffixes.length,
    eligibleAbilityHits: members.reduce((sum, member) => sum + member.eligibleHits, 0),
    members: Object.freeze(members),
    reason: known ? "ability-target-coverage-known" : "ability-target-coverage-partial",
  });
}

function bestCoverage(datacrons = [], squad = [], unitIndex = new Map(), catalog = null) {
  const candidates = asArray(datacrons)
    .map((datacron) => squadCoverage(datacron, squad, unitIndex, catalog))
    .filter((result) => result.known && result.abilityAffixes > 0)
    .sort((a, b) =>
      b.eligibleMembers - a.eligibleMembers ||
      Number(b.leaderEligible === true) - Number(a.leaderEligible === true) ||
      b.eligibleAbilityHits - a.eligibleAbilityHits ||
      (finite(b.datacron?.level) || 0) - (finite(a.datacron?.level) || 0)
    );
  return candidates[0] || null;
}

async function loadUnitCatalog(fetchImpl = fetch) {
  const snapshot = typeof window !== "undefined" ? window.__swgohCatalogSnapshot?.body : null;
  if (Array.isArray(snapshot?.units)) return snapshot;
  if (!unitCatalogPromise) {
    unitCatalogPromise = fetchImpl("/data/catalog.json", { headers: { Accept: "application/json" }, cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unit catalog returned HTTP ${response.status}.`);
        const body = await response.json();
        if (!Array.isArray(body?.units)) throw new Error("Unit catalog contained no units.");
        return body;
      })
      .catch((error) => {
        unitCatalogPromise = null;
        throw error;
      });
  }
  return unitCatalogPromise;
}

async function loadEligibilityContext(fetchImpl = fetch) {
  const [unitCatalog, datacronCatalog] = await Promise.all([
    loadUnitCatalog(fetchImpl),
    loadDatacronCatalog(fetchImpl),
  ]);
  return Object.freeze({
    unitCatalog,
    unitIndex: buildUnitIndex(unitCatalog),
    datacronCatalog,
  });
}

function datacronLabel(datacron = {}, catalog = null) {
  const resolved = catalog ? resolveDatacron(datacron, catalog) : null;
  const setName = clean(resolved?.set?.displayName) || `Set ${datacron?.setId ?? "?"}`;
  return `${setName} L${finite(datacron?.level) ?? asArray(datacron?.affixes).length}`;
}

export {
  alignmentNumber,
  bestCoverage,
  buildUnitIndex,
  datacronLabel,
  evaluateAffixForUnit,
  gateMatch,
  loadEligibilityContext,
  loadUnitCatalog,
  ruleMatch,
  squadCoverage,
};
