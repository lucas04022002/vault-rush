import type { Outcome, RoundStatus } from "../../api.ts";

/**
 * La logique commune des jeux d'ÉCHELLE en 3D (Vault Rush, Laser Grid, Getaway, Bomb Squad),
 * sans `three` : ce que montre chaque option, ce qui vient de se passer, et où dessiner les
 * options. La scène ET la grille de boutons posée sur elle lisent la même `disposition` : un
 * bouton tombe toujours sur son option.
 *
 * Rien ici ne décide : les contenus viennent de `revealed` (le serveur), les événements de
 * la partie telle que le serveur l'a renvoyée.
 */

/** Ce qu'une option cache, tel qu'on le montre : encore cachée, sûre (coffre, passage, voie libre, neutralisé) ou piégée. */
export type Contenu = "cachee" | "sure" | "piege";

/** Ce que le serveur a révélé, option par option ; rien de révélé = toutes cachées. */
export function contenus(revealed: Outcome[] | null | undefined, nb: number): Contenu[] {
  return Array.from({ length: nb }, (_, i) => {
    const r = revealed?.[i];
    return r === "safe" ? "sure" : r === "danger" ? "piege" : "cachee";
  });
}

/** L'état d'une partie à un instant, tel que l'écran le reçoit. */
export type Instant = { roundId: number; step: number; status: RoundStatus };

/** L'option choisie par le joueur : à quelle étape de quelle partie (numérotée à partir de 1). */
export type Choix = { roundId: number; step: number; porte: number };

/** Ce que la scène doit jouer entre deux instants : on avance d'une étape, on perd, on encaisse. Options indexées à partir de 0. */
export type Evenement =
  | { type: "avance"; porte: number | null }
  | { type: "perdu"; porte: number | null; contenus: Contenu[] }
  | { type: "encaisse"; porte: number | null; contenus: Contenu[] };

/**
 * L'événement entre `avant` et `apres`, ou `null` s'il n'y a rien à animer (première
 * image, reprise, autre partie, simple nouveau rendu) : la scène montre alors l'état tel quel.
 */
export function evenement(
  avant: Instant | null,
  apres: Instant,
  choix: Choix | null,
  revealed: Outcome[] | null | undefined,
): Evenement | null {
  if (!avant || avant.roundId !== apres.roundId || avant.status !== "playing") return null;

  // L'option qui a produit ce résultat : celle choisie à l'étape où l'on était.
  const porte =
    choix && choix.roundId === apres.roundId && choix.step === avant.step ? choix.porte - 1 : null;
  const monte = apres.step === avant.step + 1;
  const nb = revealed?.length ?? 0;

  if (apres.status === "playing") return monte ? { type: "avance", porte } : null;
  if (apres.status === "lost") return { type: "perdu", porte, contenus: contenus(revealed, nb) };
  if (apres.status === "cashed_out") {
    return { type: "encaisse", porte: monte ? porte : null, contenus: contenus(revealed, nb) };
  }
  return null;
}

/** Durée de la révélation d'une option (une porte s'ouvre, un câble se coupe…), en ms. */
export const OUVERTURE_MS = 700;
/** Durée du passage à l'étape suivante (la rangée descend, la suivante arrive), en ms. */
export const MONTEE_MS = 650;
/** Écart entre deux options révélées l'une après l'autre à la fin d'une partie, en ms. */
export const DECALAGE_MS = 140;

/**
 * La durée d'un événement, la même pour la scène (qui l'anime) et pour l'écran (qui
 * verrouille les options pendant une avancée, le temps que l'étape suivante soit en place).
 */
export function dureeEvenement(ev: Evenement): number {
  if (ev.type === "avance") return OUVERTURE_MS + MONTEE_MS;
  const premiere = ev.porte === null ? 0 : OUVERTURE_MS;
  const autres = ev.contenus.filter((c, i) => i !== ev.porte && c !== "cachee").length;
  return premiere + (autres > 0 ? (autres - 1) * DECALAGE_MS + OUVERTURE_MS : 0);
}

/** Où dessiner les options dans un plan visible de `largeur` × `hauteur` (unités de la scène). */
export type Disposition = { rayon: number; centres: { x: number; y: number }[] };

/**
 * `nb` options en rangée, chacune au centre de sa colonne (une grille CSS à `nb` colonnes
 * égales tombe donc pile dessus), un peu sous le milieu pour laisser la place à l'en-tête.
 */
export function disposition(nb: number, largeur: number, hauteur: number): Disposition {
  const colonne = largeur / nb;
  const rayon = Math.min(colonne * 0.38, hauteur * 0.3);
  const y = -hauteur * 0.08;
  const centres = Array.from({ length: nb }, (_, i) => ({ x: -largeur / 2 + colonne * (i + 0.5), y }));
  return { rayon, centres };
}
