import { roteP1MissionMap } from "./rote-mission-map-p1-data.js";
import { roteP2MissionMap } from "./rote-mission-map-p2-data.js";
import { roteP3MissionMap } from "./rote-mission-map-p3-data.js";
import { roteZeffoMissionMap } from "./rote-mission-map-zeffo-data.js";
import { roteP4MissionMap } from "./rote-mission-map-p4-data.js";
import { roteMandaloreMissionMap } from "./rote-mission-map-mandalore-data.js";
import { roteP5MissionMap } from "./rote-mission-map-p5-data.js";
import { roteP6MissionMap } from "./rote-mission-map-p6-data.js";

export const ROTE_MISSION_MAP_PROVIDERS = Object.freeze([
  Object.freeze({ id: "p1", getMap: roteP1MissionMap }),
  Object.freeze({ id: "p2", getMap: roteP2MissionMap }),
  Object.freeze({ id: "p3", getMap: roteP3MissionMap }),
  Object.freeze({ id: "zeffo", getMap: roteZeffoMissionMap }),
  Object.freeze({ id: "p4", getMap: roteP4MissionMap }),
  Object.freeze({ id: "mandalore", getMap: roteMandaloreMissionMap }),
  Object.freeze({ id: "p5", getMap: roteP5MissionMap }),
  Object.freeze({ id: "p6", getMap: roteP6MissionMap }),
]);

export function roteMissionMapMatches(planetId) {
  const id = String(planetId || "");
  return ROTE_MISSION_MAP_PROVIDERS
    .map((provider) => Object.freeze({ providerId: provider.id, map: provider.getMap(id) }))
    .filter((entry) => Boolean(entry.map));
}

export function roteMissionMap(planetId) {
  return roteMissionMapMatches(planetId)[0]?.map || null;
}
