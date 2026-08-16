export const ROTE_MAP_GEOMETRY = Object.freeze({
  mustafar: Object.freeze({ x: 40, y: 78, lane: "dark" }),
  corellia: Object.freeze({ x: 50, y: 70, lane: "mixed" }),
  coruscant: Object.freeze({ x: 60, y: 78, lane: "light" }),

  geonosis: Object.freeze({ x: 34, y: 68, lane: "dark" }),
  felucia: Object.freeze({ x: 50, y: 58, lane: "mixed" }),
  bracca: Object.freeze({ x: 66, y: 68, lane: "light" }),

  dathomir: Object.freeze({ x: 27, y: 58, lane: "dark" }),
  tatooine: Object.freeze({ x: 50, y: 47, lane: "mixed" }),
  kashyyyk: Object.freeze({ x: 73, y: 58, lane: "light" }),

  haven: Object.freeze({ x: 20, y: 48, lane: "dark" }),
  kessel: Object.freeze({ x: 50, y: 36, lane: "mixed" }),
  lothal: Object.freeze({ x: 80, y: 48, lane: "light" }),

  malachor: Object.freeze({ x: 15, y: 37, lane: "dark" }),
  vandor: Object.freeze({ x: 50, y: 25, lane: "mixed" }),
  kafrene: Object.freeze({ x: 85, y: 37, lane: "light" }),

  "death-star": Object.freeze({ x: 19, y: 22, lane: "dark" }),
  hoth: Object.freeze({ x: 50, y: 14, lane: "mixed" }),
  scarif: Object.freeze({ x: 81, y: 22, lane: "light" }),

  zeffo: Object.freeze({ x: 86, y: 67, lane: "bonus" }),
  mandalore: Object.freeze({ x: 72, y: 47, lane: "bonus" }),
});

export const ROTE_PHASE_ORDER = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "Bonus"]);

export const ROTE_PHASE_RELIC_LABELS = Object.freeze({
  P1: "R5",
  P2: "R6",
  P3: "R7",
  P4: "R8",
  P5: "R9",
  P6: "R9",
  Bonus: "Unlock",
});

export const ROTE_LANE_ORDER = Object.freeze({
  "Dark Side": 0,
  Mixed: 1,
  "Light Side": 2,
  Bonus: 3,
});

export function rotePhaseGroup(planet) {
  if (!planet) return "P1";
  return planet.bonus || !/^P[1-6]$/.test(String(planet.phase || "")) ? "Bonus" : String(planet.phase);
}

export function rotePlanetsForPhase(planets, phase) {
  return (Array.isArray(planets) ? planets : [])
    .filter((planet) => rotePhaseGroup(planet) === phase)
    .slice()
    .sort((a, b) => (ROTE_LANE_ORDER[a.lane] ?? 99) - (ROTE_LANE_ORDER[b.lane] ?? 99) || String(a.name).localeCompare(String(b.name)));
}

export function parseLegacyPhase(label = "") {
  const match = String(label).match(/\bP(\d+)\b/i);
  return match ? Number(match[1]) : null;
}
