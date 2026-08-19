import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createWebActionApi } from '../web-action-api.mjs';

const noopSession = { async currentUser() { throw new Error('web action session should not run for delegated TB route'); } };
const noopService = {};
const noopGoals = {};

test('web action account handler delegates TB namespace to the TB event API', async () => {
  let called = false;
  const api = createWebActionApi({
    session: noopSession,
    service: noopService,
    journeyGoals: noopGoals,
    tbEventStateApi: {
      async handle(_request, response, url) {
        called = true;
        assert.equal(url.pathname, '/api/account/web-actions/tb/today');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{"ok":true}');
        return true;
      },
    },
  });
  const response = { status: 0, payload: '', writeHead(status) { this.status = status; }, end(value) { this.payload = value; } };
  const handled = await api.handle({ method: 'GET', headers: {} }, response, new URL('https://example.test/api/account/web-actions/tb/today'));
  assert.equal(handled, true);
  assert.equal(called, true);
  assert.equal(response.status, 200);
});

test('Today in TB physical route and UI expose member queue plus officer controls', () => {
  const html = fs.readFileSync(new URL('../public/guild/tb/today/index.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../public/tb-today.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/tb-today.css', import.meta.url), 'utf8');
  assert.match(html, /Today in TB/);
  assert.match(html, /YOUR ORDERS/);
  assert.match(html, /Officer Event Controls/);
  assert.match(js, /\/today\/refresh/);
  assert.match(js, /\/action\/\$\{actionId\}\/status/);
  assert.match(js, /ROTE_PLANETS/);
  assert.match(css, /\.tb-task-panel/);
  assert.match(css, /@media\(max-width:620px\)/);
});

test('new TB modules and browser workspace parse', () => {
  for (const path of [
    new URL('../tb-member-action-service.mjs', import.meta.url),
    new URL('../tb-event-state-service.mjs', import.meta.url),
    new URL('../tb-event-state-api.mjs', import.meta.url),
    new URL('../web-action-api.mjs', import.meta.url),
    new URL('../public/tb-today.js', import.meta.url),
  ]) execFileSync(process.execPath, ['--check', path.pathname]);
});
