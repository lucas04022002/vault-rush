import type { BoardProps } from "../boards/types.ts";
import { Echelle3D } from "../echelle3d/Echelle3D.tsx";
import { LaserScene } from "./LaserScene.ts";

/**
 * Laser Grid en 3D : des cases fermées par des vitres, sur un passage libre ou deux lasers en croix.
 *
 * Export par défaut : ce module est chargé par `React.lazy` — `three` n'entre dans le site
 * que lorsque le joueur ouvre le jeu en 3D.
 */
export default function LaserBoard3D(props: BoardProps) {
  return (
    <Echelle3D
      {...props}
      titre="Grille laser"
      creerScene={(stage, nb, etapes) => new LaserScene(stage, nb, etapes)}
    />
  );
}
