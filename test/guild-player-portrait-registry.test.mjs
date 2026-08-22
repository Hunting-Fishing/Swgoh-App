import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_GAMEDATA_URL,
  installGameDataRegistry,
  installRegistry,
  normalizeGameDataPortrait,
  normalizePortraitId,
  playerPortraitTexture,
  portraitRegistrySize,
  portraitRegistryStatus,
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
  assert.equal(normalizeGameDataPortrait({ id: 'PLAYERPORTRAIT_TEST', icon: 'javascript:alert(1)' }), null);
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

test('public gamedata fallback can build the same trusted portrait registry when local cache is empty', () => {
  installGameDataRegistry({ data: [
    { id: 'PLAYERPORTRAIT_DEFAULT', icon: 'tex.vanity_clonesergeant' },
    { id: 'PLAYERPORTRAIT_JEDIMASTER', icon: 'tex.vanity_yoda' },
    { id: 'bad', icon: 'tex.vanity_bad' },
  ] });
  assert.equal(portraitRegistrySize(), 2);
  assert.equal(resolvePlayerPortraitUrl('PLAYERPORTRAIT_DEFAULT'), 'https://game-assets.swgoh.gg/tex.vanity_clonesergeant.png');
  assert.equal(playerPortraitTexture('PLAYERPORTRAIT_JEDIMASTER'), 'tex.vanity_yoda');
  assert.equal(portraitRegistryStatus().source, 'public-gamedata-fallback');
  assert.match(FALLBACK_GAMEDATA_URL, /^https:\/\/raw\.githubusercontent\.com\/swgoh-utils\/gamedata\//);
});
