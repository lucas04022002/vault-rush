/**
 * Un seul point de passage vers l'API.
 *
 * - le cookie de session part avec chaque requête (`credentials: "include"`) ;
 * - une réponse non-2xx devient une `ApiError` qui porte le CODE du serveur
 *   (`insufficient_balance`, `step_mismatch`…) et son corps complet : les 409
 *   de partie transportent l'état `round` du serveur, que le client adopte
 *   plutôt que de deviner ;
 * - aucun écran ne construit d'URL ni ne lit `res.ok` lui-même.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: Record<string, unknown>;

  constructor(status: number, code: string, payload: Record<string, unknown> = {}) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export type ApiInit = {
  method?: "GET" | "POST";
  /** Corps JSON ; sérialisé ici, jamais par l'appelant. */
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const hasBody = init.body !== undefined;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch {
    // Réseau coupé, serveur éteint : un code à nous, traduit comme les autres.
    throw new ApiError(0, "network_error");
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : "internal_error";
    throw new ApiError(res.status, code, data);
  }
  return data as T;
}

/* ------------------------------ Types du serveur ------------------------------ */

export type Outcome = "safe" | "danger";
export type RoundStatus = "playing" | "lost" | "cashed_out";
/** Le genre d'un jeu : il choisit l'écran (voir `screens/Game.tsx`). */
export type GameKind = "ladder" | "code" | "drop" | "cards";

export type GameLabels = {
  step: string;
  option: string;
  safe: string;
  danger: string;
  cashout: string;
};

export type GameMode = {
  id: string;
  label: string;
  options: number;
  safeOptions: number;
  houseEdge: number;
  chancePerStep: number;
  multipliers: number[];
};

export type GameConfig = {
  id: string;
  kind: GameKind;
  name: string;
  tagline: string;
  /** Faux quand le jeu n'a pas d'encaissement en cours de partie. */
  canCashout: boolean;
  steps: number;
  labels: GameLabels;
  maxPayoutCents: number;
  minBetCents: number;
  maxBetCents: number;
  modes: GameMode[];
};

export type Round = {
  id: number;
  game: string;
  mode: string;
  status: RoundStatus;
  step: number;
  maxSteps: number;
  betCents: number;
  multiplier: number;
  nextMultiplier: number | null;
  cashoutCents: number;
  payoutCents: number;
  /**
   * L'état PUBLIC du jeu, tel que son moteur accepte de le montrer. Absent
   * d'une partie fabriquée par le client (aperçu, test de plateau).
   */
  view?: unknown;
  createdAt: string;
  finishedAt?: string;
};

export type SessionUser = { id: number; username: string };
export type Account = { user: SessionUser; balanceCents: number };

export type HistoryRound = {
  id: number;
  game: string;
  mode: string;
  betCents: number;
  status: Exclude<RoundStatus, "playing">;
  netCents: number;
  step: number;
  maxSteps: number;
  multiplier: number;
  createdAt: string;
};

export type LeaderboardEntry = {
  username: string;
  netCents: number;
  rounds: number;
  bestPayoutCents: number;
};

/* --------------------------------- Requêtes --------------------------------- */

export const auth = {
  me: () => api<Account>("/auth/me"),
  register: (username: string, password: string) =>
    api<Account>("/auth/register", { method: "POST", body: { username, password } }),
  login: (username: string, password: string) =>
    api<Account>("/auth/login", { method: "POST", body: { username, password } }),
  setPassword: (username: string, newPassword: string) =>
    api<Account>("/auth/set-password", { method: "POST", body: { username, newPassword } }),
  logout: () => api<{ ok: true }>("/auth/logout", { method: "POST" }),
};

export const wallet = {
  balance: () => api<{ balanceCents: number }>("/wallet"),
  refill: () =>
    api<{ balanceCents: number; refilledCents: number }>("/wallet/refill", { method: "POST" }),
};

export const games = {
  list: () => api<{ games: GameConfig[] }>("/games"),
  config: (game: string) => api<{ game: GameConfig }>(`/games/${game}/config`),
  current: (game: string) => api<{ round: Round | null }>(`/games/${game}/current`),
  start: (game: string, betCoins: string, mode: string) =>
    api<{ round: Round }>(`/games/${game}/start`, { method: "POST", body: { betCoins, mode } }),
  play: (game: string, roundId: number, step: number, option: number) =>
    api<{ round: Round; revealed: Outcome[]; outcome: Outcome }>(`/games/${game}/play`, {
      method: "POST",
      body: { roundId, step, option },
    }),
  cashout: (game: string, roundId: number) =>
    api<{ round: Round; balanceCents: number }>(`/games/${game}/cashout`, {
      method: "POST",
      body: { roundId },
    }),
};

export const history = (game: string | undefined, limit: number) =>
  api<{ rounds: HistoryRound[] }>(`/history?${listQuery(game, limit)}`);

export const leaderboard = (game: string | undefined, limit: number) =>
  api<{ entries: LeaderboardEntry[] }>(`/leaderboard?${listQuery(game, limit)}`);

function listQuery(game: string | undefined, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (game) params.set("game", game);
  return params.toString();
}
