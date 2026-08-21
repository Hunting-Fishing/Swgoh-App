import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/non-gac-responsive-polish.css', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/player-command-professional.js', import.meta.url), 'utf8');

test('non-GAC responsive polish is loaded through the existing Player professional enhancer', () => {
  assert.match(loader, /non-gac-responsive-polish\.css\?v=20260821-qa1/);
  assert.match(loader, /data-non-gac-responsive-polish/);
});

test('non-GAC responsive polish does not target GAC selectors', () => {
  assert.doesNotMatch(css, /\.gac[-_]/i);
  assert.doesNotMatch(css, /data-gac/i);
});

test('responsive polish remains enhancement-only', () => {
  assert.doesNotMatch(css, /display\s*:\s*none/i);
  assert.doesNotMatch(css, /visibility\s*:\s*hidden/i);
  assert.doesNotMatch(css, /content-visibility\s*:\s*hidden/i);
});

test('shared navigation, Guild and TB/ROTE populated states receive readability coverage', () => {
  for (const selector of [
    '.workspace-tabs',
    '.workspace-tab',
    '.guild-pro-enhanced .guild-members-table',
    '.guild-pro-enhanced .guild-member-detail',
    '.tb-phase-tab',
    '.rote-mission-chips span',
    '.rote-candidate',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
});
