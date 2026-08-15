import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { teamInteractionProfileFromCatalog } from "../public/interaction-graph.js";

test("selected-team interaction evidence works from the lean catalog without prebuilt kit fields", () => {
  const catalog = {
    units: [
      {
        baseId: "LEADER",
        name: "Leader Unit",
        factions: ["Rebel"],
        abilities: [{ id: "leader_a", name: "Rebel Network", type: "Leader", description: "Rebel allies gain Speed Up and call another Rebel ally to assist." }],
      },
      {
        baseId: "ALLY",
        name: "Ally Unit",
        factions: ["Rebel"],
        abilities: [{ id: "basic_b", name: "Strike", type: "Basic", description: "Deal physical damage." }],
      },
    ],
  };
  const profile = teamInteractionProfileFromCatalog(["LEADER", "ALLY"], catalog);
  assert.equal(profile.foundUnitCount, 2);
  assert.ok(profile.activeInteractions.some((item) => item.targetType === "faction" && item.targetId === "Rebel"));
  assert.ok(profile.mechanics.some((item) => item.mechanic === "assist"));
  assert.equal("score" in profile, false);
});

test("kit enrichment publishes a separate index instead of expanding catalog.json", () => {
  const source = fs.readFileSync(new URL("../scripts/enrich-kit-intelligence.mjs", import.meta.url), "utf8");
  assert.match(source, /KIT_INDEX_PATH/);
  assert.doesNotMatch(source, /writeFile\(CATALOG_PATH/);
});

test("raw graph build overlays separate kit semantics in memory for cross validation", () => {
  const source = fs.readFileSync(new URL("../scripts/sync-raw-combat-data.mjs", import.meta.url), "utf8");
  assert.match(source, /KIT_INDEX_PATH/);
  assert.match(source, /withKitSemantics/);
  assert.match(source, /catalog: semanticCatalog/);
});

test("TB combat UI only requests enemy knowledge when a visible mission names enemies", () => {
  const ui = fs.readFileSync(new URL("../public/tb-combat-prep-ui.js", import.meta.url), "utf8");
  const intelligence = fs.readFileSync(new URL("../public/tb-combat-intelligence.js", import.meta.url), "utf8");
  assert.match(ui, /needEnemy/);
  assert.match(ui, /loadCombatKnowledge\(\{ needEnemy \}\)/);
  assert.match(intelligence, /if \(!needEnemy\) return \{ enemyKit: null \}/);
  assert.doesNotMatch(intelligence, /interaction-index\.json/);
});

test("production build keeps external static enrichment fail-soft", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const build = fs.readFileSync(new URL("../scripts/build-production-data.mjs", import.meta.url), "utf8");
  assert.equal(pkg.scripts.build, "node scripts/build-production-data.mjs");
  assert.match(build, /process\.exitCode = 0/);
  assert.match(build, /committed static data will remain the fallback/);
});

test("production combat hardening modules parse", () => {
  for (const path of [
    new URL("../public/interaction-graph.js", import.meta.url),
    new URL("../public/tb-combat-intelligence.js", import.meta.url),
    new URL("../public/tb-combat-prep-ui.js", import.meta.url),
    new URL("../scripts/build-production-data.mjs", import.meta.url),
    new URL("../scripts/sync-raw-combat-data.mjs", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
