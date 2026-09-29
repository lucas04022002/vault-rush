/** Appelée à chaque image avec le temps écoulé ; `false` = plus rien ne bouge. */
export type Tick = (dtMs: number) => boolean;

export type Boucle = {
  /** Fait tourner `tick` à chaque image tant qu'il renvoie `true`, puis s'arrête. Remplace le précédent. */
  run(tick: Tick): void;
  /** Une image, dès que possible, sans toucher au `tick` en cours. */
  requestFrame(): void;
  /** Réinstalle le dernier `tick` s'il n'y en a plus d'actif, puis planifie une image. */
  relancer(): void;
  /** Annule l'image en attente et oublie les `tick` : plus rien ne s'affichera. */
  stop(): void;
};

/** Écart maximal entre deux images pris en compte (onglet revenu au premier plan). */
const DT_MAX = 64;

/**
 * Le planificateur d'images, sans `three` : il ne connaît que `draw` (dessiner
 * une image), `raf` et `caf` (injectables pour les tests).
 *
 * AUCUNE boucle permanente : une image n'est demandée que pendant un `tick`
 * qui renvoie `true`, ou sur `requestFrame`. Au repos, rien ne tourne.
 *
 * Réentrant : un `tick` peut appeler `run(suivant)` ou `requestFrame()` sans
 * créer une seconde boucle — il y a toujours au plus UNE image en attente, et
 * le `tick` installé pendant l'appel n'est jamais écrasé par le retour de
 * l'ancien.
 */
export function createBoucle(
  draw: () => void,
  raf: (cb: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb),
  caf: (id: number) => void = (id) => cancelAnimationFrame(id),
): Boucle {
  let frame = 0;
  let tick: Tick | null = null;
  /** Le dernier `tick` confié, gardé après l'arrêt : un redimensionnement le relance pour recadrer. */
  let dernier: Tick | null = null;
  let precedent = 0;

  function planifier() {
    if (frame === 0) frame = raf(image);
  }

  function image(now: number) {
    frame = 0;
    const dt = precedent === 0 ? 16 : Math.min(now - precedent, DT_MAX);
    precedent = now;
    const courant = tick;
    const encore = courant ? courant(dt) : false;
    draw();
    if (encore) {
      // Un `run(suivant)` fait pendant l'appel a déjà planifié : ne rien doubler.
      if (tick === courant) planifier();
    } else {
      // Ne jamais effacer un `tick` installé par `courant` lui-même.
      if (tick === courant) tick = null;
      if (frame === 0) precedent = 0;
    }
  }

  return {
    run(suivant) {
      tick = suivant;
      dernier = suivant;
      planifier();
    },
    requestFrame: planifier,
    relancer() {
      tick = tick ?? dernier;
      planifier();
    },
    stop() {
      if (frame !== 0) caf(frame);
      frame = 0;
      tick = null;
      dernier = null;
      precedent = 0;
    },
  };
}
