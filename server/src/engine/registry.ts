import { GAMES } from "./definitions.ts";
import { createLadderEngine, drawOptions, type DrawFn } from "./ladder.ts";
import { GAME_IDS, type EngineRegistry, type GameEngine } from "./types.ts";
import { createVaultCodeEngine } from "./vault-code.ts";

/**
 * Le registre : un moteur par jeu, et rien d'autre.
 *
 * C'est le SEUL endroit qui sait quels jeux existent. Ajouter un jeu = une
 * ligne ici (plus son identifiant dans `types.ts` et son fichier de moteur) ;
 * ni le service, ni les routes, ni la base ne bougent.
 */

export { GAME_IDS, isGameId } from "./types.ts";
export type { GameId } from "./types.ts";

export type BuildEnginesOptions = {
  /** Tirage d'une étape d'échelle ; les tests l'injectent pour figer le hasard. */
  draw?: DrawFn;
};

/** Fabrique les moteurs livrés. Une entrée par jeu, dans l'ordre de l'arcade. */
export function buildEngines(options: BuildEnginesOptions = {}): EngineRegistry {
  const draw = options.draw ?? drawOptions;
  return {
    "vault-rush": createLadderEngine(GAMES["vault-rush"], draw),
    "laser-grid": createLadderEngine(GAMES["laser-grid"], draw),
    getaway: createLadderEngine(GAMES.getaway, draw),
    "bomb-squad": createLadderEngine(GAMES["bomb-squad"], draw),
    "vault-code": createVaultCodeEngine(),
  };
}

/** Les moteurs de production (vrai hasard). */
export const ENGINES: EngineRegistry = buildEngines();

/** Le moteur d'un jeu, ou `undefined` si l'identifiant est inconnu. */
export function engineFor(id: string, engines: EngineRegistry = ENGINES): GameEngine | undefined {
  return Object.hasOwn(engines, id) ? engines[id] : undefined;
}

/**
 * Les jeux dans l'ordre d'affichage de l'arcade : ceux de `GAME_IDS` d'abord,
 * puis tout moteur ajouté au registre (un moteur factice de test, par exemple).
 */
export function allGames(engines: EngineRegistry = ENGINES): GameEngine[] {
  const connus = (GAME_IDS as readonly string[]).filter((id) => Object.hasOwn(engines, id));
  const autres = Object.keys(engines).filter((id) => !(GAME_IDS as readonly string[]).includes(id));
  return [...connus, ...autres].map((id) => engines[id]);
}

/** Le registre par défaut, complété par les moteurs supplémentaires d'un test. */
export function registryWith(extra: EngineRegistry | undefined, draw?: DrawFn): EngineRegistry {
  const base = draw ? buildEngines({ draw }) : ENGINES;
  return extra ? { ...base, ...extra } : base;
}
