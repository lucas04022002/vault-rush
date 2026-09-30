import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import type { Round } from "../../api.ts";
import { Stage3D } from "../../three/Stage3D.tsx";
import type { Stage } from "../../three/stage.ts";
import type { BoardProps } from "../boards/types.ts";
import { progressLabel, revealWord } from "../boards/types.ts";
import { FriseEtapes } from "../boards/FriseEtapes.tsx";
import { capitalize, modeOf } from "../labels.ts";
import {
  type Choix,
  type Contenu,
  contenus,
  disposition,
  dureeEvenement,
  type Evenement,
  evenement,
  type Instant,
} from "./logique.ts";

/** Le rapport largeur / hauteur d'un plateau 3D : fixe, pour que la grille de boutons tombe pile sur les options. */
export const ASPECT = 3 / 2;

/** Ce que l'écran attend d'une scène de jeu d'échelle (voir `SceneEchelle`). */
export type SceneJouable = {
  montrer(contenus: Contenu[], etape: number): void;
  jouer(ev: Evenement, etapeApres: number): void;
  survoler(option: number | null): void;
};

export type Echelle3DProps = BoardProps & {
  /** Le nom du plateau pour un lecteur d'écran : « Chambre forte », « Grille laser »… */
  titre: string;
  /** Fabrique la scène du jeu une fois le canvas prêt. */
  creerScene: (stage: Stage, nb: number, etapes: number) => SceneJouable;
};

const instant = (round: Round): Instant => ({ roundId: round.id, step: round.step, status: round.status });

/**
 * Le plateau 3D commun des jeux d'échelle. Les options restent de VRAIS boutons : une
 * grille transparente, une colonne par option, posée exactement sur les options dessinées
 * (même `disposition` que la scène). Libellés, verrouillage et clavier sont ceux du 2D.
 * Chaque jeu ne fournit que son `titre` et sa scène.
 */
export function Echelle3D({ config, round, revealed, pending, onPick, titre, creerScene }: Echelle3DProps) {
  const mode = modeOf(config, round.mode);
  const nb = mode?.options ?? revealed?.length ?? 0;
  const noun = capitalize(config.labels.option);
  const progression = progressLabel(round.status, round.step, config.steps);

  const scene = useRef<SceneJouable | null>(null);
  /** L'état de la partie à la dernière image : l'événement à jouer se lit entre lui et le nouveau. */
  const avant = useRef<Instant | null>(null);
  /** L'option que le joueur vient de choisir, à quelle étape : lue à la réponse du serveur, sans rien déclencher. */
  const choix = useRef<Choix | null>(null);
  /** Pendant une avancée, on ne choisit pas une option de l'étape suivante avant de la voir. */
  const [verrou, setVerrou] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [survol, setSurvol] = useState<number | null>(null);

  // Les valeurs courantes, lues par la scène au moment où elle naît.
  const etat = useRef({ round, revealed, nb, creerScene });
  etat.current = { round, revealed, nb, creerScene };

  const onReady = useCallback(
    (stage: Stage) => {
      const { round: r, revealed: rev, creerScene: creer } = etat.current;
      const s = creer(stage, nb, config.steps);
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
    if (ev?.type === "avance") {
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
    <section className="vb vb3d" role="group" aria-label={`${titre} — ${progression}`}>
      <FriseEtapes config={config} round={round} />

      <div className="vb3d-scene" style={{ aspectRatio: `${ASPECT}` }}>
        {/* Autre mode = autre nombre d'options : une scène neuve, pas une scène retouchée. */}
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
