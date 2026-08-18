import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const registry = await readFile(new URL('web-action-registry.mjs', root), 'utf8');
const service = await readFile(new URL('web-action-service.mjs', root), 'utf8');
const api = await readFile(new URL('web-action-api.mjs', root), 'utf8');
const account = await readFile(new URL('account-onboarding.mjs', root), 'utf8');
const page = await readFile(new URL('public/actions/index.html', root), 'utf8');
const ui = await readFile(new URL('public/web-actions.js', root), 'utf8');
const feed = await readFile(new URL('public/web-action-feed.js', root), 'utf8');
const journeyTracker = await readFile(new URL('public/journey-tracker-v2.js', root), 'utf8');
const guildRouter = await readFile(new URL('public/guild-tw-router.js', root), 'utf8');
const onboarding = await readFile(new URL('public/onboarding/index.html', root), 'utf8');
const migration = await readFile(new URL('supabase/migrations/20260818160000_web_action_center_foundation.sql', root), 'utf8');
const goalsMigration = await readFile(new URL('supabase/migrations/20260819071500_user_journey_goals.sql', root), 'utf8');
const tbAction = await readFile(new URL('tb-farm-plan-action.mjs', root), 'utf8');
const canonical = await readFile(new URL('canonical-roster-service.mjs', root), 'utf8');

 test('Raid Max is registered as a website-native action with Discord explicitly optional', () => {
  assert.match(registry, /key: 'raid-max'/);
  assert.match(registry, /'\/raid max'/);
  assert.match(registry, /'\/raidmax'/);
  assert.match(registry, /execution: 'website-native'/);
  assert.match(registry, /discordRequired: false/);
  assert.match(registry, /shareTargets: Object\.freeze\(\['player-page', 'guild-page', 'discord'\]\)/);
});

test('Personal TB Farm Plan defaults to durable tracked Journey goals while retaining explainable alternate sorts', () => {
  assert.match(registry, /key: 'tb-farm-plan'/);
  assert.match(registry, /'\/tb farms'/);
  assert.match(registry, /'\/tb farm'/);
  assert.match(registry, /default: 'my-goals'/);
  assert.match(registry, /value: 'my-goals', label: 'My tracked Journey goals'/);
  assert.match(registry, /value: 'guild-impact'/);
  assert.match(registry, /value: 'journey-overlap'/);
  assert.match(registry, /value: 'closest-upgrade'/);
  assert.match(tbAction, /trackedActiveCount/);
  assert.match(tbAction, /myGoalsComparator/);
  assert.match(tbAction, /fallbackUsed/);
  assert.match(canonical, /getGameUnitCatalog/);
});

test('execution and publication remain separate and TB execution loads tracked goals server-side', () => {
  assert.match(api, /\/api\/account\/web-actions\/execute/);
  assert.match(api, /\/share\$/);
  assert.match(api, /sameOrigin/);
  assert.match(service, /canonical\.getPlayerRoster/);
  assert.match(service, /journeyGoals\.listForPlayer\(userId, identity\.player\.id\)/);
  assert.match(service, /executePersonalTbFarmPlan/);
  assert.match(service, /web_action_runs/);
  assert.match(service, /web_action_publications/);
  assert.doesNotMatch(service, /input\?\.trackedGoalIds/);
});

test('Action Center exposes account Journey goal management and visible MY GOAL TB results', () => {
  assert.match(page, /My Journey Goals/);
  assert.match(page, /Save My Goals/);
  assert.match(page, /Publishing is optional\. Running the action never posts automatically\./);
  assert.match(api, /\/api\/account\/web-actions\/journey-goals/);
  assert.match(api, /request\.method === 'PUT'/);
  assert.match(ui, /loadJourneyGoals/);
  assert.match(ui, /saveJourneyGoals/);
  assert.match(ui, /MY MULTI-GOAL/);
  assert.match(ui, /MY GOAL/);
  assert.match(ui, /Nothing was posted automatically/);
});

test('Farm Command shares verified-player goals but protects manually loaded other Ally Codes', () => {
  assert.match(journeyTracker, /durableMatchesLoadedPlayer/);
  assert.match(journeyTracker, /\/api\/account\/web-actions\/journey-goals/);
  assert.match(journeyTracker, /Other manually loaded Ally Codes stay device-local/);
  assert.match(journeyTracker, /Save device goals to my account/);
  assert.match(journeyTracker, /if \(!durableMatchesLoadedPlayer\(\)\) return \{ durable: false/);
});

test('app-native Player and Guild command feeds identify personalized TB Farm Plan publications', () => {
  assert.match(guildRouter, /web-action-feed\.js/);
  assert.match(feed, /feed\/player/);
  assert.match(feed, /feed\/guild/);
  assert.match(feed, /TB FARM PLAN · ROTE/);
  assert.match(feed, /PERSONALIZED/);
  assert.match(feed, /★ MY GOAL/);
  assert.match(feed, /Open Action Center/);
});

test('website action API is routed before generic account onboarding handling', () => {
  assert.match(account, /import \{ webActionApi \}/);
  assert.match(account, /startsWith\('\/api\/account\/web-actions'\)/);
  assert.match(account, /webActionApi\.handle/);
});

test('durable action tables remain server-only', () => {
  assert.match(migration, /create table if not exists public\.web_action_runs/);
  assert.match(migration, /create table if not exists public\.web_action_publications/);
  assert.match(migration, /enable row level security/);
});

test('durable Journey goals are server-only and replaced atomically', () => {
  assert.match(goalsMigration, /create table if not exists public\.user_journey_goals/);
  assert.match(goalsMigration, /primary key \(user_id, player_id, journey_event_id\)/);
  assert.match(goalsMigration, /alter table public\.user_journey_goals enable row level security/);
  assert.match(goalsMigration, /revoke all on table public\.user_journey_goals from anon, authenticated/);
  assert.match(goalsMigration, /create or replace function public\.replace_user_journey_goals/);
  assert.match(goalsMigration, /delete from public\.user_journey_goals/);
  assert.match(goalsMigration, /grant execute on function public\.replace_user_journey_goals[\s\S]*to service_role/);
});
