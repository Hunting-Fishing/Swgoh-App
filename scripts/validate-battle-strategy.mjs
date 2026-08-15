import assert from "node:assert/strict";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { battleStrategyForMission } from "../public/tb-battle-strategy-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";

function member(baseId, name, abilities) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    unit: { baseId, name },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

assert.ok(battleStrategyForMission("zeffo-clones"), "Zeffo Clone strategy pack missing");
assert.ok(battleStrategyForMission("tatooine-reva"), "Reva strategy pack missing");

const statusSemantics = extractAbilitySemantics({ description: "Inflict Purge and Thermal Detonator on target enemy." });
assert.ok(statusSemantics.debuffs.includes("Purge"), "Purge semantic recognition missing");
assert.ok(statusSemantics.debuffs.includes("Thermal Detonator"), "Thermal Detonator semantic recognition missing");

const rex = member("CAPTAINREX", "Captain Rex", [{
  id: "master_marksman",
  name: "Master Marksman",
  description: "Deal Physical damage to target enemy and Stun them for 1 turn.",
}]);
const zeffo = evaluateBattleStrategy({ missionId: "zeffo-clones", members: [rex] });
assert.equal(zeffo.status, "ready", "Zeffo strategy should recognize Captain Rex Stun");
assert.equal(zeffo.blockers.length, 0, "Zeffo validation unexpectedly has blockers");
assert.equal("winPercent" in zeffo, false, "Battle strategy must not invent win probability");

console.log(`[battle-strategy] validated ${["zeffo-clones", "tatooine-reva"].length} initial strategy packs and semantic gates`);
