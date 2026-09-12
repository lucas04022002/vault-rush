import { useCallback, useEffect, useState } from "react";
import { api, type GameMode, type HistoryItem } from "../api.ts";

export type Screen = "home" | "playing" | "result";

export type GameState = {
  screen: Screen;
  balance: number;
  betAmount: number;
  mode: GameMode;
  roundId: number | null;
  doors: number;
  currentFloor: number;
  multiplier: number;
  potentialWin: number;
  lastResult: "safe" | "alarm" | null;
  outcome: "won" | "lost" | null;
  lastPayout: number;
  history: HistoryItem[];
  loading: boolean;
  error: string | null;
};

const initialState: GameState = {
  screen: "home",
  balance: 0,
  betAmount: 10,
  mode: "safe",
  roundId: null,
  doors: 3,
  currentFloor: 0,
  multiplier: 1,
  potentialWin: 0,
  lastResult: null,
  outcome: null,
  lastPayout: 0,
  history: [],
  loading: false,
  error: null,
};

export function useGame(userId: number, initialBalance: number) {
  const [state, setState] = useState<GameState>({ ...initialState, balance: initialBalance });
  const patch = (p: Partial<GameState>) => setState((s) => ({ ...s, ...p }));

  const loadHistory = useCallback(() => {
    api.history(userId).then((h) => patch({ history: h })).catch(() => {});
  }, [userId]);

  // Charge le solde + l'historique au démarrage.
  useEffect(() => {
    api.getBalance(userId).then((r) => patch({ balance: r.balance })).catch(() => {});
    loadHistory();
  }, [userId, loadHistory]);

  const setBetAmount = useCallback((betAmount: number) => patch({ betAmount }), []);
  const setMode = useCallback((mode: GameMode) => patch({ mode }), []);

  const startGame = useCallback(async () => {
    patch({ loading: true, error: null });
    try {
      const res = await api.start(userId, state.betAmount, state.mode);
      patch({
        screen: "playing",
        roundId: res.roundId,
        balance: res.balance,
        doors: res.doors,
        currentFloor: 0,
        multiplier: 1,
        potentialWin: 0,
        lastResult: null,
        outcome: null,
        loading: false,
      });
    } catch (err) {
      patch({ loading: false, error: (err as Error).message });
    }
  }, [userId, state.betAmount, state.mode]);

  const selectDoor = useCallback(
    async (doorIndex: number): Promise<"safe" | "alarm" | null> => {
      if (!state.roundId) return null;
      patch({ loading: true, error: null });
      try {
        const res = await api.play(state.roundId, userId, doorIndex);
        if (res.status === "lost") {
          patch({
            lastResult: "alarm",
            screen: "result",
            outcome: "lost",
            lastPayout: 0,
            loading: false,
          });
          return "alarm";
        }
        patch({
          lastResult: "safe",
          currentFloor: res.currentFloor,
          multiplier: res.multiplier,
          potentialWin: res.potentialWin,
          loading: false,
        });
        return "safe";
      } catch (err) {
        patch({ loading: false, error: (err as Error).message });
        return null;
      }
    },
    [userId, state.roundId],
  );

  const cashOut = useCallback(async () => {
    if (!state.roundId) return;
    patch({ loading: true, error: null });
    try {
      const res = await api.cashout(state.roundId, userId);
      patch({
        screen: "result",
        outcome: "won",
        lastPayout: res.payout,
        balance: res.newBalance,
        loading: false,
      });
    } catch (err) {
      patch({ loading: false, error: (err as Error).message });
    }
  }, [userId, state.roundId]);

  const goHome = useCallback(() => {
    setState((s) => ({
      ...initialState,
      balance: s.balance,
      betAmount: s.betAmount,
      mode: s.mode,
      history: s.history,
    }));
    loadHistory();
  }, [loadHistory]);

  return { state, setBetAmount, setMode, startGame, selectDoor, cashOut, goHome };
}
