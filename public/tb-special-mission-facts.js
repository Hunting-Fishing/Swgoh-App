const freeze = (value) => Object.freeze(value);

const SOURCES = freeze({
  zeffo: freeze({
    label: 'SWGoH Wiki · Rise of the Empire / Zone Information',
    url: 'https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information',
    sourceType: 'community-reference',
  }),
  mandalore: freeze({
    label: 'SWGOH.GG · Mandalore Bonus Zone Information / Bo-Katan (Mand\'alor)',
    url: 'https://swgoh.gg/news/mandalore-bonus-zone-information/',
    sourceType: 'published-game-reference',
  }),
  reva: freeze({
    label: 'SWGOH.GG · Third Sister Journey Guide',
    url: 'https://swgoh.gg/journey-guides/THIRDSISTER/',
    sourceType: 'published-game-reference',
  }),
  wat: freeze({
    label: 'SWGOH.GG · Wat Tambor Journey Guide',
    url: 'https://swgoh.gg/journey-guides/WATTAMBOR/',
    sourceType: 'published-game-reference',
  }),
});

export const TB_SPECIAL_MISSION_FACTS_VERSION = '2026-08-22';

export const TB_SPECIAL_MISSION_FACTS = freeze({
  zeffo: freeze({
    id: 'zeffo',
    tbId: 'rote',
    phase: 2,
    territoryId: 'bracca',
    unlockTarget: 30,
    gate: freeze({
      relic: 7,
      required: freeze(['CEREJUNDA']),
      oneOf: freeze(['CALKESTIS', 'JEDIKNIGHTCAL']),
    }),
    reward: freeze({
      mode: 'currency-per-success',
      currency: 'GET3',
      currencyLabel: 'Mk III Guild Event Tokens',
      perSuccessfulClear: 50,
      maxGuildAttempts: 50,
      theoreticalGuildMaximum: 2500,
    }),
    source: SOURCES.zeffo,
  }),
  mandalore: freeze({
    id: 'mandalore',
    tbId: 'rote',
    phase: 3,
    territoryId: 'tatooine',
    unlockTarget: 25,
    gate: freeze({
      relic: 7,
      required: freeze(['MANDALORBOKATAN', 'THEMANDALORIANBESKARARMOR']),
      additionalFaction: 'mandalorian',
      additionalCount: 1,
    }),
    reward: freeze({
      mode: 'currency-per-success',
      currency: 'GET2',
      currencyLabel: 'Mk II Guild Event Tokens',
      perSuccessfulClear: 50,
      maxGuildAttempts: 50,
      theoreticalGuildMaximum: 2500,
    }),
    source: SOURCES.mandalore,
  }),
  reva: freeze({
    id: 'reva',
    tbId: 'rote',
    phase: 3,
    territoryId: 'tatooine',
    unlockTarget: null,
    gate: freeze({
      relic: 7,
      required: freeze(['GRANDINQUISITOR']),
      additionalFaction: 'inquisitorius',
      additionalCount: 4,
    }),
    reward: freeze({
      mode: 'shard-per-success',
      unit: 'THIRDSISTER',
      unitLabel: 'Third Sister',
      perSuccessfulClear: 1,
      maxGuildAttempts: 50,
      theoreticalGuildMaximum: 50,
    }),
    source: SOURCES.reva,
  }),
  wat: freeze({
    id: 'wat',
    tbId: 'geo-separatist',
    phase: 3,
    territoryId: 'p3-middle',
    unlockTarget: null,
    gate: freeze({
      stars: 7,
      minimumCharacterPower: 16500,
      required: freeze([
        'GEONOSIANBROODALPHA',
        'GEONOSIANSOLDIER',
        'GEONOSIANSPY',
        'POGGLETHELESSER',
        'SUNFAC',
      ]),
    }),
    reward: freeze({
      mode: 'shard-per-success',
      unit: 'WATTAMBOR',
      unitLabel: 'Wat Tambor',
      perSuccessfulClear: 1,
      maxGuildAttempts: 50,
      theoreticalGuildMaximum: 50,
    }),
    source: SOURCES.wat,
  }),
});

export function tbSpecialMissionFact(id) {
  return TB_SPECIAL_MISSION_FACTS[String(id || '').trim().toLowerCase()] || null;
}

export function potentialMissionReward(id, eligibleAttempts = 0) {
  const fact = tbSpecialMissionFact(id);
  if (!fact?.reward) return null;
  const eligible = Math.max(0, Math.floor(Number(eligibleAttempts) || 0));
  const cappedAttempts = Math.min(fact.reward.maxGuildAttempts || eligible, eligible);
  return freeze({
    attempts: cappedAttempts,
    amount: cappedAttempts * fact.reward.perSuccessfulClear,
    theoreticalGuildMaximum: fact.reward.theoreticalGuildMaximum,
    reward: fact.reward,
  });
}
