import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../public/guild-tw-router.js', import.meta.url), 'utf8');
const enhancer = await readFile(new URL('../public/guild-operations-professional-enhancer.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/guild-operations-professional.css', import.meta.url), 'utf8');

test('Guild Operations loads the professional officer UX layer', () => {
  assert.match(router, /guild-operations-professional-enhancer\.js/);
  assert.match(enhancer, /OFFICER REQUIREMENT EDITOR/);
  assert.match(enhancer, /Refresh Guild Now/);
});

test('officer requirement editor exposes override, canonical reset, ignore and re-include actions', () => {
  assert.match(enhancer, /Save Officer Override/);
  assert.match(enhancer, /Restore Canonical Requirement/);
  assert.match(enhancer, /Ignore This Slot/);
  assert.match(enhancer, /Re-include This Slot/);
  assert.match(enhancer, /requirementOverrides/);
  assert.match(enhancer, /ignoredSlots/);
});

test('website exposes immutable ROTE version generation, history, exact hash approval and cancellation', () => {
  assert.match(enhancer, /IMMUTABLE OFFICER ASSIGNMENT REVIEW/);
  assert.match(enhancer, /Generate Immutable Version/);
  assert.match(enhancer, /Refresh Version History/);
  assert.match(enhancer, /IMMUTABLE PLAN HASH · FULL 64 CHARACTERS/);
  assert.match(enhancer, /I reviewed this exact/);
  assert.match(enhancer, /Approve Exact Artifact/);
  assert.match(enhancer, /Cancel Version/);
  assert.match(enhancer, /\/immutable-preview/);
  assert.match(enhancer, /\/assignment-versions\?phase=/);
  assert.match(enhancer, /\/approve/);
  assert.match(enhancer, /\/cancel/);
});

test('immutable planning is explicitly website-ready without Discord', () => {
  assert.match(enhancer, /WEB PLAN READY · DISCORD OFF/);
  assert.match(enhancer, /Website planning \+ approval ready/);
  assert.match(enhancer, /No Discord connection is required to generate, review, approve, cancel, or inspect immutable versions/);
  assert.match(enhancer, /Website artifact is valid\. Connect and verify Discord when you want to publish/);
  assert.doesNotMatch(enhancer, /BINDING REQUIRED/);
});

test('Stage 10 controls are gated separately from website immutable planning', () => {
  assert.match(enhancer, /function immutableDiscordReady\(\)/);
  assert.match(enhancer, /discordPublicationReady/);
  assert.match(enhancer, /approved && discordReady/);
  assert.match(enhancer, /approved && !discordReady/);
  assert.match(enhancer, /!immutableDiscordReady\(\)/);
});

test('website Stage 10 requires preview before explicit PUBLISH delivery', () => {
  assert.match(enhancer, /Preview Stage 10 Delivery/);
  assert.match(enhancer, /EXACT DELIVERY PREVIEW/);
  assert.match(enhancer, /Discord message/);
  assert.match(enhancer, /Type PUBLISH/);
  assert.match(enhancer, /Publish Approved Artifact to Discord/);
  assert.match(enhancer, /stage10-preview/);
  assert.match(enhancer, /stage10-status/);
  assert.match(enhancer, /publish-immutable/);
  assert.match(enhancer, /confirm:'PUBLISH'/);
  assert.match(enhancer, /window\.confirm\(/);
});

test('changing mention policy invalidates a previously rendered delivery preview', () => {
  assert.match(enhancer, /data-immutable-mentions/);
  assert.match(enhancer, /state\.immutable\.delivery\[runId\] = \{ includeMentions:mentions\.checked \}/);
  assert.match(enhancer, /!delivery\?\.preview/);
});

test('immutable enhancer avoids mutation-observer self-render loop after installation', () => {
  assert.match(enhancer, /let created = false/);
  assert.match(enhancer, /if \(created\) renderImmutablePanel\(\)/);
  assert.match(enhancer, /if \(!state\.immutable\.loading && \(!state\.immutable\.loaded/);
});

test('TW team editing no longer requires officers to memorize raw base IDs', () => {
  assert.match(enhancer, /Find unit/);
  assert.match(enhancer, /Minimum relic/);
  assert.match(enhancer, /Add Unit to Team/);
  assert.match(enhancer, /catalogOptions/);
});

test('operations UX supports fast keyboard workflow and human-readable preassignments', () => {
  assert.match(enhancer, /event\.key\.toLowerCase\(\) === 's'/);
  assert.match(enhancer, /event\.key === 'Enter'/);
  assert.match(enhancer, /event\.altKey/);
  assert.match(enhancer, /humanizePreassignments/);
});

test('professional layer includes responsive immutable and focus-visible styling', () => {
  assert.match(css, /focus-visible/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /guild-ops-professional-bar/);
  assert.match(css, /guild-ops-immutable-review-card/);
  assert.match(css, /guild-ops-immutable-mode-note/);
  assert.match(css, /guild-ops-web-only-note/);
  assert.match(css, /guild-ops-stage10-preview/);
  assert.match(css, /guild-ops-immutable-publish-confirm/);
});
