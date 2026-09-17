/**
 * L'emblème d'un jeu : un petit dessin qui dit en un coup d'œil de quoi il
 * retourne.
 *
 * En SVG dessiné ici, et non en fichiers image, pour trois raisons : le trait
 * prend la couleur du jeu (`currentColor`, donc l'accent de la tuile), le
 * dessin reste net sur un écran à forte densité, et rien n'est à héberger ni
 * à charger — une tuile n'attend aucune requête réseau pour être complète.
 *
 * Chaque emblème reprend le geste du jeu, pas son thème : des portes
 * superposées pour la montée, une grille barrée pour les lasers, une route qui
 * bifurque pour la fuite, des câbles pour la bombe, un clavier pour le code,
 * des clous pour la chute, deux cartes pour le blackjack.
 */

/** Un dessin purement décoratif : le nom du jeu est déjà écrit à côté. */
const commun = {
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Trois portes empilées : on monte d'étage en étage. */
function MonteeEmbleme() {
  return (
    <svg {...commun}>
      <title>Portes empilées</title>
      <rect x="9" y="30" width="30" height="12" rx="2" />
      <rect x="13" y="18" width="22" height="12" rx="2" />
      <rect x="17" y="6" width="14" height="12" rx="2" />
      <path d="M24 36v.01M24 24v.01" strokeWidth="3" />
    </svg>
  );
}

/** Une grille traversée par un faisceau : la ligne sûre au milieu des lasers. */
function LaserEmbleme() {
  return (
    <svg {...commun}>
      <title>Grille de lasers</title>
      <path d="M8 12h32M8 24h32M8 36h32" opacity="0.45" />
      <path d="M14 6v36M24 6v36M34 6v36" opacity="0.45" />
      <path d="M8 30l10-12 12 14 10-10" strokeWidth="3" />
    </svg>
  );
}

/** Une route qui bifurque : à chaque tronçon, un choix. */
function FuiteEmbleme() {
  return (
    <svg {...commun}>
      <title>Route qui bifurque</title>
      <path d="M24 42V28" strokeWidth="3" />
      <path d="M24 28 10 14M24 28l14-14" />
      <circle cx="10" cy="11" r="3.5" />
      <circle cx="38" cy="11" r="3.5" />
      <path d="M18 42h12" opacity="0.45" />
    </svg>
  );
}

/** Des câbles au-dessus d'une minuterie : couper le bon, avant la fin. */
function BombeEmbleme() {
  return (
    <svg {...commun}>
      <title>Câbles et minuterie</title>
      <path d="M10 14c4 6 10 6 14 0s10-6 14 0" />
      <rect x="11" y="24" width="26" height="16" rx="3" />
      <path d="M24 28v4l3 2" strokeWidth="3" />
    </svg>
  );
}

/** Un pavé numérique : quatre chiffres à trouver. */
function CodeEmbleme() {
  return (
    <svg {...commun}>
      <title>Pavé numérique</title>
      <rect x="9" y="7" width="30" height="34" rx="3" />
      <path d="M15 15h18" strokeWidth="3" />
      <path
        d="M16 24h.01M24 24h.01M32 24h.01M16 32h.01M24 32h.01M32 32h.01"
        strokeWidth="4"
      />
    </svg>
  );
}

/** Des clous et un diamant qui tombe : le hasard décide. */
function ChuteEmbleme() {
  return (
    <svg {...commun}>
      <title>Diamant et clous</title>
      <path d="M24 6l5 6-5 6-5-6z" strokeWidth="3" />
      <path
        d="M16 26h.01M24 26h.01M32 26h.01M12 34h.01M20 34h.01M28 34h.01M36 34h.01"
        strokeWidth="4"
      />
      <path d="M8 42h32" opacity="0.45" />
    </svg>
  );
}

/** Deux cartes : tirer ou rester. */
function CartesEmbleme() {
  return (
    <svg {...commun}>
      <title>Deux cartes</title>
      <rect x="8" y="12" width="20" height="28" rx="3" transform="rotate(-10 18 26)" />
      <rect x="22" y="10" width="20" height="28" rx="3" transform="rotate(8 32 24)" />
      <path d="M32 21l2.5 3-2.5 3-2.5-3z" strokeWidth="2" />
    </svg>
  );
}

/** Portes par défaut : un jeu servi par le serveur avant d'avoir son dessin. */
const EMBLEMES: Record<string, () => JSX.Element> = {
  "vault-rush": MonteeEmbleme,
  "laser-grid": LaserEmbleme,
  getaway: FuiteEmbleme,
  "bomb-squad": BombeEmbleme,
  "vault-code": CodeEmbleme,
  "diamond-drop": ChuteEmbleme,
  "blackjack-express": CartesEmbleme,
};

export function GameEmblem({ gameId }: { gameId: string }) {
  const Dessin = EMBLEMES[gameId] ?? MonteeEmbleme;
  return (
    <span className="gamecard__embleme" aria-hidden="true">
      <Dessin />
    </span>
  );
}
