import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const assets = fs.readFileSync(new URL('../public/asset-resilience.js', import.meta.url), 'utf8');
const enhancer = fs.readFileSync(new URL('../public/guild-command-professional.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/guild-command-professional.css', import.meta.url), 'utf8');

test('Guild professional layer loads additively from the existing frontend chain', () => {
  assert.match(assets, /import '\.\/guild-command-professional\.js'/);
  assert.match(enhancer, /guild-command-professional\.css\?v=20260821-guildpro1/);
});

test('Guild enhancer is presentation-only and preserves rendered information', () => {
  assert.match(enhancer, /guild-pro-enhanced/);
  assert.match(enhancer, /classifyCapabilityCards/);
  assert.match(enhancer, /classifyStats/);
  assert.match(enhancer, /enhanceTabs/);
  assert.doesNotMatch(enhancer, /\.remove\s*\(/);
  assert.doesNotMatch(enhancer, /\.replaceChildren\s*\(/);
  assert.doesNotMatch(enhancer, /fetch\s*\(/);
});

test('Guild professional CSS explicitly follows enhancement-only presentation', () => {
  assert.match(styles, /Enhancement-only: this file does not hide, remove, replace, or suppress guild information/);
  assert.doesNotMatch(styles, /display:\s*none\s*!important/);
  assert.doesNotMatch(styles, /visibility:\s*hidden/);
});

test('Guild professional UI keeps all major information surfaces visible and readable', () => {
  for (const selector of [
    'guild-page-header',
    'guild-page-tabs',
    'guild-page-stat-grid',
    'guild-capability-grid',
    'guild-members-toolbar',
    'guild-members-table',
    'guild-member-detail',
  ]) assert.match(styles, new RegExp(`\\.${selector}`));
  assert.match(styles, /\.guild-capability-card\.is-tb/);
  assert.match(styles, /\.guild-capability-card\.is-tw/);
  assert.match(styles, /\.guild-capability-card\.is-raid/);
});

test('Guild professional UI has desktop, tablet and mobile layouts', () => {
  assert.match(styles, /@media \(max-width: 1250px\)/);
  assert.match(styles, /@media \(max-width: 980px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});
