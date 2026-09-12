import type { ReactNode } from "react";

export type ToastKind = "info" | "good" | "bad";

export type ToastProps = {
  kind: ToastKind;
  children: ReactNode;
};

/** Message de résultat ou d'erreur, annoncé poliment. */
export function Toast({ kind, children }: ToastProps) {
  return (
    <div className="toast" data-kind={kind} role="status" aria-live="polite">
      {children}
    </div>
  );
}
