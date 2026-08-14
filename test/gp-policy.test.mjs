import test from "node:test";
import assert from "node:assert/strict";
import { describeGpQuality, selectProfileGp } from "../public/gp-policy.js";

test("authoritative Comlink GP wins over mismatched calculated roster sums", () => {
  const result = selectProfileGp(
    {
      galacticPower: 10_000_000,
      characterGalacticPower: 6_250_000,
      shipGalacticPower: 3_750_000,
    },
    [{ power: 100_000 }, { power: 200_000 }],
    [{ power: 50_000 }]
  );

  assert.equal(result.totalGp, 10_000_000);
  assert.equal(result.characterGp, 6_250_000);
  assert.equal(result.shipGp, 3_750_000);
  assert.equal(result.rosterGp, 350_000);
  assert.equal(result.rosterDifference, -9_650_000);
  assert.match(describeGpQuality(result), /Comlink profile GP is authoritative/);
  assert.match(describeGpQuality(result), /diagnostic only/);
});

test("calculated roster GP is only a fallback when profile GP is absent", () => {
  const result = selectProfileGp(
    {},
    [{ power: 125_000 }, { power: 275_000 }],
    [{ power: 75_000 }]
  );

  assert.equal(result.characterGp, 400_000);
  assert.equal(result.shipGp, 75_000);
  assert.equal(result.totalGp, 475_000);
  assert.equal(result.usesAuthoritativeProfile, false);
  assert.match(describeGpQuality(result), /derived from the calculated live roster/);
});

test("reported profile split is preserved even if it does not exactly equal total GP", () => {
  const result = selectProfileGp({
    galacticPower: 1_000_000,
    characterGalacticPower: 600_000,
    shipGalacticPower: 390_000,
  });

  assert.equal(result.totalGp, 1_000_000);
  assert.equal(result.characterGp, 600_000);
  assert.equal(result.shipGp, 390_000);
  assert.equal(result.splitDifference, -10_000);
  assert.match(describeGpQuality(result), /reported profile values are shown unchanged/);
});
