import type { ReactNode } from "react";

export type PageTitleProps = {
  eyebrow?: ReactNode;
  /** L'accent du jeu : jaune par défaut, une couleur par jeu ensuite. */
  accent?: "yellow" | "cyan" | "magenta" | "orange" | "felt";
  children: ReactNode;
};

/** Titre de page Bungee, ombre dure magenta. */
export function PageTitle({ eyebrow, accent = "yellow", children }: PageTitleProps) {
  return (
    <header className="pagetitle" data-accent={accent}>
      {eyebrow ? <p className="pagetitle__eyebrow">{eyebrow}</p> : null}
      <h1 className="pagetitle__h">{children}</h1>
    </header>
  );
}
