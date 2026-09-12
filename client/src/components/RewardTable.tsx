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
  /** Mise courante en centimes : ajoute le gain max par mode sous le tableau. */
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
    // `data-dense` au-delà de 6 étapes : Laser Grid (8) tient alors dans la
    // carte au lieu d'exiger un défilement horizontal pour ses 2 dernières.
    <div className="rewardtable" data-dense={columns.length > 6 || undefined}>
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
            </tr>
          </thead>
          <tbody>
            {modes.map((mode) => (
              <tr key={mode.id}>
                <th scope="row">{mode.label}</th>
                <td>{formatPercent(mode.chancePerStep)}</td>
                {columns.map((step) => {
                  const multiplier = mode.multipliers[step - 1];
                  return (
                    <td key={step}>
                      {multiplier === undefined ? "—" : formatMultiplier(multiplier)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Le gain max vit HORS du tableau : dans le tableau il était la colonne la
        plus à droite, donc invisible sans défiler, alors que la spec demande
        qu'il soit lu avant de miser.
      */}
      {betCents === undefined ? null : (
        <ul className="rewardtable__gains">
          {modes.map((mode) => {
            const last = mode.multipliers[mode.multipliers.length - 1] ?? 1;
            const raw = Math.round(betCents * last);
            const capped = raw > maxPayoutCents;
            return (
              <li key={mode.id} className="rewardtable__gain" data-capped={capped || undefined}>
                <span className="rewardtable__gain-mode">{mode.label}</span>
                {" : gain max "}
                <span className="rewardtable__gain-value">
                  {formatCoins(Math.min(raw, maxPayoutCents))}
                </span>
                {` avec ${formatCoins(betCents)} de mise${capped ? " (plafond atteint)" : ""}`}
              </li>
            );
          })}
        </ul>
      )}

      <p className="rewardtable__cap">{`Gain plafonné à ${formatCoins(maxPayoutCents)} par partie.`}</p>
    </div>
  );
}
