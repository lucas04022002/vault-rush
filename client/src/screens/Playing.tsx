import { useState } from "react";
import type { useGame } from "../hooks/useGame.ts";
import { GameHeader } from "../components/GameHeader.tsx";
import { DoorCard } from "../components/DoorCard.tsx";
import { modeInfo } from "../modes.ts";
import { playClick, playSafe, playAlarm, playCashOut, vibrate } from "../sound.ts";

type Props = { game: ReturnType<typeof useGame> };

export function Playing({ game }: Props) {
  const { state, selectDoor, cashOut } = game;
  const info = modeInfo(state.mode);
  const [reveal, setReveal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const handleDoor = async (index: number) => {
    if (busy || state.loading) return;
    setBusy(true);
    playClick();
    const result = await selectDoor(index);
    if (result === "safe") {
      // Révèle le coffre un court instant, puis on repart sur le nouvel étage.
      playSafe();
      setReveal(index);
      setTimeout(() => {
        setReveal(null);
        setBusy(false);
      }, 700);
    } else if (result === "alarm") {
      // Alarme -> son + vibration, l'écran de résultat rouge prend le relais.
      playAlarm();
      vibrate([60, 40, 120]);
      setBusy(false);
    } else {
      setBusy(false);
    }
  };

  const handleCashOut = () => {
    playCashOut();
    vibrate(30);
    void cashOut();
  };

  const canCashOut = state.currentFloor > 0 && !busy && !state.loading;

  return (
    <div className="screen-narrow">
      <GameHeader
        floor={state.currentFloor}
        maxFloor={info.maxFloor}
        multiplier={state.multiplier}
        potentialWin={state.potentialWin}
        balance={state.balance}
      />

      <div className="doors" style={{ gridTemplateColumns: `repeat(${state.doors}, 1fr)` }}>
        {Array.from({ length: state.doors }, (_, i) => (
          <DoorCard
            key={i}
            index={i}
            visual={reveal === i ? "safe" : "closed"}
            disabled={busy || state.loading}
            onClick={handleDoor}
          />
        ))}
      </div>

      <p className="hint">
        Choisis une porte. Trouve un coffre 💰 pour monter, évite l'alarme 🚨.
      </p>

      {state.error && <div className="status error">{state.error}</div>}

      <button className="cta cashout" disabled={!canCashOut} onClick={handleCashOut}>
        {state.currentFloor === 0
          ? "Réussis 1 étage pour encaisser"
          : `CASH OUT · ${state.potentialWin} coins`}
      </button>
    </div>
  );
}
