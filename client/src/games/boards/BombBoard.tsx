import { type CSSProperties, useState } from "react";
import { capitalize, modeOf } from "../labels.ts";
import { type BoardProps, STATE_WORD, progressLabel, revealWord, stepState } from "./types.ts";

/**
 * Le plateau de Bomb Squad : un boîtier, ses câbles, et un afficheur.
 *
 * L'afficheur est un décompte d'ÉTAPES RESTANTES, pas un chronomètre : il ne
 * tourne pas, il n'y a aucune pression temporelle dans ce jeu. Il ne fait que
 * relire `round.step`, que le serveur a décidé.
 *
 * La couleur des gaines suit le RANG du câble, jamais son contenu : le tirage
 * est décidé côté serveur après le clic, la gaine ne peut donc rien trahir.
 * La page de règles le dit noir sur blanc.
 */

const GAINES = ["cyan", "magenta", "yellow", "orange"] as const;

/** Les segments allumés d'un chiffre sur un afficheur sept segments. */
const SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

const TOUS_SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"] as const;

export function BombBoard({ config, round, revealed, pending, onPick }: BoardProps) {
  const mode = modeOf(config, round.mode);
  const câbles = mode?.options ?? revealed?.length ?? 0;
  const noun = capitalize(config.labels.option);
  const étape = capitalize(config.labels.step);

  // Le câble coupé garde sa section tant que l'étape n'a pas changé.
  const [picked, setPicked] = useState<{ key: string; option: number } | null>(null);
  const key = `${round.id}:${round.step}`;
  const chosen = picked?.key === key ? picked.option : null;

  const verrouillé = pending || round.status !== "playing";
  const progression = progressLabel(round.status, round.step, config.steps);
  const restantes = Math.max(config.steps - round.step, 0);
  const affiché = String(restantes).padStart(2, "0");

  return (
    <section className="bb" role="group" aria-label={`Boîtier — ${progression}`}>
      <div className="bb-case" data-blast={round.status === "lost" ? "true" : undefined}>
        {/* Un dessin, pas un texte : sept segments par chiffre, d'où `role="img"`. */}
        <div
          className="bb-display"
          role="img"
          data-value={affiché}
          aria-label={`Reste ${restantes} ${config.labels.step}${restantes > 1 ? "s" : ""}`}
        >
          <span className="bb-display__digits" aria-hidden="true">
            {[...affiché].map((chiffre, index) => (
              <span key={index} className="bb-digit">
                {TOUS_SEGMENTS.map((segment) => (
                  <span
                    key={segment}
                    className="bb-digit__seg"
                    data-seg={segment}
                    data-on={SEGMENTS[chiffre]?.includes(segment) ? "true" : undefined}
                  />
                ))}
              </span>
            ))}
          </span>
        </div>

        <ol
          className="bb-steps"
          aria-label={progression}
          style={{ "--bb-steps": config.steps } as CSSProperties}
        >
          {Array.from({ length: config.steps }, (_, index) => {
            const state = stepState(index, round.step, round.status);
            return (
              <li
                key={index}
                className="bb-step"
                data-state={state}
                aria-label={`${étape} ${index + 1}, ${STATE_WORD[state]}`}
              />
            );
          })}
        </ol>
      </div>

      {/* `data-lost` : l'étincelle ne part QUE sur la partie perdue — un câble
          piégé qu'on n'a pas coupé se révèle, il n'explose pas. */}
      <div
        className="bb-cables"
        role="group"
        data-lost={round.status === "lost" ? "true" : undefined}
        aria-label={`Choisis un ${config.labels.option}`}
        style={{ "--bb-cables": câbles } as CSSProperties}
      >
        {Array.from({ length: câbles }, (_, index) => {
          const option = index + 1;
          const reveal = revealed?.[index];
          const coupé = chosen === option || reveal !== undefined;
          return (
            <button
              key={option}
              type="button"
              className="bb-cable"
              data-gaine={GAINES[index % GAINES.length]}
              data-reveal={reveal}
              data-cut={coupé ? "true" : undefined}
              data-picked={chosen === option ? "true" : undefined}
              aria-label={
                reveal ? `${noun} ${option} — ${revealWord(config, reveal)}` : `${noun} ${option}`
              }
              aria-disabled={verrouillé ? "true" : undefined}
              disabled={verrouillé}
              onClick={() => {
                if (verrouillé) return;
                setPicked({ key, option });
                onPick(option);
              }}
            >
              {/* Deux brins : ils s'écartent quand le câble est sectionné. */}
              <span className="bb-cable__top" aria-hidden="true" />
              <span className="bb-cable__spark" aria-hidden="true" />
              <span className="bb-cable__bottom" aria-hidden="true" />
              <span className="bb-cable__num" aria-hidden="true">
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* Le socle : les câbles y plongent tous. */}
      <div className="bb-base" aria-hidden="true" />
    </section>
  );
}
