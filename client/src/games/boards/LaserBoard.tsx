import { type CSSProperties, type ReactNode, useState } from "react";
import { formatMultiplier } from "../../lib/format.ts";
import { capitalize, modeOf } from "../labels.ts";
import { type BoardProps, STATE_WORD, progressLabel, revealWord, stepState } from "./types.ts";

/**
 * Le plateau de Laser Grid : la salle entière, ses huit lignes empilées.
 *
 * La ligne 1 est en bas et la 8 en haut (on monte) — l'ordre du DOM reste
 * logique (ligne 1 en premier, donc lue en premier) et c'est le CSS qui
 * retourne la pile. Seule la ligne courante est cliquable.
 */
export function LaserBoard({ config, round, revealed, pending, onPick }: BoardProps) {
  const mode = modeOf(config, round.mode);
  const cases = mode?.options ?? revealed?.length ?? 0;
  const noun = capitalize(config.labels.option);
  const ligne = capitalize(config.labels.step);

  // La case choisie garde son liseré tant que la ligne n'a pas changé.
  const [picked, setPicked] = useState<{ key: string; option: number } | null>(null);
  const key = `${round.id}:${round.step}`;
  const chosen = picked?.key === key ? picked.option : null;

  const verrouillé = pending || round.status !== "playing";
  const progression = progressLabel(round.status, round.step, config.steps);
  const courante = Math.min(round.step + 1, config.steps);

  return (
    <section className="lb" role="group" aria-label={`Grille laser — ${progression}`}>
      <p className="lb__counter">
        <span className="lb__line">{`${ligne} ${courante} / ${config.steps}`}</span>
        <span className="lb__mult">
          {round.nextMultiplier === null
            ? formatMultiplier(round.multiplier)
            : `${formatMultiplier(round.multiplier)} → ${formatMultiplier(round.nextMultiplier)}`}
        </span>
      </p>

      <p className="lb__exit" data-open={round.step >= config.steps ? "true" : undefined}>
        Sortie
      </p>

      <ol
        className="lb-rows"
        aria-label={progression}
        style={{ "--lb-cases": cases } as CSSProperties}
      >
        {Array.from({ length: config.steps }, (_, index) => {
          const state = stepState(index, round.step, round.status);
          const active = state === "now" && !verrouillé;
          const cellules = Array.from({ length: cases }, (_, i) => {
            const option = i + 1;
            // Seule la ligne jouée porte une révélation : les autres n'en ont pas.
            const reveal = state === "now" || state === "lost" ? revealed?.[i] : undefined;
            return (
              <button
                key={option}
                type="button"
                className="lb-cell"
                data-reveal={reveal}
                data-picked={state === "now" && chosen === option ? "true" : undefined}
                aria-label={
                  reveal
                    ? `${noun} ${option}, ${config.labels.step} ${index + 1} — ${revealWord(config, reveal)}`
                    : `${noun} ${option}, ${config.labels.step} ${index + 1}`
                }
                aria-disabled={active ? undefined : "true"}
                disabled={!active}
                onClick={() => {
                  if (!active) return;
                  setPicked({ key, option });
                  onPick(option);
                }}
              >
                <span aria-hidden="true">{option}</span>
              </button>
            );
          });

          return (
            <li
              key={index}
              className="lb-row"
              data-state={state}
              aria-label={`${ligne} ${index + 1}, ${STATE_WORD[state]}`}
            >
              <span className="lb-row__no" aria-hidden="true">
                {index + 1}
              </span>
              {/* Les émetteurs, le faisceau de balayage et le trait franchi. */}
              <span className="lb-row__beam" aria-hidden="true" />
              <Cells current={state === "now"} noun={config.labels.option}>
                {cellules}
              </Cells>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Les cases d'une ligne. La ligne courante seule est annoncée comme un groupe
 * de choix : « Choisis une case » ne doit pointer que là où on peut cliquer.
 */
function Cells({
  current,
  noun,
  children,
}: {
  current: boolean;
  noun: string;
  children: ReactNode;
}) {
  if (!current) {
    return <span className="lb-row__cells">{children}</span>;
  }
  return (
    <span className="lb-row__cells" role="group" aria-label={`Choisis une ${noun}`}>
      {children}
    </span>
  );
}
