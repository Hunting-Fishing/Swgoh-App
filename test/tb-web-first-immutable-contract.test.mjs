import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../guild-operations-api.mjs', import.meta.url), 'utf8');
const context = await readFile(new URL('../tb-immutable-web-context.mjs', import.meta.url), 'utf8');
const stage9 = await readFile(new URL('../tb-stage9-plan-preview-service.mjs', import.meta.url), 'utf8');
const stage10 = await readFile(new URL('../tb-stage10-web-delivery-service.mjs', import.meta.url), 'utf8');
const ux = await readFile(new URL('../public/guild-operations-professional-enhancer.js', import.meta.url), 'utf8');

test('website planning route uses optional planning context while Stage 10 uses strict delivery context', () => {
  assert.match(api, /createTbImmutableWebContextResolver/);
  assert.match(api, /immutableContextResolver\.planning\(user\.id, code\)/);
  assert.match(api, /immutableContextResolver\.deliveryContext\(userId, code\)/);
  assert.doesNotMatch(api, /TB_IMMUTABLE_VERIFIED_BINDING_REQUIRED/);
});

test('server context authorizes website officer before optional Discord resolution', () => {
  const officerIndex = context.indexOf('service.requireOfficer(userId, lookupAllyCode)');
  const bindingIndex = context.indexOf('delivery.resolveBinding(officer.guild.id)');
  assert.ok(officerIndex >= 0);
  assert.ok(bindingIndex > officerIndex);
  assert.match(context, /boundSeedAllyCode \|\| lookupAllyCode/);
  assert.match(context, /TB_STAGE10_VERIFIED_BINDING_REQUIRED/);
});

test('Stage 9 records website-only mode and never makes Discord mandatory in base context validation', () => {
  assert.match(stage9, /website-only/);
  assert.match(stage9, /website-plus-discord-controls/);
  assert.match(stage9, /if \(context\.discordBound\)/);
  assert.match(stage9, /interaction: context\.discordBound/);
  assert.doesNotMatch(stage9, /Bound Discord Guild context is required/);
});

test('website UX keeps planning and exact-hash approval available while Discord is off', () => {
  assert.match(ux, /WEB PLAN READY · DISCORD OFF/);
  assert.match(ux, /No Discord connection is required to generate, review, approve, cancel, or inspect immutable versions/);
  assert.match(ux, /Approve Exact Artifact/);
  assert.match(ux, /function immutableDiscordReady\(\)/);
  assert.doesNotMatch(ux, /BINDING REQUIRED/);
});

test('Stage 10 adapter remains Discord-specific and cannot be used with website-only context', () => {
  assert.match(stage10, /Verified Discord Guild context is required for Stage 10 delivery/);
  assert.match(stage10, /DISCORD_GUILD_REQUIRED/);
  assert.match(stage10, /Explicit confirm:PUBLISH/);
  assert.match(stage10, /STAGE10_HASH_CONFIRMATION_REQUIRED/);
});
