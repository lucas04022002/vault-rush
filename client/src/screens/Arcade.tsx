import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { games, type GameConfig } from "../api.ts";
import { Amount, GameCard, PageTitle, Toast } from "../components/index.ts";
import { errorMessage } from "../lib/messages.ts";

/** Couleur d'accent par rang dans le catalogue : elle boucle si un jeu s'ajoute. */
const ACCENTS = ["yellow", "cyan"] as const;

/** L'accueil : le catalogue des jeux, lisible sans compte. */
export function Arcade() {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<GameConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annulé = false;
    void games
      .list()
      .then(({ games: liste }) => {
        if (!annulé) setCatalogue(liste);
      })
      .catch((err) => {
        if (!annulé) setError(errorMessage(err));
      });
    return () => {
      annulé = true;
    };
  }, []);

  return (
    <>
      <PageTitle eyebrow="Coins fictifs · jeu gratuit">Arcade</PageTitle>

      {error ? <Toast kind="bad">{error}</Toast> : null}

      <section className="arcade__grid" aria-label="Jeux disponibles">
        {catalogue?.map((jeu, index) => (
          <GameCard
            key={jeu.id}
            tag={`Jeu ${String(index + 1).padStart(2, "0")} · ${jeu.steps} ${jeu.labels.step}s`}
            title={jeu.name}
            tagline={jeu.tagline}
            accent={ACCENTS[index % ACCENTS.length]}
            onPlay={() => navigate(`/jeux/${jeu.id}`)}
            onRules={() => navigate(`/regles/${jeu.id}`)}
          />
        ))}
      </section>

      <Toast kind="info">
        Les coins n'ont aucune valeur. Sous <Amount cents={1000} />, une recharge gratuite de{" "}
        <Amount cents={100_000} /> est offerte une fois par 24 heures.
      </Toast>
    </>
  );
}
