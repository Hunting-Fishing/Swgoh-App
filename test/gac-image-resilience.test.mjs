import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameAssetUrl, legacyAssetUrl, normalizeAssetName, portraitCandidates } from '../public/gac-image-resilience.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('legacy SWGOH portrait URLs normalize to the current game-assets host', () => {
  const legacy = 'https://swgoh.gg/static/img/assets/tex.charui_ventress.png';
  assert.equal(normalizeAssetName(legacy), 'tex.charui_ventress');
  assert.equal(gameAssetUrl(legacy), 'https://game-assets.swgoh.gg/textures/tex.charui_ventress.png');
  assert.equal(legacyAssetUrl('https://game-assets.swgoh.gg/textures/tex.charui_ventress.png'), legacy);
  assert.deepEqual(portraitCandidates(legacy), [
    legacy,
    'https://game-assets.swgoh.gg/textures/tex.charui_ventress.png',
  ]);
});

test('current game-assets portraits retain the legacy host as a secondary retry', () => {
  const current = 'https://game-assets.swgoh.gg/textures/tex.charui_dedrameero.png';
  assert.deepEqual(portraitCandidates(current), [
    current,
    'https://swgoh.gg/static/img/assets/tex.charui_dedrameero.png',
  ]);
});

test('non-game image URLs are not rewritten into guessed SWGOH assets', () => {
  const custom = 'https://example.com/avatar.png';
  assert.equal(normalizeAssetName(custom), '');
  assert.deepEqual(portraitCandidates(custom), [custom]);
});

test('shared GAC loader installs image resilience and visible initials fallback styling', () => {
  const loader = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'public/gac-image-resilience.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/gac-image-resilience.css'), 'utf8');
  assert.match(loader, /import '\.\/gac-image-resilience\.js'/);
  assert.match(source, /document\.addEventListener\('error'/);
  assert.match(source, /game-assets\.swgoh\.gg\/textures/);
  assert.match(source, /swgoh\.gg\/static\/img\/assets/);
  assert.match(source, /gac-image-fallback/);
  assert.match(css, /\.gac-image-fallback/);
  assert.doesNotMatch(css, /display\s*:\s*none(?!\s*!important)/i);
});
