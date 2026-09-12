/**
 * Client API — toutes les requêtes vers le backend Vault Rush passent ici.
 * Le frontend ne décide jamais rien : il appelle l'API et affiche la réponse.
 */

const BASE = "http://localhost:3001/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Erreur serveur");
  }
  return data as T;
}

export type GameMode = "safe" | "risk" | "insane";

export type StartResponse = {
  roundId: number;
  balance: number;
  currentFloor: number;
  multiplier: number;
  doors: number;
  status: "playing";
};

export type PlayResponse =
  | {
      status: "playing";
      result: "safe";
      currentFloor: number;
      multiplier: number;
      potentialWin: number;
    }
  | { status: "lost"; result: "alarm"; payout: 0 };

export type CashOutResponse = {
  status: "cashed_out";
  payout: number;
  newBalance: number;
};

export type HistoryItem = {
  id: number;
  betAmount: number;
  mode: GameMode;
  result: "playing" | "lost" | "cashed_out";
  payout: number;
  createdAt: string;
};

export type AuthResult = {
  userId: number;
  username: string;
  balance: number;
};

export const api = {
  login: (username: string) =>
    request<AuthResult>("POST", "/auth/login", { username }),

  getBalance: (userId: number) =>
    request<{ balance: number }>("GET", `/wallet/balance/${userId}`),

  start: (userId: number, betAmount: number, mode: GameMode) =>
    request<StartResponse>("POST", "/game/start", { userId, betAmount, mode }),

  play: (roundId: number, userId: number, selectedDoor: number) =>
    request<PlayResponse>("POST", "/game/play", { roundId, userId, selectedDoor }),

  cashout: (roundId: number, userId: number) =>
    request<CashOutResponse>("POST", "/game/cashout", { roundId, userId }),

  history: (userId: number) =>
    request<HistoryItem[]>("GET", `/game/history/${userId}`),

  leaderboard: () => request<LeaderboardEntry[]>("GET", "/leaderboard"),
};

export type LeaderboardEntry = {
  username: string;
  balance: number;
  bestPayout: number;
};
