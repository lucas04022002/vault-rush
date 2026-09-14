import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { games, type GameConfig, type GameKind } from "../api.ts";
import { Amount, GameCard, PageTitle, Toast } from "../components/index.ts";
import { accentFor } from "../games/boards/index.ts";
import { errorMessage } from "../lib/messages.ts";

/**
 * Les genres, dans l'ordre d'affichage de l'arcade. Le GENRE d'un jeu vient du
 * serveur (`config.kind`) : ajouter un jeu à un genre existant ne touche pas
 * cet écran, et ajouter un genre nouveau se fait d'une ligne ici.
 */
const GENRES: { kind: GameKind; titre: string }[] = [
  { kind: "ladder", titre: "Monte et encaisse" },
  { kind: "code", titre: "Réflexion" },
  { kind: "drop", titre: "Hasard pur" },
  { kind: "cards", titre: "Cartes" },
];

/** Le numéro d'un jeu : son rang dans le catalogue entier, genres confondus. */
function numéro(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** L'accueil : le catalogue des jeux, par genre, lisible sans compte. */
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

  // Le rang d'un jeu est celui du catalogue : il ne bouge pas avec le regroupement.
  const rangs = new Map((catalogue ?? []).map((jeu, index) => [jeu.id, index]));

  const connus = new Set(GENRES.map((genre) => genre.kind as string));
  const groupes = [
    ...GENRES.map((genre) => ({
      titre: genre.titre,
      jeux: (catalogue ?? []).filter((jeu) => jeu.kind === genre.kind),
    })),
    // Un genre servi par le serveur mais inconnu ici ne disparaît pas en silence.
    { titre: "Autres jeux", jeux: (catalogue ?? []).filter((jeu) => !connus.has(jeu.kind)) },
  ].filter((groupe) => groupe.jeux.length > 0);

  return (
    <>
      <PageTitle eyebrow="Coins fictifs · jeu gratuit">Arcade</PageTitle>

      {error ? <Toast kind="bad">{error}</Toast> : null}

      {groupes.map((groupe) => (
        <section className="arcade__genre" key={groupe.titre} aria-label={groupe.titre}>
          <h2 className="arcade__titre">{groupe.titre}</h2>
          <div className="arcade__grid">
            {groupe.jeux.map((jeu) => (
              <GameCard
                key={jeu.id}
                tag={`Jeu ${numéro(rangs.get(jeu.id) ?? 0)} · ${jeu.format}`}
                title={jeu.name}
                tagline={jeu.tagline}
                accent={accentFor(jeu.id)}
                onPlay={() => navigate(`/jeux/${jeu.id}`)}
                onRules={() => navigate(`/regles/${jeu.id}`)}
              />
            ))}
          </div>
        </section>
      ))}

      <Toast kind="info">
        Les coins n'ont aucune valeur. Sous <Amount cents={1000} />, une recharge gratuite de{" "}
        <Amount cents={100_000} /> est offerte une fois par 24 heures.
      </Toast>
    </>
  );
}
