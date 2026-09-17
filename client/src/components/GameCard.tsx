import { Button } from "./Button.tsx";
import { GameEmblem } from "./GameEmblem.tsx";

export type GameCardProps = {
  /** L'identifiant du jeu : choisit l'emblème dessiné en tête de tuile. */
  gameId: string;
  /**
   * Le genre, affiché sur la tuile depuis que la grille est unique. Il portait
   * auparavant un titre de section ; le perdre aurait coûté une information
   * pour un gain de mise en page.
   */
  genre: string;
  /** Étiquette courte : « JEU 01 · 6 ÉTAGES ». */
  tag: string;
  title: string;
  tagline: string;
  accent: "yellow" | "cyan" | "magenta" | "orange" | "ice" | "gem" | "felt";
  onPlay: () => void;
  onRules: () => void;
};

/** La tuile d'un jeu sur l'accueil arcade. */
export function GameCard({
  gameId,
  genre,
  tag,
  title,
  tagline,
  accent,
  onPlay,
  onRules,
}: GameCardProps) {
  return (
    <article className="gamecard" data-accent={accent}>
      <div className="gamecard__entete">
        <GameEmblem gameId={gameId} />
        <div className="gamecard__intitule">
          <p className="gamecard__genre">{genre}</p>
          <p className="gamecard__tag">{tag}</p>
        </div>
      </div>
      {/* h3 : la tuile vit sous le titre de son genre (h2), lui-même sous le h1. */}
      <h3 className="gamecard__title">{title}</h3>
      <p className="gamecard__tagline">{tagline}</p>
      <div className="gamecard__actions">
        <Button variant="primary" onClick={onPlay} aria-label={`Jouer à ${title}`}>
          Jouer
        </Button>
        <Button variant="secondary" onClick={onRules} aria-label={`Règles de ${title}`}>
          Règles
        </Button>
      </div>
    </article>
  );
}
