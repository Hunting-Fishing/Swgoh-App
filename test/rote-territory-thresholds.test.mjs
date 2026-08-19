import test from 'node:test';
import assert from 'node:assert/strict';
import { ROTE_PLANETS } from '../public/rote-map-data.js';
import {
  ROTE_THRESHOLD_REFERENCE,
  ROTE_TERRITORY_THRESHOLDS,
  rotePreloadCapBeforeStar,
  roteStarThresholdsByPlanetId,
  roteTerritoryThresholdById,
  withRoteStarThresholdCatalog,
} from '../public/rote-territory-thresholds.js';
import { optimizeTbRoute } from '../tb-route-optimizer.mjs';

function playablePhase(planet) {
  if (!planet?.bonus) return String(planet?.phase || '').toUpperCase();
  const source = ROTE_PLANETS.find((candidate) => candidate.id === planet.unlockFrom);
  const phaseNumber = Number(String(source?.phase || '').replace(/\D/g, ''));
  return phaseNumber >= 1 && phaseNumber < 6 ? `P${phaseNumber + 1}` : '';
}

test('threshold catalog covers every ROTE territory exactly once', () => {
  assert.equal(ROTE_TERRITORY_THRESHOLDS.length, ROTE_PLANETS.length);
  assert.deepEqual(
    ROTE_TERRITORY_THRESHOLDS.map((row) => row.planetId).sort(),
    ROTE_PLANETS.map((row) => row.id).sort(),
  );
  assert.equal(new Set(ROTE_TERRITORY_THRESHOLDS.map((row) => row.planetId)).size, ROTE_TERRITORY_THRESHOLDS.length);
});

test('each threshold row is ascending, positive and mapped to the playable phase', () => {
  for (const row of ROTE_TERRITORY_THRESHOLDS) {
    assert.equal(row.starThresholds.length, 3, row.planetId);
    assert.ok(row.starThresholds[0] > 0, row.planetId);
    assert.ok(row.starThresholds[1] > row.starThresholds[0], row.planetId);
    assert.ok(row.starThresholds[2] > row.starThresholds[1], row.planetId);
    const planet = ROTE_PLANETS.find((candidate) => candidate.id === row.planetId);
    assert.equal(row.playablePhase, playablePhase(planet), row.planetId);
  }
});

test('known reference thresholds match published values', () => {
  assert.deepEqual(roteStarThresholdsByPlanetId('mustafar'), [116_406_250, 186_250_000, 248_333_333]);
  assert.deepEqual(roteStarThresholdsByPlanetId('geonosis'), [148_125_000, 237_000_000, 316_000_000]);
  assert.deepEqual(roteStarThresholdsByPlanetId('zeffo'), [143_589_583, 229_743_333, 287_179_167]);
  assert.deepEqual(roteStarThresholdsByPlanetId('mandalore'), [197_748_650, 316_397_840, 396_497_300]);
  assert.deepEqual(roteStarThresholdsByPlanetId('death-star'), [582_632_425, 1_059_331_682, 1_246_272_567]);
  assert.deepEqual(roteStarThresholdsByPlanetId('scarif'), [555_710_999, 1_010_383_635, 1_188_686_629]);
});

test('preload cap helper stops one TP before the requested star', () => {
  assert.equal(rotePreloadCapBeforeStar('geonosis', 1), 148_124_999);
  assert.equal(rotePreloadCapBeforeStar('mustafar', 2), 186_249_999);
  assert.equal(rotePreloadCapBeforeStar('scarif', 3), 1_188_686_628);
  assert.equal(rotePreloadCapBeforeStar('unknown', 1), null);
});

test('catalog decoration retains officer/live state while adding provenance', () => {
  const [zone] = withRoteStarThresholdCatalog([{ planet_id: 'bracca', current_tp: 123, command_state: 'preload' }]);
  assert.equal(zone.current_tp, 123);
  assert.equal(zone.command_state, 'preload');
  assert.deepEqual(zone.starThresholds, [142_265_625, 227_625_000, 303_500_000]);
  assert.equal(zone.starThresholdSource.kind, 'community-reference');
  assert.equal(zone.starThresholdSource.dataset, ROTE_THRESHOLD_REFERENCE.dataset);
  assert.match(zone.starThresholdSource.url, /swgoh\.wiki/);
});

test('threshold catalog feeds exact protected next-star ceiling into route optimizer', () => {
  const [zone] = withRoteStarThresholdCatalog([{
    planetId: 'geonosis',
    currentTp: 120_000_000,
    currentStars: 0,
    targetStars: 1,
    remainingMissionTp: 0,
    remainingOperationTp: 0,
  }]);
  const result = optimizeTbRoute({ remainingGuildDeploymentTp: 40_000_000, zones: [zone] });
  assert.equal(result.zones[0].targetThresholdTp, 148_125_000);
  assert.equal(result.zones[0].safeCeilingTp, 236_999_999);
  assert.equal(result.zones[0].recommendedDeploymentTp, 28_125_000);
});

test('unknown territory stays undecorated so optimizer can fail closed', () => {
  const unknown = roteTerritoryThresholdById('not-a-planet');
  assert.equal(unknown, null);
  const [zone] = withRoteStarThresholdCatalog([{ planetId: 'not-a-planet', currentTp: 10, currentStars: 0, targetStars: 1 }]);
  assert.equal(zone.starThresholds, undefined);
  const result = optimizeTbRoute({ remainingGuildDeploymentTp: 1000, zones: [zone] });
  assert.equal(result.zones[0].blocked, true);
  assert.equal(result.zones[0].blockingCode, 'STAR_THRESHOLDS_REQUIRED');
});
