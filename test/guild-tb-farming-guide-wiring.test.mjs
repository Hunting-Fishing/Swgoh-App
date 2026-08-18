import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('Guild router loads the TB Farming Guide across Guild pages', async () => {
  const twRouter = await read('public/guild-tw-router.js');
  const farmRouter = await read('public/guild-tb-farming-router.js');
  assert.match(twRouter,/guild-tb-farming-router\.js/);
  assert.match(farmRouter,/\/guild\/tb\/farming/);
  assert.match(farmRouter,/TB Farming/);
  assert.match(farmRouter,/data-guild-tb-farming-callout/);
  assert.match(farmRouter,/data-guild-tb-farming-card/);
});

test('TB Farming Guide joins existing TB coverage and Journey preset systems', async () => {
  const page = await read('public/guild-tb-farming-guide.js');
  assert.match(page,/buildGuildRoteMissionCoverage/);
  assert.match(page,/JOURNEY_PRESETS/);
  assert.match(page,/buildGuildTbFarmingGuide/);
  assert.match(page,/redundancyTarget:\s*2/);
  assert.match(page,/Exact TB mission evidence only/i);
});

test('normal website use does not require Discord and retains member-focused controls', async () => {
  const page = await read('public/guild-tb-farming-guide.js');
  assert.match(page,/All Guild members/);
  assert.match(page,/Double-use only/);
  assert.match(page,/Open Member Farm Tools/);
  assert.doesNotMatch(page,/DISCORD_BOT_TOKEN|discordStateStore|Officer\/Leader\/Owner/);
});

test('build progress document records dual-use website-first architecture and future farm overlap expansion', async () => {
  const doc = await read('docs/WEB_FIRST_COMMAND_CENTER_BUILD_PROGRESS.md');
  assert.match(doc,/Discord is an optional identity, notification, and publication integration/i);
  assert.match(doc,/TB Roster Farming Guide with Journey overlap/i);
  assert.match(doc,/Cross-Mode Farm Value/i);
  assert.match(doc,/\/tb farms/);
  assert.match(doc,/same web-first service/i);
});
