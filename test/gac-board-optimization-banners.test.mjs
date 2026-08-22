import test from 'node:test';
import assert from 'node:assert/strict';
import { roundPlanSummary } from '../public/gac-board-optimization-model.js';

test('attempt-log banners take precedence over assignment-level duplicate banner fields', () => {
  const summary = roundPlanSummary({ assignments:[{
    status:'win',
    members:['A','B','C'],
    banners:55,
    attemptLog:[{ status:'win', members:['A','B','C'], banners:55 }],
  }]});
  assert.equal(summary.recordedBanners, 55);
  assert.equal(summary.recordedBannerSamples, 1);
});

test('assignment-level banners remain a fallback when attempt history has no banner value', () => {
  const summary = roundPlanSummary({ assignments:[{
    status:'win', members:['A','B','C'], banners:54, attemptLog:[{ status:'win', members:['A','B','C'] }],
  }]});
  assert.equal(summary.recordedBanners, 54);
  assert.equal(summary.recordedBannerSamples, 1);
});
