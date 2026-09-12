import { formatCoins, formatMultiplier, formatPercent } from "../lib/format.ts";

export type RewardMode = {
  id: string;
  label: string;
  /** Probabilité de passer une étape, entre 0 et 1. */
  chancePerStep: number;
  /** Un multiplicateur par étape. */
  multipliers: number[];
};

export type RewardTableProps = {
  modes: RewardMode[];
  /** Mise courante en centimes : ajoute la colonne « Gain max ». */
  betCents?: number;
  /** Plafond de gain par partie, en centimes. */
  maxPayoutCents: number;
};

/** Étapes affichées : toutes jusqu'à 8, sinon première / médiane / dernière. */
function shownSteps(steps: number): number[] {
  if (steps <= 8) return Array.from({ length: steps }, (_, i) => i + 1);
  return [...new Set([1, Math.ceil(steps / 2), steps])];
}

/** Le tableau des récompenses, visible avant de miser. */
export function RewardTable({ modes, betCents, maxPayoutCents }: RewardTableProps) {
  const steps = Math.max(...modes.map((mode) => mode.multipliers.length));
  const columns = shownSteps(steps);

  return (
    <div className="rewardtable">
      {/* Zone défilante : focalisable pour que le clavier puisse la parcourir. */}
      <div
        className="rewardtable__scroll"
        role="region"
        aria-label="Tableau des récompenses"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Mode</th>
              <th scope="col">Chance</th>
              {columns.map((step) => (
                <th key={step} scope="col">{`Étape ${step}`}</th>
              ))}
              {betCents === undefined ? null : <th scope="col">Gain max</th>}
            </tr>
          </thead>
          <tbody>
            {modes.map((mode) => {
              const last = mode.multipliers[mode.multipliers.length - 1] ?? 1;
              const max = Math.min(Math.round((betCents ?? 0) * last), maxPayoutCents);
              return (
                <tr key={mode.id}>
                  <th scope="row">{mode.label}</th>
                  <td>{formatPercent(mode.chancePerStep)}</td>
                  {columns.map((step) => {
                    const multiplier = mode.multipliers[step - 1];
                    return (
                      <td key={step}>{multiplier === undefined ? "—" : formatMultiplier(multiplier)}</td>
                    );
                  })}
                  {betCents === undefined ? null : (
                    <td className="rewardtable__max">{formatCoins(max)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rewardtable__cap">{`Gain plafonné à ${formatCoins(maxPayoutCents)} par partie.`}</p>
    </div>
  );
}
