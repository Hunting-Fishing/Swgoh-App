import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanCommand, isDiscordTbStage9PlanSubcommand } from '../discord-tb-stage9-plan-command.mjs';

const HASH = 'a'.repeat(64);
const RUN1 = '11111111-1111-4111-8111-111111111111';
const RUN2 = '22222222-2222-4222-8222-222222222222';
const context = {
  guild: { id: 'guild-1', name: 'Ludus Venatus', lastSyncedAt: '2026-08-19T14:00:00Z' },
  userId: '33333333-3333-4333-8333-333333333333',
  role: 'officer',
  seedAllyCode: '732764286',
};
const persistedPlan = {
  id: '44444444-4444-4444-8444-444444444444',
  guild_id: 'guild-1',
  tb_key: 'rote',
  name: 'ROTE Operations Plan',
  status: 'previewed',
  phase_layout: {},
  requirement_overrides: {},
  ignored_missions: [],
  ignored_platoons: [],
  ignored_slots: [],
  updated_at: '2026-08-19T13:00:00Z',
};

function interaction(name, options = []) {
  return {
    guild_id: '123456789012345678',
    member: { user: { id: '234567890123456789' } },
    data: { name: 'tb', options: [{ type: 1, name, options }] },
  };
}

const option = (name, value) => ({ type: 3, name, value });

function makeCommand(overrides = {}) {
  const calls = [];
  const store = overrides.store || {
    async select(table, query) {
      calls.push({ table, query });
      if (table === 'guild_tb_plans') return [persistedPlan];
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const contextResolver = overrides.contextResolver || { async resolve() { return context; } };
  const liveServices = overrides.liveServices || {
    async buildPlan(input) {
      calls.push({ service: 'buildPlan', input });
      return {
        guildBindingSource: 'durable-guild-binding',
        planningControls: { preferenceCount: 0, unavailableMemberCount: 0, hardReservationCount: 0 },
        safety: {
          summary: { protectedUnits: 99, criticalProtections: 0 },
          protections: [{ phase: 'P6', memberId: 'member-1', baseId: 'LORDVADER', severity: 82 }],
        },
        plan: {
          summary: { assigned: 112, unfilled: 158 },
          assignments: [
            { id: 'slot-p6', phase: 'P6', baseId: 'LORDVADER', name: 'Lord Vader', member: { playerId: 'member-1', name: 'The Revanchist' }, safety: { help: true, status: 'MISSION PROTECTED OVERRIDE' } },
            { id: 'slot-p5', phase: 'P5', baseId: 'REY', name: 'Rey', member: { playerId: 'member-2', name: 'Other' }, safety: { help: false, status: 'SAFE' } },
          ],
          unfilled: [
            { id: 'missing-p6', phase: 'P6', baseId: 'ASAJJVENTRESS', name: 'Asajj Ventress', eligibleOwners: 0, availableOwners: 0, safeOwners: 0 },
            { id: 'missing-p5', phase: 'P5', baseId: '50RT', name: '50R-T', eligibleOwners: 0, availableOwners: 0, safeOwners: 0 },
          ],
        },
      };
    },
  };
  const versionService = overrides.versionService || {
    async createVersion(receivedContext, input) {
      calls.push({ service: 'createVersion', receivedContext, input });
      return {
        version: {
          id: RUN1,
          planId: persistedPlan.id,
          rotePhase: 'P6',
          versionNumber: 1,
          planHash: HASH,
          inputFingerprint: input.inputFingerprint,
          status: 'preview',
          assignments: input.assignments,
          unfilled: input.unfilled,
          diagnostics: input.diagnostics,
          approvedAt: '', approvedPlanHash: '', cancelledAt: '', supersededByRunId: '',
        },
        verification: { valid: true },
      };
    },
    async approveVersion(receivedContext, input) {
      calls.push({ service: 'approveVersion', receivedContext, input });
      return {
        version: { id: RUN1, planId: persistedPlan.id, rotePhase: 'P6', versionNumber: 1, planHash: HASH, status: 'preview', approvedAt: '2026-08-19T15:00:00Z', approvedPlanHash: HASH },
        verification: { valid: true },
      };
    },
    async cancelVersion(receivedContext, input) {
      calls.push({ service: 'cancelVersion', receivedContext, input });
      return {
        version: { id: RUN2, rotePhase: 'P6', versionNumber: 2, planHash: 'b'.repeat(64), status: 'cancelled', cancelledAt: '2026-08-19T16:00:00Z', cancellationReason: input.reason },
        hashVerification: { valid: true },
      };
    },
  };
  const publishabilityService = overrides.publishabilityService || {
    async assertPublishable(receivedContext, input) {
      calls.push({ service: 'assertPublishable', receivedContext, input });
      return { publishable: true, runId: input.runId };
    },
  };
  const compareService = overrides.compareService || {
    async compareVersions(receivedContext, input) {
      calls.push({ service: 'compareVersions', receivedContext, input });
      return {
        rotePhase: 'P6',
        diff: {
          from: { versionNumber: 1, assigned: 112, unfilled: 158, helpCount: 3 },
          to: { versionNumber: 2, assigned: 112, unfilled: 158, helpCount: 2 },
          summary: { changedDonors: 1, addedAssignments: 0, removedAssignments: 0, newlyFilledSlots: 0, newlyUnfilledSlots: 0, helpDelta: -1 },
          changedDonors: [{
            from: { donorName: 'Aaron', name: 'Lord Vader' },
            to: { donorName: 'The Revanchist', name: 'Lord Vader' },
          }],
        },
      };
    },
  };
  return {
    calls,
    command: createDiscordTbStage9PlanCommand({ store, contextResolver, liveServices, versionService, publishabilityService, compareService }),
  };
}

test('Stage 9 command predicate includes approval lifecycle and no publish command', () => {
  for (const name of ['plan-preview', 'plan-status', 'plan-approve', 'plan-cancel', 'plan-diff']) {
    assert.equal(isDiscordTbStage9PlanSubcommand(name), true);
  }
  assert.equal(isDiscordTbStage9PlanSubcommand('plan-publish'), false);
  assert.equal(isDiscordTbStage9PlanSubcommand('assignments'), false);
});

test('/tb plan-preview creates a phase-scoped immutable version with deterministic non-empty fingerprint', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction('plan-preview', [option('phase', 'P6')]));

  const call = calls.find((row) => row.service === 'createVersion');
  assert.equal(call.receivedContext.userId, context.userId);
  assert.equal(call.input.planId, persistedPlan.id);
  assert.equal(call.input.rotePhase, 'P6');
  assert.match(call.input.inputFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(call.input.assignments.map((row) => row.id), ['slot-p6']);
  assert.deepEqual(call.input.unfilled.map((row) => row.id), ['missing-p6']);
  assert.equal(call.input.diagnostics.safetySummary.helpAssignments, 1);
  assert.equal(call.input.diagnostics.safetySummary.protectedUnits, 99);
  assert.deepEqual(call.input.delivery, { mode: 'preview', published: false, dmsSent: false });

  assert.match(content, /Immutable ROTE Preview · P6/);
  assert.match(content, new RegExp(RUN1));
  assert.match(content, new RegExp(HASH));
  assert.match(content, /no assignments were published and no DMs were sent/i);
});

test('/tb plan-approve requires the full hash, approves exact version, then evaluates publishability without publishing', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction('plan-approve', [option('version', RUN1), option('hash', HASH)]));

  const approval = calls.find((row) => row.service === 'approveVersion');
  assert.deepEqual(approval.input, { runId: RUN1, planHash: HASH });
  const gate = calls.find((row) => row.service === 'assertPublishable');
  assert.equal(gate.input.runId, RUN1);
  assert.equal(gate.input.planId, persistedPlan.id);
  assert.equal(gate.input.rotePhase, 'P6');

  assert.match(content, /Immutable ROTE Approval/);
  assert.match(content, /Stage 10 publishability gate: \*\*PASS\*\*/);
  assert.match(content, /Approval only\. No assignments were published and no DMs were sent/);
});

test('/tb plan-approve refuses short hash confirmation before calling the version service', async () => {
  const { command, calls } = makeCommand();
  await assert.rejects(
    command.execute(interaction('plan-approve', [option('version', RUN1), option('hash', HASH.slice(0, 16))])),
    /full 64-character plan hash/i,
  );
  assert.equal(calls.some((row) => row.service === 'approveVersion'), false);
});

test('/tb plan-cancel records reason but cannot publish', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction('plan-cancel', [option('version', RUN2), option('reason', 'Superseded live test')]));
  const call = calls.find((row) => row.service === 'cancelVersion');
  assert.deepEqual(call.input, { runId: RUN2, reason: 'Superseded live test' });
  assert.match(content, /State: \*\*CANCELLED\*\*/);
  assert.match(content, /fail closed at the Stage 10 publishability gate/);
  assert.match(content, /No assignments were published and no DMs were sent/);
});

test('/tb plan-diff exposes donor and HELP delta without delivery', async () => {
  const { command, calls } = makeCommand();
  const content = await command.execute(interaction('plan-diff', [option('from', RUN1), option('to', RUN2)]));
  const call = calls.find((row) => row.service === 'compareVersions');
  assert.deepEqual(call.input, { fromRunId: RUN1, toRunId: RUN2 });
  assert.match(content, /v1 → v2/);
  assert.match(content, /HELP\/risk: \*\*3 → 2\*\* \(-1\)/);
  assert.match(content, /Aaron → The Revanchist/);
  assert.match(content, /No assignments were published and no DMs were sent/);
});
