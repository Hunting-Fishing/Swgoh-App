import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildGuildRoteMissionFarms } from "../public/guild-rote-mission-coverage-model.js";
import { normalizeGuildRedundancyTarget } from "../public/guild-rote-mission-coverage.js";
import { buildOfficerBrief } from "../public/guild-rote-officer-export.js";

test("guild redundancy target clamps to the supported 1-5 owner range", () => {
  assert.equal(normalizeGuildRedundancyTarget(0), 1);
  assert.equal(normalizeGuildRedundancyTarget(1), 1);
  assert.equal(normalizeGuildRedundancyTarget(3.9), 3);
  assert.equal(normalizeGuildRedundancyTarget(99), 5);
  assert.equal(normalizeGuildRedundancyTarget("bad", 4), 4);
});

test("raising redundancy target creates additional evidence-safe farm work", () => {
  const readyMember = { id: "ready", name: "Ready", allyCode: "111111111" };
  const nearMember = { id: "near", name: "Near", allyCode: "222222222", galacticPower: 9_000_000 };
  const mission = {
    key: "p1:m1",
    planetId: "mustafar",
    planetName: "Mustafar",
    phase: "P1",
    lane: "Dark Side",
    evidence: "exact",
    mission: { id: "m1", name: "Mission One", entry: { verified: true, unitType: "Character", relicMin: 5, squadSize: 5 } },
    exactReady: [{ member: readyMember }],
    evaluations: [
      { member: readyMember, rosterAvailable: true, exactReady: true, blockerRows: [], poolShortfall: 0 },
      {
        member: nearMember,
        rosterAvailable: true,
        exactReady: false,
        poolShortfall: 0,
        blockerRows: [{
          baseId: "UNIT_A",
          name: "Unit A",
          unit: { baseId: "UNIT_A", name: "Unit A", unitType: "Character", relic: 4, gear: 13, stars: 7 },
          gap: { relic: 1, score: 10_000 },
        }],
      },
    ],
  };

  assert.equal(buildGuildRoteMissionFarms([mission], 1).length, 0, "one existing ready owner satisfies a 1-owner target");
  const threeOwnerPlan = buildGuildRoteMissionFarms([mission], 3);
  assert.equal(threeOwnerPlan.length, 1);
  assert.equal(threeOwnerPlan[0].member.name, "Near");
  assert.equal(threeOwnerPlan[0].unitName, "Unit A");
});

test("officer brief names the active redundancy target", () => {
  const text = buildOfficerBrief({
    redundancyTarget: 4,
    summary: {
      exactCoveragePercent: 90,
      redundancyCoveragePercent: 50,
      hydratedMembers: 50,
      totalMembers: 50,
      zeroCoverageMissions: 0,
      fragileMissions: 0,
      partialEvidenceMissions: 0,
    },
    zeroCoverage: [],
    fragile: [],
    farms: [{ member: { name: "Player" }, unitName: "Unit A", gapLabel: "+1 relic", missionImpact: 2 }],
  }, "Guild");
  assert.match(text, /4\+ redundancy: \*\*50%\*\*/);
  assert.match(text, /Highest-Impact Farms · 4-Owner Target/);
});

test("mission coverage publishes target changes and explicit refresh invalidates only the guild cache", () => {
  const source = fs.readFileSync(new URL("../public/guild-rote-mission-coverage.js", import.meta.url), "utf8");
  assert.match(source, /data-guild-mission-redundancy/);
  assert.match(source, /swgoh:guild-rote-redundancy-target/);
  assert.match(source, /__swgohGuildRoteRedundancyTarget/);
  assert.match(source, /__swgohSharedFetchCache\?\.clear\?\.\("guild", allyCode\)/);
});

test("member handoff and officer exports follow the shared target", () => {
  const handoff = fs.readFileSync(new URL("../public/guild-rote-member-plan-handoff.js", import.meta.url), "utf8");
  const exportSource = fs.readFileSync(new URL("../public/guild-rote-officer-export.js", import.meta.url), "utf8");
  assert.match(handoff, /currentRedundancyTarget/);
  assert.match(handoff, /swgoh:guild-rote-redundancy-target/);
  assert.match(handoff, /guildHandoffSignature/);
  assert.match(exportSource, /currentRedundancyTarget/);
  assert.match(exportSource, /swgoh:guild-rote-redundancy-target/);
});

test("redundancy toolbar override is wired into production after base guild coverage styles", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(index, /guild-rote-redundancy-target\.css/);
  assert.ok(index.indexOf("/guild-rote-redundancy-target.css") > index.indexOf("/guild-rote-mission-coverage.css"));
});
