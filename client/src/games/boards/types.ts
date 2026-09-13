import type { GameConfig, Outcome, Round, RoundStatus } from "../../api.ts";

/**
 * L'interface commune des plateaux de jeu.
 *
 * Un plateau est le SEUL endroit propre à un jeu : Vault Rush montre des portes
 * de coffre, Laser Grid une grille traversée de faisceaux, mais tous deux
 * reçoivent la même partie et remontent le même choix. Le hook `useLadderGame`,
 * la mise, le tableau des récompenses et le bilan restent communs.
 */
export type BoardProps = {
  config: GameConfig;
  round: Round;
  /** Les options révélées par le serveur pour l'étape jouée, ou rien. */
  revealed?: Outcome[] | null;
  /** Vrai pendant une requête : plus aucun clic ne part. */
  pending: boolean;
  /**
   * L'option choisie, numérotée à partir de 1 comme à l'écran — c'est la base
   * qu'attend `useLadderGame.play`, qui retranche 1 pour le serveur.
   */
  onPick: (option: number) => void;
};

/** L'état d'une étape dans la progression. */
export type StepState = "done" | "now" | "lost" | "todo";

/** Même règle que la frise commune : franchie, en cours, perdue, à venir. */
export function stepState(index: number, current: number, status: RoundStatus): StepState {
  if (index < current) return "done";
  if (index > current) return "todo";
  if (status === "playing") return "now";
  if (status === "lost") return "lost";
  return "todo";
}

/** Le mot dit par un lecteur d'écran pour chaque état d'étape. */
export const STATE_WORD: Record<StepState, string> = {
  done: "réussie",
  now: "en cours",
  lost: "perdue",
  todo: "à venir",
};

/**
 * Le nom accessible de la progression — identique à celui de la frise commune,
 * pour qu'un plateau reste repérable de la même façon d'un jeu à l'autre.
 */
export function progressLabel(status: RoundStatus, current: number, steps: number): string {
  const at = Math.min(current + 1, steps);
  if (status === "playing") return `Étape ${at} sur ${steps}`;
  if (status === "lost") return `Partie perdue à l'étape ${at} sur ${steps}`;
  return `Partie encaissée après ${current} étapes sur ${steps}`;
}

/** Le mot du jeu pour une révélation : « coffre » / « alarme », « passage » / « laser ». */
export function revealWord(config: GameConfig, outcome: Outcome): string {
  return outcome === "safe" ? config.labels.safe : config.labels.danger;
}
