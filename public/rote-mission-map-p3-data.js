const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_P3_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentRewards: "https://swgoh.gg/territory-battles/t05D/rewards/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Planet backgrounds and node positions are pinned to the cited GenSkaar revision. Current Zone 3 R7 requirements and special-mission rewards are cross-checked against current SWGOH Wiki / SWGOH.GG references. Zeffo is intentionally excluded from this main-planet phase and is handled separately.",
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

export const ROTE_P3_MISSION_MAPS = Object.freeze({
  dathomir: planet("dathomir", "dathomir.png", [
    node("c1", "combat", 35, 55, "Doctor Aphra", "5x Dark Side characters at Relic 7+ including Doctor Aphra", "162,500 → 341,250 TP", { missionId: "dathomir-aphra", teamId: "rote-p3-dat-aphra" }),
    node("c2", "combat", 44, 44, "Combat Mission", "5x Dark Side characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "dathomir-generic-1", teamId: "rote-p3-dat-c2-see" }),
    node("c3", "combat", 63, 35, "Empire", "5x Empire characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "dathomir-empire", teamId: "rote-p3-dat-empire-lv" }),
    node("c6", "combat", 55, 58, "Combat Mission", "5x Dark Side characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "dathomir-generic-2", teamId: "rote-p3-dat-c6-see" }),
    node("c7", "deployment", 45, 28, "Deployment", "Territory deployment", "1★ 158,960,938 · 2★ 254,337,500 · 3★ 339,116,667"),
    node("c8", "special", 62, 21, "Nightsisters + Merrin", "5x Nightsisters at Relic 7+ including Merrin", "50 Mk II Guild Event Tokens", { missionId: "dathomir-merrin", teamId: "rote-p3-dat-merrin" }),
    node("m2", "operations", 32, 37, "Operations", "Characters Relic 7 · Ships 7★", "Supports Zone 3 Operations and later Dark Side territory bonuses"),
  ]),

  tatooine: planet("tatooine", "tatooine.png", [
    node("c1", "fleet", 22, 60, "Fleet · Executor", "7★ ships including Executor", "682,500 TP", { missionId: "tatooine-fleet", teamId: "rote-p3-tat-fleet-executor" }),
    node("c2", "combat", 34, 42, "Jabba the Hutt", "5x characters at Relic 7+ including Jabba the Hutt", "162,500 → 341,250 TP", { missionId: "tatooine-jabba", teamId: "rote-p3-tat-jabba" }),
    node("c3", "combat", 56, 23, "Fennec Shand", "5x characters at Relic 7+ including Fennec Shand", "162,500 → 341,250 TP", { missionId: "tatooine-fennec", teamId: "rote-p3-tat-fennec-bh" }),
    node("c4", "reva", 64, 46, "Third Sister Reva", "5x Inquisitorius at Relic 7+ including Grand Inquisitor", "1 Third Sister shard", { missionId: "tatooine-reva", teamId: "rote-p3-tat-reva-inqs" }),
    node("c5", "special", 64, 30, "Unlock Mandalore", "3x Mandalorians at Relic 7+ including Bo-Katan (Mand'alor) and The Mandalorian (Beskar Armor)", "50 Mk II Guild Event Tokens · 25 guild clears unlock Mandalore", { missionId: "tatooine-mandalore-unlock", teamId: "rote-tatooine-mandalore-unlock-ig12" }),
    node("c6", "combat", 32, 28, "Combat Mission", "5x characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "tatooine-generic-1", teamId: "rote-p3-tat-generic-gas" }),
    node("c7", "deployment", 49, 35, "Deployment", "Territory deployment", "1★ 190,953,125 · 2★ 305,525,000 · 3★ 407,366,667"),
    node("m2", "operations", 46, 52, "Operations", "Characters Relic 7 · Ships 7★", "Supports Tatooine and Kessel Operations"),
  ]),

  kashyyyk: planet("kashyyyk", "kashyyyk.png", [
    node("c1", "fleet", 65, 52, "Fleet · Profundity", "7★ Light Side ships including Profundity", "682,500 TP", { missionId: "kashyyyk-fleet", teamId: "rote-p3-kas-fleet-profundity" }),
    node("c2", "combat", 34, 45, "Combat Mission", "5x Light Side characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "kashyyyk-generic-1", teamId: "rote-p3-kas-c2-jmk" }),
    node("c3", "combat", 60, 20, "Combat Mission", "5x Light Side characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "kashyyyk-generic-2", teamId: "rote-p3-kas-c3-jml" }),
    node("c6", "combat", 32, 25, "Wookiees", "5x Wookiees at Relic 7+", "162,500 → 341,250 TP", { missionId: "kashyyyk-wookiee", teamId: "rote-p3-kas-wookiees" }),
    node("c7", "deployment", 45, 35, "Deployment", "Territory deployment", "1★ 190,953,125 · 2★ 305,525,000 · 3★ 407,366,667"),
    node("c8", "special", 49, 27, "Saw Gerrera + Rebel Fighters", "5x Rebel Fighters at Relic 7+ including Saw Gerrera", "50 Mk II Guild Event Tokens", { missionId: "kashyyyk-saw", teamId: "rote-p3-kas-saw" }),
    node("m2", "operations", 64, 30, "Operations", "Characters Relic 7 · Ships 7★", "Supports Kashyyyk, Zeffo, Lothal, Kafrene and Scarif Operations"),
  ]),
});

export function roteP3MissionMap(planetId) {
  return ROTE_P3_MISSION_MAPS[String(planetId || "")] || null;
}
