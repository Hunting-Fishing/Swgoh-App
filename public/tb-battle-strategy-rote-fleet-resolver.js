import { roteFleetBattleStrategyForMission as rawFleetStrategy } from "./tb-battle-strategy-rote-fleet-data.js";

const SHIP_BASE_IDS = Object.freeze({
  Scythe: "SCYTHE",
  "Lando's Millennium Falcon": "MILLENNIUMFALCONPRISTINE",
  Outrider: "OUTRIDER",
  Executor: "CAPITALEXECUTOR",
  Profundity: "CAPITALPROFUNDITY",
  Negotiator: "CAPITALNEGOTIATOR",
  Ghost: "GHOST",
  "Gauntlet Starfighter": "GAUNTLETSTARFIGHTER",
  "Imperial TIE Fighter": "TIEFIGHTERIMPERIAL",
});

export function roteFleetBattleStrategyForMission(missionId) {
  const strategy = rawFleetStrategy(missionId);
  if (!strategy) return null;
  return {
    ...strategy,
    keyUnits: (strategy.keyUnits || []).map((unit) => ({
      ...unit,
      baseId: SHIP_BASE_IDS[unit.name] || String(unit.baseId || ""),
    })),
  };
}
