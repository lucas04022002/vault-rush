import type { Outcome, RoundStatus } from "../../api.ts";

/**
 * Vault Rush en 3D, sans `three` : ce que montre chaque porte, ce qui vient de se
 * passer, et où dessiner les portes. La scène ET la grille de boutons posée sur
 * elle lisent la même `disposition` : un bouton tombe toujours sur sa porte.
 *
 * Rien ici ne décide : les contenus viennent de `revealed` (le serveur), les
 * événements de la partie telle que le serveur l'a renvoyée.
 */

/** Ce qu'il y a derrière une porte, tel qu'on le montre. */
export type Contenu = "fermee" | "or" | "alarme";

/** Ce que le serveur a révélé, porte par porte ; rien de révélé = toutes fermées. */
export function contenus(revealed: Outcome[] | null | undefined, nb: number): Contenu[] {
  return Array.from({ length: nb }, (_, i) => {
    const r = revealed?.[i];
    return r === "safe" ? "or" : r === "danger" ? "alarme" : "fermee";
  });
}

/** L'état d'une partie à un instant, tel que l'écran le reçoit. */
export type Instant = { roundId: number; step: number; status: RoundStatus };

/** La porte choisie par le joueur : à quel étage de quelle partie (porte numérotée à partir de 1). */
export type Choix = { roundId: number; step: number; porte: number };

/** Ce que la scène doit jouer entre deux instants. Les portes sont indexées à partir de 0. */
export type Evenement =
  | { type: "montee"; porte: number | null }
  | { type: "alarme"; porte: number | null; contenus: Contenu[] }
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

  // La porte qui a produit ce résultat : celle choisie à l'étage où l'on était.
  const porte =
    choix && choix.roundId === apres.roundId && choix.step === avant.step ? choix.porte - 1 : null;
  const monte = apres.step === avant.step + 1;
  const nb = revealed?.length ?? 0;

  if (apres.status === "playing") return monte ? { type: "montee", porte } : null;
  if (apres.status === "lost") return { type: "alarme", porte, contenus: contenus(revealed, nb) };
  if (apres.status === "cashed_out") {
    return { type: "encaisse", porte: monte ? porte : null, contenus: contenus(revealed, nb) };
  }
  return null;
}

/** Durée d'ouverture d'un battant, en ms. */
export const OUVERTURE_MS = 700;
/** Durée de la montée d'un étage (la rangée descend, la suivante arrive), en ms. */
export const MONTEE_MS = 650;
/** Écart entre deux portes qui s'ouvrent l'une après l'autre à la fin d'une partie, en ms. */
export const DECALAGE_MS = 140;

/**
 * La durée d'un événement, la même pour la scène (qui l'anime) et pour l'écran (qui
 * verrouille les portes pendant une montée, le temps que l'étage suivant soit en place).
 */
export function dureeEvenement(ev: Evenement): number {
  if (ev.type === "montee") return OUVERTURE_MS + MONTEE_MS;
  const premiere = ev.porte === null ? 0 : OUVERTURE_MS;
  const autres = ev.contenus.filter((c, i) => i !== ev.porte && c !== "fermee").length;
  return premiere + (autres > 0 ? (autres - 1) * DECALAGE_MS + OUVERTURE_MS : 0);
}

/** Où dessiner les portes dans un plan visible de `largeur` × `hauteur` (unités de la scène). */
export type Disposition = { rayon: number; centres: { x: number; y: number }[] };

/**
 * `nb` portes rondes en rangée, chacune au centre de sa colonne (une grille CSS à `nb`
 * colonnes égales tombe donc pile dessus), un peu sous le milieu pour laisser la place
 * à la plaque d'étage.
 */
export function disposition(nb: number, largeur: number, hauteur: number): Disposition {
  const colonne = largeur / nb;
  const rayon = Math.min(colonne * 0.38, hauteur * 0.3);
  const y = -hauteur * 0.08;
  const centres = Array.from({ length: nb }, (_, i) => ({ x: -largeur / 2 + colonne * (i + 0.5), y }));
  return { rayon, centres };
}
