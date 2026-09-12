import type { GameConfig, Outcome, Round } from "../api.ts";
import { Button, OptionGrid, StepTrack } from "../components/index.ts";
import { formatCoins } from "../lib/format.ts";
import { capitalize, cashoutLabel, modeOf, nextCashoutCents } from "./labels.ts";

export type PlayPanelProps = {
  config: GameConfig;
  round: Round;
  revealed: Outcome[] | null;
  pending: boolean;
  onPick: (option: number) => void;
  onCashout: () => void;
};

/** En jeu : la progression, les options, et le bouton d'encaissement. */
export function PlayPanel({ config, round, revealed, pending, onPick, onCashout }: PlayPanelProps) {
  const mode = modeOf(config, round.mode);
  const suivant = nextCashoutCents(config, round);

  return (
    <section className="panel gamepanel" data-game={config.id} aria-label="Partie en cours">
      <StepTrack
        steps={config.steps}
        current={round.step}
        multipliers={mode?.multipliers ?? []}
        status={round.status}
      />

      <OptionGrid
        count={mode?.options ?? 0}
        labels={{ option: capitalize(config.labels.option) }}
        onPick={onPick}
        disabled={pending}
        revealed={revealed ?? undefined}
      />

      <Button
        variant="primary"
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
