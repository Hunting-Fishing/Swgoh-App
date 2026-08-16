// Presentation geometry only. Marker centers are derived from the GenSkaar ROTE
// map marker positions at revision 932c5d4d2e7a29b23baa37f759cd1254459a97a2.
// Territory click geometry lives separately in rote-territory-polygons-data.js.
export const ROTE_MAP_GEOMETRY = Object.freeze({
  mustafar: Object.freeze({ x: 40.5, y: 76.75, lane: "dark" }),
  corellia: Object.freeze({ x: 49.5, y: 69.75, lane: "mixed" }),
  coruscant: Object.freeze({ x: 58.5, y: 76.75, lane: "light" }),

  geonosis: Object.freeze({ x: 36.5, y: 66.75, lane: "dark" }),
  felucia: Object.freeze({ x: 52.5, y: 56.75, lane: "mixed" }),
  bracca: Object.freeze({ x: 62.5, y: 66.75, lane: "light" }),

  dathomir: Object.freeze({ x: 25.5, y: 67.75, lane: "dark" }),
  tatooine: Object.freeze({ x: 47.5, y: 46.75, lane: "mixed" }),
  kashyyyk: Object.freeze({ x: 74.5, y: 66.75, lane: "light" }),

  haven: Object.freeze({ x: 20.5, y: 56.75, lane: "dark" }),
  kessel: Object.freeze({ x: 57.5, y: 36.75, lane: "mixed" }),
  lothal: Object.freeze({ x: 79.5, y: 56.75, lane: "light" }),

  malachor: Object.freeze({ x: 19, y: 41.25, lane: "dark" }),
  vandor: Object.freeze({ x: 52.5, y: 25.75, lane: "mixed" }),
  kafrene: Object.freeze({ x: 79.5, y: 40.75, lane: "light" }),

  "death-star": Object.freeze({ x: 20.5, y: 28.75, lane: "dark" }),
  hoth: Object.freeze({ x: 61.5, y: 18.75, lane: "mixed" }),
  scarif: Object.freeze({ x: 78.5, y: 27.75, lane: "light" }),

  zeffo: Object.freeze({ x: 62.5, y: 50.75, lane: "bonus" }),
  mandalore: Object.freeze({ x: 40.5, y: 37.75, lane: "bonus" }),
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
