const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_P1_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Mission positions, mission types, requirements, rewards and planet backgrounds are pinned to the cited GenSkaar ROTE revision. Internal SWGOH App mission IDs are linked only where the source mission can be mapped without ambiguity.",
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
});

const planet = (id, background, nodes) => Object.freeze({
  id,
  background: `${RAW}/media/planets/${background}`,
  nodes: Object.freeze(nodes),
});

export const ROTE_P1_MISSION_MAPS = Object.freeze({
  mustafar: planet("mustafar", "mustafar.jpg", [
    node("c1", "combat", 56, 46, "Combat Mission", "5x Dark Side or Neutral characters at Relic 5+", "100,000 → 200,000 TP", { missionId: "mustafar-generic-1", teamId: "rote-p1-mus-c1-see-wat" }),
    node("c2", "combat", 28, 26, "Lord Vader", "Lord Vader at Relic 5+", "100,000 → 200,000 TP", { missionId: "mustafar-lv", teamId: "rote-p1-mus-lv-solo" }),
    node("c3", "combat", 56, 18, "Combat Mission", "5x Dark Side or Neutral characters at Relic 5+", "100,000 → 200,000 TP", { missionId: "mustafar-generic-2", teamId: "rote-p1-mus-c3-see-wat" }),
    node("c5", "combat", 35, 40, "Combat Mission", "5x Dark Side or Neutral characters at Relic 5+", "100,000 → 200,000 TP", { missionId: "mustafar-generic-3", teamId: "rote-p1-mus-c5-slkr" }),
    node("c6", "fleet", 26, 55, "Fleet · Scythe", "7★ Dark Side ships including Scythe", "400,000 TP", { missionId: "mustafar-fleet", teamId: "rote-p1-mus-fleet-mk6" }),
    node("c7", "deployment", 48, 33, "Deployment", "Territory deployment", "1★ 116,406,250 · 2★ 186,250,000 · 3★ 248,333,333"),
    node("m2", "operations", 63, 37, "Operations", "Characters Relic 5 · Ships 7★", "Supports Mustafar and Phase 2 Dark Side Operations"),
  ]),

  corellia: planet("corellia", "corellia.png", [
    node("c1", "combat", 36, 50, "Jabba the Hutt", "5x Relic 5+ characters including Jabba the Hutt", "100,000 → 200,000 TP", { missionId: "corellia-jabba", teamId: "rote-p1-cor-jabba" }),
    node("c2", "combat", 20, 44, "Doctor Aphra", "5x Relic 5+ characters including Doctor Aphra", "100,000 → 200,000 TP", { missionId: "corellia-aphra", teamId: "rote-p1-cor-aphra" }),
    node("c3", "combat", 38, 38, "Combat Mission", "5x characters at Relic 5+", "100,000 → 200,000 TP", { missionId: "corellia-generic-1", teamId: "rote-p1-cor-generic-cls" }),
    node("c5", "special", 63, 29, "Qi'ra + Young Han", "5x Relic 5+ characters including Qi'ra and Young Han Solo", "15 Mk III Guild Event Tokens", { missionId: "corellia-qira", teamId: "rote-p1-cor-qira-leia" }),
    node("c6", "fleet", 64, 53, "Fleet · Lando's Falcon", "Lando's Millennium Falcon at 7★", "400,000 TP", { missionId: "corellia-fleet", teamId: "rote-p1-cor-fleet-executor" }),
    node("c7", "deployment", 38, 29, "Deployment", "Territory deployment", "1★ 111,718,750 · 2★ 178,750,000 · 3★ 238,333,333"),
    node("m2", "operations", 53, 20, "Operations", "Characters Relic 5 · Ships 7★", "Supports Mixed territories through Phase 6"),
  ]),

  coruscant: planet("coruscant", "coruscant.png", [
    node("c1", "combat", 40, 60, "Mace + Kit Jedi", "5x Jedi at Relic 5+ including Mace Windu and Kit Fisto", "100,000 → 200,000 TP", { missionId: "coruscant-mace-kit", teamId: "rote-p1-cus-mace-kit-grj" }),
    node("c2", "combat", 22, 53, "Jedi", "5x Jedi at Relic 5+", "100,000 → 200,000 TP", { missionId: "coruscant-jedi", teamId: "rote-p1-cus-jedi-jml" }),
    node("c3", "combat", 39, 38, "Combat Mission", "5x Light Side or Neutral characters at Relic 5+", "100,000 → 200,000 TP", { missionId: "coruscant-generic-1", teamId: "rote-p1-cus-c3-leia" }),
    node("c5", "combat", 55, 26, "Combat Mission", "5x Light Side or Neutral characters at Relic 5+", "100,000 → 200,000 TP", { missionId: "coruscant-generic-2", teamId: "rote-p1-cus-c5-leia" }),
    node("c6", "fleet", 21, 25, "Fleet · Outrider", "7★ Light Side ships including Outrider", "400,000 TP", { missionId: "coruscant-fleet", teamId: "rote-p1-cus-fleet-profundity" }),
    node("c7", "deployment", 52, 48, "Deployment", "Territory deployment", "1★ 116,406,250 · 2★ 186,250,000 · 3★ 248,333,333"),
    node("m2", "operations", 68, 35, "Operations", "Characters Relic 5 · Ships 7★", "Supports Coruscant and Phase 2 Light Side Operations"),
  ]),
});

export function roteP1MissionMap(planetId) {
  return ROTE_P1_MISSION_MAPS[String(planetId || "")] || null;
}
