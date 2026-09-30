import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import type { Round } from "../../api.ts";
import { Stage3D } from "../../three/Stage3D.tsx";
import type { Stage } from "../../three/stage.ts";
import type { BoardProps } from "../boards/types.ts";
import { progressLabel, revealWord } from "../boards/types.ts";
import { VaultFloors } from "../boards/VaultFloors.tsx";
import { capitalize, modeOf } from "../labels.ts";
import {
  type Choix,
  contenus,
  disposition,
  dureeEvenement,
  evenement,
  type Instant,
} from "./portes.ts";
import { VaultScene } from "./VaultScene.ts";

/** Le rapport largeur / hauteur du plateau 3D : fixe, pour que la grille de boutons tombe pile sur les portes. */
export const ASPECT = 3 / 2;

const instant = (round: Round): Instant => ({ roundId: round.id, step: round.step, status: round.status });

/**
 * Vault Rush en 3D. Les portes restent de VRAIS boutons : une grille transparente,
 * une colonne par porte, posée exactement sur les portes dessinées (même `disposition`
 * que la scène). Libellés, verrouillage et clavier sont ceux du plateau 2D.
 *
 * Export par défaut : ce module est chargé par `React.lazy`, et c'est lui qui fait entrer
 * `three` dans le site — seulement quand le joueur ouvre Vault Rush en 3D.
 */
export default function VaultBoard3D({ config, round, revealed, pending, onPick }: BoardProps) {
  const mode = modeOf(config, round.mode);
  const nb = mode?.options ?? revealed?.length ?? 0;
  const noun = capitalize(config.labels.option);
  const progression = progressLabel(round.status, round.step, config.steps);

  const scene = useRef<VaultScene | null>(null);
  /** L'état de la partie à la dernière image : l'événement à jouer se lit entre lui et le nouveau. */
  const avant = useRef<Instant | null>(null);
  /** La porte que le joueur vient de choisir, à quel étage : lue à la réponse du serveur, sans rien déclencher. */
  const choix = useRef<Choix | null>(null);
  /** Pendant une montée, on ne choisit pas une porte de l'étage suivant avant de la voir. */
  const [verrou, setVerrou] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [survol, setSurvol] = useState<number | null>(null);

  // Les valeurs courantes, lues par la scène au moment où elle naît.
  const etat = useRef({ round, revealed, nb });
  etat.current = { round, revealed, nb };

  const onReady = useCallback(
    (stage: Stage) => {
      const s = new VaultScene(stage, nb, config.steps);
      const { round: r, revealed: rev } = etat.current;
      s.montrer(contenus(rev, nb), r.step);
      scene.current = s;
      avant.current = instant(r);
      return () => {
        scene.current = null;
      };
    },
    [nb, config.steps],
  );

  // Chaque réponse du serveur : un événement à jouer, ou l'état à montrer tel quel. Les
  // dépendances sont les champs qui changent avec une réponse, pas l'objet `round` entier.
  const { id: roundId, step, status } = round;
  useEffect(() => {
    const apres: Instant = { roundId, step, status };
    const ev = evenement(avant.current, apres, choix.current, revealed);
    avant.current = apres;
    // Le verrou ne dépend pas de la scène : même si elle n'est pas (encore) là, on ne choisit
    // pas une porte de l'étage suivant pendant que l'étage monte.
    if (ev?.type === "montee") {
      setVerrou(true);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setVerrou(false), dureeEvenement(ev));
    }
    const s = scene.current;
    if (!s) return;
    if (ev) s.jouer(ev, step);
    else s.montrer(contenus(revealed, nb), step);
  }, [roundId, step, status, revealed, nb]);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  useEffect(() => {
    scene.current?.survoler(survol);
  }, [survol]);

  const verrouille = pending || verrou || round.status !== "playing";
  const { rayon, centres } = disposition(Math.max(nb, 1), ASPECT, 1);
  // La grille de boutons couvre la hauteur des portes : même centre, même diamètre.
  const haut = 0.5 - (centres[0]?.y ?? 0) - rayon;

  return (
    <section className="vb vb3d" role="group" aria-label={`Chambre forte — ${progression}`}>
      <VaultFloors config={config} round={round} />

      <div className="vb3d-scene" style={{ aspectRatio: `${ASPECT}` }}>
        {/* Autre mode = autre nombre de portes : une scène neuve, pas une scène retouchée. */}
        <Stage3D key={nb} onReady={onReady} />

        <div
          className="vb3d-portes"
          role="group"
          aria-label={`Choisis une ${config.labels.option}`}
          style={
            {
              "--vb-doors": nb,
              top: `${haut * 100}%`,
              height: `${2 * rayon * 100}%`,
            } as CSSProperties
          }
        >
          {Array.from({ length: nb }, (_, index) => {
            const option = index + 1;
            const reveal = revealed?.[index];
            return (
              <button
                key={option}
                type="button"
                className="vb3d-porte"
                aria-label={
                  reveal ? `${noun} ${option} — ${revealWord(config, reveal)}` : `${noun} ${option}`
                }
                aria-disabled={verrouille ? "true" : undefined}
                disabled={verrouille}
                onPointerEnter={() => setSurvol(index)}
                onPointerLeave={() => setSurvol((s) => (s === index ? null : s))}
                onFocus={() => setSurvol(index)}
                onBlur={() => setSurvol((s) => (s === index ? null : s))}
                onClick={() => {
                  if (verrouille) return;
                  choix.current = { roundId: round.id, step: round.step, porte: option };
                  onPick(option);
                }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
