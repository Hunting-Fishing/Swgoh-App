import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameAssetUrl, swgohGgAssetUrl } from '../public/gac-ux-polish.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('GAC asset fallback derives canonical game and SWGOH.GG URLs', () => {
  assert.equal(gameAssetUrl('tex.charui_bossnass'), 'https://game-assets.swgoh.gg/textures/tex.charui_bossnass.png');
  assert.equal(gameAssetUrl('textures/tex.charui_bossnass.png'), 'https://game-assets.swgoh.gg/textures/tex.charui_bossnass.png');
  assert.equal(swgohGgAssetUrl('tex.charui_bossnass'), 'https://swgoh.gg/static/img/assets/tex.charui_bossnass.png');
});

test('GAC UX layer includes move, empty-target and occupied-slot swap workflows', () => {
  const source = fs.readFileSync(path.join(root, 'public/gac-ux-polish.js'), 'utf8');
  assert.match(source, /data-gac-ux-move/);
  assert.match(source, /gac-ux-move-target/);
  assert.match(source, /gac-ux-swap-target/);
  assert.match(source, /async function swapWith/);
  assert.match(source, /async function editPosition/);
  assert.match(source, /REARRANGE BOARD/);
});

test('GAC UX layer restores portraits from the static catalog and existing asset chain', () => {
  const source = fs.readFileSync(path.join(root, 'public/gac-ux-polish.js'), 'utf8');
  assert.match(source, /\/data\/catalog\.json\?gac-ux=assets1/);
  assert.match(source, /thumbnailName/);
  assert.match(source, /game-assets\.swgoh\.gg\/textures/);
  assert.match(source, /swgoh\.gg\/static\/img\/assets/);
  assert.match(source, /advanceImage/);
});

test('GAC workspace polish keeps counters compact and adds navigation/collapse controls', () => {
  const source = fs.readFileSync(path.join(root, 'public/gac-ux-polish.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/gac-ux-polish.css'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');
  assert.match(source, /1 Opponent/);
  assert.match(source, /2 My Defense/);
  assert.match(source, /3 Battle Table/);
  assert.match(source, /4 Counters/);
  assert.match(source, /Collapse roster/);
  assert.match(css, /gac-manual-counter-list\{grid-template-columns:repeat\(2/);
  assert.match(css, /gac-manual-counter-versus>div\{display:grid!important;grid-template-columns:repeat\(5,52px\)/);
  assert.match(loader, /import '\.\/gac-ux-polish\.js'/);
});
