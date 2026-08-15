const RULES = [
  ["damage", /\b(deal|deals|damage|damages|attack|attacks)\b/i],
  ["heal", /\b(heal|heals|recover health|health recovery|restore health)\b/i],
  ["protection_recovery", /\b(recover|restore|regain).*\bprotection\b|\bprotection recovery\b/i],
  ["dispel_enemy", /\bdispel(?:s|led|ling)?\b[^.]{0,80}\b(enemy|enemies|target)\b|\bremove(?:s|d)? all buffs\b/i],
  ["dispel_ally", /\bdispel(?:s|led|ling)?\b[^.]{0,80}\b(ally|allies)\b|\bcleanse(?:s|d)?\b/i],
  ["buff", /\b(gain|gains|grant|grants)\b[^.]{0,100}\b(offense up|defense up|speed up|critical chance up|critical damage up|tenacity up|potency up|foresight|advantage|stealth|taunt|retribution|health steal up|accuracy up|protection up|mastery)\b/i],
  ["debuff", /\b(inflict|inflicts|apply|applies)\b[^.]{0,100}\b(ability block|stun|daze|shock|fear|fracture|expose|burning|damage over time|healing immunity|buff immunity|tenacity down|speed down|offense down|defense down|stagger|blind|marked|deathmark|target lock|breach)\b/i],
  ["turn_meter_gain", /\b(gain|gains|grant|grants)\b[^.]{0,80}\bturn meter\b/i],
  ["turn_meter_remove", /\b(remove|removes|reduce|reduces|lose|loses)\b[^.]{0,80}\bturn meter\b/i],
  ["turn_meter_swap", /\bswap(?:s|ped)? turn meter\b|\bequalize(?:s|d)? turn meter\b/i],
  ["assist", /\b(call|calls)\b[^.]{0,80}\bto assist\b|\bassist(?:s|ed|ing)?\b/i],
  ["counter", /\bcounter chance\b|\bcounterattack\b|\bcounter attack\b/i],
  ["revive", /\brevive(?:s|d)?\b/i],
  ["prevent_revive", /\bcannot be revived\b|\bcan't be revived\b|\bprevent(?:s|ed)? reviv/i],
  ["cooldown_reduce", /\b(reduce|reduces|reset|resets)\b[^.]{0,80}\bcooldown/i],
  ["cooldown_increase", /\b(increase|increases)\b[^.]{0,80}\bcooldown/i],
  ["bonus_turn", /\bbonus turn\b|\btakes? an immediate turn\b/i],
  ["bonus_attack", /\bbonus attack\b|\battack again\b/i],
  ["ignore_taunt", /\bignore(?:s|d)? taunt\b/i],
  ["ignore_defense", /\bignore(?:s|d)? (?:the target'?s )?(defense|armor)\b/i],
  ["cannot_evade", /\bcan't be evaded\b|\bcannot be evaded\b/i],
  ["cannot_resist", /\bcan't be resisted\b|\bcannot be resisted\b/i],
  ["instakill", /\binstantly defeat\b|\bimmediately defeat\b|\bdestroy target\b/i],
  ["summon", /\bsummon(?:s|ed)?\b/i],
  ["transform", /\btransform(?:s|ed)?\b/i],
  ["stacking", /\bstack(?:s|ing)?\b|\bstacking\b/i],
  ["leader_scope", /\bwhile in the leader slot\b|\ballies? gain\b/i],
  ["faction_synergy", /\b(rebel|empire|imperial trooper|jedi|sith|galactic republic|separatist|clone trooper|first order|resistance|bounty hunter|scoundrel|mandalorian|inquisitor|nightsister|geonosian|droid|wookiee|tusken|phoenix|rogue one|ewok|jawa|unaligned force user)\b/i],
  ["threshold_health", /\b(?:below|above|less than|more than|at least)\b[^.]{0,60}\bhealth\b/i],
  ["on_crit", /\bcritical hit\b|\bcritically hit\b/i],
  ["on_kill", /\b(defeat|defeats|defeated|kill|kills|killed)\b[^.]{0,80}\b(enemy|unit|target)\b/i],
  ["start_battle", /\bat the start of battle\b|\bat the start of the encounter\b/i],
  ["start_turn", /\bat the start of (?:his|her|their|this unit'?s|the) turn\b/i],
  ["end_turn", /\bat the end of (?:his|her|their|this unit'?s|the) turn\b/i],
];

const BUFFS = ["Accuracy Up","Advantage","Critical Chance Up","Critical Damage Up","Defense Up","Foresight","Health Steal Up","Offense Up","Potency Up","Protection Up","Retribution","Speed Up","Stealth","Taunt","Tenacity Up"];
const DEBUFFS = ["Ability Block","Blind","Breach","Buff Immunity","Burning","Daze","Deathmark","Defense Down","Damage Over Time","Expose","Fear","Fracture","Healing Immunity","Marked","Offense Down","Shock","Speed Down","Stagger","Stun","Target Lock","Tenacity Down"];

function sentenceList(text) {
  return String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function namedStatuses(text, names) { const lower = String(text || "").toLowerCase(); return names.filter((name) => lower.includes(name.toLowerCase())); }
function pctValues(text) {
  return [...String(text || "").matchAll(/(?:gain|lose|remove|reduce|increase|decrease|recover|restore|inflict)[^.%]{0,50}?(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1])).filter(Number.isFinite);
}

export function classifyAbilityType(value, id = "") {
  const text = `${value || ""} ${id || ""}`.toLowerCase();
  if (/leader/.test(text)) return "leader";
  if (/unique|passive/.test(text)) return "unique";
  if (/basic/.test(text)) return "basic";
  if (/ultimate/.test(text)) return "ultimate";
  if (/hardware|reinforcement/.test(text)) return "ship-special";
  if (/special|activated/.test(text)) return "special";
  return "other";
}

export function extractAbilitySemantics(ability = {}) {
  const description = String(ability.description || ability.note || "");
  const sentences = sentenceList(description);
  const mechanics = [];
  for (const [kind, pattern] of RULES) {
    for (let i = 0; i < sentences.length; i += 1) {
      const sentence = sentences[i];
      if (!pattern.test(sentence)) continue;
      mechanics.push({ kind, sentence, sentenceIndex: i, source: "localized-description", confidence: "text-explicit" });
    }
  }
  return {
    schemaVersion: 1,
    abilityType: classifyAbilityType(ability.type, ability.id),
    mechanics,
    mechanicKinds: unique(mechanics.map((item) => item.kind)),
    buffs: namedStatuses(description, BUFFS),
    debuffs: namedStatuses(description, DEBUFFS),
    conditions: unique(mechanics.filter((item) => item.kind.startsWith("on_") || item.kind.startsWith("start_") || item.kind.startsWith("end_") || item.kind === "threshold_health").map((item) => item.kind)),
    percentValues: pctValues(description),
    zeta: Boolean(ability.zeta),
    omega: Boolean(ability.omega),
    omicron: Boolean(ability.omicron),
    omicronMode: Number(ability.omicronMode || 0),
    source: "swgoh-gamedata-localized-description",
  };
}

export function summarizeUnitKit(unit = {}) {
  const abilities = (unit.abilities || []).map((ability) => ({ ...ability, semantics: ability.semantics || extractAbilitySemantics(ability) }));
  const kinds = unique(abilities.flatMap((ability) => ability.semantics?.mechanicKinds || []));
  const buffs = unique(abilities.flatMap((ability) => ability.semantics?.buffs || []));
  const debuffs = unique(abilities.flatMap((ability) => ability.semantics?.debuffs || []));
  return {
    schemaVersion: 1,
    baseId: String(unit.baseId || ""),
    name: String(unit.name || unit.baseId || ""),
    unitType: String(unit.unitType || "Character"),
    abilityCount: abilities.length,
    zetaAbilityCount: abilities.filter((ability) => ability.zeta).length,
    omicronAbilityCount: abilities.filter((ability) => ability.omicron).length,
    mechanicKinds: kinds,
    buffs,
    debuffs,
    hasLeader: abilities.some((ability) => ability.semantics?.abilityType === "leader"),
    hasRevive: kinds.includes("revive"),
    hasDispel: kinds.includes("dispel_enemy") || kinds.includes("dispel_ally"),
    hasTurnMeterControl: kinds.includes("turn_meter_gain") || kinds.includes("turn_meter_remove") || kinds.includes("turn_meter_swap"),
    hasAssist: kinds.includes("assist"),
    hasCooldownControl: kinds.includes("cooldown_reduce") || kinds.includes("cooldown_increase"),
    hasSummon: kinds.includes("summon"),
    source: "swgoh-gamedata-localized-description",
  };
}

export function enrichCatalogWithKitSemantics(catalog = {}) {
  const units = Array.isArray(catalog.units) ? catalog.units : [];
  const enrichedUnits = units.map((unit) => {
    const abilities = (unit.abilities || []).map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
    const next = { ...unit, abilities };
    return { ...next, kit: summarizeUnitKit(next) };
  });
  return { ...catalog, kitSchemaVersion: 1, units: enrichedUnits };
}
