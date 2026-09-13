import type { GameConfig, Outcome, Round } from "../api.ts";
import { Amount, Button } from "../components/index.ts";
import { formatMultiplier } from "../lib/format.ts";
import { boardFor } from "./boards/index.ts";

export type BilanProps = {
  config: GameConfig;
  round: Round;
  revealed: Outcome[] | null;
  balanceCents: number;
  pending: boolean;
  onReplay: () => void;
  onChangeBet: () => void;
};

/** Fin de partie : ce qui a été misé, récupéré, gagné ou perdu. */
export function Bilan({
  config,
  round,
  revealed,
  balanceCents,
  pending,
  onReplay,
  onChangeBet,
}: BilanProps) {
  const net = round.payoutCents - round.betCents;
  // Le plateau du jeu reste à l'écran : on voit OÙ la partie s'est arrêtée.
  const Board = boardFor(config.id);

  return (
    <section className="panel gamepanel" data-game={config.id} aria-label="Fin de partie">
      <Board config={config} round={round} revealed={revealed} pending={pending} onPick={() => {}} />

      <table className="bilan">
        <caption>Bilan de la partie</caption>
        <tbody>
          <tr>
            <th scope="row">Mise</th>
            <td>
              <Amount cents={round.betCents} />
            </td>
          </tr>
          <tr>
            <th scope="row">Récupéré</th>
            <td>
              <Amount cents={round.payoutCents} />
            </td>
          </tr>
          <tr>
            <th scope="row">Net</th>
            <td>
              <Amount cents={net} signed />
            </td>
          </tr>
          <tr>
            <th scope="row">Nouveau solde</th>
            <td>
              <Amount cents={balanceCents} />
            </td>
          </tr>
          <tr>
            <th scope="row">Étape atteinte</th>
            <td>{`${round.step} sur ${round.maxSteps}`}</td>
          </tr>
          <tr>
            <th scope="row">Multiplicateur</th>
            <td>{formatMultiplier(round.multiplier)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bilan__actions">
        <Button variant="primary" pending={pending} onClick={onReplay}>
          Rejouer (même mise, même mode)
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onChangeBet}>
          Changer la mise
        </Button>
      </div>
    </section>
  );
}
