import { useState } from "react";
import { useGame } from "../hooks/useGame.ts";
import { Home } from "./Home.tsx";
import { Playing } from "./Playing.tsx";
import { Result } from "./Result.tsx";
import type { Session } from "../session.ts";
import { setMuted, isMuted } from "../sound.ts";

type Props = { session: Session; initialBalance: number; onLogout: () => void };

export function Game({ session, initialBalance, onLogout }: Props) {
  const game = useGame(session.userId, initialBalance);
  const [muted, setMutedState] = useState(isMuted());

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <>
      <div className="topbar">
        <span className="topbar-user">👤 {session.username}</span>
        <div className="topbar-actions">
          <button className="logout-btn" onClick={toggleMute} aria-label="Son">
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="logout-btn" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </div>

      {game.state.screen === "home" && <Home game={game} username={session.username} />}
      {game.state.screen === "playing" && <Playing game={game} />}
      {game.state.screen === "result" && <Result game={game} />}
    </>
  );
}
