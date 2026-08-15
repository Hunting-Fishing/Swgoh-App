export const ROTE_PLANETS = [
  { id: "mustafar", name: "Mustafar", phase: "P1", relic: 5, alignment: "Dark", lane: "Dark Side", x: 32, y: 83, missions: ["Nute", "Wat", "Geonosians", "Lord Vader", "Fleet"] },
  { id: "corellia", name: "Corellia", phase: "P1", relic: 5, alignment: "Mixed", lane: "Mixed", x: 50, y: 87, missions: ["Qi'ra", "Combat", "Jabba", "Doctor Aphra", "Fleet"] },
  { id: "coruscant", name: "Coruscant", phase: "P1", relic: 5, alignment: "Light", lane: "Light Side", x: 68, y: 83, missions: ["Combat", "Mace / Kit Jedi", "Fleet"] },

  { id: "geonosis", name: "Geonosis", phase: "P2", relic: 6, alignment: "Dark", lane: "Dark Side", x: 26, y: 70, missions: ["Nexu", "Acklay", "Reek", "Fleet"] },
  { id: "felucia", name: "Felucia", phase: "P2", relic: 6, alignment: "Mixed", lane: "Mixed", x: 50, y: 74, missions: ["Hondo", "Young Lando", "Jabba", "Combat", "Fleet"] },
  { id: "bracca", name: "Bracca", phase: "P2", relic: 6, alignment: "Light", lane: "Light Side", x: 74, y: 70, missions: ["Left", "Right", "Zeffo Unlock", "Jedi", "Fleet"] },

  { id: "dathomir", name: "Dathomir", phase: "P3", relic: 7, alignment: "Dark", lane: "Dark Side", x: 20, y: 57, missions: ["Combat", "Empire", "Doctor Aphra", "Merrin"] },
  { id: "tatooine", name: "Tatooine", phase: "P3", relic: 7, alignment: "Mixed", lane: "Mixed", x: 50, y: 62, missions: ["Bo-Katan", "Reva", "Combat", "Fennec", "Jabba", "Fleet"] },
  { id: "kashyyyk", name: "Kashyyyk", phase: "P3", relic: 7, alignment: "Light", lane: "Light Side", x: 80, y: 57, missions: ["Saw", "Left", "Right", "Wookiees", "Fleet"] },

  { id: "haven", name: "Haven", phase: "P4", relic: 8, alignment: "Dark", lane: "Dark Side", x: 14, y: 43, missions: ["Inquisitors", "Mid / Bottom / Right", "Top", "Left"] },
  { id: "kessel", name: "Kessel", phase: "P4", relic: 8, alignment: "Mixed", lane: "Mixed", x: 50, y: 50, missions: ["Qi'ra / L3", "Combat", "Jabba", "Fleet"] },
  { id: "lothal", name: "Lothal", phase: "P4", relic: 8, alignment: "Light", lane: "Light Side", x: 86, y: 43, missions: ["Combat", "Jedi", "Fleet"] },

  { id: "malachor", name: "Malachor", phase: "P5", relic: 9, alignment: "Dark", lane: "Dark Side", x: 9, y: 29, missions: ["Top", "Middle", "Right", "Left"] },
  { id: "vandor", name: "Vandor", phase: "P5", relic: 9, alignment: "Mixed", lane: "Mixed", x: 50, y: 38, missions: ["Top", "Right", "Bottom", "Left", "Jabba", "Fleet", "Young Han"] },
  { id: "kafrene", name: "Kafrene", phase: "P5", relic: 9, alignment: "Light", lane: "Light Side", x: 91, y: 29, missions: ["Top Left", "Top Middle", "Bottom", "Ships"] },

  { id: "death-star", name: "Death Star", phase: "P6", relic: 9, alignment: "Dark", lane: "Dark Side", x: 5, y: 13, missions: ["Generic Left", "Generic Right", "Iden", "Darth Vader", "Fleets"] },
  { id: "hoth", name: "Hoth", phase: "P6", relic: 9, alignment: "Mixed", lane: "Mixed", x: 50, y: 25, missions: ["Top", "Middle", "Bottom", "Left", "Jabba", "Doctor Aphra", "Fleet"] },
  { id: "scarif", name: "Scarif", phase: "P6", relic: 9, alignment: "Light", lane: "Light Side", x: 95, y: 13, missions: ["Generic", "Baze", "Cassian", "Ships"] },

  { id: "zeffo", name: "Zeffo", phase: "Zeffo", relic: 7, alignment: "Light", lane: "Bonus", x: 91, y: 61, missions: ["Jedi", "Clones", "Unaligned Force Users", "Combat", "Fleet"], bonus: true, unlockFrom: "bracca" },
  { id: "mandalore", name: "Mandalore", phase: "Mandalore", relic: 8, alignment: "Mixed", lane: "Bonus", x: 68, y: 52, missions: ["Combat", "Dark Trooper Moff Gideon", "Fleet"], bonus: true, unlockFrom: "tatooine" },
];

export const ROTE_PHASE_RELICS = Object.freeze({ P1: 5, P2: 6, P3: 7, P4: 8, P5: 9, P6: 9, Zeffo: 7, Mandalore: 8 });

export function rotePlanetById(id) {
  return ROTE_PLANETS.find((planet) => planet.id === String(id || "")) || ROTE_PLANETS[0];
}

function normalizedAlignment(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("dark")) return "Dark";
  if (text.includes("light")) return "Light";
  if (text.includes("neutral")) return "Neutral";
  return "Unknown";
}

export function unitMeetsPlanetGate(unit, planet) {
  if (!unit || !planet) return false;
  if (String(unit.unitType || "Character") === "Ship") return false;
  if (Number(unit.relic || 0) < Number(planet.relic || 0)) return false;
  if (planet.alignment === "Mixed") return true;
  return normalizedAlignment(unit.alignment) === planet.alignment;
}

export function planetRosterReadiness(body, planet) {
  const units = Array.isArray(body?.units) ? body.units : [];
  const eligible = units
    .filter((unit) => unitMeetsPlanetGate(unit, planet))
    .slice()
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0) || Number(b.speed || 0) - Number(a.speed || 0) || String(a.name || "").localeCompare(String(b.name || "")));
  const topFive = eligible.slice(0, 5);
  const gatePercent = Math.min(100, Math.round((eligible.length / 5) * 100));
  const status = eligible.length >= 10 ? "deep" : eligible.length >= 5 ? "ready" : eligible.length > 0 ? "thin" : "blocked";
  return {
    planetId: planet.id,
    eligible,
    topFive,
    eligibleCount: eligible.length,
    gatePercent,
    status,
    totalGp: topFive.reduce((sum, unit) => sum + Number(unit.power || 0), 0),
    averageSpeed: topFive.length ? Math.round(topFive.reduce((sum, unit) => sum + Number(unit.speed || 0), 0) / topFive.length) : 0,
  };
}

export function allPlanetReadiness(body) {
  return ROTE_PLANETS.map((planet) => ({ planet, ...planetRosterReadiness(body, planet) }));
}
