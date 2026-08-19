const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_MANDALORE_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentBkmMission: "https://swgoh.gg/units/bo-katan-mandalor/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Mandalore is an unlocked bonus territory. Planet art and node positions are pinned to GenSkaar. Current evidence keeps the territory baseline at R8 while Bo-Katan (Mand'alor) specifically requires R9. The source planet background filename is intentionally misspelled manalore.png and is preserved exactly.",
});

const node = (id, type, top, left, label, requirement, reward, internal = {}) => Object.freeze({
  id,
  type,
  top,
  left,
  label,
  requirement,
  reward,
  missionId: internal.missionId || "",
  teamId: internal.teamId || "",
  note: internal.note || "",
});

export const ROTE_MANDALORE_MISSION_MAP = Object.freeze({
  id: "mandalore",
  background: `${RAW}/media/planets/manalore.png`,
  nodes: Object.freeze([
    node("c1", "fleet", 70, 56, "Fleet · Gauntlet Starfighter", "7★ ships including Gauntlet Starfighter", "987,188 TP", { missionId: "mandalore-fleet", teamId: "rote-mando-fleet-chimaera" }),
    node("c2", "combat", 39, 53, "Combat Mission", "5x Light Side or Dark Side characters at Relic 8+", "219,375 → 493,594 TP", { missionId: "mandalore-generic-1", teamId: "rote-mando-generic-jmk" }),
    node("c3", "combat", 70, 33, "Bo-Katan (Mand'alor)", "5x Mandalorians at Relic 9+ including Bo-Katan (Mand'alor)", "658,125 → 1,480,782 TP", {
      missionId: "mandalore-bkm",
      teamId: "rote-mando-bkm",
      note: "Bo-Katan (Mand'alor) is an explicit R9 exception; the surrounding Mandalore territory baseline is R8.",
    }),
    node("c6", "combat", 55, 45, "Dark Trooper Moff Gideon", "5x characters at Relic 8+ including Dark Trooper Moff Gideon", "219,375 → 493,594 TP", { missionId: "mandalore-dtmg", teamId: "rote-mando-dtmg" }),
    node("c7", "deployment", 44, 30, "Deployment", "Unlocked Mandalore territory deployment", "Tier 1: 197,748,650 · Tier 2: 316,397,840 · 1★: 396,497,300"),
    node("m2", "operations", 32, 42, "Operations", "Characters Relic 8 · Ships 7★", "18,480,000 TP per completed Operation · 110,880,000 max"),
  ]),
});

export function roteMandaloreMissionMap(planetId) {
  return String(planetId || "") === "mandalore" ? ROTE_MANDALORE_MISSION_MAP : null;
}
