import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('Stage 9 migration locks immutable payloads, preserves identical previews and audits Discord actors', async () => {
  const sql = await source('supabase/migrations/20260819141000_stage9_immutable_tb_assignment_versions.sql');
  assert.match(sql, /add column if not exists created_by_discord_user_id text/);
  assert.match(sql, /actor_discord_user_id text/);
  assert.match(sql, /new\.assignments is distinct from old\.assignments/);
  assert.match(sql, /new\.plan_hash is distinct from old\.plan_hash/);
  assert.match(sql, /before update or delete on public\.guild_tb_assignment_run_approvals/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /v_previous\.plan_hash = p_plan_hash/);
  assert.match(sql, /return v_previous/);
  assert.match(sql, /set superseded_by_run_id = v_created\.id/);
  assert.match(sql, /guard_immutable_tb_assignment_run_payload\(\)[\s\S]*security invoker/);
  assert.match(sql, /revoke all on function public\.guard_immutable_tb_assignment_run_payload\(\) from public,anon,authenticated/);
  assert.match(sql, /revoke all on function public\.create_guild_tb_assignment_version\([\s\S]*\) from public,anon,authenticated/);
});

test('Stage 9 production follow-up migration preserves trigger-function privilege hardening', async () => {
  const sql = await source('supabase/migrations/20260819142000_stage9_guard_function_execute_hardening.sql');
  assert.match(sql, /guard_immutable_tb_assignment_run_payload\(\) security invoker/);
  assert.match(sql, /guard_append_only_tb_assignment_approval\(\) security invoker/);
  assert.match(sql, /revoke all on function public\.guard_immutable_tb_assignment_run_payload\(\) from public,anon,authenticated/);
  assert.match(sql, /revoke all on function public\.guard_append_only_tb_assignment_approval\(\) from public,anon,authenticated/);
});

test('Stage 9 version service exposes context-safe Discord and web entry points while publishability fails closed', async () => {
  const js = await source('guild-tb-plan-version-service.mjs');
  for (const name of [
    'createVersionForContext',
    'listVersionsForContext',
    'getVersionForContext',
    'approveVersionForContext',
    'cancelVersionForContext',
    'compareVersionsForContext',
    'assertPublishableForContext',
  ]) assert.match(js, new RegExp(name));
  assert.match(js, /TB_ASSIGNMENT_APPROVAL_REQUIRED/);
  assert.match(js, /TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH/);
  assert.match(js, /TB_ASSIGNMENT_VERSION_SUPERSEDED/);
  assert.match(js, /TB_ASSIGNMENT_VERSION_STALE/);
  assert.match(js, /TB_PLAN_HASH_MISMATCH/);
  assert.match(js, /actor_discord_user_id/);
  assert.match(js, /p_created_by_discord_user_id/);
});

test('Discord router intercepts Stage 9 commands before core routing and applies the officer gate', async () => {
  const router = await source('discord-interaction-router.mjs');
  assert.match(router, /isDiscordTbStage9Subcommand/);
  assert.match(router, /const isStage9 =/);
  assert.match(router, /if \(!officerAuthorized\)/);
  assert.match(router, /else if \(isStage9\) scheduleStage9Response/);
  assert.match(router, /authorizedAsOfficer: true/);
});

test('Stage 9 schema has no publish command and stays within Discord root option capacity', async () => {
  const registration = await source('scripts/register-discord-tb-commands.mjs');
  const tbStart = registration.indexOf('name: "tb"');
  const guildStart = registration.indexOf('name: "guild"');
  assert.ok(tbStart >= 0 && guildStart > tbStart);
  const tbBlock = registration.slice(tbStart, guildStart);
  const rootSubcommands = [...tbBlock.matchAll(/type: 1,\s*name: "([a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(rootSubcommands.length <= 25, `Discord /tb has ${rootSubcommands.length} root options; maximum is 25`);
  for (const name of ['plan-preview','plan-status','plan-approve','plan-cancel','plan-diff']) assert.ok(rootSubcommands.includes(name), `${name} missing`);
  assert.equal(rootSubcommands.includes('plan-publish'), false);
});
