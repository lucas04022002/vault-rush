import type { BoardProps } from "../boards/types.ts";
import { Echelle3D } from "../echelle3d/Echelle3D.tsx";
import { GetawayScene } from "./GetawayScene.ts";

/**
 * Getaway en 3D : des entrées de tunnel, sur une voie libre ou un barrage de police.
 *
 * Export par défaut : ce module est chargé par `React.lazy` — `three` n'entre dans le site
 * que lorsque le joueur ouvre le jeu en 3D.
 */
export default function GetawayBoard3D(props: BoardProps) {
  return (
    <Echelle3D
      {...props}
      titre="Cavale"
      creerScene={(stage, nb, etapes) => new GetawayScene(stage, nb, etapes)}
    />
  );
}
