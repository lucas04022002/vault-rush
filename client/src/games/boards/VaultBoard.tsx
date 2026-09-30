import { type CSSProperties, lazy, useState } from "react";
import { capitalize, modeOf } from "../labels.ts";
import { type BoardProps, progressLabel, revealWord } from "./types.ts";
import { plateauAvec3D } from "./avec3D.tsx";
import { FriseEtapes } from "./FriseEtapes.tsx";

/**
 * Le plateau de Vault Rush : en 3D quand l'appareil le permet (portes de coffre qui
 * pivotent pour de vrai), en 2D sinon. Voir `plateauAvec3D`.
 */
export const VaultBoard = plateauAvec3D(
  VaultBoard2D,
  lazy(() => import("../coffre3d/VaultBoard3D.tsx")),
);

/**
 * Le plateau 2D : la frise des étages et de vraies portes de coffre en CSS.
 *
 * Rien d'aléatoire ni de décidé ici — les étages, les portes et leurs mots
 * viennent tous de la config du jeu et de la partie en cours.
 */
export function VaultBoard2D({ config, round, revealed, pending, onPick }: BoardProps) {
  const mode = modeOf(config, round.mode);
  const portes = mode?.options ?? revealed?.length ?? 0;
  const noun = capitalize(config.labels.option);

  // La porte choisie garde son liseré tant que l'étage n'a pas changé. L'état
  // est rattaché à (partie, étage) : pas d'effet, pas de liseré fantôme.
  const [picked, setPicked] = useState<{ key: string; option: number } | null>(null);
  const key = `${round.id}:${round.step}`;
  const chosen = picked?.key === key ? picked.option : null;

  const verrouillé = pending || round.status !== "playing";
  const progression = progressLabel(round.status, round.step, config.steps);

  return (
    <section className="vb" role="group" aria-label={`Chambre forte — ${progression}`}>
      <FriseEtapes config={config} round={round} />

      <div
        className="vb-doors"
        role="group"
        aria-label={`Choisis une ${config.labels.option}`}
        style={{ "--vb-doors": portes } as CSSProperties}
      >
        {Array.from({ length: portes }, (_, index) => {
          const option = index + 1;
          const reveal = revealed?.[index];
          return (
            <button
              key={option}
              type="button"
              className="vb-door"
              data-reveal={reveal}
              data-open={reveal ? "true" : undefined}
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
              {/* Derrière la porte : le coffre ou l'alarme, visibles quand le battant pivote. */}
              <span className="vb-door__inside" aria-hidden="true">
                <span className="vb-door__loot" />
                <span className="vb-door__word">
                  {reveal ? revealWord(config, reveal) : ""}
                </span>
              </span>
              {/* Le battant : cadre acier, molette et numéro ; il tourne sur ses gonds à gauche. */}
              <span className="vb-door__leaf" aria-hidden="true">
                <span className="vb-door__hinge vb-door__hinge--top" />
                <span className="vb-door__hinge vb-door__hinge--bottom" />
                <span className="vb-door__dial">
                  <span className="vb-door__spokes" />
                </span>
                <span className="vb-door__num">{option}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
