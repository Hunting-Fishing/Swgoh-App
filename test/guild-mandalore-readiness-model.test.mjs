import test from "node:test";
import assert from "node:assert/strict";
import {
  MANDALORE_UNLOCK_TARGET,
  buildMandaloreMemberReadiness,
  buildGuildMandaloreReadiness,
} from "../public/guild-mandalore-readiness-model.js";

const catalog = [
  { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", categories: ["Mandalorian"] },
  { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", categories: ["Mandalorian"] },
  { baseId: "PAZVIZSLA", name: "Paz Vizsla", categories: ["Mandalorian"] },
  { baseId: "IG12", name: "IG-12 & Grogu", categories: ["Mandalorian"] },
];

const unit = (baseId, relic, gear = 13, power = 1) => ({ baseId, relic, gear, power });

test("Mandalore unlock target is 25 clears", () => {
  assert.equal(MANDALORE_UNLOCK_TARGET, 25);
});

test("member is ready with BKM R7, BAM R7 and any additional Mandalorian R7", () => {
  const row = buildMandaloreMemberReadiness({
    name: "Ready Officer",
    units: [unit("MANDALORBOKATAN", 7), unit("THEMANDALORIANBESKARARMOR", 7), unit("PAZVIZSLA", 7)],
  }, catalog);
  assert.equal(row.status, "READY");
  assert.equal(row.thirdMando.name, "Paz Vizsla");
  assert.equal(row.thirdMando.state.label, "R7");
});

test("best additional Mandalorian is selected automatically", () => {
  const row = buildMandaloreMemberReadiness({
    units: [
      unit("MANDALORBOKATAN", 7),
      unit("THEMANDALORIANBESKARARMOR", 7),
      unit("PAZVIZSLA", 5, 13, 100),
      unit("IG12", 8, 13, 50),
    ],
  }, catalog);
  assert.equal(row.thirdMando.name, "IG-12 & Grogu");
  assert.equal(row.thirdMando.state.label, "R8");
  assert.equal(row.status, "READY");
});

test("R5-R6 gate pieces are almost and R4 or lower is far", () => {
  const close = buildMandaloreMemberReadiness({ units: [unit("MANDALORBOKATAN", 6), unit("THEMANDALORIANBESKARARMOR", 5), unit("PAZVIZSLA", 6)] }, catalog);
  const far = buildMandaloreMemberReadiness({ units: [unit("MANDALORBOKATAN", 7), unit("THEMANDALORIANBESKARARMOR", 7), unit("PAZVIZSLA", 4)] }, catalog);
  assert.equal(close.status, "ALMOST");
  assert.equal(far.status, "FAR");
});

test("guild summary uses 25-ready unlock threshold", () => {
  const readyMember = (index) => ({ name: `P${index}`, units: [unit("MANDALORBOKATAN", 7), unit("THEMANDALORIANBESKARARMOR", 7), unit("PAZVIZSLA", 7)] });
  const report = buildGuildMandaloreReadiness({ guild: { name: "Guild" }, members: Array.from({ length: 25 }, (_, i) => readyMember(i)) }, catalog);
  assert.equal(report.summary.ready, 25);
  assert.equal(report.summary.canFieldUnlockCount, true);
  assert.equal(report.summary.buffer, 0);
});
