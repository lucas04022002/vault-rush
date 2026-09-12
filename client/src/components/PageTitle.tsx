import type { ReactNode } from "react";

export type PageTitleProps = {
  eyebrow?: ReactNode;
  children: ReactNode;
};

/** Titre de page Bungee, ombre dure magenta. */
export function PageTitle({ eyebrow, children }: PageTitleProps) {
  return (
    <header className="pagetitle">
      {eyebrow ? <p className="pagetitle__eyebrow">{eyebrow}</p> : null}
      <h1 className="pagetitle__h">{children}</h1>
    </header>
  );
}
