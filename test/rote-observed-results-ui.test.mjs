import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoteObservedMissionResults,
  roteObservedMissionResultsMarkup,
} from '../public/rote-observed-results-ui.js';

const attempts = [
  { eventId:'event-1', missionId:'mission-a', playerId:'p1', allyCode:'111222333', squadSignature:'A|B|C', result:'complete' },
  { eventId:'event-1', missionId:'mission-a', playerId:'p2', allyCode:'444555666', squadSignature:'A|B|C', result:'partial' },
  { eventId:'event-1', missionId:'mission-a', playerId:'p3', allyCode:'777888999', squadSignature:'D|E|F', result:'failed' },
  { eventId:'event-1', missionId:'mission-a', playerId:'p4', allyCode:'123123123', squadSignature:'D|E|F', result:'complete' },
  { eventId:'event-1', missionId:'mission-a', playerId:'p5', allyCode:'999888777', squadSignature:'A|B|C', result:'complete' },
  { eventId:'event-2', missionId:'mission-a', playerId:'old', allyCode:'222333444', squadSignature:'OLD|TEAM', result:'complete' },
  { eventId:'event-1', missionId:'mission-b', playerId:'other', allyCode:'555666777', squadSignature:'OTHER|TEAM', result:'complete' },
];

test('observed results scope attempts to the exact active event and mission', () => {
  const model = buildRoteObservedMissionResults({
    missionId:'mission-a',
    activeEventId:'event-1',
    attempts,
    player:{ playerId:'p1', allyCode:'111222333' },
  });
  assert.equal(model.evidenceLoaded, true);
  assert.equal(model.guild.recorded, 5);
  assert.equal(model.guild.attempts, 5);
  assert.equal(model.guild.complete, 3);
  assert.equal(model.guild.partial, 1);
  assert.equal(model.guild.failed, 1);
  assert.equal(model.player.recorded, 1);
  assert.equal(model.bySquad.length, 2);
});

test('observed completion rate stays hidden below configured sample threshold', () => {
  const model = buildRoteObservedMissionResults({
    missionId:'mission-a', activeEventId:'event-1', attempts:attempts.slice(0, 3),
    samplePolicy:{ minimumRateSample:5, adequateSample:20 },
  });
  assert.equal(model.guild.observedCompletionRate, null);
  assert.match(model.guild.sampleLabel, /RAW ATTEMPTS ONLY/);
  assert.match(roteObservedMissionResultsMarkup(model), /Rate hidden below 5 countable attempts/);
});

test('observed UI labels active-event Guild evidence and never claims predictive probability', () => {
  const model = buildRoteObservedMissionResults({ missionId:'mission-a', activeEventId:'event-1', attempts });
  const markup = roteObservedMissionResultsMarkup(model);
  assert.match(markup, /OBSERVED RESULTS · GUILD EVIDENCE/);
  assert.match(markup, /COUNTABLE ATTEMPTS/);
  assert.match(markup, /OBSERVED COMPLETION/);
  assert.match(markup, /TOP RECORDED SQUADS/);
  assert.match(markup, /not predicted win probabilities/i);
});

test('missing active-event attempt snapshot remains UNKNOWN instead of zero attempts', () => {
  const model = buildRoteObservedMissionResults({ missionId:'mission-a' });
  assert.equal(model.evidenceLoaded, false);
  assert.match(roteObservedMissionResultsMarkup(model), /ACTIVE EVENT EVIDENCE NOT LOADED/);
  assert.match(roteObservedMissionResultsMarkup(model), />UNKNOWN</);
});
