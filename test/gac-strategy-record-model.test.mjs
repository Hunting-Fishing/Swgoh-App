import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  constraintMatches,
  findExactStrategy,
  recordMatches,
  strategyGuidance,
  validateRecord,
  withinValidity,
} from "../public/gac-strategy-record-model.js";
import { catalogPayload } from "../public/gac-strategy-catalog.js";

function record(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "strategy:test:3v3",
    status: "active",
    format: "3v3",
    defender: { leaderBaseId: "DEF_LEAD", members: ["DEF_LEAD", "DEF_2", "DEF_3"] },
    attacker: { leaderBaseId: "ATT_LEAD", members: ["ATT_LEAD", "ATT_2", "ATT_3"] },
    attackerDatacron: { required: false, setIds: [], mechanicIds: [] },
    defenderDatacron: { required: false, setIds: [], mechanicIds: [] },
    guidance: {
      opening: [{ text: "Use the sourced opening sequence." }],
      targets: [{ text: "Follow the sourced target priority." }],
      mechanics: [{ text: "Respect the sourced matchup mechanic." }],
      avoid: [{ text: "Avoid the sourced failure condition." }],
    },
    provenance: {
      sourceName: "Curated strategy source",
      sourceRef: "strategy-source:fixture",
      sourceType: "curated",
      author: "Fixture Author",
      sourceUpdatedAt: "2026-08-20T00:00:00Z",
      capturedAt: "2026-08-20T01:00:00Z",
    },
    validity: {
      validFrom: "2026-08-01T00:00:00Z",
      validUntil: "2026-09-01T00:00:00Z",
      gameDataVersion: "fixture-v1",
    },
    ...overrides,
  };
}

const exactContext = {
  format: "3v3",
  defenderMembers: ["DEF_3", "DEF_LEAD", "DEF_2"],
  attackerMembers: ["ATT_2", "ATT_3", "ATT_LEAD"],
  attackerDatacron: { known: true, setId: "", mechanicIds: [] },
  defenderDatacron: { known: false, setId: "", mechanicIds: [] },
  now: Date.parse("2026-08-20T12:00:00Z"),
};

test("valid strategy records require exact squads, guidance and provenance", () => {
  const result = validateRecord(record());
  assert.equal(result.valid, true);
  assert.equal(result.record.defender.members.length, 3);
  assert.equal(result.record.guidance.hasContent, true);

  const missingProvenance = validateRecord(record({ provenance: { sourceName: "Only a name" } }));
  assert.equal(missingProvenance.valid, false);
  assert.ok(missingProvenance.errors.includes("missing-source-ref"));
  assert.ok(missingProvenance.errors.includes("missing-source-date"));
  assert.ok(missingProvenance.errors.includes("missing-captured-date"));
});

test("exact strategy match is composition-based and rejects same-leader variants", () => {
  const validated = validateRecord(record()).record;
  assert.equal(recordMatches(validated, exactContext), true);
  assert.equal(recordMatches(validated, { ...exactContext, defenderMembers: ["DEF_LEAD", "OTHER_2", "DEF_3"] }), false);
  assert.equal(recordMatches(validated, { ...exactContext, attackerMembers: ["ATT_LEAD", "OTHER_2", "ATT_3"] }), false);
  assert.equal(recordMatches(validated, { ...exactContext, format: "5v5" }), false);
});

test("validity windows fail closed for future and expired tactics", () => {
  const validated = validateRecord(record()).record;
  assert.equal(withinValidity(validated, Date.parse("2026-08-20T12:00:00Z")), true);
  assert.equal(withinValidity(validated, Date.parse("2026-07-31T23:59:59Z")), false);
  assert.equal(withinValidity(validated, Date.parse("2026-09-02T00:00:00Z")), false);
});

test("Datacron-constrained tactics require known matching Datacron evidence", () => {
  const constrained = validateRecord(record({
    attackerDatacron: { required: true, setIds: ["SET_17"], mechanicIds: ["MECH_A"] },
  })).record;
  assert.equal(constraintMatches(constrained.attackerDatacron, { known: false }), false);
  assert.equal(constraintMatches(constrained.attackerDatacron, { known: true, setId: "SET_17", mechanicIds: ["MECH_A"] }), true);
  assert.equal(constraintMatches(constrained.attackerDatacron, { known: true, setId: "SET_18", mechanicIds: ["MECH_A"] }), false);
  assert.equal(recordMatches(constrained, { ...exactContext, attackerDatacron: { known: false } }), false);
});

test("when several exact records are valid the newest sourced record wins deterministically", () => {
  const older = record({ id: "strategy:older", provenance: { ...record().provenance, sourceUpdatedAt: "2026-08-10T00:00:00Z" } });
  const newer = record({ id: "strategy:newer", provenance: { ...record().provenance, sourceUpdatedAt: "2026-08-19T00:00:00Z" } });
  const match = findExactStrategy([older, newer], exactContext);
  assert.equal(match.id, "strategy:newer");
  const guidance = strategyGuidance(match);
  assert.equal(guidance.sourceName, "Curated strategy source");
  assert.equal(guidance.opening.length, 1);
});

test("catalog payload rejects malformed rows instead of making them usable", () => {
  const payload = catalogPayload({ schemaVersion: 1, records: [record(), { id: "bad" }] });
  assert.equal(payload.records.length, 1);
  assert.equal(payload.rejected.length, 1);
  assert.ok(payload.rejected[0].errors.length > 0);
});

test("catalog payload fails closed on unsupported top-level schema", () => {
  const payload = catalogPayload({ schemaVersion: 2, records: [record()] });
  assert.equal(payload.records.length, 0);
  assert.equal(payload.rejected.length, 1);
  assert.equal(payload.rejected[0].id, "$catalog");
  assert.deepEqual(payload.rejected[0].errors, ["unsupported-catalog-schema-version"]);
});

test("catalog payload rejects duplicate stable strategy IDs", () => {
  const payload = catalogPayload({
    schemaVersion: 1,
    records: [record(), record({ provenance: { ...record().provenance, sourceUpdatedAt: "2026-08-21T00:00:00Z" } })],
  });
  assert.equal(payload.records.length, 1);
  assert.equal(payload.rejected.length, 1);
  assert.equal(payload.rejected[0].id, "strategy:test:3v3");
  assert.deepEqual(payload.rejected[0].errors, ["duplicate-id"]);
});

test("production strategy catalog is intentionally empty until sourced ingestion", async () => {
  const body = JSON.parse(await readFile(new URL("../public/data/gac-strategy-records.json", import.meta.url), "utf8"));
  assert.equal(body.schemaVersion, 1);
  assert.deepEqual(body.records, []);
  assert.match(body.sourcePolicy, /provenance-backed/i);
  assert.match(body.sourcePolicy, /No unsourced opening move/i);
});

test("Attack Brief wires exact strategy lookup but keeps the controller read-only", async () => {
  const controller = await readFile(new URL("../public/gac-war-room-attack-brief.js", import.meta.url), "utf8");
  assert.match(controller, /findStrategyGuidance\(strategyLookupContext/);
  assert.match(controller, /defenseDatacronMatchContext/);
  assert.doesNotMatch(controller, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});
