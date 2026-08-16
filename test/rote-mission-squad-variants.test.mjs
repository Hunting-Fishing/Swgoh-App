import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildMissionVariant,
  normalizeMissionVariant,
  parseMissionVariants,
} from "../public/rote-mission-squad-variants.js";

test("mission variant normalization deduplicates squad members and bounds stored metadata", () => {
  const variant = normalizeMissionVariant({
    id: "v1",
    name: "A".repeat(100),
    baseIds: ["A", "A", "B"],
    planetId: "mustafar",
    nodeId: "node-1",
    missionId: "mission-1",
    missionName: "Mission",
    sourceLabel: "Source",
    savedEntryStatus: "ENTRY LEGAL",
    createdAt: 123,
  });
  assert.equal(variant.baseIds.length, 2);
  assert.deepEqual(variant.baseIds, ["A", "B"]);
  assert.equal(variant.name.length, 60);
  assert.equal(variant.createdAt, 123);
});

test("malformed or incomplete stored variants fail closed", () => {
  assert.deepEqual(parseMissionVariants("not-json"), []);
  assert.deepEqual(parseMissionVariants(JSON.stringify([{ id: "missing-mission", baseIds: ["A"] }])), []);
  assert.deepEqual(parseMissionVariants(JSON.stringify([{ id: "missing-squad", missionId: "m1", baseIds: [] }])), []);
});

test("variant builder requires Ally Code mission context and at least one squad member", () => {
  const context = {
    planetId: "mustafar",
    nodeId: "n1",
    missionId: "m1",
    missionName: "Mission One",
    sourceLabel: "Manual legal mission core · GP-ranked",
  };
  assert.equal(buildMissionVariant({ context, allyCode: "123", baseIds: ["A"] }), null);
  assert.equal(buildMissionVariant({ context: {}, allyCode: "123456789", baseIds: ["A"] }), null);
  assert.equal(buildMissionVariant({ context, allyCode: "123456789", baseIds: [] }), null);
});

test("variant builder preserves mission source and saved entry-status snapshot", () => {
  const context = {
    planetId: "mustafar",
    nodeId: "n1",
    missionId: "m1",
    missionName: "Mission One",
    sourceLabel: "Saved source",
  };
  const variant = buildMissionVariant({
    context,
    allyCode: "123-456-789",
    baseIds: ["A", "B", "C"],
    name: "Counter Test",
    entryStatus: "ENTRY LEGAL",
    existing: [],
  });
  assert.ok(variant);
  assert.equal(variant.name, "Counter Test");
  assert.equal(variant.missionId, "m1");
  assert.equal(variant.savedEntryStatus, "ENTRY LEGAL");
  assert.equal(variant.sourceLabel, "Saved source");
});

test("loading a saved variant restores mission context before replacing squad", () => {
  const source = fs.readFileSync(new URL("../public/rote-mission-squad-variants.js", import.meta.url), "utf8");
  const contextPosition = source.indexOf('new CustomEvent("swgoh:set-squad-mission-context"');
  const replacePosition = source.indexOf('new CustomEvent("swgoh:replace-squad"');
  assert.ok(contextPosition >= 0);
  assert.ok(replacePosition > contextPosition);
  assert.match(source, /Load \+ Re-evaluate/);
  assert.match(source, /loading always re-runs the current mission-entry assessment/);
});

test("variant library is Ally Code plus mission scoped and render-loop guarded", () => {
  const source = fs.readFileSync(new URL("../public/rote-mission-squad-variants.js", import.meta.url), "utf8");
  assert.match(source, /swgoh:rote-mission-variants:v1/);
  assert.match(source, /\$\{STORAGE_PREFIX\}:\$\{allyCode\}:\$\{missionId\}/);
  assert.match(source, /librarySignature/);
  assert.match(source, /existing\?\.dataset\.signature === sig/);
});

test("mission variant assets are wired after Squad ROTE mission context", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-mission-squad-variants.css", import.meta.url), "utf8");
  assert.match(index, /rote-mission-squad-variants\.css/);
  assert.match(index, /rote-mission-squad-variants\.js/);
  assert.ok(index.indexOf("/rote-mission-squad-variants.js") > index.indexOf("/squad-rote-mission-context.js"));
  assert.match(css, /\.squad-rote-variants/);
  assert.match(css, /\.rote-variant-row/);
});
