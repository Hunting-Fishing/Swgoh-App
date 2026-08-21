import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const enhancer = fs.readFileSync(new URL('../public/player-command-professional.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/player-command-professional.css', import.meta.url), 'utf8');
const assets = fs.readFileSync(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');
const resources = fs.readFileSync(new URL('../public/resource-library.js', import.meta.url), 'utf8');
const farmLoader = fs.readFileSync(new URL('../public/farm-gallery-style-loader.js', import.meta.url), 'utf8');

test('Player professional layer loads additively through the existing asset chain', () => {
  assert.match(assets, /import '\.\/player-command-professional\.js'/);
  assert.match(enhancer, /player-command-professional\.css/);
  assert.match(enhancer, /player-pro-enhanced/);
  for (const id of ['roster', 'farm', 'mods', 'resources', 'events']) {
    assert.match(enhancer, new RegExp(`data-workspace-panel=\\"${id}\\"`));
  }
});

test('Player professional enhancer does not delete, replace or fetch workspace information', () => {
  assert.doesNotMatch(enhancer, /\.remove\s*\(/);
  assert.doesNotMatch(enhancer, /removeChild\s*\(/);
  assert.doesNotMatch(enhancer, /replaceChildren\s*\(/);
  assert.doesNotMatch(enhancer, /\.innerHTML\s*=/);
  assert.doesNotMatch(enhancer, /\bfetch\s*\(/);
  assert.doesNotMatch(enhancer, /\.hidden\s*=\s*true/);
  assert.doesNotMatch(enhancer, /style\.display\s*=\s*['\"]none/);
});

test('original roster and detailed farm planning surfaces are explicitly retained', () => {
  assert.match(styles, /#controls\.pro-legacy-roster\s*\{[^}]*display:\s*grid\s*!important/s);
  assert.match(styles, /#roster\.pro-legacy-roster\s*\{[^}]*display:\s*grid\s*!important/s);
  assert.match(styles, /#farmMasterPlan\s*\{[^}]*display:\s*grid\s*!important/s);
  assert.match(styles, /DETAILED REFERENCE · RETAINED/);
  assert.doesNotMatch(farmLoader, /display:\s*none/i);
});

test('Events and Resources visual library supplements rather than replaces detailed workspace DOM', () => {
  assert.match(resources, /panel\.prepend\s*\(/);
  assert.match(resources, /ccv2-library-surface/);
  assert.doesNotMatch(resources, /panel\.innerHTML\s*=/);
  assert.doesNotMatch(resources, /replaceChildren\s*\(/);
});

test('professional styling covers Roster, Farm, Journey, Mods and Mod Optimizer responsively', () => {
  for (const selector of [
    '.pro-command-header',
    '.farm-gallery-tabs',
    '.farm-unit-grid',
    '.journey-current-band',
    '.journey-current-card',
    '.mods-pro-heading',
    '.mods-summary-grid',
    '.mod-opt-controls',
  ]) assert.match(styles, new RegExp(selector.replaceAll('.', '\\.')));
  assert.match(styles, /@media \(max-width:1280px\)/);
  assert.match(styles, /@media \(max-width:900px\)/);
  assert.match(styles, /@media \(max-width:620px\)/);
});
