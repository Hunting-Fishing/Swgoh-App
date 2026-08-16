import assert from "node:assert/strict";
import { missionSlotModel, missionSlotSummary } from "../public/tb-mission-slot-model.js";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";

const corelliaQira = ROTE_MISSIONS_BY_PLANET.corellia.find((mission) => mission.id === "corellia-qira");
assert.ok(corelliaQira, "Corellia Qi'ra mission should exist");

const corelliaModel = missionSlotModel(corelliaQira, {
  candidates: [
    { baseId: "QIRA", name: "Qi'ra" },
    { baseId: "YOUNGHAN", name: "Young Han Solo" },
    { baseId: "REY", name: "Rey" },
    { baseId: "VANDORCHEWBACCA", name: "Vandor Chewbacca" },
    { baseId: "L3_37", name: "L3-37" },
    { baseId: "RANDOM", name: "Other R5 Character" },
  ],
});
assert.equal(corelliaModel.squadSize, 5);
assert.equal(corelliaModel.mandatorySlots, 2);
assert.equal(corelliaModel.flexSlots, 3);
assert.equal(corelliaModel.fixedSquad, false);
assert.deepEqual(corelliaModel.flexCandidates.map((unit) => unit.baseId), ["REY", "VANDORCHEWBACCA", "L3_37", "RANDOM"]);
assert.equal(missionSlotSummary(corelliaQira), "5 slots · 2 required + 3 flex");

const gasAhsoka = GEO_LS_TERRITORIES
  .flatMap((territory) => territory.missions || [])
  .find((mission) => mission.id === "p2-mid-gas");
assert.ok(gasAhsoka, "LS Geo GAS + Ahsoka fixed mission should exist");

const fixedModel = missionSlotModel(gasAhsoka, {
  candidates: [
    { baseId: "GENERALSKYWALKER", name: "General Skywalker" },
    { baseId: "AHSOKATANO", name: "Ahsoka Tano" },
    { baseId: "UNRELATED", name: "Unrelated Character" },
  ],
});
assert.equal(fixedModel.squadSize, 2);
assert.equal(fixedModel.mandatorySlots, 2);
assert.equal(fixedModel.flexSlots, 0);
assert.equal(fixedModel.fixedSquad, true);
assert.deepEqual(fixedModel.flexCandidates, []);
assert.equal(missionSlotSummary(gasAhsoka), "2 slots · 2 required · fixed squad");

const bracca = ROTE_MISSIONS_BY_PLANET.bracca.find((mission) => mission.id === "bracca-zeffo-unlock");
assert.ok(bracca, "Bracca Zeffo unlock mission should exist");
const braccaModel = missionSlotModel(bracca, {
  candidates: [
    { baseId: "CEREJUNDA", name: "Cere Junda" },
    { baseId: "CALKESTIS", name: "Cal Kestis" },
    { baseId: "JEDIKNIGHTCAL", name: "Jedi Knight Cal Kestis" },
  ],
});
assert.equal(braccaModel.squadSize, 2);
assert.equal(braccaModel.mandatorySlots, 1);
assert.equal(braccaModel.flexSlots, 1);
assert.deepEqual(braccaModel.flexCandidates.map((unit) => unit.baseId), ["CALKESTIS", "JEDIKNIGHTCAL"]);

const generic = ROTE_MISSIONS_BY_PLANET.corellia.find((mission) => mission.id === "corellia-generic-1");
const genericModel = missionSlotModel(generic, { candidates: [{ baseId: "A" }, { baseId: "B" }] });
assert.equal(genericModel.mandatorySlots, 0);
assert.equal(genericModel.flexSlots, 5);
assert.equal(genericModel.flexCandidates.length, 2);

console.log("TB mission slot model checks passed");
