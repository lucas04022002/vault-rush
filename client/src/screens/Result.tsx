import type { useGame } from "../hooks/useGame.ts";

type Props = { game: ReturnType<typeof useGame> };

export function Result({ game }: Props) {
  const { state, goHome, startGame } = game;
  const won = state.outcome === "won";

  return (
    <div className={`result ${won ? "result-won" : "result-lost"}`}>
      <div className="result-icon">{won ? "💰" : "🚨"}</div>
      <h2 className="result-title">{won ? "Braquage réussi !" : "ALARME ACTIVÉE"}</h2>

      <div className="card result-detail">
        <div className="rd-row">
          <span>Mise</span>
          <b>{state.betAmount} coins</b>
        </div>
        {won ? (
          <>
            <div className="rd-row">
              <span>Multiplicateur</span>
              <b>x{state.multiplier.toFixed(2)}</b>
            </div>
            <div className="rd-row highlight">
              <span>Gain</span>
              <b>{state.lastPayout} coins</b>
            </div>
          </>
        ) : (
          <div className="rd-row danger">
            <span>Perdu</span>
            <b>{state.betAmount} coins</b>
          </div>
        )}
      </div>

      <button className="cta" onClick={startGame}>Rejouer</button>
      <button className="cta secondary" onClick={goHome}>Retour accueil</button>
    </div>
  );
}
