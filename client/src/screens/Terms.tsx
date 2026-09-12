import { Link } from "react-router";
import { PageTitle, Toast } from "../components/index.ts";
import { LEGAL, TERMS } from "../lib/legal.ts";

/** Conditions générales d'utilisation. */
export function Terms() {
  return (
    <>
      <PageTitle eyebrow="Conditions générales d'utilisation">CGU</PageTitle>

      <Toast kind="info">
        Jeu gratuit, coins fictifs : ils n'ont aucune valeur, et il est impossible de convertir un
        coin en quoi que ce soit.
      </Toast>

      <section className="panel prose" aria-label="Conditions générales d'utilisation">
        {TERMS.map((article) => (
          <article key={article.title}>
            <h2>{article.title}</h2>
            <p>{article.body}</p>
          </article>
        ))}
        <p className="prose__meta">{`Dernière mise à jour : ${LEGAL.derniereMiseAJour}.`}</p>
      </section>

      <p className="screen__aside">
        <Link to="/mentions-legales">Mentions légales</Link>
      </p>
    </>
  );
}
