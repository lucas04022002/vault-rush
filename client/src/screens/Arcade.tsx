import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { games, type GameConfig, type GameKind } from "../api.ts";
import { Amount, GameCard, PageTitle, Toast } from "../components/index.ts";
import { accentFor } from "../games/boards/index.ts";
import { errorMessage } from "../lib/messages.ts";

/**
 * Les genres : leur ORDRE range le catalogue, leur TITRE s'affiche sur chaque
 * tuile. Le genre d'un jeu vient du serveur (`config.kind`) : ajouter un jeu à
 * un genre existant ne touche pas cet écran, et ajouter un genre nouveau se
 * fait d'une ligne ici.
 *
 * Les jeux étaient auparavant découpés en une section par genre. Sur sept jeux
 * répartis 4/1/1/1, trois sections n'avaient qu'une tuile : elles occupaient
 * une ligne entière pour une seule carte, et le catalogue se lisait comme une
 * liste verticale. Le regroupement reste — il ordonne la grille et nomme
 * chaque jeu — mais il ne coupe plus la page.
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

  // Le rang d'un jeu est celui du catalogue : il ne bouge pas avec le classement.
  const rangs = new Map((catalogue ?? []).map((jeu, index) => [jeu.id, index]));

  const connus = new Set(GENRES.map((genre) => genre.kind as string));

  /** Le titre du genre d'un jeu. Un genre inconnu du client garde un nom. */
  const genreDe = (jeu: GameConfig): string =>
    GENRES.find((genre) => genre.kind === jeu.kind)?.titre ?? "Autres jeux";

  /**
   * Le catalogue rangé par genre, dans l'ordre de GENRES, puis les jeux d'un
   * genre inconnu — servi par le serveur avant d'être déclaré ici. Ils passent
   * en dernier plutôt que de disparaître en silence.
   */
  const jeux = [
    ...GENRES.flatMap((genre) => (catalogue ?? []).filter((jeu) => jeu.kind === genre.kind)),
    ...(catalogue ?? []).filter((jeu) => !connus.has(jeu.kind)),
  ];

  return (
    <>
      <PageTitle eyebrow="Coins fictifs · jeu gratuit">Arcade</PageTitle>

      {error ? <Toast kind="bad">{error}</Toast> : null}

      <section className="arcade__genre" aria-label="Catalogue des jeux">
        <h2 className="sr-only">Catalogue des jeux</h2>
        <div className="arcade__grid">
          {jeux.map((jeu) => (
            <GameCard
              key={jeu.id}
              gameId={jeu.id}
              genre={genreDe(jeu)}
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

      <Toast kind="info">
        Les coins n'ont aucune valeur. Sous <Amount cents={1000} />, une recharge gratuite de{" "}
        <Amount cents={100_000} /> est offerte une fois par 24 heures.
      </Toast>
    </>
  );
}
