import { buildZeffoMemberReadiness } from "./guild-zeffo-readiness-model.js";
import { buildMandaloreMemberReadiness } from "./guild-mandalore-readiness-model.js";
import { buildRevaMemberReadiness } from "./guild-reva-readiness-model.js";
import { buildWatMemberReadiness } from "./guild-wat-readiness-model.js";

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const TB_SPECIAL_MISSIONS = Object.freeze([
  Object.freeze({
    id: "zeffo",
    label: "Zeffo / Bracca",
    shortLabel: "Zeffo",
    tbId: "rote",
    phase: 2,
    territoryId: "bracca",
    territoryName: "Bracca",
    missionId: "bracca-zeffo-unlock",
    rewardMode: "unlock",
    officerTarget: 30,
    officerRouteMission: "zeffo",
    gateText: "Cere Junda R7+ and either JKCK R7+ or Baby Cal R7+.",
  }),
  Object.freeze({
    id: "mandalore",
    label: "Mandalore Unlock",
    shortLabel: "Mandalore",
    tbId: "rote",
    phase: 3,
    territoryId: "tatooine",
    territoryName: "Tatooine",
    missionId: "tatooine-mandalore-unlock",
    rewardMode: "unlock",
    officerTarget: 25,
    officerRouteMission: "mandalore",
    gateText: "Bo-Katan (Mand'alor) R7+ + Beskar Mando R7+ + any additional Mandalorian R7+.",
  }),
  Object.freeze({
    id: "reva",
    label: "Reva Shard Mission",
    shortLabel: "Reva",
    tbId: "rote",
    phase: 3,
    territoryId: "tatooine",
    territoryName: "Tatooine",
    missionId: "tatooine-reva",
    rewardMode: "shards",
    officerTarget: null,
    officerRouteMission: "reva",
    gateText: "Grand Inquisitor R7+ plus four additional Inquisitorius R7+.",
  }),
  Object.freeze({
    id: "wat",
    label: "Wat Tambor Shard Mission",
    shortLabel: "Wat",
    tbId: "geo-separatist",
    phase: 3,
    territoryId: "p3-middle",
    territoryName: "Battleground",
    missionId: "s3",
    rewardMode: "shards",
    officerTarget: null,
    officerRouteMission: "wat",
    gateText: "All five Geonosians at 7★ and at least 16,500 character GP each.",
  }),
]);

export const TB_SPECIAL_MISSION_BY_ID = Object.freeze(Object.fromEntries(TB_SPECIAL_MISSIONS.map((row) => [row.id, row])));

export function specialMissionsForLocation(tbId, territoryId) {
  const tb = text(tbId).toLowerCase();
  const territory = text(territoryId).toLowerCase();
  return Object.freeze(TB_SPECIAL_MISSIONS.filter((row) => row.tbId === tb && row.territoryId === territory));
}

export function playerBodyAsReadinessMember(body = {}) {
  const profile = body.player || body.profile || {};
  return Object.freeze({
    ...profile,
    playerId: text(profile.playerId || body.playerId || body.id),
    allyCode: text(profile.allyCode || body.allyCode),
    name: text(profile.name || body.name || body.playerName || "Player"),
    galacticPower: finite(profile.galacticPower ?? profile.gp ?? body.galacticPower ?? body.gp, 0),
    units: array(body.units),
    ships: array(body.ships),
    rosterAvailable: array(body.units).length > 0,
    profileTitle: text(profile.profileTitle || profile.playerTitle || profile.title),
  });
}

function zeffoRequirements(row) {
  return Object.freeze([
    Object.freeze({ baseId: "CEREJUNDA", name: "Cere Junda", state: row.cere, target: "R7" }),
    Object.freeze({ baseId: "JEDIKNIGHTCAL", name: "JKCK", state: row.jkck, target: "R7", optionalPath: true, preferred: true }),
    Object.freeze({ baseId: "CALKESTIS", name: "Baby Cal", state: row.babyCal, target: "R7", optionalPath: true }),
  ]);
}

function mandaloreRequirements(row) {
  return Object.freeze([
    Object.freeze({ baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", state: row.boKatanMandalor, target: "R7" }),
    Object.freeze({ baseId: "THEMANDALORIANBESKARARMOR", name: "Beskar Mando", state: row.beskarMando, target: "R7" }),
    Object.freeze({ baseId: row.thirdMando?.baseId || "", name: row.thirdMando?.name || "Best additional Mandalorian", state: row.thirdMando?.state, target: "R7", dynamic: true }),
  ]);
}

function revaRequirements(row) {
  return Object.freeze([
    Object.freeze({ baseId: "GRANDINQUISITOR", name: "Grand Inquisitor", state: row.grandInquisitor, target: "R7" }),
    ...array(row.supports).map((slot) => Object.freeze({ baseId: slot.baseId || "", name: slot.name, state: slot.state, target: "R7", dynamic: true })),
  ]);
}

function watRequirements(row) {
  return Object.freeze(array(row.geonosians).map((geo) => Object.freeze({
    baseId: geo.baseId,
    name: geo.name,
    state: geo.state,
    target: "7★ · 16.5K GP",
  })));
}

function missionResult(definition, row, requirements) {
  return Object.freeze({
    ...definition,
    status: row.status,
    upgradeText: row.upgradeText,
    priorityScore: finite(row.priorityScore, 0),
    requirements,
    ready: row.status === "READY",
    almost: row.status === "ALMOST",
    far: row.status === "FAR",
  });
}

export function buildPlayerTbSpecialReadiness(body = {}, catalog = []) {
  const member = playerBodyAsReadinessMember(body);
  const zeffo = buildZeffoMemberReadiness(member);
  const mandalore = buildMandaloreMemberReadiness(member, catalog);
  const reva = buildRevaMemberReadiness(member, catalog);
  const wat = buildWatMemberReadiness(member);

  return Object.freeze([
    missionResult(TB_SPECIAL_MISSION_BY_ID.zeffo, zeffo, zeffoRequirements(zeffo)),
    missionResult(TB_SPECIAL_MISSION_BY_ID.mandalore, mandalore, mandaloreRequirements(mandalore)),
    missionResult(TB_SPECIAL_MISSION_BY_ID.reva, reva, revaRequirements(reva)),
    missionResult(TB_SPECIAL_MISSION_BY_ID.wat, wat, watRequirements(wat)),
  ]);
}

export function tbFarmTargets(readinessRows = []) {
  const targets = [];
  for (const mission of array(readinessRows)) {
    for (const requirement of array(mission.requirements)) {
      const state = requirement.state || {};
      const complete = mission.id === "wat" ? state.ready === true : finite(state.relic, -1) >= 7;
      if (complete) continue;
      targets.push(Object.freeze({
        missionId: mission.id,
        missionLabel: mission.shortLabel,
        phase: mission.phase,
        territoryName: mission.territoryName,
        baseId: requirement.baseId || "",
        name: requirement.name,
        current: text(state.label || "LOCKED"),
        target: requirement.target,
        tone: state.tone || "far",
        preferred: requirement.preferred === true,
        dynamic: requirement.dynamic === true,
      }));
    }
  }
  return Object.freeze(targets);
}

export function officerReadinessUrl(missionId, allyCode = "") {
  const mission = TB_SPECIAL_MISSION_BY_ID[text(missionId).toLowerCase()];
  if (!mission) return "/guild/zeffo";
  const params = new URLSearchParams();
  const digits = text(allyCode).replace(/\D/g, "").slice(0, 9);
  if (digits) params.set("allyCode", digits);
  params.set("mission", mission.officerRouteMission);
  return `/guild/zeffo?${params.toString()}`;
}
