import { type ComponentType, type LazyExoticComponent, Suspense, useState } from "react";
import { Fallback } from "../../three/Fallback.tsx";
import { RenderToggle } from "../../three/RenderToggle.tsx";
import { useRenderMode } from "../../three/useRenderMode.ts";
import type { BoardProps } from "./types.ts";

/**
 * Un plateau d'échelle qui s'affiche en 3D quand l'appareil le permet, en 2D sinon — ou si
 * la 3D tombe en panne pendant la partie. Les deux reçoivent la même partie et remontent le
 * même choix. Le plateau 3D est chargé à la demande (`React.lazy`) : c'est lui qui fait
 * entrer `three` dans le site.
 */
export function plateauAvec3D(
  Plateau2D: ComponentType<BoardProps>,
  Plateau3D: LazyExoticComponent<ComponentType<BoardProps>>,
): ComponentType<BoardProps> {
  return function PlateauAvec3D(props: BoardProps) {
    const rendu = useRenderMode();
    /**
     * La partie pendant laquelle la 3D a levé : 2D jusqu'à la partie suivante (l'échec est
     * rattaché à SA partie, il tombe tout seul avec elle), ou jusqu'à ce qu'on la redemande.
     */
    const [partieEchec, setPartieEchec] = useState<number | null>(null);
    const echec3d = partieEchec === props.round.id;
    const en3d = rendu.mode === "3d" && !echec3d;

    const plateau2D = <Plateau2D {...props} />;

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
              <Plateau3D {...props} />
            </Suspense>
          </Fallback>
        ) : (
          plateau2D
        )}
      </>
    );
  };
}
