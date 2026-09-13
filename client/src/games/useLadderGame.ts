import { useCallback, useMemo, useState } from "react";
import { games, type GameConfig, type Outcome, type Round } from "../api.ts";
import { capitalize } from "./labels.ts";
import { useRound, type RoundBet, type RoundControl, type RoundState } from "./useRound.ts";

/**
 * Le jeu d'ÉCHELLE (Vault Rush, Laser Grid, Getaway, Bomb Squad) : une fine
 * spécialisation de `useRound`. Tout ce qui est commun à une partie (mise,
 * reprise, verrou, 409 adoptés, solde) vit dans `useRound` ; il ne reste ici
 * que le coup — choisir une option — et sa lecture : les options révélées.
 */

export type LadderState = RoundState;
export type LadderBet = RoundBet;

export type LadderGame = Omit<RoundControl, "play"> & {
  /** Les options révélées par le serveur, gardées quand la partie se termine. */
  revealed: Outcome[] | null;
  /** `option` est numérotée à partir de 1 comme à l'écran ; le serveur part de 0. */
  play: (option: number) => Promise<void>;
};

/** Bilan d'une partie d'échelle : perdue ou encaissée. */
function finishedMessage(round: Round, config: GameConfig): string {
  if (round.status === "lost") return `${capitalize(config.labels.danger)} ! La mise est perdue.`;
  return "Partie encaissée.";
}

export function useLadderGame(gameId: string, config?: GameConfig | null): LadderGame {
  const [revealed, setRevealed] = useState<Outcome[] | null>(null);

  const onReset = useCallback(() => setRevealed(null), []);
  const partie = useRound(gameId, { config, onReset, finishedMessage });
  const { play: jouerUnCoup } = partie;

  const play = useCallback(
    (option: number) =>
      jouerUnCoup(
        (round) => games.play(gameId, round.id, round.step, option - 1),
        (résultat, { config: jeu, adopt, setMessage }) => {
          if (résultat.outcome === "danger" || résultat.round.status !== "playing") {
            setRevealed(résultat.revealed);
            adopt(résultat.round);
            setMessage(finishedMessage(résultat.round, jeu));
            return;
          }

          // Étape franchie : la révélation de l'étape précédente laisserait une
          // grille bariolée devant le choix suivant, on ne garde que le message.
          setRevealed(null);
          adopt(résultat.round);
          setMessage(
            `${capitalize(jeu.labels.safe)} ! Étape ${résultat.round.step} sur ${
              jeu.steps
            } franchie.`,
          );
        },
      ),
    [gameId, jouerUnCoup],
  );

  return useMemo(() => ({ ...partie, revealed, play }), [partie, play, revealed]);
}
