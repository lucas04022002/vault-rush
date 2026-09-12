import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export type FieldProps = {
  label: string;
  /** Identifiant posé sur le contrôle et racine des identifiants d'aide/erreur. */
  id: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

/** Libellé + contrôle + aide/erreur, reliés par aria-describedby. */
export function Field({ label, id, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  let control = children;
  if (isValidElement<ControlProps>(children)) {
    const element = children as ReactElement<ControlProps>;
    const describedBy = [element.props["aria-describedby"], hintId, errorId]
      .filter(Boolean)
      .join(" ");
    control = cloneElement(element, {
      id,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": error ? "true" : element.props["aria-invalid"],
    });
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
