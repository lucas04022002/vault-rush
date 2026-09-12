import type { CSSProperties } from "react";

export type OptionReveal = "safe" | "danger";

export type OptionGridProps = {
  /** Nombre d'options proposées à cette étape. */
  count: number;
  /** Vocabulaire du jeu : « Porte » (Vault Rush) ou « Case » (Laser Grid). */
  labels: { option: string };
  onPick: (option: number) => void;
  /** Vrai pendant une requête : plus aucun clic ne part. */
  disabled: boolean;
  /** Nature réelle de chaque option, une fois la réponse du serveur reçue. */
  revealed?: OptionReveal[];
};

const REVEAL_WORD: Record<OptionReveal, string> = {
  safe: "sûre",
  danger: "alarme",
};

/** Les N options d'une étape, révélées après la réponse du serveur. */
export function OptionGrid({ count, labels, onPick, disabled, revealed }: OptionGridProps) {
  const noun = labels.option;
  return (
    <div
      className="optiongrid"
      role="group"
      aria-label={`Choisis une ${noun.toLocaleLowerCase("fr-FR")}`}
      style={{ "--option-count": count } as CSSProperties}
    >
      {Array.from({ length: count }, (_, index) => {
        const option = index + 1;
        const reveal = revealed?.[index];
        return (
          <button
            key={option}
            type="button"
            className="option"
            data-reveal={reveal}
            aria-label={reveal ? `${noun} ${option} — ${REVEAL_WORD[reveal]}` : `${noun} ${option}`}
            aria-disabled={disabled ? "true" : undefined}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onPick(option);
            }}
          >
            <span aria-hidden="true">{option}</span>
          </button>
        );
      })}
    </div>
  );
}
