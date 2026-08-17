import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const foundation = await readFile(new URL('../supabase/migrations/20260818032500_guild_intelligence_daily_report_foundation.sql', import.meta.url), 'utf8');
const scheduler = await readFile(new URL('../supabase/migrations/20260818033300_guild_intelligence_midnight_scheduler.sql', import.meta.url), 'utf8');
const router = await readFile(new URL('../public/guild-intelligence-router.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/guild-intelligence.css', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/guild-member-command-router.js', import.meta.url), 'utf8');

const workbookSheets = [
  'GR Dashboard', 'Member Data', 'Zeffo', 'M- Dashboard', 'M- Player Performance', 'ROTE Data',
  'Scorecards', 'Raid Performance', 'Raid Progress', 'Ticket Dashboard', 'tickets', 'ROTE Perf',
  'ROTE Operations', 'ROTE Summary', 'GL Report', 'Inquisitor Dashboard', 'M- Processing Cache',
  'Member Data Backup', 'Raid History', 'Raid Data', 'Endor Perf Data', 'ROTE Reva', 'Absences',
  'ROTE Platoons', 'About Guild Report', 'Relationships', 'EchoBase Platoons', 'Echobase Ops- Old', 'Sheet40',
];

test('every worksheet in the LV Unit Tracker is registered for Guild Intelligence', () => {
  assert.equal(workbookSheets.length, 29);
  for (const sheet of workbookSheets) assert.ok(foundation.includes(`'${sheet}'`), `missing workbook sheet: ${sheet}`);
  assert.match(foundation, /guild_intelligence_page_registry/);
  assert.match(foundation, /daily_capture boolean not null default true/);
});

test('daily reports preserve partial and source-pending truth rather than fabricating coverage', () => {
  assert.match(foundation, /implementation_status in \('active','partial','pending_source','legacy_reference'\)/);
  assert.match(foundation, /capture_status in \('captured','partial','source_pending','not_applicable','failed'\)/);
  assert.match(foundation, /returnedEvents/);
});

test('midnight scheduler is Guild-timezone aware and forces a fresh activity sync', () => {
  assert.match(scheduler, /create extension if not exists pg_cron/i);
  assert.match(scheduler, /report_timezone/);
  assert.match(scheduler, /report_local_time/);
  assert.match(scheduler, /trigger_kind/);
  assert.match(scheduler, /'scheduled'/);
  assert.match(scheduler, /include_activity,force_refresh/);
  assert.match(scheduler, /true,true/);
  assert.match(scheduler, /guildIntelligenceDaily/);
  assert.match(scheduler, /capture_guild_intelligence_daily_report/);
});

test('Guild Intelligence route exposes all workbook modules and Returned tracking', () => {
  assert.match(router, /\/guild\/intelligence/);
  assert.match(router, /29-page Guild Intelligence registry/);
  assert.match(router, /Returned/);
  assert.match(router, /enhanceReturnedEvents/);
  assert.match(css, /guild-change\.returned/);
  assert.match(loader, /import "\.\/guild-intelligence-router\.js"/);
});
