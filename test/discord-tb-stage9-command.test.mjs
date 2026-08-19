import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeDiscordTbStage9Command,
  isDiscordTbStage9Subcommand,
} from '../discord-tb-stage9-command.mjs';

const HASH = 'a'.repeat(64);
const VERSION = '11111111-1111-4111-8111-111111111111';
const VERSION_2 = '22222222-2222-4222-8222-222222222222';

function interaction(name, options = []) {
  return {
    guild_id: '987654321098765432',
    member: { user: { id: '111111111111111111' } },
    data: { name: 'tb', options: [{ type: 1, name, options }] },
  };
}

function option(name, value, type = 3) {
  return { type, name, value };
}

function config() {
  return { pilotAllyCode: '732764286', redundancyTarget: 2 };
}

test('Stage 9 subcommand predicate is exact', () => {
  for (const name of ['plan-preview', 'plan-status', 'plan-approve', 'plan-cancel', 'plan-diff']) {
    assert.equal(isDiscordTbStage9Subcommand(name), true);
  }
  assert.equal(isDiscordTbStage9Subcommand('assignments'), false);
  assert.equal(isDiscordTbStage9Subcommand('plan-publish'), false);
});

test('plan-preview scopes live planner rows to one phase and persists an immutable version', async () => {
  let createdInput = null;
  const request = interaction('plan-preview', [option('phase', 'P6')]);
  const content = await executeDiscordTbStage9Command(request, config(), {
    authorizedAsOfficer: true,
    buildPlan: async () => ({
      guildBindingSource: 'durable-guild-binding',
      planningControls: { preferenceCount: 0, unavailableMemberCount: 0, hardReservationCount: 0 },
      safety: { summary: { protectedUnits: 99, criticalProtections: 0 } },
      plan: {
        assignments: [
          { id: 'p6-a', phase: 'P6', name: 'Lord Vader', member: { name: 'Aaron' }, safety: { help: true, status: 'MISSION PROTECTED OVERRIDE' } },
          { id: 'p5-a', phase: 'P5', name: 'Rey', member: { name: 'Other' }, safety: { help: false, status: 'SAFE' } },
        ],
        unfilled: [
          { id: 'p6-u', phase: 'P6', name: 'Asajj Ventress' },
          { id: 'p5-u', phase: 'P5', name: '50R-T' },
        ],
      },
    }),
    planVersionService: {
      createVersion: async (_interaction, input) => {
        createdInput = structuredClone(input);
        return { id: VERSION };
      },
      getVersion: async () => ({
        id: VERSION,
        rote_phase: 'P6',
        version_number: 1,
        plan_hash: HASH,
        assignments: createdInput.assignments,
        unfilled: createdInput.unfilled,
        diagnostics: createdInput.diagnostics,
        approval: null,
      }),
    },
  });

  assert.equal(createdInput.phase, 'P6');
  assert.deepEqual(createdInput.assignments.map((row) => row.id), ['p6-a']);
  assert.deepEqual(createdInput.unfilled.map((row) => row.id), ['p6-u']);
  assert.equal(createdInput.diagnostics.helpAssignments, 1);
  assert.equal(createdInput.diagnostics.protectedUnits, 99);
  assert.match(content, /Immutable ROTE Preview · P6/);
  assert.match(content, /Version: \*\*#1\*\*/);
  assert.match(content, new RegExp(HASH));
  assert.match(content, /no assignments were published and no DMs were sent/i);
});

test('plan-approve requires exact hash confirmation and evaluates fail-closed publishability without publishing', async () => {
  let approved = null;
  let checked = null;
  const request = interaction('plan-approve', [
    option('version', VERSION),
    option('hash', HASH.slice(0, 16)),
    option('reason', 'Officer reviewed P6'),
  ]);
  const content = await executeDiscordTbStage9Command(request, config(), {
    authorizedAsOfficer: true,
    planVersionService: {
      approveVersion: async (_interaction, runId, hash, reason) => {
        approved = { runId, hash, reason };
        return {
          run: { id: VERSION, rote_phase: 'P6', version_number: 4, plan_hash: HASH },
          approval: { decision: 'approved', plan_hash: HASH },
          idempotent: false,
        };
      },
      assertPublishable: async (_interaction, runId) => {
        checked = runId;
        return { publishable: true };
      },
    },
  });

  assert.deepEqual(approved, { runId: VERSION, hash: HASH.slice(0, 16), reason: 'Officer reviewed P6' });
  assert.equal(checked, VERSION);
  assert.match(content, /ROTE Version Approved/);
  assert.match(content, /Publishability safety gate: \*\*PASS\*\*/);
  assert.match(content, /does not publish assignments or send DMs/i);
});

test('status, cancel and diff remain read-only officer surfaces', async () => {
  const service = {
    listVersions: async () => ([
      { id: VERSION, rote_phase: 'P6', version_number: 1, plan_hash: HASH, approval: { decision: 'approved', plan_hash: HASH } },
      { id: VERSION_2, rote_phase: 'P6', version_number: 2, plan_hash: 'b'.repeat(64), approval: null },
    ]),
    cancelVersion: async () => ({ id: VERSION_2, rote_phase: 'P6', version_number: 2, status: 'cancelled', cancel_reason: 'Superseded test' }),
    compareVersions: async () => ({
      fromVersion: 1,
      toVersion: 2,
      changedDonors: [{
        from: { phase: 'P6', unitName: 'Lord Vader', donorName: 'Aaron' },
        to: { phase: 'P6', unitName: 'Lord Vader', donorName: 'The Revanchist' },
      }],
      addedAssignments: [],
      removedAssignments: [],
      newlyFilled: [],
      newlyUnfilled: [],
      risk: { from: 3, to: 2, delta: -1 },
    }),
  };

  const status = await executeDiscordTbStage9Command(
    interaction('plan-status', [option('phase', 'P6')]), config(),
    { authorizedAsOfficer: true, planVersionService: service },
  );
  assert.match(status, /P6 #1.*APPROVED/);
  assert.match(status, /P6 #2.*UNAPPROVED/);

  const cancelled = await executeDiscordTbStage9Command(
    interaction('plan-cancel', [option('version', VERSION_2), option('reason', 'Superseded test')]), config(),
    { authorizedAsOfficer: true, planVersionService: service },
  );
  assert.match(cancelled, /State: \*\*CANCELLED\*\*/);
  assert.match(cancelled, /cannot pass the Stage 10 publishability gate/);

  const diff = await executeDiscordTbStage9Command(
    interaction('plan-diff', [option('from', VERSION), option('to', VERSION_2)]), config(),
    { authorizedAsOfficer: true, planVersionService: service },
  );
  assert.match(diff, /Changed donors: \*\*1\*\*/);
  assert.match(diff, /Aaron → The Revanchist/);
  assert.match(diff, /3 → 2 \(-1\)/);
});

test('Stage 9 executor refuses non-officer invocation even when called directly', async () => {
  await assert.rejects(
    executeDiscordTbStage9Command(interaction('plan-status'), config(), {
      authorizedAsOfficer: false,
      planVersionService: {},
    }),
    /require Discord officer authorization/,
  );
});
