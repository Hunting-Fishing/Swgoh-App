const text = (value) => String(value ?? "").trim();

export const LEGACY_TB_GLOBAL_MECHANIC_SOURCES = Object.freeze({
  "geo-separatist": Object.freeze({
    id: "swgohgg-t03d-global",
    label: "SWGOH.GG · Geonosis: Separatist Might mission bonuses",
    kind: "current-reference",
    url: "https://swgoh.gg/territory-battles/t03D/",
  }),
  "geo-republic": Object.freeze({
    id: "swgohgg-t04d-global",
    label: "SWGOH.GG · Geonosis: Republic Offensive mission bonuses",
    kind: "current-reference",
    url: "https://swgoh.gg/territory-battles/t04D/",
  }),
  "hoth-imperial": Object.freeze({
    id: "swgohgg-t02d-global",
    label: "SWGOH.GG · Hoth: Imperial Retaliation mission bonuses",
    kind: "current-reference",
    url: "https://swgoh.gg/territory-battles/t02D/",
  }),
  "hoth-rebel": Object.freeze({
    id: "swgohgg-t01d-global",
    label: "SWGOH.GG · Hoth: Rebel Assault mission bonuses",
    kind: "current-reference",
    url: "https://swgoh.gg/territory-battles/t01D/",
  }),
});

const PROFILE = Object.freeze({
  "geo-separatist": Object.freeze({
    ground: Object.freeze([
      Object.freeze({
        id: "separatist-motives",
        name: "Separatist Motives",
        rule: "When a Separatist defeats an enemy, all Separatist allies gain a stack of Separatist Affiliation (max 10). At 10 stacks it becomes Separatist Loyalty, adding damage, start-of-turn recovery, and a temporary ally-stat inheritance effect when a loyal ally is defeated.",
        response: "When the chosen squad contains Separatists, route safe finishing blows through Separatist attackers when practical so the team can build Affiliation without sacrificing control. Once Loyalty is active, value its sustain before spending recovery cooldowns.",
      }),
    ]),
    fleet: Object.freeze([]),
    conditional: Object.freeze([
      "Platoon completion can change Droid Factory, Republic Resolve, Core Ship, Hailfire Tank, Metal Mayhem and other strategic abilities. Their exact level is guild-state dependent and must not be assumed by the fallback strategy.",
    ]),
  }),
  "geo-republic": Object.freeze({
    ground: Object.freeze([
      Object.freeze({
        id: "bravery",
        name: "Bravery",
        rule: "Whenever a character uses an ability, it deals bonus damage equal to 5% of the target's Max Health when the target does not have Droid Battalion; when targeting an enemy with Droid Battalion during its turn, it attacks again with its Basic once per turn.",
        response: "Use the extra Basic against Droid Battalion targets as part of the control/damage plan rather than treating it as incidental. Against enemies without Droid Battalion, repeated safe ability use converts into Max-Health-based bonus pressure.",
      }),
    ]),
    fleet: Object.freeze([
      Object.freeze({
        id: "formations",
        name: "Formations",
        rule: "When the relevant platoon ability is unlocked, the allied Capital Ship can switch between Defensive Formation and Assault Formation; higher levels add team recovery or major damage amplification.",
        response: "If Formations is actually unlocked for the guild state, use Defensive Formation to stabilize a damaged opening and Assault Formation for a decisive cooldown/TM/damage window. Do not assume the ability exists when platoon state is unknown.",
        conditional: true,
      }),
    ]),
    conditional: Object.freeze([
      "Republic Resolve, AT-TE, LAAT, Core Ship, Hailfire Tank, Metal Mayhem and Droid Factory levels depend on platoon completion and can materially alter a battle.",
    ]),
  }),
  "hoth-imperial": Object.freeze({
    ground: Object.freeze([
      Object.freeze({
        id: "imperial-might",
        name: "Imperial Might",
        rule: "Empire characters gain +10% Critical Chance, +10% Max Health, and +10% Lifesteal during Hoth: Imperial Retaliation.",
        response: "When an Empire composition is legal, include the mode bonus in survivability and damage expectations instead of evaluating the team exactly like a non-TB battle.",
      }),
      Object.freeze({
        id: "malice",
        name: "Malice",
        rule: "Hoth Hero characters dispel all buffs on their selected target the first time they use a Special ability each encounter.",
        response: "If a selected unit is a Hoth Hero, preserve its first Special for a target where the opening buff dispel has real value rather than wasting the once-per-encounter trigger.",
      }),
    ]),
    fleet: Object.freeze([]),
    conditional: Object.freeze([
      "AT-AT Assault, Orbital Bombardment, Ion Cannon, Rebel Strafing Run and Planetary Shield behavior depends on territory/platoon state. The fallback must show these as conditional guild-state mechanics, not guaranteed buttons or hazards.",
    ]),
  }),
  "hoth-rebel": Object.freeze({
    ground: Object.freeze([
      Object.freeze({
        id: "focused-defense",
        name: "Focused Defense",
        rule: "At the end of a unit's turn, it gains Protection Up for 2 turns if it used a Special ability and no enemies were defeated that turn.",
        response: "When a Special will not secure a kill, account for the resulting Protection Up as part of sustain sequencing; a setup/control Special can therefore be safer than its raw damage suggests.",
      }),
      Object.freeze({
        id: "last-stand",
        name: "Last Stand",
        rule: "The first time a qualifying Hoth Hero is defeated, it revives with offensive buffs and Last Stand; it will be defeated after 2 turns unless an enemy is defeated or the encounter ends.",
        response: "Treat the revive as a short conversion window, not permanent recovery. If Last Stand triggers, immediately plan a reachable enemy defeat or encounter closeout before the two-turn clock expires.",
      }),
    ]),
    fleet: Object.freeze([]),
    conditional: Object.freeze([
      "Rebel Guerrilla Strike, Ion Cannon Blast, Rebel Supply Lines, Rebel Strafing Run and Planetary Shield depend on platoon/territory state and must be presented conditionally.",
    ]),
  }),
});

export function legacyTbGlobalMechanicsForMission(mission = {}) {
  const tbId = text(mission.tbId);
  const profile = PROFILE[tbId];
  if (!profile) return { tbId, source: null, mechanics: [], conditional: [] };
  const isFleet = text(mission.missionType).toLowerCase() === "fleet" || text(mission.entry?.unitType).toLowerCase() === "ship";
  return {
    tbId,
    source: LEGACY_TB_GLOBAL_MECHANIC_SOURCES[tbId] || null,
    mechanics: [...(isFleet ? profile.fleet : profile.ground)],
    conditional: [...profile.conditional],
  };
}
