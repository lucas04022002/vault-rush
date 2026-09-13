import type { ReactElement } from "react";
import type { GameConfig, GameKind } from "../api.ts";
import { LadderScreen } from "./LadderScreen.tsx";

/**
 * Le registre des écrans : le GENRE du jeu (`config.kind`, donné par le
 * serveur) choisit l'écran. Ajouter un jeu d'un genre nouveau = son écran,
 * et une ligne ici. Aucune route, aucun aiguillage écrit ailleurs.
 */

export type GameScreenProps = {
  gameId: string;
  /** La config déjà chargée : l'écran ne la redemande pas au serveur. */
  config: GameConfig;
};

export type GameScreen = (props: GameScreenProps) => ReactElement | null;

export const SCREENS: Partial<Record<GameKind, GameScreen>> = {
  ladder: LadderScreen,
  // code : Vault Code · drop : Diamond Drop · cards : Blackjack Express
};
