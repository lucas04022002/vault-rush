import type { BoardProps } from "../boards/types.ts";
import { Echelle3D } from "../echelle3d/Echelle3D.tsx";
import { BombScene } from "./BombScene.ts";

/**
 * Bomb Squad en 3D : des câbles gainés qu'on coupe net, neutralisés ou déclencheurs.
 *
 * Export par défaut : ce module est chargé par `React.lazy` — `three` n'entre dans le site
 * que lorsque le joueur ouvre le jeu en 3D.
 */
export default function BombBoard3D(props: BoardProps) {
  return (
    <Echelle3D
      {...props}
      titre="Boîtier"
      creerScene={(stage, nb, etapes) => new BombScene(stage, nb, etapes)}
    />
  );
}
