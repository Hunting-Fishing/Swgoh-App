import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const htmlUrl = new URL('../public/guild/tb/route/index.html', import.meta.url);
const jsUrl = new URL('../public/tb-route.js', import.meta.url);
const cssUrl = new URL('../public/tb-route.css', import.meta.url);

test('Star Route page exposes preview and explicit audited apply controls', () => {
  const html = fs.readFileSync(htmlUrl, 'utf8');
  const js = fs.readFileSync(jsUrl, 'utf8');
  const css = fs.readFileSync(cssUrl, 'utf8');
  assert.match(html, /Star Route \+ Preload Optimizer/);
  assert.match(html, /data-route-apply/);
  assert.match(html, /Apply Safe Orders/);
  assert.match(js, /\/api\/account\/web-actions\/tb\/route\/preview/);
  assert.match(js, /\/api\/account\/web-actions\/tb\/route\/apply/);
  assert.match(js, /expectedInputFingerprint/);
  assert.match(js, /window\.confirm/);
  assert.match(js, /ROUTE_PREVIEW_STALE/);
  assert.match(css, /\.route-results-head button\.apply/);
  assert.match(css, /\.route-apply-status\.success/);
});

test('Star Route browser module parses', () => {
  execFileSync(process.execPath, ['--check', jsUrl.pathname]);
});

test('route UI never seeds unknown remaining TP with mock numeric values', () => {
  const html = fs.readFileSync(htmlUrl, 'utf8');
  assert.match(html, /Remaining Guild deployable TP/);
  assert.doesNotMatch(html, /name="remainingGuildDeploymentTp"[^>]*value=/);
  assert.doesNotMatch(html, /data-route-mission[^>]*value=/);
  assert.doesNotMatch(html, /data-route-operation[^>]*value=/);
});
