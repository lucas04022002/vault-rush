import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** État sélectionné, exposé par aria-pressed. */
  selected?: boolean;
  children: ReactNode;
};

/** Puce en pilule : raccourcis de mise, choix de mode. */
export function Chip({ selected = false, className, children, ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type="button"
      className={className ? `chip ${className}` : "chip"}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}
