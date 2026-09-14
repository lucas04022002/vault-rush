import { vi } from "vitest";

/**
 * Faux réseau : on remplace `fetch`, pas les modules du client.
 *
 * Les tests décrivent donc le SERVEUR (routes, statuts, corps JSON), exactement
 * comme il répond vraiment — `api.ts`, `session.tsx` et `useLadderGame` sont
 * traversés pour de bon. Les corps ci-dessous sont copiés des réponses réelles
 * relevées dans le rapport de la tâche 2.
 */

export type Reply = { status?: number; json?: unknown };
export type Responder = Reply | ((body: unknown, url: URL) => Reply | Promise<Reply>);

export type Call = { method: string; path: string; query: string; body: unknown };

export class FakeApi {
  readonly calls: Call[] = [];
  private readonly routes = new Map<string, Responder[]>();

  /**
   * `on("POST /api/games/vault-rush/start", …)`. Un second appel sur la même
   * route REMPLACE la réponse (un test peut ainsi redéfinir le socle) ;
   * plusieurs réponses dans le même appel forment une file, une par requête,
   * la dernière restant valable ensuite.
   */
  on(key: string, ...responders: Responder[]): this {
    this.routes.set(key, responders);
    return this;
  }

  /** Les appels faits sur une route, dans l'ordre. */
  callsTo(key: string): Call[] {
    const [method, path] = key.split(" ");
    return this.calls.filter((call) => call.method === method && call.path === path);
  }

  install(): this {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:5173");
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      this.calls.push({ method, path: url.pathname, query: url.search, body });

      const key = `${method} ${url.pathname}`;
      const queue = this.routes.get(key);
      if (!queue || queue.length === 0) {
        return Promise.resolve(jsonResponse(404, { error: "not_found" }));
      }
      // La dernière réponse d'une file reste valable pour les appels suivants.
      const responder = queue.length > 1 ? queue.shift()! : queue[0];
      const reply = typeof responder === "function" ? responder(body, url) : responder;
      return Promise.resolve(reply).then((r) => jsonResponse(r.status ?? 200, r.json ?? {}));
    });
    return this;
  }
}

function jsonResponse(status: number, json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/* Fixtures : la forme exacte des réponses du serveur (tâches 1 et 2). */
/* ------------------------------------------------------------------ */

export const VAULT_RUSH_CONFIG = {
  id: "vault-rush",
  kind: "ladder",
  canCashout: true,
  name: "Vault Rush",
  tagline: "Monte, choisis une porte par étage, encaisse avant l'alarme.",
  steps: 6,
  format: "6 étages",
  labels: {
    step: "étage",
    option: "porte",
    safe: "coffre",
    danger: "alarme",
    cashout: "Encaisser",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "safe",
      label: "Safe",
      options: 3,
      safeOptions: 2,
      houseEdge: 0.02,
      chancePerStep: 2 / 3,
      multipliers: [1.47, 2.16, 3.31, 5.06, 7.75, 11.16],
    },
    {
      id: "risk",
      label: "Risk",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 0.5,
      multipliers: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44],
    },
    {
      id: "insane",
      label: "Insane",
      options: 5,
      safeOptions: 2,
      houseEdge: 0.06,
      chancePerStep: 0.4,
      multipliers: [2.35, 5.88, 14.69, 36.73, 91.83, 229.5],
    },
  ],
};

export const LASER_GRID_CONFIG = {
  id: "laser-grid",
  kind: "ladder",
  canCashout: true,
  name: "Laser Grid",
  tagline: "Traverse la grille ligne par ligne sans toucher un laser.",
  steps: 8,
  format: "8 lignes",
  labels: {
    step: "ligne",
    option: "case",
    safe: "passage",
    danger: "laser",
    cashout: "Sortir",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "calme",
      label: "Calme",
      options: 4,
      safeOptions: 3,
      houseEdge: 0.02,
      chancePerStep: 0.75,
      multipliers: [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79],
    },
    {
      id: "tendu",
      label: "Tendu",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 0.5,
      multipliers: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76],
    },
    {
      id: "mortel",
      label: "Mortel",
      options: 5,
      safeOptions: 2,
      houseEdge: 0.06,
      chancePerStep: 0.4,
      multipliers: [2.35, 5.88, 14.69, 36.73, 91.83, 229.5, 573.75, 1434.38],
    },
  ],
};

export const GETAWAY_CONFIG = {
  id: "getaway",
  kind: "ladder",
  canCashout: true,
  name: "Getaway",
  tagline: "Choisis ta route à chaque tronçon, planque-toi avant le barrage.",
  steps: 5,
  format: "5 tronçons",
  labels: {
    step: "tronçon",
    option: "route",
    safe: "voie libre",
    danger: "barrage",
    cashout: "Se planquer",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "tranquille",
      label: "Tranquille",
      options: 4,
      safeOptions: 3,
      houseEdge: 0.02,
      chancePerStep: 0.75,
      multipliers: [1.31, 1.74, 2.32, 3.1, 4.13],
    },
    {
      id: "nerveux",
      label: "Nerveux",
      options: 3,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 2 / 3,
      multipliers: [1.44, 2.16, 3.24, 4.86, 7.29],
    },
    {
      id: "cavale",
      label: "Cavale",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.06,
      chancePerStep: 0.5,
      multipliers: [1.88, 3.76, 7.52, 15.04, 30.08],
    },
  ],
};

export const BOMB_SQUAD_CONFIG = {
  id: "bomb-squad",
  kind: "ladder",
  canCashout: true,
  name: "Bomb Squad",
  tagline: "Coupe un câble par étape, retire-toi avant l'explosion.",
  steps: 4,
  format: "4 étapes",
  labels: {
    step: "étape",
    option: "câble",
    safe: "neutralisé",
    danger: "explosion",
    cashout: "Se retirer",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "novice",
      label: "Novice",
      options: 4,
      safeOptions: 3,
      houseEdge: 0.02,
      chancePerStep: 0.75,
      multipliers: [1.31, 1.74, 2.32, 3.1],
    },
    {
      id: "confirme",
      label: "Confirmé",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 0.5,
      multipliers: [1.92, 3.84, 7.68, 15.36],
    },
    {
      id: "demineur",
      label: "Démineur",
      options: 5,
      safeOptions: 2,
      houseEdge: 0.06,
      chancePerStep: 0.4,
      multipliers: [2.35, 5.87, 14.69, 36.72],
    },
  ],
};

/** Une partie de Vault Rush en mode Risk, mise 25,00 coins, à l'étape voulue. */
export function round(step: number, extra: Record<string, unknown> = {}) {
  const multipliers = [1, 1.92, 3.84, 7.68, 15.36, 30.72, 61.44];
  const multiplier = multipliers[step];
  return {
    id: 1,
    game: "vault-rush",
    mode: "risk",
    status: "playing",
    step,
    maxSteps: 6,
    betCents: 2500,
    multiplier,
    nextMultiplier: step < 6 ? multipliers[step + 1] : null,
    cashoutCents: step === 0 ? 0 : Math.round(2500 * multiplier),
    payoutCents: 0,
    view: { step, multiplier, revealed: null },
    createdAt: "2026-09-12 17:33:28",
    ...extra,
  };
}

export const ACCOUNT = {
  user: { id: 1, username: "lucas" },
  balanceCents: 100_000,
};

/** Le socle commun : catalogue, config, solde. */
export function baseApi(logged = true): FakeApi {
  const api = new FakeApi();
  api
    .on("GET /api/auth/me", logged ? { json: ACCOUNT } : { status: 401, json: { error: "unauthorized" } })
    .on("GET /api/games", {
      json: { games: [VAULT_RUSH_CONFIG, LASER_GRID_CONFIG, GETAWAY_CONFIG, BOMB_SQUAD_CONFIG] },
    })
    .on("GET /api/games/vault-rush/config", { json: { game: VAULT_RUSH_CONFIG } })
    .on("GET /api/games/laser-grid/config", { json: { game: LASER_GRID_CONFIG } })
    .on("GET /api/games/getaway/config", { json: { game: GETAWAY_CONFIG } })
    .on("GET /api/games/bomb-squad/config", { json: { game: BOMB_SQUAD_CONFIG } })
    .on("GET /api/wallet", { json: { balanceCents: 97_500 } })
    .on("GET /api/history", { json: { rounds: [] } })
    .on("GET /api/leaderboard", { json: { entries: [] } });
  return api;
}
