import { type CSSProperties, useState } from "react";
import { formatMultiplier } from "../../lib/format.ts";
import { capitalize, modeOf } from "../labels.ts";
import { type BoardProps, STATE_WORD, progressLabel, revealWord, stepState } from "./types.ts";

/**
 * Le plateau de Getaway : une route qui défile, et la police derrière.
 *
 * Le tronçon 1 est en bas et le dernier en haut (on fuit vers l'avant) —
 * l'ordre du DOM reste logique, c'est le CSS qui retourne le ruban. La voiture
 * est posée sur le tronçon courant, les tronçons franchis restent verts
 * derrière elle. La jauge de poursuite ne fait que relire `round.step` : elle
 * ne décide de rien, elle raconte.
 */
export function GetawayBoard({ config, round, revealed, pending, onPick }: BoardProps) {
  const mode = modeOf(config, round.mode);
  const routes = mode?.options ?? revealed?.length ?? 0;
  const multipliers = mode?.multipliers ?? [];
  const noun = capitalize(config.labels.option);
  const tronçon = capitalize(config.labels.step);

  // Le panneau choisi garde son liseré tant que le tronçon n'a pas changé.
  const [picked, setPicked] = useState<{ key: string; option: number } | null>(null);
  const key = `${round.id}:${round.step}`;
  const chosen = picked?.key === key ? picked.option : null;

  const verrouillé = pending || round.status !== "playing";
  const progression = progressLabel(round.status, round.step, config.steps);
  // « Sur le pare-chocs » : dernier tronçon en jeu, ou course terminée.
  const collée = round.step >= config.steps - 1;

  return (
    <section className="gb" role="group" aria-label={`Cavale — ${progression}`}>
      <div className="gb-track">
        <div className="gb-roadway">
          {/* Les bandes blanches du milieu : elles défilent sous la voiture. */}
          <span className="gb-roadway__lanes" aria-hidden="true" />
          <ol className="gb-road" aria-label={progression}>
            {Array.from({ length: config.steps }, (_, index) => {
              const state = stepState(index, round.step, round.status);
              const multiplier = multipliers[index];
              return (
                <li
                  key={index}
                  className="gb-seg"
                  data-state={state}
                  aria-label={
                    multiplier === undefined
                      ? `${tronçon} ${index + 1}, ${STATE_WORD[state]}`
                      : `${tronçon} ${index + 1}, ${formatMultiplier(multiplier)}, ${STATE_WORD[state]}`
                  }
                >
                  <span className="gb-seg__num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="gb-seg__mult" aria-hidden="true">
                    {multiplier === undefined ? "" : formatMultiplier(multiplier)}
                  </span>
                  {/* La voiture : une carrosserie et son toit, dessinées en CSS. */}
                  {state === "now" || state === "lost" ? (
                    <span
                      className="gb-seg__car"
                      aria-hidden="true"
                      data-crashed={state === "lost" ? "true" : undefined}
                    >
                      <span className="gb-seg__roof" />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="gb-chase" data-close={collée ? "true" : undefined}>
          <p className="gb-chase__title sr-only">{`Poursuite ${round.step} / ${config.steps}`}</p>
          <span className="gb-chase__bar" aria-hidden="true">
            {Array.from({ length: config.steps }, (_, index) => (
              <span
                key={index}
                className="gb-chase__pip"
                data-on={index < round.step ? "true" : undefined}
                data-last={index === config.steps - 1 ? "true" : undefined}
              />
            ))}
          </span>
        </div>
      </div>

      <div
        className="gb-signs"
        role="group"
        aria-label={`Choisis une ${config.labels.option}`}
        style={{ "--gb-signs": routes } as CSSProperties}
      >
        {Array.from({ length: routes }, (_, index) => {
          const option = index + 1;
          const reveal = revealed?.[index];
          return (
            <button
              key={option}
              type="button"
              className="gb-sign"
              data-reveal={reveal}
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
              {/* Le panneau de direction : flèche, numéro, et la barrière si barrage. */}
              <span className="gb-sign__plate" aria-hidden="true">
                <span className="gb-sign__arrow" />
                <span className="gb-sign__num">{option}</span>
              </span>
              <span className="gb-sign__barrier" aria-hidden="true" />
              <span className="gb-sign__word" aria-hidden="true">
                {reveal ? revealWord(config, reveal) : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
