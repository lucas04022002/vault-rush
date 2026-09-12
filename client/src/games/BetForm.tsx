import { useState, type ReactNode } from "react";
import type { GameConfig } from "../api.ts";
import { Button, Chip, Field, RewardTable } from "../components/index.ts";
import { formatCoins } from "../lib/format.ts";
import { QUICK_BETS, checkBet, coinsOnly } from "./bets.ts";

export type BetFormProps = {
  config: GameConfig;
  pending: boolean;
  onStart: (coins: string, mode: string) => void;
  /** Bloc libre sous le bouton (la recharge gratuite, par exemple). */
  footer?: ReactNode;
};

/** Avant de miser : montant, mode, et le tableau des récompenses en face. */
export function BetForm({ config, pending, onStart, footer }: BetFormProps) {
  const [bet, setBet] = useState(() => coinsOnly(500));
  const [mode, setMode] = useState(config.modes[0].id);
  const [error, setError] = useState<string | null>(null);

  const check = checkBet(bet, config.minBetCents, config.maxBetCents);

  function lancer() {
    if (check.error) {
      setError(check.error);
      return;
    }
    setError(null);
    onStart(bet, mode);
  }

  return (
    <>
      <section className="panel betform" aria-label="Mise">
        <p className="label" id="mise-raccourcis">
          Mise
        </p>
        <div className="chips" role="group" aria-labelledby="mise-raccourcis">
          {QUICK_BETS.map((cents) => (
            <Chip
              key={cents}
              selected={check.cents === cents}
              aria-label={`Mise ${formatCoins(cents)}`}
              disabled={pending}
              onClick={() => {
                setBet(coinsOnly(cents));
                setError(null);
              }}
            >
              {coinsOnly(cents)}
            </Chip>
          ))}
        </div>

        <Field
          label="Mise libre"
          id="mise-libre"
          hint={`Entre ${coinsOnly(config.minBetCents)} et ${formatCoins(config.maxBetCents)}`}
          error={error}
        >
          <input
            inputMode="decimal"
            autoComplete="off"
            value={bet}
            disabled={pending}
            onChange={(event) => {
              setBet(event.target.value);
              setError(null);
            }}
          />
        </Field>

        <p className="label" id="mode-choix">
          Mode
        </p>
        <div className="chips" role="group" aria-labelledby="mode-choix">
          {config.modes.map((m) => (
            <Chip
              key={m.id}
              selected={m.id === mode}
              aria-label={`Mode ${m.label}`}
              disabled={pending}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </Chip>
          ))}
        </div>

        <Button variant="primary" pending={pending} onClick={lancer}>
          Lancer la partie
        </Button>

        {footer}
      </section>

      <section className="panel" aria-label="Récompenses">
        <p className="label">Tableau des récompenses</p>
        <RewardTable
          modes={config.modes}
          betCents={check.cents ?? undefined}
          maxPayoutCents={config.maxPayoutCents}
        />
      </section>
    </>
  );
}
