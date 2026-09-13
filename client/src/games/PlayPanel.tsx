import type { GameConfig, Outcome, Round } from "../api.ts";
import { Button, type ButtonVariant } from "../components/index.ts";
import { formatCoins } from "../lib/format.ts";
import { type BoardAccent, accentFor, boardFor } from "./boards/index.ts";
import { cashoutLabel, nextCashoutCents } from "./labels.ts";

/** Le bouton d'encaissement porte la couleur du jeu, pas celle de l'arcade. */
const VARIANTE: Record<BoardAccent, ButtonVariant> = {
  yellow: "primary",
  cyan: "accent-cyan",
  magenta: "accent-magenta",
  orange: "accent-orange",
  ice: "accent-ice",
};

export type PlayPanelProps = {
  config: GameConfig;
  round: Round;
  revealed: Outcome[] | null;
  pending: boolean;
  onPick: (option: number) => void;
  onCashout: () => void;
};

/**
 * En jeu : le plateau du jeu (portes de coffre ou grille laser), et le bouton
 * d'encaissement à l'accent du jeu. Tout le reste est commun.
 */
export function PlayPanel({ config, round, revealed, pending, onPick, onCashout }: PlayPanelProps) {
  const suivant = nextCashoutCents(config, round);
  const Board = boardFor(config.id);
  const accent = accentFor(config.id);

  return (
    <section className="panel gamepanel" data-game={config.id} aria-label="Partie en cours">
      <Board
        config={config}
        round={round}
        revealed={revealed}
        pending={pending}
        onPick={onPick}
      />

      <Button
        variant={VARIANTE[accent]}
        pending={pending}
        disabled={round.step === 0}
        onClick={onCashout}
      >
        {round.step === 0
          ? config.labels.cashout
          : cashoutLabel(config.labels.cashout, formatCoins(round.cashoutCents))}
      </Button>

      <p className="gamepanel__line">
        {`Mise ${formatCoins(round.betCents)}`}
        {suivant === null ? null : ` · si tu passes : ${formatCoins(suivant)}`}
      </p>
    </section>
  );
}
