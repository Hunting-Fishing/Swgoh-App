import test from 'node:test';
import assert from 'node:assert/strict';

import { assertStage10PlanningSnapshot } from '../tb-stage10-discord-delivery-service.mjs';

test('Stage 10 rejects an immutable artifact created in website-only planning mode', () => {
  assert.throws(
    () => assertStage10PlanningSnapshot({ diagnostics:{ planningMode:'website-only', discordBound:false } }),
    (error) => error?.status === 409
      && error?.code === 'STAGE10_REPLAN_AFTER_DISCORD_BINDING_REQUIRED'
      && /fresh immutable version after connecting Discord/i.test(error.message),
  );
});

test('Stage 10 also detects website-only mode from nested fingerprint inputs', () => {
  assert.throws(
    () => assertStage10PlanningSnapshot({
      diagnostics:{ source:{ plannerInputs:{ planningMode:'website-only', discordBound:false } } },
    }),
    (error) => error?.code === 'STAGE10_REPLAN_AFTER_DISCORD_BINDING_REQUIRED',
  );
});

test('Stage 10 accepts a version explicitly created with Discord planning controls', () => {
  const result = assertStage10PlanningSnapshot({
    diagnostics:{ planningMode:'website-plus-discord-controls', discordBound:true },
  });
  assert.deepEqual(result,{ planningMode:'website-plus-discord-controls', discordBound:true });
});

test('legacy immutable versions without planning-mode metadata remain backward compatible', () => {
  const result = assertStage10PlanningSnapshot({ diagnostics:{ plannerContract:'stage9-legacy' } });
  assert.deepEqual(result,{ planningMode:'legacy', discordBound:null });
});
