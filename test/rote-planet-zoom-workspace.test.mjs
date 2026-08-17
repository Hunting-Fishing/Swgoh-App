import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { roteMissionMap } from "../public/rote-mission-map-registry.js";
import { missionEntryRule, resolveRoteMissionNodes } from "../public/rote-mission-node-eligibility.js";
import {
  missionTypeConflict,
  poolEvidenceLevel,
  recommendationBaseIds,
} from "../public/rote-planet-zoom-workspace.js";

test("character pools are presented as exact while incomplete generic fleet pools fail closed", () => {
  const qira = resolveRoteMissionNodes("corellia", roteMissionMap("corellia")).nodes.find((node) => node.missionId === "corellia-qira");
  const genericFleet = resolveRoteMissionNodes("felucia", roteMissionMap("felucia")).nodes.find((node) => node.mission?.missionType === "fleet");
  assert.equal(poolEvidenceLevel(missionEntryRule(qira.mission)), "exact");
  assert.equal(poolEvidenceLevel(missionEntryRule(genericFleet.mission)), "gate-only");
});

test("Hondo mission-type disagreement is surfaced while Reva marker alias is not treated as a conflict", () => {
  const felucia = resolveRoteMissionNodes("felucia", roteMissionMap("felucia"));
  const hondo = felucia.nodes.find((node) => node.missionId === "felucia-hondo");
  assert.ok(hondo);
  assert.equal(hondo.type, "combat");
  assert.equal(hondo.mission.missionType, "special");
  assert.equal(missionTypeConflict(hondo), true);

  const tatooine = resolveRoteMissionNodes("tatooine", roteMissionMap("tatooine"));
  const reva = tatooine.nodes.find((node) => node.missionId === "tatooine-reva");
  assert.equal(reva.type, "reva");
  assert.equal(reva.mission.missionType, "special");
  assert.equal(missionTypeConflict(reva), false);
});

test("recommended-team loader resolves missing Base IDs from the static catalog by unit name", () => {
  const byId = new Map([
    ["QIRA", { baseId: "QIRA", name: "Qi'ra" }],
    ["YOUNGHAN", { baseId: "YOUNGHAN", name: "Young Han Solo" }],
  ]);
  const byName = new Map([
    ["qi ra", { baseId: "QIRA", name: "Qi'ra" }],
    ["young han solo", { baseId: "YOUNGHAN", name: "Young Han Solo" }],
  ]);
  const recommendation = {
    members: [
      { name: "Qi'ra", baseId: "" },
      { name: "Young Han Solo", baseId: "YOUNGHAN" },
    ],
  };
  assert.deepEqual(recommendationBaseIds(recommendation, { byId, byName }), ["QIRA", "YOUNGHAN"]);
});

test("zoom workspace retires the side board and opens mission detail as a floating popup on the full planet map", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-planet-zoom-workspace.css", import.meta.url), "utf8");
  const overlayCss = fs.readFileSync(new URL("../public/rote-planet-zoom-overlay.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/rote-planet-zoom-workspace.js", import.meta.url), "utf8");
  assert.match(index, /rote-planet-zoom-workspace\.css/);
  assert.match(index, /rote-planet-zoom-overlay\.css/);
  assert.match(index, /rote-planet-zoom-workspace\.js/);
  assert.match(css, /#roteMissionBoard\s*\{\s*display:\s*none\s*!important;/s);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(overlayCss, /\.rote-zoom-stage\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
  assert.match(overlayCss, /\.rote-zoom-inspector\s*\{[^}]*position:\s*absolute;[^}]*top:\s*clamp\([^}]*right:\s*clamp\([^}]*bottom:\s*auto;[^}]*max-height:\s*min\([^}]*border-radius:\s*18px;/s);
  assert.doesNotMatch(overlayCss, /\.rote-zoom-inspector\s*\{[^}]*top:\s*0;[^}]*bottom:\s*0;/s);
  assert.match(overlayCss, /@media \(max-width:\s*1080px\)[\s\S]*\.rote-zoom-inspector\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*12px;[^}]*left:\s*12px;[^}]*max-height:\s*46vh;/s);
  assert.match(js, /REQUIRED UNITS/);
  assert.match(js, /EXACT ALLOWED SET/);
  assert.match(js, /YOUR LEGAL UNITS/);
  assert.match(js, /RECOMMENDED TEAM/);
});
