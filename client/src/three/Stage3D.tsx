import { useEffect, useRef, useState } from "react";
import { createStage, type Stage } from "./stage.ts";

export type Stage3DProps = {
  /**
   * Construit la scène d'un jeu une fois le canvas prêt ; peut renvoyer une
   * fonction appelée avant la libération. Lue au montage seulement : pour une
   * autre scène, changer la `key` du composant.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: une scène peut ne rien renvoyer (`void`) ou renvoyer son nettoyage.
  onReady: (stage: Stage) => (() => void) | void;
  className?: string;
};

/**
 * Le canvas d'un plateau 3D. Décoratif pour un lecteur d'écran (`aria-hidden`) :
 * ce qui compte est redit en HTML par l'écran du jeu.
 *
 * Si le contexte WebGL est perdu, le composant LÈVE pendant le rendu, pour que
 * la `Fallback` qui l'entoure bascule sur le plateau 2D.
 */
export function Stage3D({ onReady, className }: Stage3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const [perdu, setPerdu] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onLost = (event: Event) => {
      event.preventDefault();
      setPerdu(true);
    };
    element.addEventListener("webglcontextlost", onLost);
    const stage = createStage(element);
    const nettoyer = ready.current(stage);
    return () => {
      // L'écouteur part AVANT `dispose`, qui perd le contexte volontairement.
      element.removeEventListener("webglcontextlost", onLost);
      nettoyer?.();
      stage.dispose();
    };
  }, []);

  // Après tous les hooks : lever ici laisse l'ordre des hooks intact.
  if (perdu) throw new Error("Contexte WebGL perdu");

  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: un canvas sans tabindex n'est pas focalisable ; il est purement décoratif.
  return <canvas ref={canvas} className={className ?? "stage3d"} aria-hidden="true" />;
}
