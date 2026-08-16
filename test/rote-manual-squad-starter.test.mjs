import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildRoteManualSquadCore } from "../public/rote-manual-squad-starter-model.js";

const character = (baseId, name, relic = 5, power = 20_000) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Light",
  factions: ["Jedi"],
  categories: ["Jedi"],
  stars: 7,
  gear: 13,
  relic,
  power,
  speed: 240,
});

const exactMission = {
  id: "manual-core-mission",
  name: "Manual Core Mission",
  missionType: "combat",
  entry: {
    verified: true,
    unitType: "Character",
    squadSize: 5,
    relicMin: 5,
    requiredCategories: ["Jedi"],
    categoryMode: "all",
    mandatoryMembers: [{ baseId: "REQ", name: "Required Jedi", relicMin: 5 }],
  },
};

const legalBody = {
  units: [
    character("REQ", "Required Jedi", 5, 18_000),
    character("J1", "Jedi One", 5, 30_000),
    character("J2", "Jedi Two", 5, 29_000),
    character("J3", "Jedi Three", 5, 28_000),
    character("J4", "Jedi Four", 5, 27_000),
    character("J5", "Jedi Five", 5, 26_000),
  ],
  ships: [],
};

test("manual starter builds an exact legal character core and includes mandatory unit first", () => {
  const core = buildRoteManualSquadCore(legalBody, exactMission);
  assert.equal(core.available, true);
  assert.equal(core.exactEntryCore, true);
  assert.equal(core.actionLabel, "Build Legal Mission Core");
  assert.equal(core.baseIds.length, 5);
  assert.equal(core.baseIds[0], "REQ");
  assert.equal(core.mandatoryBlockers.length, 0);
  assert.equal(core.unownedMandatory.length, 0);
});

test("owned mandatory unit below gate remains in planning core so blocker is visible", () => {
  const body = {
    ...legalBody,
    units: legalBody.units.map((unit) => unit.baseId === "REQ" ? { ...unit, relic: 4 } : unit),
  };
  const core = buildRoteManualSquadCore(body, exactMission);
  assert.equal(core.available, true);
  assert.equal(core.exactEntryCore, false);
  assert.equal(core.actionLabel, "Build Planning Core + Blockers");
  assert.equal(core.baseIds[0], "REQ");
  assert.equal(core.mandatoryBlockers.length, 1);
  assert.equal(core.mandatoryBlockers[0].baseId, "REQ");
});

test("unowned mandatory unit remains an explicit blocker and is never invented into squad", () => {
  const body = {
    ...legalBody,
    units: legalBody.units.filter((unit) => unit.baseId !== "REQ"),
  };
  const core = buildRoteManualSquadCore(body, exactMission);
  assert.equal(core.available, true);
  assert.equal(core.exactEntryCore, false);
  assert.equal(core.unownedMandatory.length, 1);
  assert.equal(core.unownedMandatory[0].baseId, "REQ");
  assert.equal(core.baseIds.includes("REQ"), false);
});

test("fleet missions do not get forced into character Squad Workbench", () => {
  const fleetMission = {
    id: "fleet",
    name: "Fleet Mission",
    missionType: "fleet",
    entry: { verified: true, unitType: "Ship", squadSize: 5, starsMin: 7 },
  };
  const body = {
    units: [],
    ships: Array.from({ length: 5 }, (_, index) => ({ baseId: `SHIP_${index}`, name: `Ship ${index}`, unitType: "Ship", stars: 7, power: 40_000 - index })),
  };
  const core = buildRoteManualSquadCore(body, fleetMission);
  assert.equal(core.available, false);
  assert.equal(core.reason, "character-workbench-only");
  assert.deepEqual(core.baseIds, []);
});

test("manual starter sets mission context before replacing the Workbench squad", () => {
  const source = fs.readFileSync(new URL("../public/rote-manual-squad-starter.js", import.meta.url), "utf8");
  const contextPosition = source.indexOf('new CustomEvent("swgoh:set-squad-mission-context"');
  const replacePosition = source.indexOf('new CustomEvent("swgoh:replace-squad"');
  assert.ok(contextPosition >= 0);
  assert.ok(replacePosition > contextPosition);
  assert.match(source, /GP-ranked roster starting point only — not a battle-performance recommendation/);
  assert.match(source, /character-workbench-only/);
});

test("Squad mission context preserves manual origin instead of calling it a planning template", () => {
  const source = fs.readFileSync(new URL("../public/squad-rote-mission-context.js", import.meta.url), "utf8");
  assert.match(source, /swgoh:set-squad-mission-context/);
  assert.match(source, /manual GP-ranked roster core, not a sourced team recommendation/);
  assert.match(source, /sourceLabel/);
});

test("manual starter assets are wired after Squad ROTE context", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-manual-squad-starter.css", import.meta.url), "utf8");
  assert.match(index, /rote-manual-squad-starter\.css/);
  assert.match(index, /rote-manual-squad-starter\.js/);
  assert.ok(index.indexOf("/rote-manual-squad-starter.js") > index.indexOf("/squad-rote-mission-context.js"));
  assert.match(css, /\.rote-manual-core-action/);
});
