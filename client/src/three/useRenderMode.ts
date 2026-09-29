import { useCallback, useState } from "react";
import {
  chooseRender,
  loadRenderPreference,
  prefersReducedMotion,
  type Rendu,
  setRenderPreference,
  webglAvailable,
} from "./support.ts";

/**
 * Le mode d'affichage des plateaux, commun à tous les jeux.
 * Les capacités de l'appareil sont lues une fois ; seule la préférence bouge.
 */
export function useRenderMode(): { mode: Rendu; possible: boolean; toggle: () => void } {
  const [capacites] = useState(() => ({
    webgl: webglAvailable(),
    reducedMotion: prefersReducedMotion(),
  }));
  const [preference, setPreference] = useState<Rendu | null>(loadRenderPreference);
  const { mode, possible } = chooseRender({ ...capacites, preference });

  const toggle = useCallback(() => {
    const suivant: Rendu = mode === "3d" ? "2d" : "3d";
    setRenderPreference(suivant);
    setPreference(suivant);
  }, [mode]);

  return { mode, possible, toggle };
}
