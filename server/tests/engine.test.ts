import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMultipliers,
  cashoutCents,
  configFor,
  drawOptions,
  findMode,
  multiplierAt,
  playStep,
  type Outcome,
} from "../src/engine/ladder.ts";
import { GAMES, GAME_IDS, isGameId } from "../src/engine/definitions.ts";
import { MAX_PAYOUT_CENTS } from "../src/money.ts";

/**
 * Moteur « jeu d'échelle », testé sans HTTP ni base : des fonctions pures,
 * plus le tirage (le seul endroit où le hasard entre).
 */

// Valeurs produites par l'ancien game.algorithm.ts (Number(x.toFixed(2))) :
// la refonte ne doit rien changer aux gains de Vault Rush.
const VAULT_RUSH_ATTENDU: Record<string, number[]> = {
  safe: [1.47, 2.21, 3.31, 4.96, 7.44, 11.16],
  risk: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44],
  insane: [2.35, 5.87, 14.69, 36.72, 91.8, 229.49],
};

const LASER_GRID_ATTENDU: Record<string, number[]> = {
  calme: [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79],
  tendu: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76],
  mortel: [2.35, 5.87, 14.69, 36.72, 91.8, 229.49, 573.73, 1434.33],
};

const GETAWAY_ATTENDU: Record<string, number[]> = {
  tranquille: [1.31, 1.74, 2.32, 3.1, 4.13],
  nerveux: [1.44, 2.16, 3.24, 4.86, 7.29],
  cavale: [1.88, 3.76, 7.52, 15.04, 30.08],
};

const BOMB_SQUAD_ATTENDU: Record<string, number[]> = {
  novice: [1.31, 1.74, 2.32, 3.1],
  confirme: [1.92, 3.84, 7.68, 15.36],
  demineur: [2.35, 5.87, 14.69, 36.72],
};

test("régression : les multiplicateurs de Vault Rush sont inchangés (3 modes x 6 étages)", () => {
  const def = GAMES["vault-rush"];
  assert.equal(def.steps, 6);
  assert.deepEqual(
    def.modes.map((m) => m.id),
    ["safe", "risk", "insane"],
  );

  for (const mode of def.modes) {
    const mults = buildMultipliers(mode.safeOptions, mode.options, mode.houseEdge, def.steps);
    assert.equal(mults.length, 6);
    assert.deepEqual(mults, VAULT_RUSH_ATTENDU[mode.id], `mode ${mode.id}`);
  }
});

test("buildMultipliers garde le même avantage de la maison à chaque étape", () => {
  for (const id of GAME_IDS) {
    const def = GAMES[id];
    for (const mode of def.modes) {
      const p = mode.safeOptions / mode.options;
      const mults = buildMultipliers(mode.safeOptions, mode.options, mode.houseEdge, def.steps);
      mults.forEach((m, i) => {
        const rtp = m * Math.pow(p, i + 1);
        assert.ok(
          Math.abs(rtp - (1 - mode.houseEdge)) < 0.01,
          `${id}/${mode.id} étape ${i + 1} : RTP=${rtp.toFixed(3)}`,
        );
      });
    }
  }
});

test("Laser Grid : 8 lignes, trois modes, chances et multiplicateurs attendus", () => {
  const def = GAMES["laser-grid"];
  assert.equal(def.steps, 8);
  assert.equal(def.labels.step, "ligne");
  assert.equal(def.labels.option, "case");
  assert.equal(def.labels.danger, "laser");

  const attendu = [
    { id: "calme", options: 4, safeOptions: 3, houseEdge: 0.02, chance: 0.75 },
    { id: "tendu", options: 4, safeOptions: 2, houseEdge: 0.04, chance: 0.5 },
    { id: "mortel", options: 5, safeOptions: 2, houseEdge: 0.06, chance: 0.4 },
  ];

  assert.deepEqual(
    def.modes.map((m) => ({
      id: m.id,
      options: m.options,
      safeOptions: m.safeOptions,
      houseEdge: m.houseEdge,
      chance: m.safeOptions / m.options,
    })),
    attendu,
  );

  for (const mode of def.modes) {
    assert.deepEqual(
      buildMultipliers(mode.safeOptions, mode.options, mode.houseEdge, def.steps),
      LASER_GRID_ATTENDU[mode.id],
      `mode ${mode.id}`,
    );
  }
});

test("Getaway : 5 tronçons, trois modes, multiplicateurs figés", () => {
  const def = GAMES.getaway;
  assert.equal(def.name, "Getaway");
  assert.equal(def.steps, 5);
  assert.deepEqual(def.labels, {
    step: "tronçon",
    option: "route",
    safe: "voie libre",
    danger: "barrage",
    cashout: "Se planquer",
  });

  assert.deepEqual(
    def.modes.map((m) => ({
      id: m.id,
      label: m.label,
      options: m.options,
      safeOptions: m.safeOptions,
      houseEdge: m.houseEdge,
    })),
    [
      { id: "tranquille", label: "Tranquille", options: 4, safeOptions: 3, houseEdge: 0.02 },
      { id: "nerveux", label: "Nerveux", options: 3, safeOptions: 2, houseEdge: 0.04 },
      { id: "cavale", label: "Cavale", options: 4, safeOptions: 2, houseEdge: 0.06 },
    ],
  );

  for (const mode of def.modes) {
    const mults = buildMultipliers(mode.safeOptions, mode.options, mode.houseEdge, def.steps);
    assert.equal(mults.length, 5);
    assert.deepEqual(mults, GETAWAY_ATTENDU[mode.id], `mode ${mode.id}`);
  }
});

test("Bomb Squad : 4 étapes, trois modes, multiplicateurs figés", () => {
  const def = GAMES["bomb-squad"];
  assert.equal(def.name, "Bomb Squad");
  assert.equal(def.steps, 4);
  assert.deepEqual(def.labels, {
    step: "étape",
    option: "câble",
    safe: "neutralisé",
    danger: "explosion",
    cashout: "Se retirer",
  });

  assert.deepEqual(
    def.modes.map((m) => ({
      id: m.id,
      label: m.label,
      options: m.options,
      safeOptions: m.safeOptions,
      houseEdge: m.houseEdge,
    })),
    [
      { id: "novice", label: "Novice", options: 4, safeOptions: 3, houseEdge: 0.02 },
      { id: "confirme", label: "Confirmé", options: 4, safeOptions: 2, houseEdge: 0.04 },
      { id: "demineur", label: "Démineur", options: 5, safeOptions: 2, houseEdge: 0.06 },
    ],
  );

  for (const mode of def.modes) {
    const mults = buildMultipliers(mode.safeOptions, mode.options, mode.houseEdge, def.steps);
    assert.equal(mults.length, 4);
    assert.deepEqual(mults, BOMB_SQUAD_ATTENDU[mode.id], `mode ${mode.id}`);
  }
});

test("les quatre jeux ont des identifiants, des modes et des libellés distincts", () => {
  const def = GAME_IDS.map((id) => GAMES[id]);
  assert.deepEqual(
    def.map((d) => d.id),
    [...GAME_IDS],
  );
  // Deux jeux ne partagent jamais le mot de leur danger : le bilan resterait ambigu.
  const dangers = def.map((d) => d.labels.danger);
  assert.equal(new Set(dangers).size, dangers.length);
  for (const d of def) {
    assert.ok(d.tagline.length > 0, `${d.id} sans accroche`);
    assert.equal(new Set(d.modes.map((m) => m.id)).size, d.modes.length, `${d.id}`);
  }
});

test("drawOptions tire exactement le bon nombre de cases sûres, à une place variable", () => {
  const TIRAGES = 10_000;
  for (const id of GAME_IDS) {
    const def = GAMES[id];
    for (const mode of def.modes) {
      let sures = 0;
      const positionsSures = new Array(mode.options).fill(0);

      for (let i = 0; i < TIRAGES; i++) {
        const tirage = drawOptions(mode.options, mode.safeOptions);
        assert.equal(tirage.length, mode.options);
        const safes = tirage.filter((o) => o === "safe").length;
        assert.equal(safes, mode.safeOptions, `${id}/${mode.id} : tirage déséquilibré`);
        sures += safes;
        tirage.forEach((o, pos) => {
          if (o === "safe") positionsSures[pos] += 1;
        });
      }

      const proportion = sures / (TIRAGES * mode.options);
      const cible = mode.safeOptions / mode.options;
      assert.ok(
        Math.abs(proportion - cible) < 0.03,
        `${id}/${mode.id} : proportion sûre ${proportion.toFixed(3)} vs ${cible}`,
      );
      // Aucune position privilégiée : chaque case est sûre à peu près aussi souvent.
      for (const compte of positionsSures) {
        assert.ok(
          Math.abs(compte / TIRAGES - cible) < 0.03,
          `${id}/${mode.id} : position biaisée (${compte}/${TIRAGES})`,
        );
      }
    }
  }
});

test("drawOptions accepte un tirage injecté (hasard neutralisé)", () => {
  const tirage = drawOptions(5, 2, () => 0);
  assert.equal(tirage.length, 5);
  assert.equal(tirage.filter((o: Outcome) => o === "safe").length, 2);
});

test("cashoutCents arrondit au centime puis plafonne", () => {
  assert.equal(cashoutCents(1000, 2.21), 2210);
  assert.equal(cashoutCents(333, 1.47), 490); // 489,51 arrondi
  assert.equal(cashoutCents(100_000, 229.49), MAX_PAYOUT_CENTS);
});

test("multiplierAt : 1 avant la première étape, la valeur du mode ensuite", () => {
  const def = GAMES["vault-rush"];
  const safe = findMode(def, "safe")!;
  assert.equal(multiplierAt(safe, def.steps, 0), 1);
  assert.equal(multiplierAt(safe, def.steps, 1), 1.47);
  assert.equal(multiplierAt(safe, def.steps, 6), 11.16);
  assert.throws(() => multiplierAt(safe, def.steps, 7));
});

test("findMode ne connaît que les modes du jeu demandé", () => {
  assert.equal(findMode(GAMES["vault-rush"], "safe")?.id, "safe");
  assert.equal(findMode(GAMES["vault-rush"], "calme"), undefined);
  assert.equal(findMode(GAMES["laser-grid"], "calme")?.id, "calme");
});

test("playStep avance sur une case sûre et s'arrête sur un danger", () => {
  const def = GAMES["laser-grid"];
  const mode = findMode(def, "tendu")!;
  const sureDabord = () => ["safe", "safe", "danger", "danger"] as Outcome[];
  const dangerDabord = () => ["danger", "danger", "safe", "safe"] as Outcome[];

  const gagne = playStep(def, mode, 0, 0, sureDabord);
  assert.equal(gagne.outcome, "safe");
  assert.equal(gagne.nextStep, 1);
  assert.equal(gagne.multiplier, 1.92);
  assert.deepEqual(gagne.revealed, ["safe", "safe", "danger", "danger"]);

  const perdu = playStep(def, mode, 3, 0, dangerDabord);
  assert.equal(perdu.outcome, "danger");
  assert.equal(perdu.nextStep, 3);
  assert.equal(perdu.multiplier, 0);
});

test("configFor décrit le jeu pour le client", () => {
  const config = configFor(GAMES["laser-grid"]);
  assert.equal(config.id, "laser-grid");
  assert.equal(config.name, "Laser Grid");
  assert.ok(config.tagline.length > 0);
  assert.equal(config.steps, 8);
  assert.equal(config.maxPayoutCents, MAX_PAYOUT_CENTS);
  assert.equal(config.minBetCents, 100);
  assert.equal(config.maxBetCents, 100_000);
  assert.deepEqual(config.labels, {
    step: "ligne",
    option: "case",
    safe: "passage",
    danger: "laser",
    cashout: "Sortir",
  });

  const calme = config.modes[0];
  assert.equal(calme.id, "calme");
  assert.equal(calme.label, "Calme");
  assert.equal(calme.options, 4);
  assert.equal(calme.safeOptions, 3);
  assert.equal(calme.houseEdge, 0.02);
  assert.equal(calme.chancePerStep, 0.75);
  assert.deepEqual(calme.multipliers, LASER_GRID_ATTENDU.calme);
});

test("isGameId ne reconnaît que les quatre jeux livrés", () => {
  assert.ok(isGameId("vault-rush"));
  assert.ok(isGameId("laser-grid"));
  assert.ok(isGameId("getaway"));
  assert.ok(isGameId("bomb-squad"));
  assert.ok(!isGameId("poker"));
  assert.ok(!isGameId(""));
  assert.ok(!isGameId(undefined));
  assert.deepEqual([...GAME_IDS], ["vault-rush", "laser-grid", "getaway", "bomb-squad"]);
});

// --- LA preuve : le VRAI hasard, mesuré ---

test("le tirage réel donne le bon taux de réussite par étape", () => {
  // Contrôle serré : c'est ce taux, combiné aux multiplicateurs, qui fixe le RTP.
  const COUPS = 50_000;
  for (const id of GAME_IDS) {
    const def = GAMES[id];
    for (const mode of def.modes) {
      let reussites = 0;
      for (let i = 0; i < COUPS; i++) {
        const choix = Math.floor(Math.random() * mode.options);
        if (playStep(def, mode, 0, choix).outcome === "safe") reussites += 1;
      }
      const p = mode.safeOptions / mode.options;
      const observe = reussites / COUPS;
      // 4 écarts-types (SE = sqrt(p(1-p)/n) <= 0,0023 ici).
      const tolerance = 4 * Math.sqrt((p * (1 - p)) / COUPS);
      assert.ok(
        Math.abs(observe - p) < tolerance,
        `[${id}/${mode.id}] réussite=${(observe * 100).toFixed(2)}% vs ${(p * 100).toFixed(0)}%`,
      );
    }
  }
});

test("simulation Monte Carlo : le RTP réel converge vers la cible", () => {
  const PARTIES = 200_000;

  for (const id of GAME_IDS) {
    const def = GAMES[id];
    for (const mode of def.modes) {
      const mise = 100; // centimes
      const p = mode.safeOptions / mode.options;
      const mults = Array.from({ length: def.steps }, (_, n) =>
        multiplierAt(mode, def.steps, n + 1),
      );

      let totalMise = 0;
      let totalGain = 0;

      for (let r = 0; r < PARTIES; r++) {
        totalMise += mise;
        // Stratégie : viser une étape au hasard, puis encaisser.
        const viseeEtape = 1 + Math.floor(Math.random() * def.steps);
        let step = 0;
        let vivant = true;

        for (let s = 0; s < viseeEtape; s++) {
          const choix = Math.floor(Math.random() * mode.options);
          const res = playStep(def, mode, step, choix);
          if (res.outcome === "danger") {
            vivant = false;
            break;
          }
          step = res.nextStep;
        }

        if (vivant) totalGain += cashoutCents(mise, multiplierAt(mode, def.steps, step));
      }

      const rtp = totalGain / totalMise;
      const cible = 1 - mode.houseEdge;
      // Les gros multiplicateurs sont rares : la tolérance suit l'écart-type
      // réel de cette stratégie, sinon le test échouerait au hasard.
      const moment2 =
        mults.reduce((acc, m, n) => acc + m * m * Math.pow(p, n + 1), 0) / def.steps;
      const tolerance = 4 * Math.sqrt((moment2 - cible * cible) / PARTIES);
      assert.ok(
        Math.abs(rtp - cible) < tolerance,
        `[${id}/${mode.id}] RTP réel=${(rtp * 100).toFixed(2)}% vs cible=${(cible * 100).toFixed(2)}% (±${(tolerance * 100).toFixed(2)})`,
      );
    }
  }
});
