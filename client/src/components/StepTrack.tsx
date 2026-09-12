import type { CSSProperties } from "react";
import { formatMultiplier } from "../lib/format.ts";

export type RoundStatus = "playing" | "lost" | "cashed_out";
export type StepState = "done" | "now" | "lost" | "todo";

export type StepTrackProps = {
  /** Nombre total d'étapes du jeu. */
  steps: number;
  /** Nombre d'étapes déjà franchies (0..steps). */
  current: number;
  /** Un multiplicateur par étape. */
  multipliers: number[];
  status: RoundStatus;
};

function stateOf(index: number, current: number, status: RoundStatus): StepState {
  if (index < current) return "done";
  if (index > current) return "todo";
  if (status === "playing") return "now";
  if (status === "lost") return "lost";
  return "todo";
}

const STATE_WORD: Record<StepState, string> = {
  done: "réussie",
  now: "en cours",
  lost: "perdue",
  todo: "à venir",
};

function trackLabel(status: RoundStatus, current: number, steps: number): string {
  const at = Math.min(current + 1, steps);
  if (status === "playing") return `Étape ${at} sur ${steps}`;
  if (status === "lost") return `Partie perdue à l'étape ${at} sur ${steps}`;
  return `Partie encaissée après ${current} étapes sur ${steps}`;
}

/** La progression des étapes : réussies, courante qui pulse, suivantes en veille. */
export function StepTrack({ steps, current, multipliers, status }: StepTrackProps) {
  return (
    <ol
      className="steptrack"
      aria-label={trackLabel(status, current, steps)}
      style={{ "--step-count": steps } as CSSProperties}
    >
      {Array.from({ length: steps }, (_, index) => {
        const state = stateOf(index, current, status);
        const multiplier = multipliers[index];
        return (
          <li
            key={index}
            className="steptrack__step"
            data-state={state}
            aria-label={
              multiplier === undefined
                ? `Étape ${index + 1}, ${STATE_WORD[state]}`
                : `Étape ${index + 1}, ${formatMultiplier(multiplier)}, ${STATE_WORD[state]}`
            }
          >
            <span className="steptrack__num" aria-hidden="true">
              {index + 1}
            </span>
            <span className="steptrack__mult" aria-hidden="true">
              {multiplier === undefined ? "" : formatMultiplier(multiplier)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
