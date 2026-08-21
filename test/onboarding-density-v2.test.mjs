import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/onboarding.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/onboarding/index.html', import.meta.url), 'utf8');

test('verified onboarding keeps the dedicated responsive success layout', () => {
  assert.match(css, /body:has\(\[data-view="verified"\]:not\(\.hidden\)\)/);
  assert.match(css, /\.verified-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
  assert.match(css, /\.verified-stat\s*\{[^}]*min-height:\s*108px/s);
});

test('onboarding still exposes all five verified identity evidence blocks', () => {
  for (const token of ['Command Center Account', 'SWGOH Player', 'Guild Assignment', 'Command Clearance', 'Ownership Proof']) {
    assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('verified primary destinations remain visible', () => {
  assert.match(html, /Open Action Center/);
  assert.match(html, /Guild Command Center/);
  assert.match(html, /Player Command Center/);
});

test('onboarding cache-busts the bright ui3 stylesheet', () => {
  assert.match(html, /onboarding\.css\?v=20260821-ui3/);
});
