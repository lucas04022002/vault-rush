import { useEffect, useState } from "react";
import { games, type GameConfig } from "../api.ts";
import { errorMessage } from "../lib/messages.ts";

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

/**
 * La config d'UN jeu, lue une fois par l'écran qui aiguille sur son genre.
 * Elle est ensuite passée au hook de partie, qui ne la redemande pas.
 */
export function useGameConfig(gameId: string): {
  config: GameConfig | null;
  loading: boolean;
  error: string | null;
} {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annulé = false;
    setLoading(true);
    setConfig(null);
    setError(null);

    void games
      .config(gameId)
      .then(({ game }) => {
        if (!annulé) setConfig(game);
      })
      .catch((err: unknown) => {
        if (!annulé) setError(errorMessage(err));
      })
      .finally(() => {
        if (!annulé) setLoading(false);
      });

    return () => {
      annulé = true;
    };
  }, [gameId]);

  return { config, loading, error };
}
