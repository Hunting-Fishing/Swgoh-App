import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTbOperationContributionService,
  effectiveOperationContribution,
  normalizeRoteOperationReference,
} from '../tb-operation-contribution-service.mjs';

const MEMBER_USER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const OFFICER_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OFFICER_PLAYER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GUILD_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function eq(value) {
  const raw = String(value || '');
  return raw.startsWith('eq.') ? raw.slice(3) : null;
}

function inValues(value) {
  const raw = String(value || '');
  if (!raw.startsWith('in.(') || !raw.endsWith(')')) return null;
  return raw.slice(4, -1).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function matches(row, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (['select','order','limit','offset'].includes(key)) continue;
    if (String(value) === 'is.null') {
      if (row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== '') return false;
      continue;
    }
    const expectedList = inValues(value);
    if (expectedList && !expectedList.includes(String(row?.[key] ?? ''))) return false;
    if (expectedList) continue;
    const expected = eq(value);
    if (expected !== null && String(row?.[key] ?? '') !== expected) return false;
  }
  return true;
}

function fakeStore() {
  let sequence = 0;
  const selectCalls = [];
  const tables = {
    user_player_links: [
      { user_id: MEMBER_USER_ID, player_id: MEMBER_PLAYER_ID, is_primary: true, verification_status: 'verified', verified_at: '2026-08-20T00:00:00.000Z' },
      { user_id: OFFICER_USER_ID, player_id: OFFICER_PLAYER_ID, is_primary: true, verification_status: 'verified', verified_at: '2026-08-20T00:00:00.000Z' },
    ],
    players: [
      { id: MEMBER_PLAYER_ID, ally_code: '123456789', swgoh_player_id: 'member-game-id', name: 'Member One', current_guild_id: GUILD_ID, last_synced_at: '2026-08-20T06:00:00.000Z' },
      { id: OFFICER_PLAYER_ID, ally_code: '987654321', swgoh_player_id: 'officer-game-id', name: 'Officer One', current_guild_id: GUILD_ID, last_synced_at: '2026-08-20T06:00:00.000Z' },
    ],
    guild_user_memberships: [
      { guild_id: GUILD_ID, user_id: MEMBER_USER_ID, player_id: MEMBER_PLAYER_ID, role: 'member', status: 'active' },
      { guild_id: GUILD_ID, user_id: OFFICER_USER_ID, player_id: OFFICER_PLAYER_ID, role: 'officer', status: 'active' },
    ],
    guild_tb_events: [{ id: EVENT_ID, guild_id: GUILD_ID, tb_key: 'rote', current_phase: 'P3', status: 'active', updated_at: '2026-08-20T06:00:00.000Z' }],
    guild_tb_operation_slots: [],
    guild_tb_operation_assignments: [],
    guild_tb_operation_contributions: [],
    player_units_current: [
      { player_id: MEMBER_PLAYER_ID, base_id: 'CEREJUNDA', unit_name: 'Cere Junda', combat_type: 1, rarity: 7, level: 85, gear_level: 13, relic_tier: 8, galactic_power: 35000, zeta_count: 2, omicron_count: 1, last_synced_at: '2026-08-20T06:00:00.000Z', metadata: { speed: 318, skills: [{ id: 'unique01', tier: 8 }] } },
      { player_id: OFFICER_PLAYER_ID, base_id: 'CEREJUNDA', unit_name: 'Cere Junda', combat_type: 1, rarity: 7, level: 85, gear_level: 13, relic_tier: 7, galactic_power: 33000, zeta_count: 2, omicron_count: 0, last_synced_at: '2026-08-20T06:00:00.000Z', metadata: { speed: 290, skills: [{ id: 'unique01', tier: 8 }] } },
    ],
  };

  return {
    tables,
    selectCalls,
    status() { return { configured: true }; },
    async select(table, query = {}) {
      selectCalls.push({ table, query: { ...query } });
      const rows = (tables[table] || []).filter((row) => matches(row, query));
      const offset = Number(query.offset || 0);
      const limit = Number(query.limit || rows.length || 0);
      return rows.slice(offset, offset + limit);
    },
    async insert(table, rows) {
      const target = tables[table] || (tables[table] = []);
      const inserted = [];
      for (const input of rows) {
        if (table === 'guild_tb_operation_contributions' && target.some((row) => row.contribution_key === input.contribution_key)) {
          const error = new Error('duplicate key');
          error.status = 409;
          throw error;
        }
        sequence += 1;
        const row = { ...input, id: `55555555-5555-4555-8555-${String(sequence).padStart(12, '0')}`, created_at: '2026-08-20T07:00:00.000Z' };
        target.push(row);
        inserted.push(row);
      }
      return inserted;
    },
    async upsert(table, rows, options = {}) {
      assert.equal(table, 'guild_tb_operation_slots');
      assert.equal(options.onConflict, 'event_id,phase,operation_id,slot_id');
      const target = tables[table];
      const saved = [];
      for (const input of rows) {
        const existing = target.find((row) => row.event_id === input.event_id && row.phase === input.phase && row.operation_id === input.operation_id && row.slot_id === input.slot_id);
        if (existing) {
          Object.assign(existing, input);
          saved.push(existing);
        } else {
          sequence += 1;
          const row = { ...input, id: `66666666-6666-4666-8666-${String(sequence).padStart(12, '0')}`, created_at: '2026-08-20T07:00:00.000Z' };
          target.push(row);
          saved.push(row);
        }
      }
      return saved;
    },
  };
}

function operationsPayload(baseId = 'CEREJUNDA') {
  return [{
    id: 'P2-C1',
    phase: 'P2',
    conflict: 'C1',
    linkedConflictId: 'tb3_mixed_phase02_conflict01',
    squads: [{
      id: 'tb3-platoon-4',
      units: [{ unitIdentifier: baseId, baseId, nameKey: baseId === 'CEREJUNDA' ? 'Cere Junda' : baseId, combatType: 1, unitRelicTier: 8, rarity: 7 }],
    }],
  }];
}

test('normalizes ROTE Operation source into stable canonical event-slot identities without embedding the required unit in slot identity', () => {
  const normalized = normalizeRoteOperationReference(operationsPayload());
  assert.equal(normalized.slots.length, 1);
  const slot = normalized.slots[0];
  assert.equal(slot.phase, 'P2');
  assert.equal(slot.planetId, 'felucia');
  assert.equal(slot.operationId, 'P2-C1:tb3-platoon-4');
  assert.equal(slot.slotId, 'P2:P2-C1:tb3-platoon-4:1');
  assert.equal(slot.requiredBaseId, 'CEREJUNDA');
  assert.equal(slot.requiredRelic, 6);
  assert.equal(slot.requiredRarity, 7);
  assert.equal(slot.operationName, 'Felucia · Operation 4');
});

test('unknown conflict-to-planet evidence is skipped rather than guessed', () => {
  const payload = operationsPayload();
  payload[0].linkedConflictId = 'unrecognized_conflict';
  const normalized = normalizeRoteOperationReference(payload);
  assert.equal(normalized.slots.length, 0);
  assert.equal(normalized.skipped.length, 1);
  assert.deepEqual(normalized.skipped[0].reasons, ['planet']);
});

test('syncs canonical Operation slots to the active durable ROTE event and never creates contribution evidence', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store, now: () => new Date('2026-08-20T07:00:00.000Z') });
  const result = await service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload(), { sourceFetchedAt: '2026-08-20T06:59:00Z' });
  assert.equal(result.savedSlots, 1);
  assert.equal(store.tables.guild_tb_operation_slots.length, 1);
  assert.equal(store.tables.guild_tb_operation_contributions.length, 0);
  assert.match(result.evidenceBoundary, /do not prove/i);
});

test('slot requirement changes inside the same event fail closed instead of rewriting assignment-linked slot history', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload());
  await assert.rejects(
    () => service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload('JEDIKNIGHTCAL')),
    (error) => error?.status === 409 && error?.code === 'TB_OPERATION_SLOT_DEFINITION_CONFLICT',
  );
  assert.equal(store.tables.guild_tb_operation_slots[0].required_base_id, 'CEREJUNDA');
});

test('member self-confirmation records Guild evidence with server-side roster progression and preserves assignment as separate evidence', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store, now: () => new Date('2026-08-20T07:00:00.000Z') });
  await service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  store.tables.guild_tb_operation_assignments.push({
    id: '77777777-7777-4777-8777-777777777777', slot_id: slot.id, assignment_run_id: null,
    assigned_player_id: MEMBER_PLAYER_ID, assigned_ally_code: '123456789', assigned_base_id: 'CEREJUNDA',
    assignment_state: 'assigned', assignment_source: 'stage9', assigned_at: '2026-08-20T06:30:00.000Z', superseded_at: null,
  });
  const result = await service.recordMemberConfirmation(MEMBER_USER_ID, {
    id: 'member-fill-001', eventId: EVENT_ID, slotRecordId: slot.id, observedAt: '2026-08-20T06:45:00.000Z',
    unitSnapshot: { relic: 1, speed: 1 },
  });
  assert.equal(result.contribution.status, 'filled');
  assert.equal(result.contribution.evidenceClass, 'GUILD_DATA');
  assert.equal(result.contribution.sourceKind, 'member_web');
  assert.equal(result.contribution.playerId, MEMBER_PLAYER_ID);
  assert.equal(result.contribution.relic, 8);
  assert.equal(result.contribution.unitSnapshot.stats.speed, 318);
  assert.equal(result.contribution.metadata.assignmentMatched, true);
  assert.equal(store.tables.guild_tb_operation_assignments.length, 1);
});

test('normal members cannot attribute a contribution to another Guild member', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  await assert.rejects(
    () => service.recordMemberConfirmation(MEMBER_USER_ID, { id: 'forged-fill', slotRecordId: slot.id, allyCode: '987654321' }),
    (error) => error?.status === 403 && error?.code === 'TB_OPERATION_MEMBER_SELF_CONFIRM_ONLY',
  );
  assert.equal(store.tables.guild_tb_operation_contributions.length, 0);
});

test('officer confirmation detects a contributor/assignment mismatch instead of silently marking the assigned member as filled', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(OFFICER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  store.tables.guild_tb_operation_assignments.push({
    id: '77777777-7777-4777-8777-777777777778', slot_id: slot.id,
    assigned_player_id: MEMBER_PLAYER_ID, assigned_ally_code: '123456789', assigned_base_id: 'CEREJUNDA',
    assignment_state: 'assigned', assignment_source: 'stage9', assigned_at: '2026-08-20T06:30:00.000Z', superseded_at: null,
  });
  const result = await service.recordOfficerConfirmation(OFFICER_USER_ID, {
    id: 'officer-confirm-001', slotRecordId: slot.id, contributorAllyCode: '987654321', observedAt: '2026-08-20T06:50:00.000Z',
  });
  assert.equal(result.contribution.status, 'mismatch');
  assert.deepEqual(result.contribution.metadata.mismatchReasons, ['CONTRIBUTOR_DOES_NOT_MATCH_ASSIGNMENT']);
});

test('game/gateway evidence can preserve unresolved contributor identity as UNKNOWN without inventing a player', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  const result = await service.recordGameEvidence({
    id: 'gateway-observation-001', slotRecordId: slot.id, contributorAllyCode: '555444333', contributedBaseId: 'CEREJUNDA',
    unitSnapshot: { baseId: 'CEREJUNDA', relic: 7, stars: 7, source: 'gateway' }, observedAt: '2026-08-20T06:55:00.000Z',
  }, { guildId: GUILD_ID, eventId: EVENT_ID, sourceKind: 'game_gateway' });
  assert.equal(result.contribution.status, 'unknown');
  assert.equal(result.contribution.playerId, '');
  assert.equal(result.contribution.allyCode, '555444333');
  assert.equal(result.contribution.evidenceClass, 'GAME_DATA');
});

test('same logical contribution retry is idempotent and a changed contributor for that ID fails closed', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(OFFICER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  const input = { id: 'officer-idempotent-001', slotRecordId: slot.id, contributorAllyCode: '123456789' };
  const first = await service.recordOfficerConfirmation(OFFICER_USER_ID, input);
  const second = await service.recordOfficerConfirmation(OFFICER_USER_ID, input);
  assert.equal(first.alreadyRecorded, false);
  assert.equal(second.alreadyRecorded, true);
  assert.equal(store.tables.guild_tb_operation_contributions.length, 1);
  await assert.rejects(
    () => service.recordOfficerConfirmation(OFFICER_USER_ID, { ...input, contributorAllyCode: '987654321' }),
    (error) => error?.status === 409 && error?.code === 'TB_OPERATION_CONTRIBUTION_EVIDENCE_CONFLICT',
  );
});

test('retry remains idempotent after roster progression and assignment context change', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(MEMBER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  store.tables.guild_tb_operation_assignments.push({
    id: '77777777-7777-4777-8777-777777777780', slot_id: slot.id,
    assigned_player_id: MEMBER_PLAYER_ID, assigned_ally_code: '123456789', assigned_base_id: 'CEREJUNDA',
    assignment_state: 'assigned', assignment_source: 'stage9', assigned_at: '2026-08-20T06:30:00.000Z', superseded_at: null,
  });
  const input = { id: 'member-retry-stable-001', slotRecordId: slot.id };
  const first = await service.recordMemberConfirmation(MEMBER_USER_ID, input);
  assert.equal(first.contribution.relic, 8);
  assert.equal(first.contribution.unitSnapshot.stats.speed, 318);
  assert.equal(first.contribution.metadata.assignmentMatched, true);

  const unit = store.tables.player_units_current.find((row) => row.player_id === MEMBER_PLAYER_ID && row.base_id === 'CEREJUNDA');
  unit.relic_tier = 9;
  unit.metadata.speed = 350;
  store.tables.guild_tb_operation_assignments[0].assigned_player_id = OFFICER_PLAYER_ID;
  store.tables.guild_tb_operation_assignments[0].assigned_ally_code = '987654321';

  const retry = await service.recordMemberConfirmation(MEMBER_USER_ID, input);
  assert.equal(retry.alreadyRecorded, true);
  assert.equal(store.tables.guild_tb_operation_contributions.length, 1);
  assert.equal(retry.contribution.relic, 8);
  assert.equal(retry.contribution.unitSnapshot.stats.speed, 318);
  assert.equal(retry.contribution.metadata.assignmentMatched, true);
});

test('ledger keeps assignment separate, uses bulk evidence reads, and prefers known GAME DATA over lower-precedence Guild confirmation', async () => {
  const store = fakeStore();
  const service = createTbOperationContributionService({ store });
  await service.syncReferenceSlots(OFFICER_USER_ID, operationsPayload());
  const slot = store.tables.guild_tb_operation_slots[0];
  store.tables.guild_tb_operation_assignments.push({
    id: '77777777-7777-4777-8777-777777777779', slot_id: slot.id,
    assigned_player_id: MEMBER_PLAYER_ID, assigned_ally_code: '123456789', assigned_base_id: 'CEREJUNDA',
    assignment_state: 'assigned', assignment_source: 'stage9', assigned_at: '2026-08-20T06:30:00.000Z', superseded_at: null,
  });
  await service.recordOfficerConfirmation(OFFICER_USER_ID, { id: 'officer-ledger-001', slotRecordId: slot.id, contributorAllyCode: '123456789' });
  await service.recordGameEvidence({ id: 'game-ledger-001', slotRecordId: slot.id, contributorAllyCode: '123456789', contributedBaseId: 'CEREJUNDA', unitSnapshot: { baseId: 'CEREJUNDA', relic: 8, stars: 7 } }, { guildId: GUILD_ID, eventId: EVENT_ID, sourceKind: 'canonical' });

  store.selectCalls.length = 0;
  const ledger = await service.ledger(MEMBER_USER_ID, { phase: 'P2' });
  assert.equal(ledger.slots.length, 1);
  assert.equal(ledger.slots[0].assignment.playerId, MEMBER_PLAYER_ID);
  assert.equal(ledger.slots[0].contributions.length, 2);
  assert.equal(ledger.slots[0].effectiveContribution.sourceKind, 'canonical');
  assert.match(ledger.evidenceBoundary, /ASSIGNED and CONTRIBUTED are separate/i);

  const contributionReads = store.selectCalls.filter((call) => call.table === 'guild_tb_operation_contributions');
  assert.equal(contributionReads.length, 1);
  assert.equal(contributionReads[0].query.event_id, `eq.${EVENT_ID}`);
  assert.equal(Object.hasOwn(contributionReads[0].query, 'slot_id'), false);
  const assignmentReads = store.selectCalls.filter((call) => call.table === 'guild_tb_operation_assignments');
  assert.equal(assignmentReads.length, 1);
  assert.match(String(assignmentReads[0].query.slot_id), /^in\.\(/);
});

test('effective contribution ignores UNKNOWN when known evidence exists', () => {
  const effective = effectiveOperationContribution([
    { sourceKind: 'canonical', status: 'unknown', observedAt: '2026-08-20T07:00:00Z' },
    { sourceKind: 'member_web', status: 'filled', observedAt: '2026-08-20T06:00:00Z' },
  ]);
  assert.equal(effective.sourceKind, 'member_web');
  assert.equal(effective.status, 'filled');
});
