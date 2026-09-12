import type { useGame } from "../hooks/useGame.ts";
import { BetSelector } from "../components/BetSelector.tsx";
import { ModeSelector } from "../components/ModeSelector.tsx";
import { History } from "../components/History.tsx";
import { Leaderboard } from "../components/Leaderboard.tsx";

type Props = { game: ReturnType<typeof useGame>; username: string };

export function Home({ game, username }: Props) {
  const { state, setBetAmount, setMode, startGame } = game;
  const canPlay = state.betAmount > 0 && state.betAmount <= state.balance && !state.loading;

  return (
    <div className="home-grid">
      <div className="home-col">
        <div className="card balance-card">
          <div className="balance-label">Solde</div>
          <div className="balance-value">
            {state.balance} <span className="coins">coins</span>
          </div>
        </div>

        <BetSelector bet={state.betAmount} balance={state.balance} onChange={setBetAmount} />
        <ModeSelector selected={state.mode} onChange={setMode} />

        {state.error && <div className="status error">{state.error}</div>}

        <button className="cta" disabled={!canPlay} onClick={startGame}>
          {state.loading ? "…" : "Lancer le braquage"}
        </button>
      </div>

      <div className="home-col">
        <Leaderboard currentUsername={username} />
        <History items={state.history} />
      </div>
    </div>
  );
}
