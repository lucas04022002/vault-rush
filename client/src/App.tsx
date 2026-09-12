import { useState } from "react";
import { Login } from "./screens/Login.tsx";
import { Game } from "./screens/Game.tsx";
import { loadSession, saveSession, clearSession, type Session } from "./session.ts";

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [balance, setBalance] = useState(0);

  const handleLogin = (s: Session, bal: number) => {
    saveSession(s);
    setBalance(bal);
    setSession(s);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  return (
    <div className="app">
      <h1 className="brand">VAULT RUSH</h1>
      {session ? (
        <Game
          key={session.userId}
          session={session}
          initialBalance={balance}
          onLogout={handleLogout}
        />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}
