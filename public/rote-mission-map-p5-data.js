const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_P5_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentRewards: "https://swgoh.gg/territory-battles/t05D/rewards/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Malachor, Vandor and Ring of Kafrene use source-pinned planet art and node coordinates. Current Zone 5 evidence requires R9 for all mission units except Deployment; current special/fleet rewards are preserved separately from community layout data.",
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

const planet = (id, background, nodes) => Object.freeze({
  id,
  background: `${RAW}/media/planets/${background}`,
  nodes: Object.freeze(nodes),
});

export const ROTE_P5_MISSION_MAPS = Object.freeze({
  malachor: planet("malachor", "malachor.png", [
    node("c1", "combat", 51, 15, "Combat Mission", "5x Dark Side characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "malachor-generic-1", teamId: "rote-p5-mal-c1-slkr" }),
    node("c2", "combat", 41, 45, "Combat Mission", "5x Dark Side characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "malachor-generic-2", teamId: "rote-p5-mal-c2-lv" }),
    node("c4", "combat", 59, 41, "Eighth + Fifth + Seventh Sister", "5x Dark Side characters at Relic 9+ including Eighth Brother, Fifth Brother, and Seventh Sister", "721,744 TP", { missionId: "malachor-inqs", teamId: "rote-p5-mal-inqs" }),
    node("c6", "combat", 32, 20, "Combat Mission", "5x Dark Side characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "malachor-generic-3", teamId: "rote-p5-mal-c6-see" }),
    node("c7", "deployment", 55, 25, "Deployment", "Territory deployment", "1★ 341,250,768 · 2★ 620,455,942 · 3★ 729,948,167"),
    node("m2", "operations", 28, 34, "Operations", "Characters Relic 9 · Ships 7★", "33,264,000 TP per completed Operation · 199,584,000 max"),
  ]),

  vandor: planet("vandor", "vandor.png", [
    node("c1", "fleet", 67, 54, "Fleet Mission", "7★ ships", "1,443,488 TP", { missionId: "vandor-fleet", teamId: "rote-p5-van-fleet-executor" }),
    node("c2", "combat", 30, 50, "Combat Mission", "5x characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "vandor-generic-1", teamId: "rote-p5-van-c2-gungans" }),
    node("c3", "special", 54, 29, "Young Han + Vandor Chewbacca", "5x characters at Relic 9+ including Young Han Solo and Vandor Chewbacca", "20 Mk III Guild Event Tokens", { missionId: "vandor-yhan", teamId: "rote-p5-van-yhan-rey" }),
    node("c4", "combat", 70, 24, "Combat Mission", "5x characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "vandor-generic-2", teamId: "rote-p5-van-c4-gungans" }),
    node("c6", "combat", 50, 45, "Jabba the Hutt", "5x characters at Relic 9+ including Jabba the Hutt", "307,125 → 721,744 TP", { missionId: "vandor-jabba", teamId: "rote-p5-van-jabba" }),
    node("c7", "deployment", 42, 36, "Deployment", "Territory deployment", "1★ 341,250,768 · 2★ 620,455,942 · 3★ 729,948,167"),
    node("m2", "operations", 65, 40, "Operations", "Characters Relic 9 · Ships 7★", "33,264,000 TP per completed Operation · 199,584,000 max"),
  ]),

  kafrene: planet("kafrene", "kafrene.png", [
    node("c1", "fleet", 27, 55, "Fleet Mission", "7★ Light Side ships", "1,443,488 TP", { missionId: "kafrene-fleet", teamId: "rote-p5-kaf-fleet-profundity" }),
    node("c2", "combat", 20, 42, "Cassian Andor + K-2SO", "5x Light Side characters at Relic 9+ including Cassian Andor and K-2SO", "307,125 → 721,744 TP", { missionId: "kafrene-cassian", teamId: "rote-p5-kaf-cassian-rogue" }),
    node("c3", "combat", 20, 25, "Combat Mission", "5x Light Side characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "kafrene-generic-1", teamId: "rote-p5-kaf-c3-jmk" }),
    node("c4", "combat", 65, 46, "Combat Mission", "5x Light Side characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "kafrene-generic-2", teamId: "rote-p5-kaf-c4-jkck" }),
    node("c6", "combat", 35, 22, "Combat Mission", "5x Light Side characters at Relic 9+", "307,125 → 721,744 TP", { missionId: "kafrene-generic-3", teamId: "rote-p5-kaf-c6-bkm" }),
    node("c7", "deployment", 35, 36, "Deployment", "Territory deployment", "1★ 341,250,768 · 2★ 620,455,942 · 3★ 729,948,167"),
    node("m2", "operations", 69, 33, "Operations", "Characters Relic 9 · Ships 7★", "33,264,000 TP per completed Operation · 199,584,000 max"),
  ]),
});

export function roteP5MissionMap(planetId) {
  return ROTE_P5_MISSION_MAPS[String(planetId || "")] || null;
}
