import { Button } from "./Button.tsx";

export type GameCardProps = {
  /** Étiquette courte : « JEU 01 · 6 ÉTAGES ». */
  tag: string;
  title: string;
  tagline: string;
  accent: "yellow" | "cyan";
  onPlay: () => void;
  onRules: () => void;
};

/** La tuile d'un jeu sur l'accueil arcade. */
export function GameCard({ tag, title, tagline, accent, onPlay, onRules }: GameCardProps) {
  return (
    <article className="gamecard" data-accent={accent}>
      <p className="gamecard__tag">{tag}</p>
      <h2 className="gamecard__title">{title}</h2>
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
