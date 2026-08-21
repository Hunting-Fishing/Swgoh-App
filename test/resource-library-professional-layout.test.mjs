import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/workspace-visual-library.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../public/resource-library.js', import.meta.url), 'utf8');

test('Events and Resources remain additive instead of replacing detailed workspace content', () => {
  assert.match(js, /panel\.prepend\s*\(/);
  assert.doesNotMatch(js, /panel\.innerHTML\s*=/);
  assert.doesNotMatch(js, /replaceChildren\s*\(/);
  assert.doesNotMatch(js, /\.remove\s*\(/);
});

test('resource library uses readable populated-state controls and copy', () => {
  assert.match(css, /\.ccv2-library-status\s*\{[^}]*font-size:\s*\.68rem/s);
  assert.match(css, /\.ccv2-library-copy p\s*\{[^}]*font-size:\s*\.78rem/s);
  assert.match(css, /\.ccv2-library-card button\s*\{[^}]*min-height:\s*42px/s);
  assert.match(css, /\.ccv2-library-pending\s*\{[^}]*font-size:\s*\.72rem/s);
});

test('resource library keeps four to one responsive card hierarchy', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(4,/);
  assert.match(css, /@media \(max-width: 1260px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /@media \(max-width: 540px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
});

test('resource visual layer remains presentation-only', () => {
  assert.doesNotMatch(css, /display\s*:\s*none/i);
  assert.doesNotMatch(css, /visibility\s*:\s*hidden/i);
  assert.doesNotMatch(css, /\.gac[-_]/i);
});
