import { useEffect, useState } from "react";
import { games, type GameConfig } from "../api.ts";

/**
 * Le catalogue des jeux, lu une fois par écran qui en a besoin.
 * Aucune liste de jeux n'est écrite en dur dans le client : elle vient du serveur.
 */
export function useCatalogue(): GameConfig[] {
  const [catalogue, setCatalogue] = useState<GameConfig[]>([]);

  useEffect(() => {
    let annulé = false;
    void games
      .list()
      .then(({ games: liste }) => {
        if (!annulé) setCatalogue(liste);
      })
      .catch(() => {
        // Sans catalogue, les écrans de liste restent utilisables sans filtre.
      });
    return () => {
      annulé = true;
    };
  }, []);

  return catalogue;
}
