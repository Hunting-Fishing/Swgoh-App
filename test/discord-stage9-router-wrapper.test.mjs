import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { handleDiscordInteractionRequest as wrappedHandler } from '../discord-interaction-router.mjs';
import { handleDiscordInteractionRequest as coreHandler } from '../discord-interaction-router-core.mjs';

const wrapperUrl = new URL('../discord-interaction-router.mjs', import.meta.url);
const coreUrl = new URL('../discord-interaction-router-core.mjs', import.meta.url);

test('Stage 9 router wrapper and preserved core router both load as valid modules', () => {
  assert.equal(typeof wrappedHandler, 'function');
  assert.equal(typeof coreHandler, 'function');
});

test('Stage 9 wrapper intercepts only immutable plan safety commands and delegates all others to preserved core', () => {
  const wrapper = fs.readFileSync(wrapperUrl, 'utf8');
  assert.match(wrapper, /STAGE9_SUBCOMMANDS\s*=\s*new Set\(\['plan-status', 'plan-diff', 'plan-approve'\]\)/);
  assert.match(wrapper, /handleCoreDiscordInteractionRequest\(replayRequest\(request, rawBody\)/);
  assert.match(wrapper, /discordTbMemberHasOfficerPermission/);
  assert.match(wrapper, /discordTbMemberHasConfiguredOfficerRole/);
  assert.match(wrapper, /verifyDiscordInteraction/);
  assert.match(wrapper, /deferredEphemeral\(\)/);
  assert.doesNotMatch(wrapper, /publishDiscord|sendDm|sendDM|deliveryReceipt/i);
});

test('preserved core router still contains the pre-Stage-9 command routes', () => {
  const core = fs.readFileSync(coreUrl, 'utf8');
  for (const token of ['isGuildCommand', 'isPlayerLifecycle', 'isActivity', 'isControls', 'isReserve', 'isReserves']) {
    assert.match(core, new RegExp(token));
  }
});
