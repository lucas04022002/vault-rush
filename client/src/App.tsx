import { NavLink, Link, Outlet, useLocation } from "react-router";
import { Balance } from "./components/index.ts";
import { useSession } from "./session.tsx";

/** Le cadre commun : marque, solde, navigation, pied de page. */
export function App() {
  const { user, balanceCents, loading } = useSession();
  const chemin = useLocation().pathname;
  const surLaConnexion = chemin === "/connexion";
  // Le catalogue est une grille : il lui faut de la largeur. Les autres écrans
  // gardent leur colonne étroite, qui va bien à un plateau de jeu.
  const catalogue = chemin === "/";

  return (
    <div className="shell" data-large={catalogue ? "" : undefined}>
      <header className="shell__top">
        <Link to="/" className="brand">
          VAULT RUSH
        </Link>
        {loading || (!user && surLaConnexion) ? null : user ? (
          <Balance cents={balanceCents} />
        ) : (
          <Link to="/connexion" className="shell__signin">
            Se connecter
          </Link>
        )}
      </header>

      <nav className="shell__nav" aria-label="Navigation principale">
        <NavLink to="/" end>
          Arcade
        </NavLink>
        <NavLink to="/historique">Historique</NavLink>
        <NavLink to="/classement">Classement</NavLink>
        <NavLink to="/compte">Compte</NavLink>
      </nav>

      <main className="page">
        <Outlet />
      </main>

      <footer className="shell__foot">
        <p>Coins fictifs, sans valeur. Jeu gratuit.</p>
        <p className="shell__links">
          <Link to="/cgu">CGU</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/mentions-legales">Mentions légales</Link>
        </p>
      </footer>
    </div>
  );
}
