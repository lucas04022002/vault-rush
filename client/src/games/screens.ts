import type { ReactElement } from "react";
import type { GameConfig, GameKind } from "../api.ts";
import { DiamondDropRules } from "./DiamondDropRules.tsx";
import { DiamondDropScreen } from "./DiamondDropScreen.tsx";
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
  drop: DiamondDropScreen,
  // code : Vault Code · cards : Blackjack Express
};

/**
 * Les pages de règles qui ne sont PAS celles d'un jeu d'échelle. `Rules.tsx`
 * y passe la main quand le genre en a une ; sinon il écrit les règles communes
 * des jeux d'échelle. Même principe que `SCREENS` : une ligne par genre.
 */
export type RulesScreen = (props: { config: GameConfig }) => ReactElement | null;

export const RULES: Partial<Record<GameKind, RulesScreen>> = {
  drop: DiamondDropRules,
};
