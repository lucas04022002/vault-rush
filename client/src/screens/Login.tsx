import { useState } from "react";
import { api } from "../api.ts";
import type { Session } from "../session.ts";

type Props = { onLogin: (session: Session, balance: number) => void };

export function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(username.trim());
      onLogin({ userId: res.userId, username: res.username }, res.balance);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <p className="login-sub">Entre ton pseudo pour jouer</p>

      <div className="card">
        <input
          className="login-input"
          placeholder="Ton pseudo"
          value={username}
          maxLength={20}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && username.trim().length >= 3 && submit()}
        />
        <p className="login-hint">3 à 20 caractères : lettres, chiffres, _</p>
      </div>

      {error && <div className="status error">{error}</div>}

      <button
        className="cta"
        disabled={username.trim().length < 3 || loading}
        onClick={submit}
      >
        {loading ? "…" : "Entrer dans le coffre"}
      </button>

      <p className="login-note">
        Pas de mot de passe pour l'instant. Un nouveau pseudo crée un compte avec 1000 coins.
      </p>
    </div>
  );
}
