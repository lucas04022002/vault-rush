import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet" | "accent-cyan";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  /** Requête en cours : bouton désactivé, aria-busy, roue d'attente. */
  pending?: boolean;
  children: ReactNode;
};

/**
 * Bouton d'arcade : pilule jaune à ombre dure en principal, cyan (`accent-cyan`)
 * quand le jeu porte l'accent froid — Laser Grid.
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
