import assert from "node:assert/strict";
import test from "node:test";
import { buildFactionSquads, squadReadiness } from "../public/team-builder.js";

function members(readinessValues) {
  return readinessValues.map((readiness, index) => ({
    baseId: `UNIT_${index}`,
    name: `Unit ${index}`,
    unitType: "Character",
    factions: ["Jedi"],
    power: 20_000 - index * 100,
    speed: 200 - index,
    readiness,
    abilities: index === 0 ? [{ type: "Leader" }] : [],
  }));
}

test("faction squad leaves average readiness unknown when persisted roster has no readiness evidence", () => {
  const squads = buildFactionSquads(members([null, null, null, null, null]), { size: 5, limit: 1 });
  assert.equal(squads.length, 1);
  assert.equal(squads[0].averageReadiness, null);
  assert.equal(squads[0].readinessKnown, false);
  assert.equal(squads[0].totalPower > 0, true);

  const summary = squadReadiness(squads[0]);
  assert.deepEqual(summary, { ready: "—", developing: "—", needsWork: "—", known: false });
});

test("faction squad preserves normal readiness calculations when all live evidence is known", () => {
  const squads = buildFactionSquads(members([95, 88, 74, 66, 50]), { size: 5, limit: 1 });
  assert.equal(squads.length, 1);
  assert.equal(squads[0].averageReadiness, 75);
  assert.equal(squads[0].readinessKnown, true);
  assert.deepEqual(squadReadiness(squads[0]), { ready: 2, developing: 2, needsWork: 1, known: true });
});
