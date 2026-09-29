import { useCallback, useEffect, useRef } from "react";
import { formatMultiplier } from "../../lib/format.ts";
import { Stage3D } from "../../three/Stage3D.tsx";
import type { Stage } from "../../three/stage.ts";
import type { DiamondBoardProps } from "../DiamondBoard.tsx";
import { DiamondScene } from "./DiamondScene.ts";

export type DiamondBoard3DProps = DiamondBoardProps & {
  /** Durée d'une rangée côté écran : la scène lisse la chute sur ce rythme. */
  rowMs: number;
};

/**
 * Le plateau de Diamond Drop en 3D, avec les MÊMES props que `DiamondBoard` :
 * l'écran passe de l'un à l'autre sans rien changer d'autre.
 *
 * Export par défaut : ce module est chargé par `React.lazy`, et c'est lui qui
 * fait entrer `three` dans le site — seulement quand le joueur ouvre le jeu en 3D.
 */
export default function DiamondBoard3D({ rows, slots, path, row, landedSlot, rowMs }: DiamondBoard3DProps) {
  const scene = useRef<DiamondScene | null>(null);
  const etat = useRef({ path, row, landedSlot, rowMs });
  etat.current = { path, row, landedSlot, rowMs };

  const onReady = useCallback(
    (stage: Stage) => {
      const s = new DiamondScene(stage, rows, slots);
      s.setRowMs(etat.current.rowMs);
      s.update(etat.current);
      scene.current = s;
      return () => {
        scene.current = null;
      };
    },
    [rows, slots],
  );

  useEffect(() => {
    scene.current?.setRowMs(rowMs);
    scene.current?.update({ path, row, landedSlot });
  }, [path, row, landedSlot, rowMs]);

  const libelle =
    landedSlot === null
      ? "Plateau de clous en 3D"
      : `Plateau de clous en 3D — diamant posé en case ${landedSlot + 1} (${formatMultiplier(
          slots[landedSlot] ?? 0,
        )})`;

  return (
    <div className="dd-stage" role="img" aria-label={libelle}>
      {/* Autre mode = autres rangées : une scène neuve, pas une scène retouchée. */}
      <Stage3D key={`${rows}:${slots.join(",")}`} onReady={onReady} />
    </div>
  );
}
