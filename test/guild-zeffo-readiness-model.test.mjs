import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGuildZeffoReadiness,
  buildZeffoMemberReadiness,
  normalizeZeffoUnitState,
  ZEFFO_UNLOCK_TARGET,
} from "../public/guild-zeffo-readiness-model.js";

function unit(baseId, gear, relic = 0) { return { baseId, gear, relic }; }
function member(name, cere, jkck, babyCal, allyCode = "123456789") {
  return {
    name,
    allyCode,
    units: [cere, jkck, babyCal].filter(Boolean),
  };
}

test("exact toon states distinguish relic, gear and locked", () => {
  assert.equal(normalizeZeffoUnitState(unit("CALKESTIS", 13, 0)).label, "R0");
  assert.equal(normalizeZeffoUnitState(unit("CALKESTIS", 12, 0)).label, "G12");
  assert.equal(normalizeZeffoUnitState(null).label, "LOCKED");
});

test("Zeffo readiness accepts JKCK or Baby Cal at R7 with Cere R7", () => {
  const jk = buildZeffoMemberReadiness(member("JK route", unit("CEREJUNDA", 13, 7), unit("JEDIKNIGHTCAL", 13, 7), unit("CALKESTIS", 12)));
  const baby = buildZeffoMemberReadiness(member("Baby route", unit("CEREJUNDA", 13, 7), null, unit("CALKESTIS", 13, 7)));
  assert.equal(jk.status, "READY");
  assert.equal(jk.preferredPath, "JKCK");
  assert.equal(baby.status, "READY");
  assert.equal(baby.preferredPath, "Baby Cal");
});

test("R5-R6 is almost and R4-or-lower is far", () => {
  const almost = buildZeffoMemberReadiness(member("Almost", unit("CEREJUNDA", 13, 6), unit("JEDIKNIGHTCAL", 13, 5), null));
  const far = buildZeffoMemberReadiness(member("Far", unit("CEREJUNDA", 13, 5), unit("JEDIKNIGHTCAL", 13, 4), null));
  assert.equal(almost.status, "ALMOST");
  assert.equal(far.status, "FAR");
});

test("guild report separates officer action list and counts the 30-clear target", () => {
  const members = [];
  for (let i = 0; i < 31; i += 1) members.push(member(`Ready ${i}`, unit("CEREJUNDA", 13, 7), unit("JEDIKNIGHTCAL", 13, 7), null, String(100000000 + i)));
  members.push(member("Almost", unit("CEREJUNDA", 13, 6), unit("JEDIKNIGHTCAL", 13, 6), null, "200000001"));
  members.push(member("Far", unit("CEREJUNDA", 12), unit("JEDIKNIGHTCAL", 13, 4), null, "200000002"));
  const report = buildGuildZeffoReadiness({ guild: { name: "Any Guild" }, members });
  assert.equal(report.unlockTarget, ZEFFO_UNLOCK_TARGET);
  assert.equal(report.summary.ready, 31);
  assert.equal(report.summary.buffer, 1);
  assert.equal(report.summary.canFieldUnlockCount, true);
  assert.deepEqual(report.actionMembers.map((row) => row.status), ["ALMOST", "FAR"]);
});
