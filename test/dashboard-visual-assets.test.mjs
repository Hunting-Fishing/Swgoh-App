import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/dashboard-visual-assets.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

const module = await import('../public/tb-visual-assets-data.js');

test('dashboard location visuals reuse the existing vetted ROTE asset contract', () => {
  assert.match(source, /ROTE_VISUAL_ASSETS/);
  assert.match(source, /TB_MISSION_VISUAL_ASSETS/);
  assert.match(source, /tatooine/);
  assert.match(source, /felucia/);
  assert.match(source, /bracca/);
  assert.match(source, /zeffo/);
  assert.ok(module.ROTE_VISUAL_ASSETS.planets.tatooine);
  assert.ok(module.ROTE_VISUAL_ASSETS.planets.felucia);
});

test('dashboard does not hardcode fake inline game image URLs', () => {
  assert.doesNotMatch(source, /images\.unsplash|placeholder\.com|picsum|data:image/);
});

test('dashboard visual asset enhancer and stylesheet are loaded by the main shell', () => {
  assert.match(index, /dashboard-visual-assets\.css\?v=20260820-ui4/);
  assert.match(index, /dashboard-visual-assets\.js\?v=20260820-ui4/);
});
