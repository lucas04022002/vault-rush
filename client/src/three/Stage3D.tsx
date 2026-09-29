import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
 * Le plateau d'un jeu 3D : un `<div>` (qui porte la classe et que le CSS
 * dimensionne) contenant un `<canvas>`. Décoratif pour un lecteur d'écran
 * (`aria-hidden`) : ce qui compte est redit en HTML par l'écran du jeu.
 *
 * Le canvas est créé À CHAQUE montage, pas par React : en développement,
 * `StrictMode` monte, démonte puis remonte l'effet. Réutiliser le même canvas
 * lui ferait hériter du contexte que `dispose` vient de perdre volontairement
 * (`forceContextLoss`), et le plateau basculerait à tort sur le 2D.
 *
 * Si le contexte WebGL est perdu, le composant LÈVE pendant le rendu, pour que
 * la `Fallback` qui l'entoure bascule sur le plateau 2D.
 */
export function Stage3D({ onReady, className }: Stage3DProps) {
  const boite = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const [perdu, setPerdu] = useState(false);

  // Hors du rendu ; un effet de mise en page passe AVANT l'effet de montage, qui la lit.
  useLayoutEffect(() => {
    ready.current = onReady;
  });

  useEffect(() => {
    const parent = boite.current;
    if (!parent) return;
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    parent.appendChild(canvas);
    const onLost = (event: Event) => {
      event.preventDefault();
      setPerdu(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    // L'écouteur part AVANT `dispose`, qui perd le contexte volontairement.
    const liberer = (stage?: Stage) => {
      canvas.removeEventListener("webglcontextlost", onLost);
      stage?.dispose();
      canvas.remove();
    };
    let stage: Stage;
    let nettoyer: ReturnType<Stage3DProps["onReady"]>;
    try {
      stage = createStage(canvas);
    } catch (erreur) {
      liberer();
      throw erreur;
    }
    try {
      nettoyer = ready.current(stage);
    } catch (erreur) {
      // Rien ne doit fuir : la `Fallback` attrape l'erreur, mais le contexte, lui, resterait ouvert.
      liberer(stage);
      throw erreur;
    }
    return () => {
      nettoyer?.();
      liberer(stage);
    };
  }, []);

  // Après tous les hooks : lever ici laisse l'ordre des hooks intact.
  if (perdu) throw new Error("Contexte WebGL perdu");

  return <div ref={boite} className={className ?? "stage3d"} aria-hidden="true" />;
}
