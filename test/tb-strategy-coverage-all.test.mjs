import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  allTerritoryBattleMissions,
  allTerritoryBattleStrategyCoverageReport,
  TB_COVERAGE_IDS,
  territoryBattleCoverageGaps,
  territoryBattleStrategyCoverage,
} from "../public/tb-strategy-coverage-all.js";
import { DS_GEO_TERRITORIES } from "../public/ds-geo-data.js";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";

const findMission = (territories, id) => territories.flatMap((territory) => territory.missions || []).find((mission) => mission.id === id);

test("all-TB audit includes ROTE, both Geo TBs, and both Hoth TBs", () => {
  const report = allTerritoryBattleStrategyCoverageReport();
  const expected = Object.values(TB_COVERAGE_IDS).sort();
  assert.deepEqual(Object.keys(report.byTb).sort(), expected);
  assert.equal(report.rows.length, allTerritoryBattleMissions().length);
  assert.equal(report.counts.covered + report.counts.partial + report.counts.missing, report.counts.total);
  for (const tbId of expected) assert.ok(report.byTb[tbId].counts.total > 0, `${tbId} should contain missions`);
});

test("recommendation-only legacy missions remain partial instead of being promoted to verified strategy", () => {
  const mission = findMission(GEO_LS_TERRITORIES, "p1-mid-cm1");
  const row = territoryBattleStrategyCoverage(mission);
  assert.equal(row.coverage, "partial");
  assert.equal(row.planningAvailable, true);
  assert.ok(row.recommendationCount > 0);
  assert.match(row.reason, /no sourced mission-specific battle stages/i);
});

test("existing KAM and Wat battle packs are surfaced by the legacy audit", () => {
  const kam = territoryBattleStrategyCoverage(findMission(GEO_LS_TERRITORIES, "p3-kam"));
  assert.notEqual(kam.coverage, "missing");
  assert.equal(kam.strategyAvailable, true);

  const wat = territoryBattleStrategyCoverage(findMission(DS_GEO_TERRITORIES, "s3"));
  assert.notEqual(wat.coverage, "missing");
  assert.equal(wat.strategyAvailable, true);
});

test("coverage gaps can be filtered by Territory Battle and state", () => {
  const geoLsPartial = territoryBattleCoverageGaps({ tbId: TB_COVERAGE_IDS.GEO_LS, coverage: "partial" });
  assert.ok(geoLsPartial.length > 0);
  assert.ok(geoLsPartial.every((row) => row.tbId === TB_COVERAGE_IDS.GEO_LS && row.coverage === "partial"));
});

test("all-TB coverage modules parse", () => {
  for (const path of [
    new URL("../public/tb-strategy-coverage-all.js", import.meta.url),
    new URL("../scripts/report-all-tb-strategy-coverage.mjs", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
