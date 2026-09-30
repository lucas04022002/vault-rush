import type { BoardProps } from "../boards/types.ts";
import { Echelle3D } from "../echelle3d/Echelle3D.tsx";
import { VaultScene } from "./VaultScene.ts";

/**
 * Vault Rush en 3D : des portes de coffre rondes qui pivotent sur des lingots ou un gyrophare.
 *
 * Export par défaut : ce module est chargé par `React.lazy`, et c'est lui qui fait entrer
 * `three` dans le site — seulement quand le joueur ouvre Vault Rush en 3D.
 */
export default function VaultBoard3D(props: BoardProps) {
  return (
    <Echelle3D
      {...props}
      titre="Chambre forte"
      creerScene={(stage, nb, etapes) => new VaultScene(stage, nb, etapes)}
    />
  );
}
