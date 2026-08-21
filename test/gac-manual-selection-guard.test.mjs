import test from 'node:test';
import assert from 'node:assert/strict';
import { manualActionButton } from '../public/gac-manual-selection-guard.js';

test('manual action resolver returns only the nearest manual action button', () => {
  const action = { marker: true };
  const target = {
    closest(selector) {
      return selector.includes('[data-gac-manual-own-toggle]') ? action : null;
    },
  };
  assert.equal(manualActionButton(target), action);
  assert.equal(manualActionButton(null), null);
});
