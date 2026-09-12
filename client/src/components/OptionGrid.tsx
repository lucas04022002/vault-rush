import type { CSSProperties } from "react";

export type OptionReveal = "safe" | "danger";

export type OptionGridProps = {
  /** Nombre d'options proposées à cette étape. */
  count: number;
  /**
   * Vocabulaire du jeu : « Porte » / « Case », et les mots dits à la
   * révélation (« coffre » / « alarme », « passage » / « laser »).
   */
  labels: { option: string; safe?: string; danger?: string };
  onPick: (option: number) => void;
  /** Vrai pendant une requête : plus aucun clic ne part. */
  disabled: boolean;
  /** Nature réelle de chaque option, une fois la réponse du serveur reçue. */
  revealed?: OptionReveal[];
};

/** Les N options d'une étape, révélées après la réponse du serveur. */
export function OptionGrid({ count, labels, onPick, disabled, revealed }: OptionGridProps) {
  const noun = labels.option;
  // Repli générique quand le jeu ne donne pas ses mots (vitrine, tests).
  const word: Record<OptionReveal, string> = {
    safe: labels.safe ?? "sûre",
    danger: labels.danger ?? "alarme",
  };
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
            aria-label={reveal ? `${noun} ${option} — ${word[reveal]}` : `${noun} ${option}`}
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
