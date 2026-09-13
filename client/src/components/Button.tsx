import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "quiet"
  | "accent-cyan"
  | "accent-magenta"
  | "accent-orange"
  | "accent-gem";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  /** Requête en cours : bouton désactivé, aria-busy, roue d'attente. */
  pending?: boolean;
  children: ReactNode;
};

/**
 * Bouton d'arcade : pilule jaune à ombre dure en principal, et une variante par
 * accent de jeu — cyan (Laser Grid), magenta (Getaway), orange (Bomb Squad),
 * améthyste (Diamond Drop).
 * Toutes ont la même forme et la même ombre dure, seule la couleur change.
 */
export function Button({
  variant = "primary",
  pending = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={className ? `btn ${className}` : "btn"}
      data-variant={variant}
      disabled={disabled || pending}
      aria-busy={pending ? "true" : undefined}
    >
      {pending ? <span className="btn__spinner" aria-hidden="true" /> : null}
      <span className="btn__label">{children}</span>
    </button>
  );
}
