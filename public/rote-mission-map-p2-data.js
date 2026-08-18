const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_P2_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentHondoMission: "https://swgoh.gg/units/hondo-ohnaka/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Positions and planet backgrounds are pinned to GenSkaar. Current Zone 2 relic gates use the current SWGOH Wiki; Hondo's current mission type uses SWGOH.GG. Stale source text is not allowed to override newer requirement evidence.",
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

export const ROTE_P2_MISSION_MAPS = Object.freeze({
  geonosis: planet("geonosis", "geonosis.png", [
    node("c1", "combat", 36, 53, "Combat · Nexu", "5x Dark Side characters at Relic 6+", "125,000 → 250,000 TP", { missionId: "geonosis-generic-1", teamId: "rote-p2-geo-nexu-slkr" }),
    node("c2", "combat", 71, 32, "Combat · Acklay", "5x Dark Side characters at Relic 6+", "250,000 TP", { missionId: "geonosis-generic-2", teamId: "rote-p2-geo-acklay-slkr" }),
    node("c3", "combat", 59, 20, "Combat · Reek", "5x Dark Side characters at Relic 6+", "250,000 TP", { missionId: "geonosis-generic-3", teamId: "rote-p2-geo-reek-see-wat" }),
    node("c5", "combat", 55, 42, "Geonosians", "5x Geonosians at Relic 6+", "125,000 → 250,000 TP", {
      missionId: "geonosis-geos",
      teamId: "rote-p2-geo-geos",
      note: "The pinned GenSkaar revision labels this node R7; current Zone 2 requirements are R6, so the newer requirement reference is used.",
    }),
    node("c6", "fleet", 77, 55, "Fleet Mission", "7★ ships", "500,000 TP", { missionId: "geonosis-fleet", teamId: "rote-p2-geo-fleet-leviathan" }),
    node("c7", "deployment", 38, 27, "Deployment", "Territory deployment", "1★ 148,125,000 · 2★ 237,000,000 · 3★ 316,000,000"),
    node("m2", "operations", 33, 37, "Operations", "Characters Relic 6 · Ships 7★", "Supports Geonosis, Dathomir and Haven Operations"),
  ]),

  felucia: planet("felucia", "felucia.png", [
    node("c1", "combat", 56, 55, "Jabba the Hutt", "5x Relic 6+ characters including Jabba the Hutt", "125,000 → 250,000 TP", { missionId: "felucia-jabba", teamId: "rote-p2-fel-jabba" }),
    node("c2", "combat", 44, 24, "Young Lando", "5x Relic 6+ characters including Young Lando Calrissian", "125,000 → 250,000 TP", { missionId: "felucia-lando", teamId: "rote-p2-fel-lando-slkr" }),
    node("c3", "combat", 45, 48, "Combat Mission", "5x characters at Relic 6+", "125,000 → 250,000 TP", { missionId: "felucia-generic-1", teamId: "rote-p2-fel-generic-rey501" }),
    node("c5", "combat", 63, 29, "Hondo Ohnaka", "5x Relic 6+ characters including Hondo Ohnaka", "125,000 → 250,000 TP", {
      missionId: "felucia-hondo",
      teamId: "rote-p2-fel-hondo-rey",
      note: "Current SWGOH.GG identifies this as a Combat Mission. The normalized mission record is corrected to Combat before tactical recommendations are attached.",
    }),
    node("c6", "fleet", 22, 61, "Fleet Mission", "7★ ships", "500,000 TP", { missionId: "felucia-fleet", teamId: "rote-p2-fel-fleet-executor" }),
    node("c7", "deployment", 50, 38, "Deployment", "Territory deployment", "1★ 148,125,000 · 2★ 237,000,000 · 3★ 316,000,000"),
    node("m2", "operations", 70, 50, "Operations", "Characters Relic 6 · Ships 7★", "Supports Felucia and Tatooine Operations"),
  ]),

  bracca: planet("bracca", "bracca.png", [
    node("c1", "combat", 38, 55, "Combat Mission", "5x Light Side or Neutral characters at Relic 6+", "125,000 → 250,000 TP", { missionId: "bracca-generic-1", teamId: "rote-p2-bra-c1-jmk" }),
    node("c2", "combat", 29, 44, "Jedi", "5x Jedi at Relic 6+", "125,000 → 250,000 TP", { missionId: "bracca-jedi", teamId: "rote-p2-bra-jedi-jml" }),
    node("c3", "combat", 31, 24, "Combat Mission", "5x Light Side or Neutral characters at Relic 6+", "125,000 → 250,000 TP", { missionId: "bracca-generic-2", teamId: "rote-p2-bra-c3-jmk" }),
    node("c4", "special", 61, 26, "Unlock Zeffo · Cere + Cal", "Cere Junda at Relic 7+ plus either Cal Kestis variant at Relic 7+", "50 Mk III Guild Event Tokens · 30 guild clears unlock Zeffo", { missionId: "bracca-zeffo-unlock", teamId: "rote-p2-bra-zeffo-cere-cal" }),
    node("c6", "fleet", 19, 61, "Fleet Mission", "7★ Light Side ships", "500,000 TP", { missionId: "bracca-fleet", teamId: "rote-p2-bra-fleet-profundity" }),
    node("c7", "deployment", 46, 34, "Deployment", "Territory deployment", "1★ 142,265,625 · 2★ 227,625,000 · 3★ 303,500,000"),
    node("m2", "operations", 62, 48, "Operations", "Characters Relic 6 · Ships 7★", "Supports Bracca, Kashyyyk and Lothal Operations"),
  ]),
});

export function roteP2MissionMap(planetId) {
  return ROTE_P2_MISSION_MAPS[String(planetId || "")] || null;
}
