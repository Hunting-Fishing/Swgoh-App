import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbStage9PlanPreviewService } from '../tb-stage9-plan-preview-service.mjs';

const context = Object.freeze({
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: 'user-1',
  seedAllyCode: '732764286',
  discordGuildId: '',
});

function fixture({ discordBound = false, brokenDiscordState = false } = {}) {
  const calls = [];
  const stateStore = {
    status() { calls.push(['discord-status']); return brokenDiscordState ? { enabled:false, durable:true } : { enabled:true, durable:true }; },
    async readGuild(id) { calls.push(['discord-read', id]); return { swgohAllyCode:'732764286', userLinks:{}, memberPreferences:{}, memberAvailability:{} }; },
  };
  const reservationStore = {
    status() { calls.push(['reserve-status']); return { enabled:true, durable:true }; },
    async readGuild(id) { calls.push(['reserve-read', id]); return { reservations:{} }; },
  };
  const store = {
    async select(table) {
      calls.push(['select', table]);
      if (table === 'guild_tb_plans') return [{
        id:'plan-1', guild_id:'guild-1', tb_key:'rote', name:'Plan', status:'draft',
        phase_layout:{}, requirement_overrides:{}, ignored_missions:[], ignored_platoons:[], ignored_slots:[],
        updated_at:'2026-08-22T12:00:00Z',
      }];
      if (table === 'guild_tb_grouping_rules') return [];
      if (table === 'guild_tb_plan_preassignments') return [];
      if (table === 'players') return [{id:'db-p1',ally_code:'111111111',swgoh_player_id:'P1',name:'One',current_guild_id:'guild-1'}];
      if (table === 'guild_member_operation_controls') return [];
      if (table === 'guild_unit_donation_preferences') return [];
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const live = {
    async buildPlan(input) {
      calls.push(['live', input]);
      return {
        guildBindingSource: input.interaction?.guild_id ? 'durable-guild-binding' : 'explicit-ally-code',
        cache:'live', guildAgeMs:25,
        guild:{guild:{id:'swgoh-guild-1'},members:[{playerId:'P1',allyCode:'111111111',name:'One',rosterAvailable:true,units:[{baseId:'A',stars:7,relic:9}]}]},
        operations:{slots:[{id:'P6-S1',phase:'P6',conflictId:'P6-C1',squadId:'P6-PLATOON-1',baseId:'A',requiredRelic:9}]},
        safety:{protections:[]},
        planningControls:{preferenceCount:0,unavailableMemberCount:0,hardReservationCount:0},
        plan:{strategy:'mission-safe',maxPerTerritory:10},
      };
    },
  };
  const parityPlanner = (_guild, _operations, options) => {
    calls.push(['parity', options]);
    return {
      strategy:'parity', maxPerTerritory:10,
      phases:[{phase:'P6',total:1,assigned:1,unfilled:0}],
      assignments:[{id:'P6-S1',phase:'P6',baseId:'A',member:{playerId:'P1',name:'One'},safety:{help:false}}],
      unfilled:[], lockIssues:[],
      parity:{mode:'echobase-parity-command-center',previewReady:true,publishReady:true,unresolvedRequirements:[],groupingRulesApplied:[],completion:{sourceSlots:1,activeSlots:1,assigned:1,unfilled:0,lockIssues:0}},
    };
  };
  const versionService = {
    async createVersion(receivedContext, input) {
      calls.push(['version', receivedContext, input]);
      return {version:{id:'run-1',versionNumber:1,rotePhase:'P6',planHash:'a'.repeat(64)},verification:{valid:true},attempt:1};
    },
  };
  const service = createTbStage9PlanPreviewService({
    store, stateStore, reservationStore, live, parityPlanner, versionService,
    discordConfig:{redundancyTarget:2},
    now:() => new Date('2026-08-22T12:30:00Z'),
  });
  const ctx = discordBound ? {...context,discordGuildId:'123456789012345678'} : context;
  return { service, calls, context:ctx };
}

test('website-only Stage 9 never reads Discord state and records explicit planning mode', async () => {
  const {service,calls,context:ctx}=fixture({discordBound:false,brokenDiscordState:true});
  const result=await service.createPreview(ctx,{planId:'plan-1',phase:'P6',interaction:{guild_id:'999999999999999999'}});

  assert.equal(result.planningMode,'website-only');
  assert.equal(result.discordBound,false);
  assert.equal(calls.some((row)=>row[0]==='discord-status' || row[0]==='discord-read' || row[0]==='reserve-status' || row[0]==='reserve-read'),false);
  const liveCall=calls.find((row)=>row[0]==='live');
  assert.equal(liveCall[1].allyCode,'732764286');
  assert.deepEqual(liveCall[1].interaction,{});
  const version=calls.find((row)=>row[0]==='version');
  assert.equal(version[2].diagnostics.planningMode,'website-only');
  assert.equal(version[2].diagnostics.discordBound,false);
  assert.equal(version[2].diagnostics.planningControls.hardReservations,0);
});

test('bound Discord planning remains fail-closed if configured durable state is unavailable', async () => {
  const {service,calls,context:ctx}=fixture({discordBound:true,brokenDiscordState:true});
  await assert.rejects(
    () => service.createPreview(ctx,{planId:'plan-1',phase:'P6'}),
    (error) => error?.status === 503 && error?.code === 'DISCORD_PLANNING_STATE_UNAVAILABLE',
  );
  assert.equal(calls.some((row)=>row[0]==='live'),false);
  assert.equal(calls.some((row)=>row[0]==='version'),false);
});
