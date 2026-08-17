import assert from 'node:assert/strict';
import test from 'node:test';

const expected = Object.freeze({
  guildSnapshots: 666,
  playerMonthly: 1723,
  membershipPeriods: 107,
  returns: 16,
  trackedUnitMilestones: 4299,
  ticketDays: 961,
  raidEvents: 136,
  roteEvents: 81,
  revaEvents: 76,
});

test('Ludus historical archive v1 recovered source counts are immutable', () => {
  assert.deepEqual(expected, {
    guildSnapshots: 666,
    playerMonthly: 1723,
    membershipPeriods: 107,
    returns: 16,
    trackedUnitMilestones: 4299,
    ticketDays: 961,
    raidEvents: 136,
    roteEvents: 81,
    revaEvents: 76,
  });
});
