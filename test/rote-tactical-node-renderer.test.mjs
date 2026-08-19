import test from 'node:test';
import assert from 'node:assert/strict';

import { roteTacticalMissionNode } from '../public/rote-tactical-node-model.js';
import { roteTacticalNodeMarkup } from '../public/rote-tactical-node-renderer.js';

const catalog = {
  units: [
    { baseId: 'HONDO', name: 'Hondo Ohnaka', image: '/game-assets/hondo.png' },
    { baseId: 'CEREJUNDA', name: 'Cere Junda', image: '/game-assets/cere.png' },
    { baseId: 'CALKESTIS', name: 'Cal Kestis', image: '/game-assets/cal.png' },
    { baseId: 'JEDIKNIGHTCAL', name: 'Jedi Knight Cal Kestis', image: '/game-assets/jkck.png' },
    { baseId: 'GRANDINQUISITOR', name: 'Grand Inquisitor', image: '/game-assets/gi.png' },
  ],
};

test('Hondo mission-node markup places the required Hondo portrait on the mission itself', () => {
  const node = roteTacticalMissionNode('felucia', 'felucia-hondo', { catalog });
  const markup = roteTacticalNodeMarkup(node, catalog);

  assert.match(markup, /Hondo Ohnaka/i);
  assert.match(markup, /\/game-assets\/hondo\.png/);
  assert.match(markup, />REQ</);
  assert.match(markup, /R6\+/);
});

test('Bracca Zeffo unlock markup visually separates Cere required from Cal or JKCK alternatives', () => {
  const node = roteTacticalMissionNode('bracca', 'bracca-zeffo-unlock', { catalog });
  const markup = roteTacticalNodeMarkup(node, catalog);

  assert.match(markup, /Cere Junda/);
  assert.match(markup, /Cal Kestis/);
  assert.match(markup, /Jedi Knight Cal Kestis/);
  assert.equal((markup.match(/>REQ</g) || []).length, 1);
  assert.equal((markup.match(/>OR</g) || []).length, 2);
  assert.match(markup, /R7\+/);
});

test('Reva shard node uses the dedicated Reva mission icon but labels Grand Inquisitor as the required unit', () => {
  const node = roteTacticalMissionNode('tatooine', 'tatooine-reva', { catalog });
  const markup = roteTacticalNodeMarkup(node, catalog);

  assert.match(markup, /mission_reva\.png/);
  assert.match(markup, /Grand Inquisitor/);
  assert.match(markup, /Third Sister shard/i);
  assert.doesNotMatch(markup, /title="REQUIRED: Third Sister"/i);
});
