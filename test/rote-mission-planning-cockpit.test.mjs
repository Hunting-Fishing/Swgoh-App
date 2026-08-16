import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  describeEntryGap,
  missionPlanningSummary,
  recommendationPlanningSummary,
} from "../public/rote-mission-planning-cockpit.js";

test("mission planning summary distinguishes ready, close, and blocked roster states", () => {
  const ready = missionPlanningSummary({
    loaded: true,
    ready: true,
    candidates: [{}, {}, {}, {}, {}],
    mandatory: [{ legal: true }],
    poolTarget: 5,
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.poolShortfall, 0);
  assert.equal(ready.mandatoryReady, 1);

  const close = missionPlanningSummary({
    loaded: true,
    ready: false,
    candidates: [{}, {}, {}, {}],
    mandatory: [{ legal: true }, { legal: false, gap: { relic: 1 } }],
    poolTarget: 5,
  });
  assert.equal(close.status, "close");
  assert.equal(close.poolShortfall, 1);
  assert.equal(close.mandatoryBlockers.length, 1);

  const blocked = missionPlanningSummary({
    loaded: true,
    ready: false,
    candidates: [{}, {}],
    mandatory: [{ legal: false }, { legal: false }],
    poolTarget: 5,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.poolShortfall, 3);
});

test("entry gaps are converted to compact actionable farm deficits", () => {
  assert.equal(describeEntryGap({ missing: true }), "Not owned");
  assert.equal(describeEntryGap({ stars: 1, relic: 2, gear: 0, power: 3500 }), "+1★ · +2 relic · +3,500 GP");
  assert.equal(describeEntryGap({ stars: 0, relic: 0, gear: 0, power: 0 }), "Entry gate met");
});

test("recommended team planning exposes ownership and legality blockers", () => {
  const summary = recommendationPlanningSummary({
    rows: [
      { owned: true, legal: true },
      { owned: true, legal: false },
      { owned: false, legal: false },
    ],
    owned: 2,
    legal: 1,
    complete: false,
  });
  assert.equal(summary.total, 3);
  assert.equal(summary.owned, 2);
  assert.equal(summary.legal, 1);
  assert.equal(summary.blockers.length, 2);
});

test("ROTE zoom loads the mission planning cockpit as an additive layer", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-mission-planning-cockpit.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/rote-mission-planning-cockpit.js", import.meta.url), "utf8");
  assert.match(index, /rote-mission-planning-cockpit\.css/);
  assert.match(index, /rote-mission-planning-cockpit\.js/);
  assert.match(css, /\.rote-plan-kpis/);
  assert.match(js, /MISSION PLANNING COCKPIT/);
  assert.match(js, /RECOMMENDED TEAM READINESS/);
  assert.match(js, /data-workspace-tab=\"roster\"/);
});
