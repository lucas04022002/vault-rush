import { type CSSProperties, lazy, Suspense, useState } from "react";
import { Fallback } from "../../three/Fallback.tsx";
import { RenderToggle } from "../../three/RenderToggle.tsx";
import { useRenderMode } from "../../three/useRenderMode.ts";
import { capitalize, modeOf } from "../labels.ts";
import { type BoardProps, progressLabel, revealWord } from "./types.ts";
import { VaultFloors } from "./VaultFloors.tsx";

/** Le plateau 3D, chargé à la demande : c'est lui qui fait entrer `three` dans le site. */
const VaultBoard3D = lazy(() => import("../coffre3d/VaultBoard3D.tsx"));

/**
 * Le plateau de Vault Rush : en 3D quand l'appareil le permet (portes de coffre qui
 * pivotent pour de vrai), en 2D sinon — ou si la 3D tombe en panne pendant la partie.
 * Les deux reçoivent la même partie et remontent le même choix.
 */
export function VaultBoard(props: BoardProps) {
  const rendu = useRenderMode();
  /**
   * La partie pendant laquelle la 3D a levé : 2D jusqu'à la partie suivante (l'échec est
   * rattaché à SA partie, il tombe tout seul avec elle), ou jusqu'à ce qu'on la redemande.
   */
  const [partieEchec, setPartieEchec] = useState<number | null>(null);
  const echec3d = partieEchec === props.round.id;
  const en3d = rendu.mode === "3d" && !echec3d;

  const plateau2D = <VaultBoard2D {...props} />;

  return (
    <>
      {rendu.possible ? (
        <div className="vb-head">
          <RenderToggle
            mode={en3d ? "3d" : "2d"}
            possible={rendu.possible}
            // Après une panne, le bouton décoché veut dire « réessaie la 3D », pas « passe en 2D ».
            onToggle={echec3d ? () => setPartieEchec(null) : rendu.toggle}
          />
        </div>
      ) : null}
      {en3d ? (
        <Fallback
          resetKey={props.round.id}
          onError={() => setPartieEchec(props.round.id)}
          fallback={plateau2D}
        >
          <Suspense fallback={plateau2D}>
            <VaultBoard3D {...props} />
          </Suspense>
        </Fallback>
      ) : (
        plateau2D
      )}
    </>
  );
}

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
      <VaultFloors config={config} round={round} />

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
