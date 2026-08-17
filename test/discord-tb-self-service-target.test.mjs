import assert from "node:assert/strict";
import test from "node:test";
import { discordTbSelfServiceTargetAllowed } from "../discord-tb.mjs";

const actorId = "111111111111111111";
const otherId = "222222222222222222";

function interaction(subcommand, memberValue) {
  return {
    member: { user: { id: actorId } },
    data: {
      name: "tb",
      options: [{
        type: 1,
        name: subcommand,
        ...(memberValue === undefined ? {} : {
          options: [{ type: 6, name: "member", value: memberValue }],
        }),
      }],
    },
  };
}

test("linked member self-service allows implicit self target", () => {
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("availability")), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preference")), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preferences")), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("me")), true);
});

test("linked member self-service allows explicit self target", () => {
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("availability", actorId)), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preference", actorId)), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preferences", actorId)), true);
});

test("linked member self-service rejects another Discord member", () => {
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("availability", otherId)), false);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preference", otherId)), false);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("preferences", otherId)), false);
});

test("self-service target helper rejects officer-only and malformed contexts", () => {
  assert.equal(discordTbSelfServiceTargetAllowed(interaction("sync")), false);
  assert.equal(discordTbSelfServiceTargetAllowed({
    member: { user: { id: "not-a-snowflake" } },
    data: { name: "tb", options: [{ type: 1, name: "availability" }] },
  }), false);
});
