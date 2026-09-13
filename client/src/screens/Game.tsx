import { useParams } from "react-router";
import { Toast } from "../components/index.ts";
import { useGameConfig } from "../games/catalogue.ts";
import { SCREENS } from "../games/screens.ts";

/**
 * L'écran d'un jeu. Cet écran-ci n'en dessine aucun : il lit la config du jeu,
 * y trouve son GENRE (`kind`, décidé par le serveur) et passe la main à l'écran
 * de ce genre. Les jeux d'échelle gardent exactement l'écran qu'ils avaient.
 */
export function Game() {
  const { game = "" } = useParams();
  const { config, loading, error } = useGameConfig(game);

  if (loading) {
    return (
      <p className="page__loading" role="status">
        Chargement du jeu…
      </p>
    );
  }

  if (!config) {
    return <Toast kind="bad">{error ?? "Ce jeu n'existe pas."}</Toast>;
  }

  const Screen = SCREENS[config.kind];
  if (!Screen) {
    return <Toast kind="bad">Ce jeu n'a pas encore d'écran.</Toast>;
  }

  return <Screen gameId={game} config={config} />;
}
