import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeAttempt,
  sanitizeStoredBanners,
  validatedResultBanners,
} from '../gac-attack-plan-service.mjs';

test('server banner truth preserves unknown and rejects malformed submitted values', () => {
  assert.equal(sanitizeStoredBanners(null), null);
  assert.equal(sanitizeStoredBanners(''), null);
  assert.equal(sanitizeStoredBanners('bad'), null);
  assert.equal(sanitizeStoredBanners(-1), null);
  assert.equal(sanitizeStoredBanners(2.5), null);
  assert.equal(sanitizeStoredBanners(0), 0);
  assert.equal(sanitizeStoredBanners(65), 65);

  assert.equal(validatedResultBanners(''), null);
  assert.equal(validatedResultBanners(0), 0);
  assert.equal(validatedResultBanners('65'), 65);
  assert.throws(() => validatedResultBanners(-1), /non-negative whole number/i);
  assert.throws(() => validatedResultBanners(2.5), /non-negative whole number/i);
  assert.throws(() => validatedResultBanners('bad'), /non-negative whole number/i);
});

test('stored attempt with malformed banners never becomes a fake zero', () => {
  const attempt = sanitizeAttempt({
    members:['ATK_A'],
    leaderBaseId:'ATK_A',
    status:'loss',
    banners:'bad',
    at:'2026-08-21T06:00:00Z',
  });
  assert.equal(attempt.banners, null);
  assert.equal(attempt.postAttempt.defenseState, 'unknown');
});
