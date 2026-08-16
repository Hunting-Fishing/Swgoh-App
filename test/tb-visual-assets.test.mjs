import test from "node:test";
import assert from "node:assert/strict";

import {
  ROTE_VISUAL_ASSETS,
  TB_CAMPAIGN_MAP_ASSETS,
  TB_MISSION_VISUAL_ASSETS,
  missionVisualKind,
} from "../public/tb-visual-assets-data.js";

const EXPECTED_ROTE_PLANETS = [
  "mustafar",
  "corellia",
  "coruscant",
  "geonosis",
  "felucia",
  "bracca",
  "dathomir",
  "tatooine",
  "kashyyyk",
  "haven",
  "kessel",
  "lothal",
  "malachor",
  "vandor",
  "kafrene",
  "death-star",
  "hoth",
  "scarif",
  "zeffo",
  "mandalore",
];

test("real ROTE visual manifest covers every planet in the app map", () => {
  assert.deepEqual(Object.keys(ROTE_VISUAL_ASSETS.planets), EXPECTED_ROTE_PLANETS);
  for (const [id, url] of Object.entries(ROTE_VISUAL_ASSETS.planets)) {
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/genskaar\/tb_empire\/main\/media\/planet_/);
    assert.match(url, /\.png$/);
    assert.ok(url.length > id.length);
  }
  assert.match(ROTE_VISUAL_ASSETS.map, /map_rote_lines\.jpeg$/);
  assert.match(ROTE_VISUAL_ASSETS.starfield, /starfield_bg\.png$/);
});

test("Geo and Hoth campaigns have actual map imagery configured", () => {
  assert.match(TB_CAMPAIGN_MAP_ASSETS["geo-separatist"], /genskaar\/tb_geo\/master\/media\/map_dark\.jpg$/);
  assert.match(TB_CAMPAIGN_MAP_ASSETS["geo-republic"], /genskaar\/tb_geo\/master\/media\/map\.jpg$/);
  assert.match(TB_CAMPAIGN_MAP_ASSETS["hoth-rebel"], /Territory_Battle-Rebel_Assault_Zones\.png/);
  assert.match(TB_CAMPAIGN_MAP_ASSETS["hoth-imperial"], /Territory_Battle-Imperial_Retaliation_Zones\.png/);
});

test("mission visual resolver does not mistake fleet missions for combat", () => {
  assert.equal(missionVisualKind("Fleet"), "fleet");
  assert.equal(missionVisualKind("Ships"), "fleet");
  assert.equal(missionVisualKind("Special Mission — unlock"), "special");
  assert.equal(missionVisualKind("Reva"), "reva");
  assert.equal(missionVisualKind("Ki-Adi-Mundi shard"), "kam");
  assert.equal(missionVisualKind("Wat Tambor"), "wat");
  assert.equal(missionVisualKind("Combat", "combat"), "combat");
  assert.match(TB_MISSION_VISUAL_ASSETS.fleet, /mission_fleet\.png$/);
  assert.match(TB_MISSION_VISUAL_ASSETS.operations, /mission_platoon\.png$/);
});
