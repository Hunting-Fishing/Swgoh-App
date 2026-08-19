import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const htmlUrl = new URL('../public/guild/tb/route/index.html', import.meta.url);
const jsUrl = new URL('../public/tb-route.js', import.meta.url);
const cssUrl = new URL('../public/tb-route.css', import.meta.url);
const applyCssUrl = new URL('../public/tb-route-apply.css', import.meta.url);

test('Star Route page exposes explicit priority, preview and audited apply controls', () => {
  const html = fs.readFileSync(htmlUrl, 'utf8');
  const js = fs.readFileSync(jsUrl, 'utf8');
  const css = fs.readFileSync(cssUrl, 'utf8');
  const applyCss = fs.readFileSync(applyCssUrl, 'utf8');
  assert.match(html, /Star Route \+ Preload Optimizer/);
  assert.match(html, /unique officer route priority/i);
  assert.match(html, /tb-route-apply\.css/);
  assert.match(html, /data-route-apply/);
  assert.match(html, /Apply Safe Orders/);
  assert.match(js, /data-route-priority/);
  assert.match(js, /Every territory needs a unique priority/);
  assert.match(js, /\/api\/account\/web-actions\/tb\/route\/preview/);
  assert.match(js, /\/api\/account\/web-actions\/tb\/route\/apply/);
  assert.match(js, /expectedInputFingerprint/);
  assert.match(js, /window\.confirm/);
  assert.match(js, /ROUTE_PREVIEW_STALE/);
  assert.match(css, /\.route-results-head button\.apply/);
  assert.match(css, /\.route-apply-status\.success/);
  assert.match(applyCss, /\.route-zone-input/);
  assert.match(applyCss, /label\.priority/);
});

test('Star Route browser module parses', () => {
  execFileSync(process.execPath, ['--check', jsUrl.pathname]);
});

test('route UI never seeds unknown route priority or remaining TP with mock numeric values', () => {
  const html = fs.readFileSync(htmlUrl, 'utf8');
  const js = fs.readFileSync(jsUrl, 'utf8');
  assert.match(html, /Remaining Guild deployable TP/);
  assert.doesNotMatch(html, /name="remainingGuildDeploymentTp"[^>]*value=/);
  assert.match(js, /data-route-priority type="number"[^>]*placeholder="1 = highest" required/);
  assert.doesNotMatch(js, /data-route-priority type="number"[^>]*value=/);
  assert.doesNotMatch(js, /data-route-mission type="number"[^>]*value=/);
  assert.doesNotMatch(js, /data-route-operation type="number"[^>]*value=/);
});
