import { Chip } from "./Chip.tsx";

export type GameFilterOption = { id: string; name: string };

export type GameFilterProps = {
  label: string;
  options: GameFilterOption[];
  /** `undefined` = tous les jeux. */
  value: string | undefined;
  onChange: (game: string | undefined) => void;
};

/** Puces « Tous / Vault Rush / Laser Grid » au-dessus d'une liste. */
export function GameFilter({ label, options, value, onChange }: GameFilterProps) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <Chip selected={value === undefined} onClick={() => onChange(undefined)}>
        Tous
      </Chip>
      {options.map((option) => (
        <Chip
          key={option.id}
          selected={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.name}
        </Chip>
      ))}
    </div>
  );
}
