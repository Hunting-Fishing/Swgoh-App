import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installRegistry,
  normalizePortraitId,
  playerPortraitTexture,
  portraitRegistrySize,
  resolvePlayerPortraitUrl,
  trustedPortraitUrl,
} from '../public/guild-player-portrait-registry.js';
import { normalizePortrait } from '../scripts/sync-player-portraits.mjs';

test('build-time portrait normalization maps game portrait ID to dedicated asset CDN', () => {
  const row = normalizePortrait({
    id: 'PLAYERPORTRAIT_JEDIMASTER',
    icon: 'tex.vanity_yoda',
    obtainable: true,
    hidden: false,
  });
  assert.equal(row.id, 'PLAYERPORTRAIT_JEDIMASTER');
  assert.equal(row.icon, 'tex.vanity_yoda');
  assert.equal(row.image, 'https://game-assets.swgoh.gg/tex.vanity_yoda.png');
});

test('portrait normalization rejects malformed IDs and texture keys', () => {
  assert.equal(normalizePortrait({ id: 'bad', icon: 'tex.vanity_yoda' }), null);
  assert.equal(normalizePortrait({ id: 'PLAYERPORTRAIT_TEST', icon: 'javascript:alert(1)' }), null);
});

test('browser portrait registry resolves only trusted same-origin or game-asset URLs', () => {
  installRegistry({ portraits: [
    { id: 'PLAYERPORTRAIT_JEDIMASTER', icon: 'tex.vanity_yoda', image: 'https://game-assets.swgoh.gg/tex.vanity_yoda.png' },
    { id: 'PLAYERPORTRAIT_EVIL', icon: 'tex.vanity_evil', image: 'https://example.com/evil.png' },
  ] });
  assert.equal(portraitRegistrySize(), 1);
  assert.equal(normalizePortraitId('playerportrait_jedimaster'), 'PLAYERPORTRAIT_JEDIMASTER');
  assert.equal(playerPortraitTexture('PLAYERPORTRAIT_JEDIMASTER'), 'tex.vanity_yoda');
  assert.equal(resolvePlayerPortraitUrl('PLAYERPORTRAIT_JEDIMASTER'), 'https://game-assets.swgoh.gg/tex.vanity_yoda.png');
  assert.equal(resolvePlayerPortraitUrl('PLAYERPORTRAIT_EVIL'), '');
  assert.equal(trustedPortraitUrl('/assets/local.png'), '/assets/local.png');
  assert.equal(trustedPortraitUrl('https://example.com/nope.png'), '');
});
