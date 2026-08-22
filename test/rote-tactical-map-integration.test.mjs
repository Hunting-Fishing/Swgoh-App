import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enhanceRoteTacticalOverlay,
  hydrateSelectedMissionReadiness,
} from '../public/rote-tactical-map-integration.js';
import { TB_READINESS_EVIDENCE } from '../public/tb-mission-readiness-v2.js';

function fakeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...items) { for (const item of items) values.add(item); },
    contains(item) { return values.has(item); },
    values,
  };
}

test('tactical overlay hydration preserves the existing mission button geometry and click contract', async (t) => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCss = globalThis.CSS;

  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    if (previousCss === undefined) delete globalThis.CSS;
    else globalThis.CSS = previousCss;
  });

  globalThis.window = {
    __swgohLiveSnapshot: {
      allyCode: '123456789',
      fetchedAt: 1724100000000,
      body: null,
    },
  };
  globalThis.CSS = { escape: (value) => String(value) };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/data/catalog.json');
    assert.equal(options?.cache, 'no-cache');
    return {
      ok: true,
      async json() {
        return {
          units: [
            { baseId: 'HONDO', name: 'Hondo Ohnaka', image: '/game-assets/hondo.png' },
          ],
        };
      },
    };
  };

  const clickHandler = () => 'existing-map-click-handler';
  const hondoButton = {
    innerHTML: '<img src="/old-mission-icon.png"><span>Old Hondo marker</span>',
    style: { cssText: 'top:63%;left:29%' },
    dataset: { roteZoomNode: 'p2-felucia-hondo' },
    classList: fakeClassList(['rote-zoom-node', 'type-combat']),
    ariaLabel: 'Open Hondo mission',
    clickHandler,
  };

  const root = {
    isConnected: true,
    dataset: {
      signature: 'felucia|p2-felucia-hondo|1724100000000|ready|1',
      roteZoomPlanet: 'felucia',
    },
    querySelector(selector) {
      return selector.includes('p2-felucia-hondo') ? hondoButton : null;
    },
  };

  const beforeStyle = hondoButton.style.cssText;
  const beforeClickHandler = hondoButton.clickHandler;
  const beforeNodeId = hondoButton.dataset.roteZoomNode;
  const beforeAriaLabel = hondoButton.ariaLabel;

  const result = await enhanceRoteTacticalOverlay(root);

  assert.equal(result?.hydrated, 1);
  assert.equal(root.dataset.roteTacticalHydrated, '1');
  assert.ok(root.dataset.roteTacticalSignature);

  // Existing map ownership stays intact: coordinates, node identity, accessibility
  // label and click wiring are not replaced by the tactical presentation layer.
  assert.equal(hondoButton.style.cssText, beforeStyle);
  assert.equal(hondoButton.clickHandler, beforeClickHandler);
  assert.equal(hondoButton.dataset.roteZoomNode, beforeNodeId);
  assert.equal(hondoButton.ariaLabel, beforeAriaLabel);

  assert.equal(hondoButton.classList.contains('rote-tactical-node-v2'), true);
  assert.equal(hondoButton.dataset.tacticalMissionId, 'felucia-hondo');
  assert.equal(hondoButton.dataset.tacticalReadiness, 'UNKNOWN');
  assert.match(hondoButton.innerHTML, /Hondo Ohnaka/i);
  assert.match(hondoButton.innerHTML, /\/game-assets\/hondo\.png/);
  assert.match(hondoButton.innerHTML, />REQ</);
  assert.match(hondoButton.innerHTML, /R6\+/);
});

test('selected mission inspector receives tactical Level, Zeta, TB Omicron and mod/stat evidence without replacing the legacy inspector', () => {
  const originalInspectorContent = '<section data-legacy-inspector>Existing mission inspector</section>';
  const createdHost = { dataset: {}, innerHTML: '' };
  const inspector = {
    ownerDocument: {
      createElement(tag) {
        assert.equal(tag, 'div');
        return createdHost;
      },
    },
    legacyContent: originalInspectorContent,
    children: [],
    querySelector() { return null; },
    appendChild(node) {
      this.children.push(node);
      return node;
    },
  };
  const selectedButton = {
    dataset: { roteZoomNode: 'p2-felucia-hondo' },
    classList: fakeClassList(['rote-zoom-node', 'selected']),
  };
  const root = {
    querySelector(selector) {
      if (selector === '.rote-zoom-inspector') return inspector;
      if (selector.includes('.selected')) return selectedButton;
      return null;
    },
  };
  const model = {
    nodes: [{
      id: 'p2-felucia-hondo',
      missionId: 'felucia-hondo',
      infrastructure: false,
      readiness: {
        verdict: 'NEEDS ZETA',
        officialEntryReady: true,
        battleEvidenceComplete: false,
        progressionFailures: [{ key: 'level' }],
        unknownEvidence: [{ type: 'battle-evidence' }],
        progression: [{
          baseId: 'HONDO',
          name: 'Hondo Ohnaka',
          level: { state: TB_READINESS_EVIDENCE.FAIL, current: 84, target: 85 },
          stars: { state: TB_READINESS_EVIDENCE.PASS, current: 7, target: 7 },
          gear: { state: TB_READINESS_EVIDENCE.PASS, current: 13, target: 13 },
          relic: { state: TB_READINESS_EVIDENCE.PASS, current: 6, target: 6 },
        }],
        abilities: [{ state: TB_READINESS_EVIDENCE.UNKNOWN, required: true, name: 'Special 2', reason: 'ability tier unavailable' }],
        zetas: [{ state: TB_READINESS_EVIDENCE.FAIL, required: true, name: 'I Smell Profit!', installed: false }],
        omicrons: [{ state: TB_READINESS_EVIDENCE.PASS, required: true, name: 'Territory Business', installed: true, activeHere: true }],
        stats: [{ state: TB_READINESS_EVIDENCE.UNKNOWN, required: true, baseId: 'HONDO', name: 'Hondo Ohnaka', stat: 'health', minimum: 100000, reason: 'health evidence unavailable' }],
        evidenceBoundary: 'Official entry remains separate from battle preparation.',
      },
    }],
  };

  const result = hydrateSelectedMissionReadiness(root, model);

  assert.equal(result.hydrated, true);
  assert.equal(result.missionId, 'felucia-hondo');
  assert.equal(result.verdict, 'NEEDS ZETA');
  assert.equal(inspector.legacyContent, originalInspectorContent, 'legacy inspector content remains owned by the existing workspace');
  assert.equal(inspector.children.length, 1, 'tactical readiness is appended as a child instead of replacing the inspector');
  assert.equal(createdHost.dataset.roteTacticalReadinessHost, 'true');
  assert.equal(createdHost.dataset.tacticalMissionId, 'felucia-hondo');
  assert.equal(createdHost.dataset.tacticalVerdict, 'NEEDS ZETA');
  assert.match(createdHost.innerHTML, /ENTRY LEGAL/);
  assert.match(createdHost.innerHTML, /84 \/ 85/);
  assert.match(createdHost.innerHTML, /I Smell Profit!/);
  assert.match(createdHost.innerHTML, /Territory Business/);
  assert.match(createdHost.innerHTML, /health evidence unavailable/);
  assert.match(createdHost.innerHTML, /Unknown evidence <b>1<\/b>/);
});
