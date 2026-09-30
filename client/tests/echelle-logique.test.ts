// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  contenus,
  DECALAGE_MS,
  disposition,
  dureeEvenement,
  evenement,
  type Evenement,
  type Instant,
  MONTEE_MS,
  OUVERTURE_MS,
} from "../src/games/echelle3d/logique.ts";

const jeu = (step: number, status: Instant["status"] = "playing", roundId = 7): Instant => ({
  roundId,
  step,
  status,
});

describe("contenus", () => {
  it("toutes fermées tant que le serveur n'a rien révélé", () => {
    expect(contenus(null, 4)).toEqual(["cachee", "cachee", "cachee", "cachee"]);
    expect(contenus(undefined, 3)).toEqual(["cachee", "cachee", "cachee"]);
  });

  it("coffre = or, alarme = alarme, porte par porte", () => {
    expect(contenus(["safe", "danger", "safe", "danger"], 4)).toEqual([
      "sure",
      "piege",
      "sure",
      "piege",
    ]);
  });

  it("une révélation plus courte que la rangée laisse les dernières fermées", () => {
    expect(contenus(["danger"], 3)).toEqual(["piege", "cachee", "cachee"]);
  });
});

describe("evenement", () => {
  it("rien à l'arrivée ou sur une autre partie (reprise, nouvelle partie) : on montre l'état tel quel", () => {
    expect(evenement(null, jeu(2), null, null)).toBeNull();
    expect(evenement(jeu(2, "playing", 6), jeu(0, "playing", 7), null, null)).toBeNull();
  });

  it("un étage franchi : la porte choisie s'ouvre sur l'or, puis on monte", () => {
    const choix = { roundId: 7, step: 2, porte: 3 };
    expect(evenement(jeu(2), jeu(3), choix, null)).toEqual({ type: "avance", porte: 2 });
  });

  it("un choix d'un autre étage n'est pas celui qui a fait monter", () => {
    const vieux = { roundId: 7, step: 1, porte: 1 };
    expect(evenement(jeu(2), jeu(3), vieux, null)).toEqual({ type: "avance", porte: null });
  });

  it("perdue : la porte choisie déclenche l'alarme, puis les autres montrent leur contenu", () => {
    const choix = { roundId: 7, step: 2, porte: 2 };
    expect(evenement(jeu(2), jeu(2, "lost"), choix, ["safe", "danger", "safe"])).toEqual({
      type: "perdu",
      porte: 1,
      contenus: ["sure", "piege", "sure"],
    });
  });

  it("encaissée sans jouer : toutes les portes s'ouvrent, aucune n'est « la » porte", () => {
    expect(evenement(jeu(3), jeu(3, "cashed_out"), null, ["safe", "safe", "danger"])).toEqual({
      type: "encaisse",
      porte: null,
      contenus: ["sure", "sure", "piege"],
    });
  });

  it("dernier étage franchi (encaissement automatique) : la porte choisie s'ouvre d'abord sur l'or", () => {
    const choix = { roundId: 7, step: 5, porte: 1 };
    expect(evenement(jeu(5), jeu(6, "cashed_out"), choix, ["safe", "danger", "safe"])).toEqual({
      type: "encaisse",
      porte: 0,
      contenus: ["sure", "piege", "sure"],
    });
  });

  it("rien quand rien n'a bougé (nouveau rendu du même état)", () => {
    expect(evenement(jeu(2), jeu(2), null, null)).toBeNull();
    expect(evenement(jeu(2, "lost"), jeu(2, "lost"), null, ["danger"])).toBeNull();
  });
});

describe("dureeEvenement", () => {
  it("une montée : ouvrir la porte, puis monter", () => {
    expect(dureeEvenement({ type: "avance", porte: 1 })).toBe(OUVERTURE_MS + MONTEE_MS);
  });

  it("une alarme : la porte choisie, puis les autres l'une après l'autre", () => {
    const ev: Evenement = { type: "perdu", porte: 1, contenus: ["sure", "piege", "sure", "sure"] };
    // 3 autres portes : la dernière commence 2 décalages après la première, et dure une ouverture.
    expect(dureeEvenement(ev)).toBe(OUVERTURE_MS + 2 * DECALAGE_MS + OUVERTURE_MS);
  });

  it("un encaissement sans porte choisie : seulement les ouvertures en cascade", () => {
    const ev: Evenement = { type: "encaisse", porte: null, contenus: ["sure", "sure", "piege"] };
    expect(dureeEvenement(ev)).toBe(2 * DECALAGE_MS + OUVERTURE_MS);
  });
});

describe("disposition", () => {
  it.each([3, 4, 5])("%i portes tiennent dans le cadre, sans se toucher", (nb) => {
    const { rayon, centres } = disposition(nb, 10, 6);
    expect(centres).toHaveLength(nb);
    for (const c of centres) {
      expect(c.x - rayon).toBeGreaterThanOrEqual(-5);
      expect(c.x + rayon).toBeLessThanOrEqual(5);
      expect(c.y - rayon).toBeGreaterThanOrEqual(-3);
      expect(c.y + rayon).toBeLessThanOrEqual(3);
    }
    for (let i = 1; i < nb; i++) {
      expect(centres[i].x - centres[i - 1].x).toBeGreaterThan(2 * rayon);
    }
  });

  it("chaque porte est au centre de sa colonne : la grille de boutons tombe pile dessus", () => {
    const { centres } = disposition(4, 8, 4);
    expect(centres.map((c) => c.x)).toEqual([-3, -1, 1, 3]);
  });

  it("un cadre étroit (téléphone) donne des portes plus petites, pas des portes qui débordent", () => {
    const large = disposition(5, 10, 6).rayon;
    const etroit = disposition(5, 4, 6).rayon;
    expect(etroit).toBeLessThan(large);
  });
});
