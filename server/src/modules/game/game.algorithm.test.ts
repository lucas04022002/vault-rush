import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GAME_MODES,
  buildMultipliers,
  generateDoors,
  getMultiplier,
  playFloor,
  calculateCashOut,
  MAX_PAYOUT,
  type GameMode,
} from "./game.algorithm.ts";

test("buildMultipliers produit le bon house edge à chaque étage", () => {
  // Safe : p = 2/3, edge 2% -> RTP doit valoir 0.98 partout
  const mults = buildMultipliers(2, 3, 0.02, 6);
  const p = 2 / 3;
  mults.forEach((m, i) => {
    const rtp = m * Math.pow(p, i + 1);
    assert.ok(Math.abs(rtp - 0.98) < 0.01, `étage ${i + 1}: RTP=${rtp.toFixed(3)} attendu ~0.98`);
  });
});

test("generateDoors renvoie le bon nombre de portes coffre/alarme", () => {
  for (const mode of Object.keys(GAME_MODES) as GameMode[]) {
    const cfg = GAME_MODES[mode];
    const doors = generateDoors(mode);
    assert.equal(doors.length, cfg.doors);
    assert.equal(doors.filter((d) => d === "safe").length, cfg.safeDoors);
    assert.equal(doors.filter((d) => d === "alarm").length, cfg.alarmDoors);
  }
});

test("calculateCashOut applique le plafond MAX_PAYOUT", () => {
  assert.equal(calculateCashOut(10, 2.21), 22.1);
  assert.equal(calculateCashOut(1000, 229.49), MAX_PAYOUT); // plafonné
});

test("playFloor refuse une porte invalide", () => {
  assert.throws(() => playFloor("safe", 99, 0));
  assert.throws(() => playFloor("safe", -1, 0));
});

// --- LA preuve : on simule des millions de parties et on vérifie l'edge réel ---
test("simulation Monte Carlo : le RTP réel converge vers la cible", () => {
  const ROUNDS = 2_000_000;

  for (const mode of Object.keys(GAME_MODES) as GameMode[]) {
    const cfg = GAME_MODES[mode];
    const bet = 1;
    let totalBet = 0;
    let totalPayout = 0;

    for (let r = 0; r < ROUNDS; r++) {
      totalBet += bet;
      // Stratégie du joueur : il vise un étage cible aléatoire puis cash out.
      const target = 1 + Math.floor(Math.random() * cfg.maxFloor);
      let floor = 0;
      let alive = true;

      for (let f = 0; f < target; f++) {
        // Le joueur choisit une porte ; playFloor tire le hasard côté serveur.
        const choice = Math.floor(Math.random() * cfg.doors);
        const res = playFloor(mode, choice, floor);
        if (res.status === "lost") {
          alive = false;
          break;
        }
        floor = res.nextFloor;
      }

      if (alive) {
        totalPayout += calculateCashOut(bet, getMultiplier(mode, floor));
      }
    }

    const rtp = totalPayout / totalBet;
    const target = 1 - cfg.houseEdge;
    // Tolérance large car le cap MAX_PAYOUT n'intervient pas ici (bet=1).
    assert.ok(
      Math.abs(rtp - target) < 0.01,
      `[${mode}] RTP réel=${(rtp * 100).toFixed(2)}% vs cible=${(target * 100).toFixed(2)}%`,
    );
    console.log(
      `  [${mode}] RTP réel = ${(rtp * 100).toFixed(2)}%  (cible ${(target * 100).toFixed(0)}%, edge ${(cfg.houseEdge * 100).toFixed(0)}%)`,
    );
  }
});
