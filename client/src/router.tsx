import type { RouteObject } from "react-router";
import { Link } from "react-router";
import { App } from "./App.tsx";
import { PageTitle, Toast } from "./components/index.ts";
import { Account } from "./screens/Account.tsx";
import { Arcade } from "./screens/Arcade.tsx";
import { Game } from "./screens/Game.tsx";
import { History } from "./screens/History.tsx";
import { Leaderboard } from "./screens/Leaderboard.tsx";
import { Legal } from "./screens/Legal.tsx";
import { Login } from "./screens/Login.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Terms } from "./screens/Terms.tsx";
import { RequireSession } from "./session.tsx";

/**
 * Les routes de l'application.
 *
 * Exportées telles quelles : `main.tsx` en fait un routeur de navigateur, les
 * tests un routeur en mémoire — les deux exécutent donc exactement les mêmes
 * routes et les mêmes gardes.
 */
export const routes: RouteObject[] = [
  {
    element: <App />,
    children: [
      { index: true, element: <Arcade /> },
      {
        path: "jeux/:game",
        element: (
          <RequireSession>
            <Game />
          </RequireSession>
        ),
      },
      { path: "regles/:game", element: <Rules /> },
      {
        path: "historique",
        element: (
          <RequireSession>
            <History />
          </RequireSession>
        ),
      },
      { path: "classement", element: <Leaderboard /> },
      {
        path: "compte",
        element: (
          <RequireSession>
            <Account />
          </RequireSession>
        ),
      },
      { path: "connexion", element: <Login /> },
      { path: "cgu", element: <Terms /> },
      { path: "mentions-legales", element: <Legal /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

function NotFound() {
  return (
    <>
      <PageTitle eyebrow="Erreur 404">Page introuvable</PageTitle>
      <Toast kind="bad">Cette page n'existe pas (ou n'existe plus).</Toast>
      <p className="screen__aside">
        <Link to="/">Retour à l'arcade</Link>
      </p>
    </>
  );
}
