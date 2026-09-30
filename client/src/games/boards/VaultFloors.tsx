import type { CSSProperties } from "react";
import type { GameConfig, Round } from "../../api.ts";
import { formatMultiplier } from "../../lib/format.ts";
import { capitalize, modeOf } from "../labels.ts";
import { STATE_WORD, progressLabel, stepState } from "./types.ts";

/**
 * La frise des étages de Vault Rush : un étage par case, son multiplicateur et son
 * état (franchi, en cours, perdu, à venir). Commune au plateau 2D et au plateau 3D.
 */
export function VaultFloors({ config, round }: { config: GameConfig; round: Round }) {
  const multipliers = modeOf(config, round.mode)?.multipliers ?? [];
  const étage = capitalize(config.labels.step);
  const progression = progressLabel(round.status, round.step, config.steps);

  return (
    <ol
      className="vb-floors"
      aria-label={progression}
      style={{ "--vb-floors": config.steps } as CSSProperties}
    >
      {Array.from({ length: config.steps }, (_, index) => {
        const state = stepState(index, round.step, round.status);
        const multiplier = multipliers[index];
        return (
          <li
            key={index}
            className="vb-floor"
            data-state={state}
            aria-label={
              multiplier === undefined
                ? `${étage} ${index + 1}, ${STATE_WORD[state]}`
                : `${étage} ${index + 1}, ${formatMultiplier(multiplier)}, ${STATE_WORD[state]}`
            }
          >
            <span className="vb-floor__num" aria-hidden="true">
              {index + 1}
            </span>
            <span className="vb-floor__mult" aria-hidden="true">
              {multiplier === undefined ? "" : formatMultiplier(multiplier)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
